import { Command } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import { gray, yellow } from "jsr:@std/fmt/colors";
import console from "node:console";
import process from "node:process";
import ora from "ora";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";

import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import {
  createNodesTable,
  forceOption,
  jsonOption,
  pluralizeNodes,
} from "./utils.ts";

async function releaseNodesAction(
  nodeNames: string[],
  options: ReturnType<typeof release.opts>,
) {
  try {
    const client = await nodesClient();

    // Fetch and filter nodes for both dry run and confirmation
    const spinner = ora("Fetching nodes to release...").start();
    const { data: allNodes } = await client.nodes.list();
    spinner.stop();

    // Filter nodes that match the provided names/IDs
    const nodesToRelease: SFCNodes.Node[] = [];
    const notFound: string[] = [];

    for (const nameOrId of nodeNames) {
      const node = allNodes.find((n) =>
        n.name === nameOrId || n.id === nameOrId
      );
      if (node) nodesToRelease.push(node);
      else notFound.push(nameOrId);
    }

    if (options.dryRun) {
      if (options.json) {
        console.log(JSON.stringify(
          nodesToRelease,
          null,
          2,
        ));
        process.exit(0);
      }

      console.log("The following nodes would be released:");

      if (nodesToRelease.length > 0) {
        console.log(createNodesTable(nodesToRelease));
        console.log(
          gray(
            `\nWould release ${nodesToRelease.length} ${
              pluralizeNodes(nodesToRelease.length)
            }.`,
          ),
        );
      }

      if (notFound.length > 0) {
        console.log(gray("\nNodes not found:"));
        for (const name of notFound) {
          console.log(`  • ${name}`);
        }
        console.log("\n");
      }

      if (nodesToRelease.length === 0) {
        console.log("No matching nodes found to release.");
      }

      return;
    }

    // Show nodes table and get confirmation for destructive action
    if (!options.force) {
      if (nodesToRelease.length > 0) {
        console.log("The following nodes will be released:");
        console.log(createNodesTable(nodesToRelease));
      }

      if (notFound.length > 0) {
        console.log(gray("\nNodes not found:"));
        for (const name of notFound) {
          console.log(`  • ${name}`);
        }
      }

      if (nodesToRelease.length === 0) {
        console.log(yellow("\nNo matching nodes found to release."));
        process.exit(0);
      }

      const confirmed = await confirm({
        message: `Release ${nodesToRelease.length} ${
          pluralizeNodes(nodesToRelease.length)
        }? This action cannot be undone.`,
        default: false,
      });
      if (!confirmed) {
        console.log("Operation cancelled.");
        process.exit(0);
      }
    }

    const releaseSpinner = ora(
      `Releasing ${nodesToRelease.length} ${
        pluralizeNodes(nodesToRelease.length)
      }...`,
    )
      .start();

    const results: { name: string; status: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const node of nodesToRelease) {
      try {
        // Release node using the actual SDK API call (accepts ID or name)
        await client.nodes.release(node.id, { body: {} });
        results.push({ name: node.name, status: "released" });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push({ name: node.name, error: errorMsg });
      }
    }

    if (results.length > 0) {
      releaseSpinner.succeed(
        `Released ${results.length} ${pluralizeNodes(results.length)}`,
      );
    }

    if (errors.length > 0) {
      if (results.length === 0) {
        releaseSpinner.fail("Failed to release any nodes");
      } else {
        releaseSpinner.warn(
          `Released ${results.length} ${
            pluralizeNodes(results.length)
          }, but ${errors.length} failed`,
        );
      }
      console.error(gray("\nFailed to release:"));
      for (const error of errors) {
        console.error(`  • ${error.name}: ${error.error}`);
      }
    }

    if (options.json) {
      console.log(JSON.stringify(
        results,
        null,
        2,
      ));
      process.exit(0);
    }

    if (results.length === 0 && errors.length === 0) {
      releaseSpinner.fail("No nodes specified");
    }
  } catch (err) {
    handleNodesError(err);
  }
}

const release = new Command("release")
  .description("Release one or more compute nodes")
  .argument("<names...>", "Node IDs or names to release")
  .addOption(forceOption)
  .option(
    "--dry-run",
    "Show what would be released without actually releasing nodes",
  )
  .addOption(jsonOption)
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# Release a single node by name\x1b[0m
  $ sf nodes release node-1

  \x1b[2m# Release multiple nodes by name\x1b[0m
  $ sf nodes release node-1 node-2 node-3

  \x1b[2m# Release node by ID\x1b[0m
  $ sf nodes release node-abc123

  \x1b[2m# Release nodes without confirmation\x1b[0m
  $ sf nodes release node-1 --force

  \x1b[2m# Show what would be released in JSON format\x1b[0m
  $ sf nodes release node-1 --dry-run --json

  \x1b[2m# Release nodes and output result in JSON format\x1b[0m
  $ sf nodes release node-1 --json
`,
  )
  .action(async (names, options) => {
    await releaseNodesAction(names, options);
  });

export default release;
