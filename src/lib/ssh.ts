import type { Command } from "@commander-js/extra-typings";
import console from "node:console";
import process from "node:process";
import { Shescape } from "shescape";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";
import { getAuthToken } from "../helpers/config.ts";
import child_process from "node:child_process";
import ora from "ora";

type SshHostKey = {
  keyType: string;
  base64EncodedKey: string;
};

type VmInstance = {
  id: string;
  current_status: string;
  last_updated_at: string;
  cluster_id: string;
  instance_group_id: string;
};

export function registerSsh(program: Command) {
  program
    .command("ssh")
    .option("-q, --quiet", "Quiet mode", false)
    .option(
      "--use-host-keys [value]",
      "Use API provided SSH server host keys if known",
      true,
    )
    .argument(
      "<destination>",
      "USERNAME@VM_ID The (optional) username, and VM id to SSH into.",
    )
    .allowExcessArguments(false)
    .action(async (destination, options) => {
      const splitDestination = destination.split("@");
      let vmId: string;
      let sshUsername: string | undefined;
      if (splitDestination.length == 1) {
        sshUsername = undefined;
        vmId = splitDestination[0];
      } else if (splitDestination.length == 2) {
        sshUsername = splitDestination[0];
        vmId = splitDestination[1];
      } else {
        logAndQuit(`Invalid SSH destination string: ${destination}`);
      }

      // Check VM status before attempting SSH
      // This addresses PRODUCT-503: Show friendly error if VM is still spinning up
      const vmSpinner = ora("Checking VM status...").start();
      const vmListUrl = await getApiUrl("vms_instances_list");
      const vmListResponse = await fetch(vmListUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });

      if (!vmListResponse.ok) {
        vmSpinner.fail("Failed to check VM status");
        if (vmListResponse.status === 401) {
          logSessionTokenExpiredAndQuit();
        }
        logAndQuit(
          `Failed to retrieve VM information: ${vmListResponse.statusText}`,
        );
      }

      const vmData = await vmListResponse.json();
      const vmInstances = vmData.data as VmInstance[];
      const targetVm = vmInstances.find((vm) => vm.id === vmId);

      if (!targetVm) {
        vmSpinner.fail("VM not found");
        logAndQuit(`VM with ID ${vmId} not found`);
      }

      // Check if VM is in a state that suggests it's still starting up
      const startupStatuses = [
        "starting",
        "booting",
        "initializing",
        "provisioning",
        "pending",
        "creating",
      ];
      
      const vmStatusLower = targetVm.current_status.toLowerCase();
      const isStartingUp = startupStatuses.some(status => 
        vmStatusLower.includes(status)
      );

      // Check if the VM was recently updated (within last 5 minutes)
      const lastUpdated = new Date(targetVm.last_updated_at);
      const now = new Date();
      const minutesSinceLastUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60);
      
      if (isStartingUp || minutesSinceLastUpdate < 5) {
        vmSpinner.fail("VM is still starting up");
        console.log(
          `\n⚠️  VM ${vmId} appears to be still starting up (status: ${targetVm.current_status}).`
        );
        console.log(
          "Networking might not be fully configured yet. Please wait a few minutes before trying to SSH."
        );
        console.log(
          `\nLast updated: ${minutesSinceLastUpdate.toFixed(1)} minutes ago`
        );
        console.log(
          "\nTip: You can check VM logs with:"
        );
        console.log(`  $ sf vm logs --instance ${vmId}`);
        process.exit(1);
      }

      vmSpinner.succeed("VM is ready");

      const baseUrl = await getApiUrl("vms_ssh_get");
      const params = new URLSearchParams();
      params.append("vm_id", vmId);
      const url = `${baseUrl}?${params.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          logSessionTokenExpiredAndQuit();
        }

        logAndQuit(
          `Failed to retrieve ssh information: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        ssh_hostname: string;
        ssh_port: number;
        ssh_host_keys: SshHostKey[] | undefined;
      };
      const sshHostname = data.ssh_hostname;
      const sshPort = data.ssh_port;
      const sshHostKeys = data.ssh_host_keys || [];

      let sshDestination = sshHostname;
      if (sshUsername !== undefined) {
        sshDestination = `${sshUsername}@${sshDestination}`;
      }
      if (sshPort !== undefined) {
        sshDestination = `${sshDestination}:${sshPort}`;
      }
      sshDestination = `ssh://${sshDestination}`;

      let cmd = ["ssh"];

      if (sshHostKeys.length > 0 && options.useHostKeys) {
        let knownHostsCommand = ["/usr/bin/env", "printf", "%s %s %s\\n"];
        for (const sshHostKey of sshHostKeys) {
          knownHostsCommand = knownHostsCommand.concat([
            sshHostname,
            sshHostKey.keyType,
            sshHostKey.base64EncodedKey,
          ]);
        }
        // Escape all characters for proper pass through
        for (const i in knownHostsCommand) {
          knownHostsCommand[i] = knownHostsCommand[i].replaceAll("%", "%%");
          knownHostsCommand[i] = knownHostsCommand[i].replaceAll('"', '\\"');
          knownHostsCommand[i] = '"' + knownHostsCommand[i] + '"';
        }
        const knownHostsCommand_str = knownHostsCommand.join(" ");
        cmd = cmd.concat(["-o", `KnownHostsCommand=${knownHostsCommand_str}`]);
      }

      cmd = cmd.concat(["-o", `HostKeyAlias=${vmId}.vms.sfcompute.dev`]);
      cmd = cmd.concat([sshDestination]);

      let shescape: undefined | Shescape = undefined;
      let shell: undefined | string = undefined;
      if (process.env.SHELL !== undefined) {
        try {
          shescape = new Shescape({
            flagProtection: false,
            shell: process.env.SHELL,
          });
          shell = process.env.SHELL;
        } catch {
          // shescape will stay undefined
        }
      }
      if (shescape === undefined) {
        shescape = new Shescape({
          flagProtection: false,
          shell: "/bin/sh",
        });
        shell = "/bin/sh";
      }
      const shell_cmd = shescape.quoteAll(cmd).join(" ");
      if (!options.quiet) {
        console.log(`Executing (${shell} style output): ${shell_cmd}`);
      }

      // Ideally this would use `@alphahydrae/exec` but `deno compile` doesn't
      // support ffi modules.
      const result = child_process.spawnSync(cmd[0], cmd.slice(1), {
        stdio: "inherit",
      });
      if (result.status !== undefined) {
        process.exit(result.status);
      } else {
        process.exit(128);
      }
    });
}
