import { Command, Option } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import { readFileSync } from "node:fs";
import { brightRed, gray, red } from "jsr:@std/fmt/colors";
import console from "node:console";
import process from "node:process";
import ora from "ora";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";

import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import {
  createNodesTable,
  jsonOption,
  pluralizeNodes,
  yesOption,
} from "./utils.ts";

const redeploy = new Command("redeploy")
  .description(
    "Redeploy nodes by replacing their current VMs with new ones",
  )
  .showHelpAfterError()
  .argument("<names...>", "Node IDs or names to redeploy")
  .addOption(
    new Option(
      "--image-id <imageId>",
      "VM image ID to use for the new VM (inherits from current VM if not specified)",
    ),
  )
  .addOption(
    new Option(
      "-u, --user-data <script>",
      "Cloud-init user data script to run during VM boot",
    ).conflicts("userDataFile"),
  )
  .addOption(
    new Option(
      "-U, --user-data-file <file>",
      "Path to a cloud-init user data script to run during VM boot",
    )
      .conflicts("userData")
      .argParser((val) => {
        try {
          return readFileSync(val, "utf-8");
        } catch {
          throw new Error(`Could not read file: ${val}`);
        }
      }),
  )
  .addOption(
    new Option(
      "--override-empty",
      "If set, any configuration left empty will be cleared in the new VM (default: inherits from current VM)",
    ),
  )
  .addOption(yesOption)
  .addOption(jsonOption)
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# Redeploy a single node (inherits current VM configuration)\x1b[0m
  $ sf nodes redeploy my-node

  \x1b[2m# Redeploy with a new VM image\x1b[0m
  $ sf nodes redeploy my-node --image-id vmi_0000000000000000

  \x1b[2m# Redeploy multiple nodes\x1b[0m
  $ sf nodes redeploy node-1 node-2 node-3

  \x1b[2m# Redeploy with custom cloud-init user data\x1b[0m
  $ sf nodes redeploy my-node --user-data-file /path/to/cloud-init

  \x1b[2m# Redeploy and clear inherited configuration\x1b[0m
  $ sf nodes redeploy my-node --override-empty

  \x1b[2m# Skip confirmation prompt\x1b[0m
  $ sf nodes redeploy my-node --yes

  \x1b[2m# Output redeployed nodes in JSON format\x1b[0m
  $ sf nodes redeploy my-node --json
`,
  )
  .action(redeployNodeAction);

async function redeployNodeAction(
  nodeNames: string[],
  options: ReturnType<typeof redeploy.opts>,
) {
  try {
    const client = await nodesClient();

    // Fetch nodes by names
    const fetchSpinner = ora().start(
      `Checking ${nodeNames.length} ${pluralizeNodes(nodeNames.length)}...`,
    );
    const { data: fetchedNodes } = await client.nodes.list({ name: nodeNames });
    fetchSpinner.stop();

    // Check which names were not found
    const foundNodes: { name: string; node: SFCNodes.Node }[] = [];
    const notFound: string[] = [];

    for (const nameOrId of nodeNames) {
      const node = fetchedNodes.find((n) =>
        n.name === nameOrId || n.id === nameOrId
      );
      if (node) {
        foundNodes.push({ name: nameOrId, node });
      } else {
        notFound.push(nameOrId);
      }
    }

    if (notFound.length > 0) {
      console.log(
        red(
          `Could not find ${notFound.length === 1 ? "this" : "these"} ${
            pluralizeNodes(notFound.length)
          }:`,
        ),
      );
      for (const name of notFound) {
        console.log(`  • ${name}`);
      }
      console.log();
    }

    // Filter out nodes that can't be redeployed (only running nodes can be redeployed)
    const redeployableStatuses = [
      "running" as const,
    ] as SFCNodes.Node["status"][];
    const nonRedeployableNodes = foundNodes.filter(({ node }) =>
      !redeployableStatuses.includes(node.status)
    );
    const redeployableNodes = foundNodes.filter(({ node }) =>
      redeployableStatuses.includes(node.status)
    );

    if (nonRedeployableNodes.length > 0) {
      console.log(
        red(
          `Cannot redeploy ${
            nonRedeployableNodes.length === 1 ? "this" : "these"
          } ${pluralizeNodes(nonRedeployableNodes.length)} (not running):`,
        ),
      );
      for (const { name } of nonRedeployableNodes) {
        console.log(`  • ${name}`);
      }
      console.log(
        brightRed(
          `\nOnly running nodes can be redeployed.\n`,
        ),
      );
    }

    if (redeployableNodes.length === 0) {
      process.exit(1);
    }

    // Prepare cloud-init user data if provided
    const userData = (options.userData ?? options.userDataFile)
      ? Array.from(
        (new TextEncoder()).encode(options.userData ?? options.userDataFile),
      )
      : undefined;

    // Show nodes table and get confirmation for destructive action
    if (!options.yes) {
      if (redeployableNodes.length > 0) {
        console.log(
          `The following ${
            pluralizeNodes(redeployableNodes.length)
          } will be redeployed:`,
        );
        console.log(createNodesTable(redeployableNodes.map((n) => n.node)));
      }

      const configChanges: string[] = [];
      if (options.imageId) {
        configChanges.push(`  • New image: ${options.imageId}`);
      }
      if (userData) {
        configChanges.push(`  • Updated cloud-init user data`);
      }
      if (options.overrideEmpty) {
        configChanges.push(
          `  • Clear any unspecified configuration (override empty)`,
        );
      }

      if (configChanges.length > 0) {
        console.log("\nConfiguration changes:");
        for (const change of configChanges) {
          console.log(change);
        }
      } else {
        console.log(
          "\nNo configuration changes specified. VMs will inherit current configuration.",
        );
      }

      console.log(
        `\n${
          redeployableNodes.length === 1 ? "This node" : "These nodes"
        } will have ${
          redeployableNodes.length === 1 ? "its" : "their"
        } current VM replaced with a new VM.\n`,
      );

      const confirmed = await confirm({
        message: `Redeploy ${redeployableNodes.length} ${
          pluralizeNodes(redeployableNodes.length)
        }? This action cannot be undone.`,
        default: false,
      });
      if (!confirmed) {
        console.log("Operation cancelled.");
        process.exit(0);
      }
    }

    const spinner = ora(
      `Redeploying ${redeployableNodes.length} ${
        pluralizeNodes(redeployableNodes.length)
      }...`,
    ).start();

    const results: { name: string; node: SFCNodes.Node }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (
      const { name: nodeIdOrName, node: originalNode } of redeployableNodes
    ) {
      try {
        const redeployedNode = await client.nodes.redeploy(originalNode.id, {
          image_id: options.imageId,
          cloud_init_user_data: userData,
          override_empty: options.overrideEmpty ?? false,
        });

        results.push({ name: nodeIdOrName, node: redeployedNode });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push({ name: nodeIdOrName, error: errorMsg });
      }
    }

    if (options.json) {
      console.log(JSON.stringify(results.map((r) => r.node), null, 2));
      process.exit(0);
    }

    if (results.length > 0) {
      spinner.succeed(
        `Successfully redeployed ${results.length} ${
          pluralizeNodes(results.length)
        }`,
      );
    }

    if (errors.length > 0) {
      if (results.length === 0) {
        spinner.fail("Failed to redeploy any nodes");
      } else {
        spinner.warn(
          `Redeployed ${results.length} ${
            pluralizeNodes(results.length)
          }, but ${errors.length} failed`,
        );
      }
    }

    if (results.length > 0) {
      console.log(gray("\nRedeployed nodes:"));
      console.log(createNodesTable(results.map((r) => r.node)));
      console.log(
        gray("\nNew VMs are being provisioned on these nodes."),
      );
    }

    if (errors.length > 0) {
      console.log(gray("\nFailed to redeploy:"));
      for (const error of errors) {
        console.log(`  • ${error.name}: ${error.error}`);
      }
    }

    if (results.length === 0 && errors.length === 0) {
      spinner.fail("No nodes specified");
    }
  } catch (err) {
    handleNodesError(err);
  }
}

export default redeploy;
