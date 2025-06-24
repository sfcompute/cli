import type { Command } from "@commander-js/extra-typings";
import console from "node:console";
import process from "node:process";
import { Shescape } from "shescape";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import child_process from "node:child_process";
import { apiClient } from "../apiClient.ts";

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

      // First, let's get VM instance info to check its status
      const api = await apiClient();
      const vmListResponse = await api.GET("/v0/vms/instances");

      let vmInfo: any = null;
      if (vmListResponse.response.ok && vmListResponse.data) {
        vmInfo = vmListResponse.data.data?.find((vm: any) => vm.id === vmId);
      }

      const sshResponse = await api.GET("/v0/vms/ssh", {
        params: {
          query: { vm_id: vmId },
        },
      });

      if (!sshResponse.response.ok) {
        if (sshResponse.response.status === 401) {
          logSessionTokenExpiredAndQuit();
        }

        logAndQuit(
          `Failed to retrieve ssh information: ${sshResponse.response.statusText}`,
        );
      }

      if (!sshResponse.data) {
        logAndQuit("No SSH information returned from server");
      }

      const sshHostname = sshResponse.data.ssh_hostname;
      const sshPort = sshResponse.data.ssh_port;
      const sshHostKeys = sshResponse.data.ssh_host_keys || [];

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
            sshHostKey.key_type,
            sshHostKey.base64_encoded_key,
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
      
      // Check if SSH failed (common exit codes: 255 for connection refused, non-zero for other errors)
      if (result.status !== 0) {
        console.error("\n");
        
        // Check if VM was updated recently (within last 10 minutes)
        if (vmInfo && vmInfo.last_updated_at) {
          const lastUpdated = new Date(vmInfo.last_updated_at);
          const now = new Date();
          const timeDiff = now.getTime() - lastUpdated.getTime();
          const minutesSinceUpdate = Math.floor(timeDiff / 1000 / 60);
          
          if (minutesSinceUpdate < 10) {
            console.error(`⚠️  VM ${vmId} was updated ${minutesSinceUpdate} minute${minutesSinceUpdate === 1 ? '' : 's'} ago.`);
            console.error("   Networking might still be setting up. Please wait a few more minutes and try again.");
            console.error("");
            console.error("   If this issue persists after 10 minutes, check:");
            console.error("   • Your SSH key is correctly configured with 'sf vm script'");
            console.error("   • VM logs with 'sf vm logs -i " + vmId + "'");
            process.exit(result.status || 255);
          }
        }
        
        // Generic error message if not recently updated
        console.error(`⚠️  SSH connection failed for VM ${vmId}.`);
        console.error("");
        console.error("   Possible causes:");
        console.error("   • VM is still starting up (wait a few minutes)");
        console.error("   • SSH key not configured (use 'sf vm script' to add your key)");
        console.error("   • Network connectivity issues");
        console.error("");
        console.error("   To debug, check VM logs: sf vm logs -i " + vmId);
        
        process.exit(result.status || 255);
      }
      
      if (result.status !== undefined) {
        process.exit(result.status);
      } else {
        process.exit(128);
      }
    });
}
