import type { Command } from "@commander-js/extra-typings";
import console from "node:console";
import { confirm } from "@inquirer/prompts";
import ora from "ora";
import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers";
import Table from "cli-table3";
import { getAuthToken } from "../helpers/config.ts";
import process from "node:process";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
  logSupportCTAAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";
import { isFeatureEnabled } from "./posthog.ts";
import { registerSsh } from "./ssh.ts";

type VMInstance = {
  id: string;
  instance_group_id: string;
  status: string;
  last_updated_at: string;
};

export async function registerVM(program: Command) {
  const isEnabled = await isFeatureEnabled("vms");

  if (!isEnabled) {
    return;
  }

  const vm = program
    .command("vm")
    .aliases(["v", "vms"])
    .description("Manage virtual machines");

  registerSsh(vm);

  vm.command("list")
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
        logAndQuit("No VMs found");
      }

      const formattedData = data.map(
        (instance: {
          id: string;
          instance_group_id: string;
          current_status: string;
          last_updated_at: string;
        }): VMInstance => ({
          id: instance.id,
          instance_group_id: instance.instance_group_id,
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
          instance.instance_group_id,
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
    .option("-i, --instance <id>", "Filter logs by instance ID")
    .option(
      "-l, --limit <number>",
      "Number of log lines to fetch",
      (val) => {
        const parsedValue = Number(val);
        if (
          Number.isNaN(parsedValue) || !Number.isInteger(parsedValue) ||
          parsedValue <= 0
        ) {
          logAndQuit("Limit must be a positive integer");
        }
        return parsedValue;
      },
      100,
    )
    .option(
      "--before <timestamp>",
      "Get logs older than this timestamp (descending)",
    )
    .option(
      "--since <timestamp>",
      "Get logs newer than this timestamp (ascending)",
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
    .action(async (options) => {
      const baseUrl = await getApiUrl("vms_logs_list");
      const params = new URLSearchParams();

      if (options.instance) {
        params.append("instance_id", options.instance);
      }

      if (options.limit) {
        params.append("limit", options.limit.toString());
      }

      // Function to fetch logs with given parameters
      async function fetchLogs(urlParams: URLSearchParams) {
        const url = `${baseUrl}?${urlParams.toString()}`;
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

          // Get the full error response
          let errorDetails = "";
          try {
            const errorResponse = await response.json();
            errorDetails = JSON.stringify(errorResponse, null, 2);
          } catch {
            errorDetails = await response.text();
          }

          logAndQuit(
            `Failed to fetch logs: ${response.status} ${response.statusText}\nResponse details: ${errorDetails}`,
          );
        }

        const { data } = await response.json();
        return data;
      }

      // Function to print a formatted log line
      function printLogLine(log: {
        timestamp: string;
        instance_id: string;
        message: string;
      }) {
        // Format the timestamp to ISO without milliseconds
        const timestamp = new Date(log.timestamp);
        const formattedTime = timestamp
          .toISOString()
          .slice(0, 19)
          .replace("T", " ")
          .padEnd(19); // YYYY-MM-DD HH:MM:SS

        if (log.message.includes("\n")) {
          const prefix = `(instance ${log.instance_id}) [${formattedTime}] `;
          const lines = log.message.split("\n").filter((line) => line !== "");
          console.log(prefix + lines[0]);
          for (let i = 1; i < lines.length; i++) {
            console.log(lines[i]);
          }
        } else {
          console.log(
            `(instance ${log.instance_id}) [${formattedTime}] ${log.message}`,
          );
        }
      }

      // Function to ensure timestamp is in ISO format
      function formatTimestampToISO(timestamp: string): string {
        try {
          const date = new Date(timestamp);
          if (Number.isNaN(date.getTime())) {
            throw new Error("Invalid date");
          }
          return date.toISOString();
        } catch {
          logAndQuit(
            `Invalid timestamp format: ${timestamp}. Please use ISO format (e.g., 2023-01-01T00:00:00Z)`,
          );
        }
      }

      // If we're not following (just a single fetch)
      if (!options.follow) {
        try {
          // Format timestamps if provided
          if (options.since) {
            params.set("since", formatTimestampToISO(options.since));
          }
          if (options.before) {
            params.set("before", formatTimestampToISO(options.before));
          }

          const data = await fetchLogs(params);
          if (data?.length) {
            for (const log of data) {
              printLogLine(log);
            }
          } else {
            console.log("No logs found");
          }
        } catch (err: unknown) {
          // Gracefully handle broken pipe errors
          if (
            (err as Error).message?.includes("Broken pipe") ||
            (err as Error).name === "BrokenPipe"
          ) {
            return;
          }
          throw err;
        }
        return;
      }

      // If we are following => do poll-based tailing
      try {
        // If user didn't specify --since, we do an initial fetch to get the latest logs
        let sinceTimestamp = options.since
          ? formatTimestampToISO(options.since)
          : "";

        // Initial fetch (if --since not provided, we get the latest logs)
        if (!sinceTimestamp) {
          const data = await fetchLogs(params);
          if (data?.length) {
            data.forEach(printLogLine);
            // The last log's timestamp is our new "since"
            // Ensure the timestamp is in ISO format
            const lastLogTime = new Date(
              data[data.length - 1].timestamp,
            ).getTime();
            sinceTimestamp = new Date(lastLogTime + 1).toISOString();
          }
        }

        // Polling loop
        while (true) {
          // Build query for the next fetch
          const newParams = new URLSearchParams(params);
          newParams.delete("before"); // Not relevant in tail mode

          // Only set the since parameter if it has a value
          if (sinceTimestamp) {
            newParams.set("since", sinceTimestamp);
          }

          const newData = await fetchLogs(newParams);

          // Print new logs
          if (newData?.length) {
            for (const log of newData) {
              printLogLine(log);
            }
            // Bump the last timestamp by 1ms before next request
            const lastLogTime = new Date(
              newData[newData.length - 1].timestamp,
            ).getTime();
            sinceTimestamp = new Date(lastLogTime + 1).toISOString();
          }

          // Sleep for 2 seconds
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (err: unknown) {
        // Gracefully handle broken pipe errors
        if (
          (err as Error).message?.includes("Broken pipe") ||
          (err as Error).name === "BrokenPipe"
        ) {
          return;
        }
        throw err;
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
