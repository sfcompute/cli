import { Command, CommanderError } from "@commander-js/extra-typings";
import console from "node:console";
import { setTimeout } from "node:timers";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import ora from "ora";
import { cyan } from "jsr:@std/fmt/colors";
import process from "node:process";

import { getLastVM } from "./utils.ts";
import { apiClient } from "../../apiClient.ts";
import { getAuthToken } from "../../helpers/config.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { paths } from "../../schema.ts";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";

dayjs.extend(utc);

type VMLogsParams = paths["/v0/vms/logs2"]["get"]["parameters"]["query"];
type VMLogsResponse =
  paths["/v0/vms/logs2"]["get"]["responses"]["200"]["content"][
    "application/json"
  ]["data"];

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
  .description("View or tail VM logs from a node")
  .showHelpAfterError()
  .argument("[node]", "Node name or ID to get logs from")
  .option(
    "-i, --instance <id>",
    "VM instance ID (conflicts with node argument)",
  )
  .option(
    "-l, --limit <number>",
    "Number of log lines to fetch",
    (val) => {
      const parsedValue = Number(val);
      if (
        Number.isNaN(parsedValue) || !Number.isInteger(parsedValue) ||
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

  \x1b[2m# Get logs for a node's current VM\x1b[0m
  $ sf nodes logs my-node

  \x1b[2m# Get logs for a specific VM ID\x1b[0m
  $ sf nodes logs -i vm_xxxxxxxxxxxxxxxxxxxxx

  \x1b[2m# Get last 200 log lines for a node\x1b[0m
  $ sf nodes logs my-node --limit 200

  \x1b[2m# Get logs before a given timestamp\x1b[0m
  $ sf nodes logs my-node --before "2025-01-01"

  \x1b[2m# Tail logs in real-time\x1b[0m
  $ sf nodes logs my-node --follow

  \x1b[2m# Get up to 300 logs between a 3 hour duration\x1b[0m
  $ sf nodes logs my-node --since "2025-01-01T17:30:00" --before "2025-01-01T20:30:00" -l 300
`,
  )
  .action(async (node, options, cmd) => {
    try {
      // Validate that either node or instance is provided, but not both
      if (!node && !options.instance) {
        logAndQuit(
          "Either a node name/ID or --instance flag must be provided",
        );
      }

      if (node && options.instance) {
        logAndQuit(
          "Cannot specify both a node name/ID and --instance flag. Use one or the other.",
        );
      }

      let vmId: string;

      // If node is provided, fetch the node and get its current_vm
      if (node) {
        const nodesClientInstance = await nodesClient();
        const spinner = ora("Fetching node information...").start();

        try {
          const nodeData = await nodesClientInstance.nodes.get(node);
          spinner.succeed(`Node found for name ${cyan(node)}.`);

          const lastVm = getLastVM(nodeData);

          if (!lastVm) {
            spinner.fail(
              `Node ${
                cyan(node)
              } does not have a VM. VMs can take up to 5-10 minutes to spin up.`,
            );
            process.exit(1);
          }

          vmId = lastVm.id;
        } catch {
          spinner.info(
            `No node found for name ${cyan(node)}. Interpreting as VM ID...`,
          );
          vmId = node;
        }
      } else {
        vmId = options.instance!;
      }

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
        instance_id: vmId,
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
            `(instance ${vmId}) [${lastTimestamp}] ${incompleteLine}`,
          );
        }
      }

      if (!options.follow) {
        const spinner = ora("Fetching logs...").start();
        const response = await fetchLogs(params);
        if (response?.data?.length) {
          spinner.succeed(`${response.data.length} logs fetched successfully.`);
          processLogs(response.data);
        } else {
          spinner.info(
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
          instance_id: vmId,
          limit: 2500,
          order_by: "seqnum_asc",
        };

        if (sinceSeqnum) {
          newParams.since_seqnum = sinceSeqnum;
        }

        const newResponse = await fetchLogs(newParams);

        if (newResponse?.data?.length) {
          processLogs(newResponse.data);
          sinceSeqnum = newResponse.data[newResponse.data.length - 1].seqnum +
            1;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (err) {
      handleNodesError(err);
    }
  });

export default logs;
