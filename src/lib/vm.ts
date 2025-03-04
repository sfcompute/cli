import type { Command } from "@commander-js/extra-typings";
import { isFeatureEnabled } from "./posthog.ts";
import { readFileSync } from "node:fs";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";
import { getAuthToken } from "../helpers/config.ts";

export async function registerVM(program: Command) {
  const isEnabled = await isFeatureEnabled("vms");

  if (!isEnabled) {
    return;
  }

  const vm = program
    .command("vm")
    .aliases(["v", "vms"])
    .description("Manage virtual machines");

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

      if (!data?.data) {
        logAndQuit("No VMs found");
      }

      console.table(
        data.data.map((instance) => ({
          id: instance.id,
          instance_group_id: instance.instance_group_id,
          status: instance.status,
          last_updated_at: instance.last_updated_at,
        })),
      );
    });

  vm.command("script")
    .description("Push a startup script to VMs")
    .requiredOption("-f, --file <file>", "Path to startup script file")
    .action(async (options) => {
      let script: string;
      try {
        script = readFileSync(options.file, "utf-8");
      } catch (err) {
        logAndQuit(`Failed to read script file: ${err.message}`);
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
    .description("View VM logs")
    .action(async () => {
      const url = await getApiUrl("vms_logs_list");
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
        logAndQuit(`Failed to fetch logs: ${response.statusText}`);
      }

      const { data } = await response.json();

      if (!data?.data?.length) {
        console.log("No logs found");
        return;
      }

      for (const log of data.data) {
        console.log(
          `(instance ${log.instance_id}) [${log.timestamp}] ${log.message}`,
        );
      }
    });
}
