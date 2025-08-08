import { Command } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import { brightRed, gray, red } from "jsr:@std/fmt/colors";
import console from "node:console";
import process from "node:process";
import ora from "ora";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import {
  createNodesTable,
  forceOption,
  jsonOption,
  maxPriceOption,
  pluralizeNodes,
  requiredDurationOption,
} from "./utils.ts";
import SFCNodes from "npm:@sfcompute/nodes-sdk-alpha@latest";
import { getPricePerGpuHourFromQuote, getQuote } from "../buy/index.tsx";
import { GPUS_PER_NODE } from "../constants.ts";
import { logAndQuit } from "../../helpers/errors.ts";

const extend = new Command("extend")
  .description("Extend the duration of reserved nodes and update their pricing")
  .showHelpAfterError()
  .argument("<nodes...>", "Node IDs or names to extend")
  .addOption(requiredDurationOption)
  .addOption(maxPriceOption)
  .addOption(forceOption)
  .addOption(jsonOption)
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# Extend a single node by 1 hour with max price $15/hour\x1b[0m
  $ sf nodes extend my-node --duration 1h --max-price 15.00

  \x1b[2m# Extend multiple nodes by 4 hours with max price $12/hour\x1b[0m
  $ sf nodes extend node-1 node-2 node-3 --duration 4h --max-price 12.00

  \x1b[2m# Extend by node ID instead of name\x1b[0m
  $ sf nodes extend node-abc123 --duration 2h --max-price 10.00

  \x1b[2m# Extend with raw seconds\x1b[0m
  $ sf nodes extend my-node --duration 7200 --max-price 10.00

  \x1b[2m# Skip confirmation prompt\x1b[0m
  $ sf nodes extend my-node --duration 1h --max-price 10.00 --force

  \x1b[2m# Output extended nodes in JSON format\x1b[0m
  $ sf nodes extend my-node --duration 1h --max-price 10.00 --json
`,
  )
  .action(extendNodeAction);

async function extendNodeAction(
  nodeNames: string[],
  options: ReturnType<typeof extend.opts>,
) {
  try {
    const client = await nodesClient();

    // Fetch all nodes and filter by provided names/IDs
    const fetchSpinner = ora().start();
    const { data: allNodes } = await client.nodes.list();
    fetchSpinner.stop();

    // Filter nodes that match the provided names/IDs
    const nodes: { name: string; node: SFCNodes.Node }[] = [];
    const notFound: string[] = [];

    for (const nameOrId of nodeNames) {
      const node = allNodes.find((n) =>
        n.name === nameOrId || n.id === nameOrId
      );
      if (node) {
        nodes.push({ name: nameOrId, node });
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

    // Filter out spot nodes (they can't be extended)
    const spotNodes = nodes.filter(({ node }) => node.node_type === "spot");
    const extendableNodes = nodes.filter(({ node }) =>
      node.node_type !== "spot"
    );

    if (spotNodes.length > 0) {
      console.log(
        red(
          `Cannot extend ${spotNodes.length === 1 ? "this" : "these"} spot ${
            pluralizeNodes(spotNodes.length)
          } (they auto-extend):`,
        ),
      );
      for (const { name } of spotNodes) {
        console.log(`  • ${name}`);
      }
      console.log(
        brightRed(
          `\nTo configure spot nodes, use the \`sf nodes set\` command.`,
        ),
      );
    }

    if (extendableNodes.length === 0) {
      process.exit(1);
    }

    // Only show pricing and get confirmation if not using --force
    if (!options.force) {
      // Get quote for accurate pricing preview
      const spinner = ora(
        `Quoting extending ${extendableNodes.length} ${
          pluralizeNodes(extendableNodes.length)
        }...`,
      ).start();

      // Add flexibility to duration for better quote matching (matches buy command logic)
      const durationSeconds = options.duration!;
      const minDurationSeconds = Math.max(
        1,
        durationSeconds - Math.ceil(durationSeconds * 0.1),
      );
      const maxDurationSeconds = Math.max(
        durationSeconds + 3600,
        durationSeconds + Math.ceil(durationSeconds * 0.1),
      );

      const quote = await getQuote({
        instanceType: "h100v",
        quantity: extendableNodes.length,
        minStartTime: "NOW",
        maxStartTime: "NOW",
        minDurationSeconds: minDurationSeconds,
        maxDurationSeconds: maxDurationSeconds,
      });

      spinner.stop();

      let confirmationMessage = `Extend ${extendableNodes.length} ${
        pluralizeNodes(extendableNodes.length)
      } for ${Math.round(durationSeconds / 3600 * 100) / 100} hours`;

      if (quote) {
        const pricePerGpuHour = getPricePerGpuHourFromQuote(quote);
        const pricePerNodeHour = (pricePerGpuHour * GPUS_PER_NODE) / 100;
        confirmationMessage += ` for ~$${pricePerNodeHour.toFixed(2)}/node/hr`;
      } else {
        logAndQuit(
          red(
            "No nodes available matching your requirements. This is likely due to insufficient capacity.",
          ),
        );
      }

      const confirmed = await confirm({
        message: confirmationMessage + "?",
        default: false,
      });
      if (!confirmed) process.exit(0);
    }

    const spinner = ora(
      `Extending ${extendableNodes.length} ${
        pluralizeNodes(extendableNodes.length)
      }...`,
    ).start();

    const results: { name: string; node: SFCNodes.Node }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const { name: nodeIdOrName, node: originalNode } of extendableNodes) {
      try {
        const extendedNode = await client.nodes.extend(originalNode.id, {
          duration_seconds: options.duration!,
          max_price_per_node_hour: Math.round(options.maxPrice * 100),
        });

        results.push({ name: nodeIdOrName, node: extendedNode });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push({ name: nodeIdOrName, error: errorMsg });
      }
    }

    if (results.length > 0) {
      spinner.succeed(
        `Successfully extended ${results.length} ${
          pluralizeNodes(results.length)
        }`,
      );
    }

    if (errors.length > 0) {
      if (results.length === 0) {
        spinner.fail("Failed to extend any nodes");
      } else {
        spinner.warn(
          `Extended ${results.length} ${
            pluralizeNodes(results.length)
          }, but ${errors.length} failed`,
        );
      }
    }

    if (options.json) {
      console.log(JSON.stringify(results.map((r) => r.node), null, 2));
      process.exit(0);
    }

    if (results.length > 0) {
      console.log(gray("\nExtended nodes:"));
      console.log(createNodesTable(results.map((r) => r.node)));
      console.log(
        gray(
          `\nDuration extended by: ${options.duration} seconds (${
            Math.round(options.duration! / 3600 * 100) / 100
          } hours)`,
        ),
      );
      console.log(gray(`Max price: $${options.maxPrice.toFixed(2)}/hour`));
    }

    if (errors.length > 0) {
      console.log(gray("\nFailed to extend:"));
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

export default extend;
