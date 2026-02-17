import child_process from "node:child_process";
import console from "node:console";
import process from "node:process";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import { Shescape } from "shescape";

import { apiClient } from "../../apiClient.ts";
import { getAuthToken, loadConfig } from "../../helpers/config.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import { jsonOption } from "./utils.ts";

// Canonical SSH info shape (v2 NodeSshInfo format)
type SshInfo = {
  hostname: string;
  port: number;
  host_keys: { key_type: string; key: string }[];
  last_successful_key_update: number | null;
  last_attempted_key_update: number | null;
};

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
    "Node name, Node ID, or VM ID to SSH into.\nFollows `ssh` behavior (i.e. root@node or jenson@node).",
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

      const sshSpinner = ora("Fetching SSH information...").start();
      const config = await loadConfig();
      const token = await getAuthToken();

      let hostKeyAlias = "";
      let data: SshInfo | undefined;

      // Try v2 endpoint for non-vm_ IDs
      if (!nodeOrVmId.startsWith("vm_")) {
        const v2Response = await fetch(
          `${config.api_url}/v2/nodes/${nodeOrVmId}/ssh`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (v2Response.ok) {
          const v2Data = await v2Response.json();
          data = {
            hostname: v2Data.hostname,
            port: v2Data.port,
            host_keys: v2Data.host_keys ?? [],
            last_successful_key_update:
              v2Data.last_successful_key_update ?? null,
            last_attempted_key_update:
              v2Data.last_attempted_key_update ?? null,
          };
          hostKeyAlias = `${nodeOrVmId}.v2.nodes.sfcompute.dev`;
        }
      }

      // Fall back to v0 flow if v2 didn't resolve
      if (!data) {
        let vmId: string;

        if (!nodeOrVmId.startsWith("vm_")) {
          const client = await nodesClient();
          try {
            const node = await client.nodes.get(nodeOrVmId);
            if (!node?.current_vm) {
              sshSpinner.fail(
                `Node ${chalk.cyan(
                  nodeOrVmId,
                )} does not have a current VM. VMs can take up to 5-10 minutes to spin up.`,
              );
              process.exit(1);
            }
            vmId = node.current_vm.id;
          } catch {
            vmId = nodeOrVmId;
          }
        } else {
          vmId = nodeOrVmId;
        }

        const client = await apiClient(token);
        const { response, data: sshData } = await client.GET("/v0/vms/ssh", {
          params: { query: { vm_id: vmId } },
        });

        if (response.status === 401) {
          sshSpinner.stop();
          logSessionTokenExpiredAndQuit();
        }

        if (!response.ok || !sshData) {
          sshSpinner.fail(
            `Failed to retrieve SSH information for ${chalk.cyan(
              vmId,
            )}: ${response.statusText}`,
          );
          process.exit(1);
        }

        // Coerce v0 response to v2 shape
        data = {
          hostname: sshData.ssh_hostname,
          port: sshData.ssh_port,
          host_keys: (sshData.ssh_host_keys ?? []).map((k) => ({
            key_type: k.key_type,
            key: k.base64_encoded_key,
          })),
          last_successful_key_update:
            sshData.last_successful_key_update ?? null,
          last_attempted_key_update:
            sshData.last_attempted_key_update ?? null,
        };
        hostKeyAlias = `${vmId}.vms.sfcompute.dev`;
      }

      sshSpinner.succeed("SSH information fetched successfully.");

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const sshHostname = data.hostname;
      const sshPort = data.port;
      const sshHostKeys = data.host_keys;

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
            hostKeyAlias,
            sshHostKey.key_type,
            sshHostKey.key,
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

      cmd = cmd.concat(["-o", `HostKeyAlias=${hostKeyAlias}`]);
      cmd = cmd.concat([sshDestination]);

      let shescape: undefined | Shescape;
      let shell: undefined | string;
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

      // Ideally this would use `@alphahydrae/exec` but `pkg` doesn't
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
