import { type Command, CommanderError } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import Table from "cli-table3";
import console from "node:console";
import { readFileSync } from "node:fs";
import process from "node:process";
import { setTimeout } from "node:timers";
import ora from "ora";
import dayjs from "dayjs";
import { getAuthToken } from "../helpers/config.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
  logSupportCTAAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";
import { registerSsh } from "./ssh.ts";
import { apiClient } from "../apiClient.ts";
import { paths } from "../schema.ts";

type VMLogsParams = paths["/v0/vms/logs2"]["get"]["parameters"]["query"];
type VMLogsResponse =
  paths["/v0/vms/logs2"]["get"]["responses"]["200"]["content"][
    "application/json"
  ]["data"];
type VMInstance = {
  id: string;
  status: string;
  last_updated_at: string;
};

// Function to ensure timestamp is in RFC3339 format
function formatTimestampToISO(timestamp: string): string {
  const date = dayjs(timestamp);
  if (!date.isValid()) {
    throw new CommanderError(
      1,
      "INVALID_TIMESTAMP_FORMAT",
      "Invalid timestamp format: ${timestamp}. Please use RFC3339 format (e.g., 2023-01-01T00:00:00Z)",
    );
  }
  return date.toISOString();
}

export function registerVM(program: Command) {
  const vm = program
    .command("vm")
    .showHelpAfterError()
    .aliases(["v", "vms"])
    .description("Manage virtual machines");

  registerSsh(vm);

  vm.command("list")
    .alias("ls")
    .description("List all virtual machines")
    .action(async () => {
      const url = await getApiUrl("vms_instances_list");
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          await logSessionTokenExpiredAndQuit();
        }
        logAndQuit(`Failed to list VMs: ${response.statusText}`);
      }

      const { data } = await response.json();

      if (!data?.length) {
        logAndQuit(
          "You have no VMs. Buy a VM with: \n  $ sf buy -t h100v -d 1h -n 8",
        );
      }

      const formattedData = data.map(
        (instance: {
          id: string;
          current_status: string;
          last_updated_at: string;
        }): VMInstance => ({
          id: instance.id,
          status: instance.current_status,
          last_updated_at: instance.last_updated_at,
        }),
      );

      const table = new Table({
        head: ["ID", "Instance group ID", "Status", "Last updated at"],
      });

      formattedData.forEach((instance: VMInstance) => {
        table.push([
          instance.id,
          instance.status,
          instance.last_updated_at,
        ]);
      });

      console.log(table.toString());
    });

  vm.command("script")
    .description("Push a startup script to VMs")
    .requiredOption("-f, --file <file>", "Path to startup script file")
    .action(async (options) => {
      let script: string;
      try {
        script = readFileSync(options.file, "utf-8");
      } catch {
        logAndQuit("Failed to read script file");
      }

      const url = await getApiUrl("vms_script_post");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({ script }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          await logSessionTokenExpiredAndQuit();
        }
        logAndQuit(`Failed to upload script: ${response.statusText}`);
      }

      console.log("Successfully uploaded startup script");
    });

  vm.command("logs")
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

  \x1b[2m# Get logs for all my vms \x1b[0m
  $ sf vm logs

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

      // Function to fetch logs with given parameters
      async function fetchLogs(query: VMLogsParams) {
        const { response, data } = await client.GET("/v0/vms/logs2", {
          params: {
            query,
          },
        });

        if (response.status === 401) {
          await logSessionTokenExpiredAndQuit();
        }

        if (!response.ok) {
          // Get the full error response
          logAndQuit(
            `Failed to fetch logs: ${response.status} ${response.statusText}`,
          );
        }
        return data;
      }

      // Build initial query parameters
      const params: VMLogsParams = {
        instance_id: options.instance,
        limit: options.limit,
        since_realtime_timestamp: options.since,
        before_realtime_timestamp: options.before,
        order_by: "seqnum_asc",
      };

      // State for handling incomplete lines across chunks
      let incompleteLine = "";
      let lastTimestamp = "";
      let totalLogs = 0;

      // Function to process and print logs
      function processLogs(logs: VMLogsResponse) {
        for (const log of logs) {
          const timestamp = dayjs(log.realtime_timestamp).format(
            "YYYY-MM-DD HH:mm:ss",
          );
          lastTimestamp = timestamp;

          const chunkData = new TextDecoder("utf-8", { fatal: false })
            .decode(new Uint8Array(log.data));

          // Combine incomplete line from previous chunk with new data
          const fullData = incompleteLine + chunkData;
          const lines = fullData.split("\n");

          // Keep the last line as incomplete if it doesn't end with newline
          incompleteLine = fullData.endsWith("\n") ? "" : lines.pop() || "";

          // Print complete lines
          const prefix = `(instance ${log.instance_id}) [${timestamp}]`;
          for (const line of lines) {
            if (line.length > 0) {
              console.log(`${prefix} ${line}`);
            }
          }
          totalLogs += logs.length;
        }
      }

      function flushIncompleteLine() {
        if (incompleteLine.length > 0) {
          console.log(
            `(instance ${options.instance}) [${lastTimestamp}] ${incompleteLine}`,
          );
        }
      }

      // If we're not following (just a single fetch)
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

      // If we are following => do poll-based tailing
      let sinceSeqnum: number | undefined;
      // Initial fetch (in the first fetch we don't have a sinceSeqnum)
      const response = await fetchLogs(params);
      if (response?.data?.length) {
        processLogs(response.data);
        // The last log's seqnum is our new "since" - add 1 to exclude the last seen log
        sinceSeqnum = response.data[response.data.length - 1].seqnum + 1;
      }

      // If we get a SIGINT or SIGTERM, flush the incomplete line
      cmd.hook("postAction", flushIncompleteLine);

      // Polling loop - continue indefinitely when following
      while (true) {
        // Build query for the next fetch
        const newParams: VMLogsParams = {
          instance_id: options.instance,
          limit: 2500,
          order_by: "seqnum_asc",
        };

        // Only set the since parameter if it has a value
        if (sinceSeqnum) {
          newParams.since_seqnum = sinceSeqnum;
        }

        const newResponse = await fetchLogs(newParams);

        // Print new logs
        if (newResponse?.data?.length) {
          processLogs(newResponse.data);
          // Use the last log's seqnum + 1 for next request to avoid duplicates
          sinceSeqnum = newResponse.data[newResponse.data.length - 1].seqnum +
            1;
        }

        // Sleep for 2 seconds
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    });

  vm.command("replace")
    .description("Replace a virtual machine")
    .requiredOption("-i, --id <id>", "ID of the VM to replace")
    .action(async (options) => {
      // Replace is a destructive action - get confirmation
      const replaceConfirmed = await confirm({
        message:
          `Are you sure you want to replace VM instance ${options.id}? (You cannot undo this action)`,
        default: false,
      });
      if (!replaceConfirmed) {
        process.exit(0);
      }

      const loadingSpinner = ora(`Replacing VM ${options.id}`).start();

      const url = await getApiUrl("vms_replace");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({ vm_id: options.id.toString() }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          await logSessionTokenExpiredAndQuit();
        }

        if (response.status === 404) {
          loadingSpinner.fail("VM doesn't exist - double check the ID");
          process.exit(1);
        }

        // unexpected error - display support CTA and quit
        loadingSpinner.fail("Failed to replace VM");
        logSupportCTAAndQuit();
      }

      const {
        replaced,
        replaced_by,
      }: {
        replaced: string;
        replaced_by: string;
      } = await response.json();
      if (!replaced || !replaced_by) {
        loadingSpinner.fail("Invalid API response format");
        logSupportCTAAndQuit();
      }
      loadingSpinner.succeed(
        `Replaced VM instance ${replaced} with VM ${replaced_by}`,
      );
      process.exit(0);
    });
}
