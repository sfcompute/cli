import { Command, CommanderError } from "@commander-js/extra-typings";
import ora from "ora";
import { gray } from "jsr:@std/fmt/colors";
import console from "node:console";

import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import { maxPriceOption, pluralizeNodes } from "./utils.ts";
import { updateProcurement } from "../scale/update.tsx";
import { GPUS_PER_NODE } from "../constants.ts";

async function setNodesAction(
  names: string[],
  options: ReturnType<typeof set.opts>,
) {
  try {
    if (!options.maxPrice) {
      throw new CommanderError(
        1,
        "NO_ATTRIBUTES_PROVIDED",
        "No attributes provided to update. Use `--max-price` to update pricing.",
      );
    }

    const client = await nodesClient();
    const spinner = ora("Updating nodes...").start();

    // Use the API's names parameter to filter nodes directly
    const { data: fetchedNodes } = await client.nodes.list({ name: names });

    // Check which names were not found
    const foundNames = new Set(fetchedNodes.map((node) => node.name));
    const notFound: string[] = [];

    for (const name of names) {
      if (!foundNames.has(name)) {
        notFound.push(name);
      }
    }

    // Filter nodes that have procurement_id (auto reserved nodes)
    const nodesWithProcurement = fetchedNodes.filter((node) =>
      node.procurement_id
    );
    const nodesWithoutProcurement = fetchedNodes.filter((node) =>
      !node.procurement_id
    );

    if (nodesWithProcurement.length === 0) {
      spinner.fail("No updatable nodes found");
      throw new CommanderError(
        1,
        "NO_UPDATABLE_NODES",
        "No nodes with procurement IDs found. Only auto reserved nodes can have their pricing updated.",
      );
    }

    const results: Array<
      { name: string; maxPrice: number; procurementId: string }
    > = [];
    const errors: Array<{ name: string; error: string }> = [];
    const priceInCents = Math.round(options.maxPrice * 100);

    for (const node of nodesWithProcurement) {
      try {
        await updateProcurement({
          procurementId: node.procurement_id!,
          pricePerGpuHourInCents: Math.round(priceInCents / GPUS_PER_NODE),
        });
        results.push({
          name: node.name,
          maxPrice: options.maxPrice,
          procurementId: node.procurement_id!,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push({ name: node.name, error: errorMsg });
      }
    }

    // Conclude spinner based on results
    if (results.length > 0 && errors.length === 0) {
      spinner.succeed(
        `Successfully updated ${results.length} ${
          pluralizeNodes(results.length)
        }`,
      );
    } else if (results.length > 0 && errors.length > 0) {
      spinner.warn(
        `Updated ${results.length} ${
          pluralizeNodes(results.length)
        }, but ${errors.length} failed`,
      );
    } else {
      spinner.fail("Failed to update any nodes");
    }

    // Show outcome lists
    if (results.length > 0) {
      console.log(gray("\nUpdated nodes:"));
      for (const result of results) {
        console.log(
          `  • ${result.name}: Max price set to $${
            result.maxPrice.toFixed(2)
          }/GPU/hr`,
        );
      }
    }

    if (errors.length > 0) {
      console.log(gray("\nFailed to update:"));
      for (const error of errors) {
        console.log(`  • ${error.name}: ${error.error}`);
      }
    }

    if (nodesWithoutProcurement.length > 0) {
      console.log(gray("\nReserved nodes (cannot update pricing):"));
      for (const node of nodesWithoutProcurement) {
        console.log(`  • ${node.name} (${node.node_type})`);
      }
    }

    if (notFound.length > 0) {
      console.log(gray("\nNodes not found:"));
      for (const name of notFound) {
        console.log(`  • ${name}`);
      }
    }
  } catch (err) {
    handleNodesError(err);
  }
}

const set = new Command("set")
  .description("Update attributes of compute nodes")
  .showHelpAfterError()
  .argument("<names...>", "Names of the nodes to update")
  .addOption(maxPriceOption)
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# Update max price for a single node\x1b[0m
  $ sf nodes set node-1 --max-price 15.00

  \x1b[2m# Update max price for multiple nodes\x1b[0m
  $ sf nodes set node-1 node-2 --max-price 10.50
`,
  )
  .action(async (names, options) => {
    await setNodesAction(names, options);
  });

export default set;
