import { Command } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
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
  printNodeStatus,
  yesOption,
} from "./utils.ts";

const release = new Command("release")
  .description(
    "Release one or more compute nodes (stop a node from auto-renewing)",
  )
  .showHelpAfterError()
  .argument("<names...>", "Node IDs or names to release")
  .addOption(yesOption)
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
  $ sf nodes release node-1 --yes

  \x1b[2m# Show what would be released in JSON format\x1b[0m
  $ sf nodes release node-1 --dry-run --json

  \x1b[2m# Release nodes and output result in JSON format\x1b[0m
  $ sf nodes release node-1 --json
`,
  )
  .action(async (names, options) => {
    await releaseNodesAction(names, options);
  });

async function releaseNodesAction(
  nodeNames: string[],
  options: ReturnType<typeof release.opts>,
) {
  try {
    const client = await nodesClient();

    // Use the API's names parameter to filter nodes directly
    const spinner = ora("Fetching nodes to release...").start();
    const { data: fetchedNodes } = await client.nodes.list({ names: nodeNames });
    spinner.stop();

    // Check which names were not found
    const foundNames = new Set(fetchedNodes.map((node) => node.name));
    const foundNodes: { name: string; node: SFCNodes.Node }[] = [];
    const notFound: string[] = [];

    for (const nameOrId of nodeNames) {
      const node = fetchedNodes.find((n) => n.name === nameOrId);
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

    // Filter out non-releasable nodes (already released, failed, terminated, deleted)
    const releasableStatuses = [
      "running",
      "pending",
      "awaitingcapacity",
    ] as SFCNodes.Node["status"][];
    const nonReleasableNodes = foundNodes.filter(({ node }) =>
      !releasableStatuses.includes(node.status)
    );
    const releasableNodes = foundNodes.filter(({ node }) =>
      releasableStatuses.includes(node.status)
    );

    if (nonReleasableNodes.length > 0) {
      console.log(
        red(
          `Cannot release ${
            nonReleasableNodes.length === 1 ? "this" : "these"
          } ${pluralizeNodes(nonReleasableNodes.length)}:`,
        ),
      );
      for (const { name, node } of nonReleasableNodes) {
        console.log(`  • ${name} (${printNodeStatus(node.status)})`);
      }
      console.log(
        brightRed(
          `\nOnly nodes with status 'Running', 'Pending', or 'Awaiting Capacity' can be released.\n`,
        ),
      );
    }

    const nodesToRelease = releasableNodes.map(({ node }) => node);

    if (nodesToRelease.length === 0) {
      process.exit(1);
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

      if (nodesToRelease.length === 0) {
        console.log("No matching nodes found to release.");
      }

      return;
    }

    // Show nodes table and get confirmation for destructive action
    if (!options.yes) {
      if (nodesToRelease.length > 0) {
        console.log(
          `The following ${
            pluralizeNodes(nodesToRelease.length)
          } will be released:`,
        );
        console.log(createNodesTable(nodesToRelease));
      }

      if (nodesToRelease.length > 0) {
        console.log(
          `No additional time will be purchased for ${
            nodesToRelease.length === 1 ? "this" : "these"
          } ${pluralizeNodes(nodesToRelease.length)}. ${
            nodesToRelease.length === 1 ? "It" : "They"
          } will expire at the end time.\n`,
        );
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

export default release;
