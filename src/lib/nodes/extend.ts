import { Command } from "@commander-js/extra-typings";
import { gray } from "jsr:@std/fmt/colors";
import console from "node:console";
import ora from "ora";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import {
  createNodesTable,
  maxPriceOption,
  requiredDurationOption,
} from "./utils.ts";
import SFCNodes from "npm:@sfcompute/nodes-sdk-alpha@latest";

const extend = new Command("extend")
  .description("Extend the duration of reserved nodes and update their pricing")
  .argument("<nodes...>", "Node IDs or names to extend")
  .addOption(requiredDurationOption)
  .addOption(maxPriceOption)
  .addHelpText(
    "after",
    `
Examples:
  \x1b[2m# Extend a single node by 1 hour with max price $15/hour\x1b[0m
  $ sf nodes extend my-node --duration 1h --max-price 15.00

  \x1b[2m# Extend multiple nodes by 4 hours with max price $12/hour\x1b[0m
  $ sf nodes extend node-1 node-2 node-3 --duration 4h --max-price 12.00

  \x1b[2m# Extend by node ID instead of name\x1b[0m
  $ sf nodes extend node-abc123 --duration 2h --max-price 10.00

  \x1b[2m# Extend with raw seconds\x1b[0m
  $ sf nodes extend my-node --duration 7200 --max-price 10.00
`,
  )
  .action(extendNodeAction);

async function extendNodeAction(
  nodeNames: string[],
  options: ReturnType<typeof extend.opts>,
) {
  try {
    const client = await nodesClient();

    const spinner = ora(`Extending ${nodeNames.length} node(s)...`).start();

    const results: { name: string; node: SFCNodes.Node }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const nodeIdOrName of nodeNames) {
      try {
        const result = await client.nodes.extend(nodeIdOrName, {
          duration_seconds: options.duration!,
          max_price_per_hour: Math.round(options.maxPrice * 100),
        });

        results.push({ name: nodeIdOrName, node: result.node });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push({ name: nodeIdOrName, error: errorMsg });
      }
    }

    if (results.length > 0) {
      spinner.succeed(`Successfully extended ${results.length} node(s)`);
    }

    if (errors.length > 0) {
      if (results.length === 0) {
        spinner.fail("Failed to extend any nodes");
      } else {
        spinner.warn(
          `Extended ${results.length} node(s), but ${errors.length} failed`,
        );
      }
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
