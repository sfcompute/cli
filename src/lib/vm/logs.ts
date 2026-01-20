import console from "node:console";
import { setTimeout } from "node:timers";
import { Command, CommanderError } from "@commander-js/extra-typings";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

import { apiClient } from "../../apiClient.ts";
import { getAuthToken } from "../../helpers/config.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import type { paths } from "../../schema.ts";

dayjs.extend(utc);

type VMLogsParams = paths["/v0/vms/logs2"]["get"]["parameters"]["query"];
type VMLogsResponse =
  paths["/v0/vms/logs2"]["get"]["responses"]["200"]["content"]["application/json"]["data"];

function formatTimestampToISO(timestamp: string): string {
  const date = dayjs(timestamp);
  if (!date.isValid()) {
    throw new CommanderError(
      1,
      "INVALID_TIMESTAMP_FORMAT",
      `Invalid timestamp format: ${timestamp}. Please use RFC3339 format (e.g., 2023-01-01T00:00:00Z)`,
    );
  }
  return date.toISOString();
}

const logs = new Command("logs")
  .description("View or tail VM logs")
  .requiredOption("-i, --instance <id>", "VM instance ID")
  .option(
    "-l, --limit <number>",
    "Number of log lines to fetch",
    (val) => {
      const parsedValue = Number(val);
      if (
        Number.isNaN(parsedValue) ||
        !Number.isInteger(parsedValue) ||
        parsedValue <= 0
      ) {
        throw new CommanderError(
          1,
          "LIMIT_MUST_BE_A_POSITIVE_INTEGER",
          "Limit must be a positive integer",
        );
      }
      return parsedValue;
    },
    100,
  )
  .option(
    "--before <timestamp>",
    "Get logs older than this timestamp (descending)",
    formatTimestampToISO,
  )
  .option(
    "--since <timestamp>",
    "Get logs newer than this timestamp (ascending)",
    formatTimestampToISO,
  )
  .option("-f, --follow", "Continue polling newer logs (like tail -f)")
  .addHelpText(
    "after",
    `
Examples:

  \x1b[2m# Get logs for a specific vm \x1b[0m
  $ sf vm logs --instance <instance_id>

  \x1b[2m# Get logs for a vm \x1b[0m
  $ sf vm logs --instance <instance_id>

  \x1b[2m# Get last 200 log lines for a vm  \x1b[0m
  $ sf vm logs --instance <instance_id> --limit 200

  \x1b[2m# Get logs before a given timestamp  \x1b[0m
  $ sf vm logs -i <instance_id> --before "2025-01-01"

  \x1b[2m# Get up to 300 logs between a 3 hour duration  \x1b[0m
  $ sf vm logs -i <instance_id> --since "2025-01-01T17:30:00" --before "2025-01-01T20:30:00" -l 300
`,
  )
  .action(async (options, cmd) => {
    const client = await apiClient(await getAuthToken());

    async function fetchLogs(query: VMLogsParams) {
      const { response, data } = await client.GET("/v0/vms/logs2", {
        params: { query },
      });

      if (response.status === 401) {
        await logSessionTokenExpiredAndQuit();
      }

      if (!response.ok) {
        logAndQuit(
          `Failed to fetch logs: ${response.status} ${response.statusText}`,
        );
      }
      return data;
    }

    const params: VMLogsParams = {
      instance_id: options.instance,
      limit: options.limit,
      since_realtime_timestamp: options.since,
      before_realtime_timestamp: options.before,
      order_by: "seqnum_asc",
    };

    let incompleteLine = "";
    let lastTimestamp = "";

    function processLogs(logs: VMLogsResponse) {
      for (const log of logs) {
        const timestamp = dayjs(log.realtime_timestamp).format(
          "YYYY-MM-DD HH:mm:ss",
        );
        lastTimestamp = timestamp;

        const chunkData = new TextDecoder("utf-8", { fatal: false }).decode(
          new Uint8Array(log.data),
        );

        const fullData = incompleteLine + chunkData;
        const lines = fullData.split("\n");

        incompleteLine = fullData.endsWith("\n") ? "" : lines.pop() || "";

        const prefix = `(instance ${log.instance_id}) [${timestamp}]`;
        for (const line of lines) {
          if (line.length > 0) {
            console.log(`${prefix} ${line}`);
          }
        }
      }
    }

    function flushIncompleteLine() {
      if (incompleteLine.length > 0) {
        console.log(
          `(instance ${options.instance}) [${lastTimestamp}] ${incompleteLine}`,
        );
      }
    }

    if (!options.follow) {
      const response = await fetchLogs(params);
      if (response?.data?.length) {
        processLogs(response.data);
      } else {
        console.log(
          "No logs found. VMs take up to 10 minutes to spin-up, so it may not have started yet.",
        );
      }
      return;
    }

    let sinceSeqnum: number | undefined;
    const response = await fetchLogs(params);
    if (response?.data?.length) {
      processLogs(response.data);
      sinceSeqnum = response.data[response.data.length - 1].seqnum + 1;
    }

    cmd.hook("postAction", flushIncompleteLine);

    while (true) {
      const newParams: VMLogsParams = {
        instance_id: options.instance,
        limit: 2500,
        order_by: "seqnum_asc",
      };

      if (sinceSeqnum) {
        newParams.since_seqnum = sinceSeqnum;
      }

      const newResponse = await fetchLogs(newParams);

      if (newResponse?.data?.length) {
        processLogs(newResponse.data);
        sinceSeqnum = newResponse.data[newResponse.data.length - 1].seqnum + 1;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  });

export default logs;
