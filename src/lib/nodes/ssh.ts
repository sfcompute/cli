import { Command } from "@commander-js/extra-typings";
import console from "node:console";
import process from "node:process";
import { Shescape } from "shescape";
import child_process from "node:child_process";
import ora from "ora";
import { cyan } from "jsr:@std/fmt/colors";

import { jsonOption } from "./utils.ts";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { getApiUrl } from "../../helpers/urls.ts";
import { getAuthToken } from "../../helpers/config.ts";

const ssh = new Command("ssh")
  .description(`SSH into a VM on a node.

Runs \`ssh\` with host keys from the API, forgoing the need to manually accept keys on first connect.
Keys are fetched asynchronously from the VM's SSH server and may take a moment to populate.

Standard \`ssh\` behavior applies (e.g. defaults to your current username).`)
  .showHelpAfterError()
  .option("-q, --quiet", "Quiet mode", false)
  .option(
    "--use-host-keys [value]",
    "Use API provided SSH server host keys if known",
    true,
  )
  .addOption(jsonOption)
  .argument(
    "<destination>",
    "Node name, Node ID, or VM ID to SSH into.\nFollows \`ssh\` behavior (i.e. root@node or jenson@node).",
  )
  .usage("[options] [user@]<destination>")
  .allowExcessArguments(false)
  .addHelpText(
    "after",
    `
Examples:

  \x1b[2m# SSH into a node's current VM\x1b[0m
  $ sf nodes ssh root@my-node

  \x1b[2m# SSH with a specific username\x1b[0m
  $ sf nodes ssh jenson@my-node
  
  \x1b[2m# SSH directly to a VM ID\x1b[0m
  $ sf nodes ssh root@vm_xxxxxxxxxxxxxxxxxxxxx
`,
  )
  .action(async (destination, options) => {
    try {
      const splitDestination = destination.split("@");
      let nodeOrVmId: string;
      let sshUsername: string | undefined;

      if (splitDestination.length === 1) {
        sshUsername = undefined;
        nodeOrVmId = splitDestination[0];
      } else if (splitDestination.length === 2) {
        sshUsername = splitDestination[0];
        nodeOrVmId = splitDestination[1];
      } else {
        logAndQuit(`Invalid SSH destination string: ${destination}`);
      }

      let vmId: string;

      // If the ID doesn't start with vm_, assume it's a node name/ID
      if (!nodeOrVmId.startsWith("vm_")) {
        const client = await nodesClient();
        const spinner = ora("Fetching node information...").start();

        try {
          const node = await client.nodes.get(nodeOrVmId);
          spinner.succeed(`Node found for name ${cyan(nodeOrVmId)}.`);

          if (!node?.current_vm) {
            spinner.fail(
              `Node ${
                cyan(nodeOrVmId)
              } does not have a current VM. VMs can take up to 5-10 minutes to spin up.`,
            );
            process.exit(1);
          }

          vmId = node.current_vm.id;
        } catch {
          spinner.info(
            `No node found for name ${
              cyan(nodeOrVmId)
            }. Interpreting as VM ID...`,
          );
          vmId = nodeOrVmId;
        }
      } else {
        vmId = nodeOrVmId;
      }

      const sshSpinner = ora("Fetching SSH information...").start();
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
          sshSpinner.stop();
          logSessionTokenExpiredAndQuit();
        }

        sshSpinner.fail(
          `Failed to retrieve SSH information for ${
            cyan(vmId)
          }: ${response.statusText}`,
        );
        process.exit(1);
      }

      const data = (await response.json()) as {
        ssh_hostname: string;
        ssh_port: number;
        ssh_host_keys: {
          key_type: string;
          base64_encoded_key: string;
        }[] | undefined;
      };
      sshSpinner.succeed("SSH information fetched successfully.");

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

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
            `${vmId}.vms.sfcompute.dev`,
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
      if (result.status !== undefined) {
        process.exit(result.status);
      } else {
        process.exit(128);
      }
    } catch (err) {
      handleNodesError(err);
    }
  });

export default ssh;
