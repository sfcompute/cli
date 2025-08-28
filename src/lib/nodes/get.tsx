import React from "react";
import { Command } from "@commander-js/extra-typings";
import { gray, red } from "jsr:@std/fmt/colors";
import console from "node:console";
import process from "node:process";
import ora from "ora";
import { render } from "ink";

import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import { createNodesTable, jsonOption, pluralizeNodes } from "./utils.ts";
import { getAuthToken } from "../../helpers/config.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { NodesVerboseDisplay } from "./list.tsx";

const get = new Command("get")
  .description("Get detailed information about specific nodes")
  .showHelpAfterError()
  .argument("<names...>", "Node names to get information about")
  .option("--short", "Show nodes in table format instead of verbose output")
  .addOption(jsonOption)
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# Get detailed information about specific nodes (verbose by default)\x1b[0m
  $ sf nodes get node-1 node-2

  \x1b[2m# Get nodes in table format\x1b[0m
  $ sf nodes get node-1 node-2 --short

  \x1b[2m# Get nodes in JSON format\x1b[0m
  $ sf nodes get node-1 node-2 --json
`,
  )
  .action(getNodesAction);

async function getNodesAction(
  nodeNames: string[],
  options: ReturnType<typeof get.opts>,
) {
  try {
    const token = await getAuthToken();
    if (!token) {
      logAndQuit("Not logged in. Please run 'sf login' first.");
    }
    const client = await nodesClient(token);

    // Use the API's names parameter to filter nodes directly
    const spinner = ora("Fetching nodes...").start();
    const { data: fetchedNodes } = await client.nodes.list({ name: nodeNames });
    spinner.stop();

    // Check which names were not found
    const foundNames = new Set(fetchedNodes.map((node) => node.name));
    const notFound: string[] = [];

    for (const name of nodeNames) {
      if (!foundNames.has(name)) {
        notFound.push(name);
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

    if (fetchedNodes.length === 0) {
      console.log("No nodes found.");
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(fetchedNodes, null, 2));
      return;
    }

    if (options.short) {
      // Show table format
      console.log(createNodesTable(fetchedNodes));
      console.log(
        gray(
          `\nFound ${fetchedNodes.length} ${
            pluralizeNodes(fetchedNodes.length)
          }.`,
        ),
      );
    } else {
      // Show verbose output by default
      render(<NodesVerboseDisplay nodes={fetchedNodes} />);
    }
  } catch (err) {
    handleNodesError(err);
  }
}

export default get;
