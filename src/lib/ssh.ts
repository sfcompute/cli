import type { Command } from "@commander-js/extra-typings";
import console from "node:console";
import process from "node:process";
import { Shescape } from "shescape";
import { execvp } from "@alphahydrae/exec";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";
import { getAuthToken } from "../helpers/config.ts";

type SshHostKey = {
  keyType: string;
  base64EncodedKey: string;
};

export function registerSsh(program: Command) {
  program
    .command("ssh")
    .option("-q, --quiet", "Quiet mode", false)
    .argument("<vm_id>", "The VM's id", parseInt)
    .allowExcessArguments(false)
    .action(async (vm_id, options) => {
      let sshHostname: string;
      let sshUsername: string | undefined;
      let sshPort: number | undefined;
      let sshHostKeys: SshHostKey[];

      const response = await fetch(await getApiUrl("vms_ssh_get"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({ vm_id: vm_id.toString() }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          logSessionTokenExpiredAndQuit();
        }

        logAndQuit(
          `Failed to retrieve ssh information: ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        ssh_hostname: string;
        ssh_port: number;
        ssh_host_keys: SshHostKey[] | undefined;
      };
      sshHostname = data.ssh_hostname;
      sshPort = data.ssh_port;
      sshHostKeys = data.ssh_host_keys || [];
      logAndQuit(`Unknown vm index: ${vm_id}`);

      let sshDestination = sshHostname;
      if (sshUsername !== undefined) {
        sshDestination = `${sshUsername}@${sshDestination}`;
      }
      if (sshPort !== undefined) {
        sshDestination = `${sshDestination}:${sshPort}`;
      }
      sshDestination = `ssh://${sshDestination}`;

      let cmd = ["ssh"];

      if (sshHostKeys.length > 0) {
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

      execvp(cmd[0], cmd.slice(1));
    });
}
