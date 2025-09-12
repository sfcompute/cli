import type { Command } from "@commander-js/extra-typings";
import console from "node:console";
import process from "node:process";
import { Shescape } from "shescape";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { getApiUrl } from "../../helpers/urls.ts";
import { getAuthToken } from "../../helpers/config.ts";
import child_process from "node:child_process";

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
        ssh_host_keys: {
          keyType: string;
          base64EncodedKey: string;
        }[] | undefined;
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
