import console from "node:console";
import process from "node:process";
import { Command } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";
import chalk from "chalk";
import ora from "ora";

import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import {
  createNodesTable,
  jsonOption,
  pluralizeNodes,
  yesOption,
} from "./utils.ts";

const deleteCommand = new Command("delete")
  .description("Permanently delete compute nodes")
  .showHelpAfterError()
  .argument("<names...>", "Node IDs or names to delete")
  .addOption(yesOption)
  .option(
    "--dry-run",
    "Show what would be deleted without actually deleting nodes",
  )
  .addOption(jsonOption)
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# Delete a single node by name\x1b[0m
  $ sf nodes delete node-1

  \x1b[2m# Delete node by ID\x1b[0m
  $ sf nodes delete node-abc123

  \x1b[2m# Delete nodes without confirmation\x1b[0m
  $ sf nodes delete node-1 --yes

  \x1b[2m# Show what would be deleted in JSON format\x1b[0m
  $ sf nodes delete node-1 --dry-run --json

  \x1b[2m# Delete nodes and output result in JSON format\x1b[0m
  $ sf nodes delete node-1 --json
`,
  )
  .action(async (names, options) => {
    await deleteNodesAction(names, options);
  });

async function deleteNodesAction(
  nodeNames: string[],
  options: ReturnType<typeof deleteCommand.opts>,
) {
  try {
    const client = await nodesClient();

    // Use the API's names parameter to filter nodes directly
    const spinner = ora("Fetching nodes to delete...").start();
    const { data: fetchedNodes } = await client.nodes.list({ name: nodeNames });
    spinner.stop();

    // Check which names were not found
    const foundNodes: { name: string; node: SFCNodes.Node }[] = [];
    const notFound: string[] = [];

    for (const nameOrId of nodeNames) {
      const node = fetchedNodes.find(
        (n) => n.name === nameOrId || n.id === nameOrId,
      );
      if (node) {
        foundNodes.push({ name: nameOrId, node });
      } else {
        notFound.push(nameOrId);
      }
    }

    if (notFound.length > 0) {
      console.log(
        chalk.red(
          `Could not find ${notFound.length === 1 ? "this" : "these"} ${pluralizeNodes(
            notFound.length,
          )}:`,
        ),
      );
      for (const name of notFound) {
        console.log(`  • ${name}`);
      }
      console.log();
    }

    // Filter out non-deletable nodes
    // A node cannot be deleted if:
    // 1. It has active or pending VMs, OR
    // 2. It's an auto reserved node that hasn't been released
    const activeOrPendingVMStatuses = ["Pending", "Running"];

    const activeVMNodes: { name: string; node: SFCNodes.Node }[] = [];
    const unreleasedAutoNodes: { name: string; node: SFCNodes.Node }[] = [];
    const deletableNodes: { name: string; node: SFCNodes.Node }[] = [];

    for (const { name, node } of foundNodes) {
      // Check if node has an active or pending VM
      const hasActiveVM = node.vms?.data?.some((vm) =>
        activeOrPendingVMStatuses.includes(vm.status),
      );

      if (hasActiveVM) {
        activeVMNodes.push({ name, node });
        continue;
      }

      // Check if it's an auto reserved node that hasn't been released
      if (node.node_type === "autoreserved" && node.status !== "released") {
        unreleasedAutoNodes.push({ name, node });
        continue;
      }

      // Node can be deleted
      deletableNodes.push({ name, node });
    }

    const nonDeletableCount = activeVMNodes.length + unreleasedAutoNodes.length;

    if (nonDeletableCount > 0) {
      // Print nodes with active or pending VMs
      if (activeVMNodes.length > 0) {
        console.log(
          chalk.red(
            `Cannot delete ${activeVMNodes.length === 1 ? "this" : "these"} ${pluralizeNodes(
              activeVMNodes.length,
            )} with active or pending VMs:`,
          ),
        );
        for (const { name } of activeVMNodes) {
          console.log(`  • ${name}`);
        }
        console.log(
          chalk.redBright(
            "\nNodes cannot be deleted while they have an active or pending VM.\n",
          ),
        );
      }

      // Print non-released auto-reserved nodes
      if (unreleasedAutoNodes.length > 0) {
        console.log(
          chalk.red(
            `Cannot delete ${
              unreleasedAutoNodes.length === 1 ? "this" : "these"
            } ${pluralizeNodes(
              unreleasedAutoNodes.length,
            )} non-released auto-reserved nodes:`,
          ),
        );
        for (const { name } of unreleasedAutoNodes) {
          console.log(`  • ${name}`);
        }
        console.log(
          chalk.redBright(
            `\nRelease the ${pluralizeNodes(
              unreleasedAutoNodes.length,
            )} first with: sf nodes release <node-names...>\n`,
          ),
        );
      }
    }

    const nodesToDelete = deletableNodes.map(({ node }) => node);

    if (nodesToDelete.length === 0) {
      console.log("No nodes can be deleted.");
      process.exit(1);
    }

    if (options.dryRun) {
      if (options.json) {
        console.log(JSON.stringify(nodesToDelete, null, 2));
        process.exit(0);
      }

      console.log("The following nodes would be deleted:");

      if (nodesToDelete.length > 0) {
        console.log(createNodesTable(nodesToDelete));
        console.log(
          chalk.gray(
            `\nWould delete ${nodesToDelete.length} ${pluralizeNodes(
              nodesToDelete.length,
            )}.`,
          ),
        );
      }

      return;
    }

    // Show nodes table and get confirmation for destructive action
    if (!options.yes) {
      if (nodesToDelete.length > 0) {
        console.log(
          `The following ${pluralizeNodes(
            nodesToDelete.length,
          )} will be permanently deleted:`,
        );
        console.log(createNodesTable(nodesToDelete));
      }

      if (nodesToDelete.length > 0) {
        console.log(
          chalk.redBright(
            `\nWarning: ${
              nodesToDelete.length === 1 ? "This node" : "These nodes"
            } will be permanently deleted and cannot be recovered.\n`,
          ),
        );
      }

      const confirmed = await confirm({
        message: `Delete ${nodesToDelete.length} ${pluralizeNodes(
          nodesToDelete.length,
        )}? This action cannot be undone.`,
        default: false,
      });
      if (!confirmed) {
        console.log("Operation cancelled.");
        process.exit(0);
      }
    }

    const deleteSpinner = ora(
      `Deleting ${nodesToDelete.length} ${pluralizeNodes(
        nodesToDelete.length,
      )}...`,
    ).start();

    const results: { name: string; status: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const node of nodesToDelete) {
      try {
        // Delete node using the actual SDK API call
        await client.nodes.delete(node.id);
        results.push({ name: node.name, status: "deleted" });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push({ name: node.name, error: errorMsg });
      }
    }

    if (results.length > 0) {
      deleteSpinner.succeed(
        `Deleted ${results.length} ${pluralizeNodes(results.length)}`,
      );
    }

    if (errors.length > 0) {
      if (results.length === 0) {
        deleteSpinner.fail("Failed to delete any nodes");
      } else {
        deleteSpinner.warn(
          `Deleted ${results.length} ${pluralizeNodes(
            results.length,
          )}, but ${errors.length} failed`,
        );
      }
      console.error(chalk.gray("\nFailed to delete:"));
      for (const error of errors) {
        console.error(`  • ${error.name}: ${error.error}`);
      }
    }

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      process.exit(0);
    }
  } catch (err) {
    handleNodesError(err);
  }
}

export default deleteCommand;
