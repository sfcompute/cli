import console from "node:console";
import process from "node:process";
import { Command } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import type SFCNodes from "@sfcompute/nodes-sdk-alpha";
import chalk from "chalk";
import { formatDuration } from "date-fns/formatDuration";
import { intervalToDuration } from "date-fns/intervalToDuration";
import dayjs from "dayjs";
import ora from "ora";
import { selectTime } from "../../helpers/units.ts";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import { getPricePerGpuHourFromQuote, getQuote } from "../../helpers/quote.ts";
import { GPUS_PER_NODE } from "../constants.ts";
import {
  createNodesTable,
  jsonOption,
  maxPriceOption,
  pluralizeNodes,
  requiredDurationOption,
  yesOption,
} from "./utils.ts";

const extend = new Command("extend")
  .description("Extend the duration of reserved nodes and update their pricing")
  .showHelpAfterError()
  .argument("<nodes...>", "Node IDs or names to extend")
  .addOption(requiredDurationOption)
  .addOption(maxPriceOption)
  .addOption(yesOption)
  .addOption(jsonOption)
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# Extend a single node by 1 hour with max price $15/hour\x1b[0m
  $ sf nodes extend my-node --duration 1h --max-price 15.00

  \x1b[2m# Extend multiple nodes by node ID instead of name\x1b[0m
  $ sf nodes extend n_b1dc52505c6db142 n_c1ed52505c6db142 --duration 2h --max-price 10.00

  \x1b[2m# Extend with raw seconds\x1b[0m
  $ sf nodes extend my-node --duration 7200 --max-price 10.00

  \x1b[2m# Skip confirmation prompt\x1b[0m
  $ sf nodes extend my-node --duration 1h --max-price 10.00 --yes

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

    // Use the API's names parameter to filter nodes directly
    const fetchSpinner = ora().start(
      `Checking ${nodeNames.length} ${pluralizeNodes(nodeNames.length)}...`,
    );
    const { data: fetchedNodes } = await client.nodes.list({ name: nodeNames });
    fetchSpinner.stop();

    // Check which names were not found
    const nodes: { name: string; node: SFCNodes.Node }[] = [];
    const notFound: string[] = [];

    for (const nameOrId of nodeNames) {
      const node = fetchedNodes.find(
        (n) => n.name === nameOrId || n.id === nameOrId,
      );
      if (node) {
        nodes.push({ name: nameOrId, node });
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

    // Filter out auto reserved nodes (they can't be extended)
    const autoReservedNodes = nodes.filter(
      ({ node }) => node.node_type === "autoreserved",
    );
    const extendableNodes = nodes.filter(
      ({ node }) => node.node_type !== "autoreserved",
    );

    if (autoReservedNodes.length > 0) {
      console.log(
        chalk.red(
          `Cannot extend ${
            autoReservedNodes.length === 1 ? "this" : "these"
          } auto reserved ${pluralizeNodes(
            autoReservedNodes.length,
          )} (they auto-extend):`,
        ),
      );
      for (const { name } of autoReservedNodes) {
        console.log(`  • ${name}`);
      }
      console.log(
        chalk.redBright(
          "\nTo configure auto reserved nodes, use the `sf nodes set` command.",
        ),
      );
    }

    if (extendableNodes.length === 0) {
      process.exit(1);
    }

    // Check if duration is a multiple of an hour
    const durationSeconds = options.duration!;
    const isHourMultiple = durationSeconds % 3600 === 0;

    if (!isHourMultiple && !options.yes) {
      // Calculate the end time based on the first node's current end_at plus the duration
      const referenceNode = extendableNodes[0].node;
      const startTime = referenceNode.end_at
        ? new Date(referenceNode.end_at * 1000)
        : dayjs().add(1, "hour").startOf("hour").toDate();
      const calculatedEndTime = new Date(
        startTime.getTime() + durationSeconds * 1000,
      );

      const selectedTime = await selectTime(calculatedEndTime, {
        message: `Nodes must be extended to an hour boundary. ${chalk.cyan(
          "Choose an end time:",
        )}`,
      });

      if (selectedTime === "NOW") {
        console.error(chalk.red("You must extend to a future time"));
        process.exit(1);
      }

      // Update duration based on selected time
      options.duration = Math.max(
        0,
        Math.floor((selectedTime.getTime() - startTime.getTime()) / 1000),
      );
    } else if (!isHourMultiple && options.yes) {
      // Round up to the next hour boundary
      options.duration = Math.ceil(durationSeconds / 3600) * 3600;
    }

    const formattedDuration = formatDuration(
      intervalToDuration({
        start: 0,
        end: options.duration! * 1000,
      }),
      {
        delimiter: ", ",
      },
    );

    // Only show pricing and get confirmation if not using --yes
    if (!options.yes) {
      // Get quote for accurate pricing preview
      const spinner = ora(
        `Quoting extending ${extendableNodes.length} ${pluralizeNodes(
          extendableNodes.length,
        )}...`,
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

      const quotes = await Promise.allSettled(
        extendableNodes.map(async ({ node }) => {
          return await getQuote({
            instanceType: `${node.gpu_type.toLowerCase()}v` as const,
            quantity: 8,
            minStartTime: node.end_at ? new Date(node.end_at * 1000) : "NOW",
            maxStartTime: node.end_at ? new Date(node.end_at * 1000) : "NOW",
            minDurationSeconds: minDurationSeconds,
            maxDurationSeconds: maxDurationSeconds,
            cluster: node.zone ?? undefined,
          });
        }),
      );

      const filteredQuotes = quotes.filter(
        (quote) => quote.status === "fulfilled",
      );

      spinner.stop();

      let confirmationMessage = `Extend ${extendableNodes.length} ${pluralizeNodes(
        extendableNodes.length,
      )} for ${formattedDuration}`;

      // If there's only one node, show the price per node per hour
      if (filteredQuotes.length === 1 && filteredQuotes[0].value) {
        const pricePerGpuHour = getPricePerGpuHourFromQuote(
          filteredQuotes[0].value,
        );
        const pricePerNodeHour = (pricePerGpuHour * GPUS_PER_NODE) / 100;
        confirmationMessage += ` for ~$${pricePerNodeHour.toFixed(2)}/node/hr`;
      } else if (filteredQuotes.length > 1) {
        const totalPrice = filteredQuotes.reduce((acc, quote) => {
          return acc + (quote.value?.price ?? 0);
        }, 0);
        // If there's multiple nodes, show the total price, as nodes could be on different zones or have different hardware
        confirmationMessage += ` for ~$${totalPrice / 100}`;
      } else {
        confirmationMessage = chalk.red(
          "No nodes available matching your requirements. This is likely due to insufficient capacity. Attempt to extend anyway",
        );
      }

      const confirmed = await confirm({
        message: confirmationMessage + "?",
        default: false,
      });
      if (!confirmed) process.exit(0);
    }

    const spinner = ora(
      `Extending ${extendableNodes.length} ${pluralizeNodes(
        extendableNodes.length,
      )}...`,
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

    if (options.json) {
      console.log(
        JSON.stringify(
          results.map((r) => r.node),
          null,
          2,
        ),
      );
      process.exit(0);
    }

    if (results.length > 0) {
      spinner.succeed(
        `Successfully extended ${results.length} ${pluralizeNodes(
          results.length,
        )}`,
      );
    }

    if (errors.length > 0) {
      if (results.length === 0) {
        spinner.fail("Failed to extend any nodes");
      } else {
        spinner.warn(
          `Extended ${results.length} ${pluralizeNodes(
            results.length,
          )}, but ${errors.length} failed`,
        );
      }
    }

    if (results.length > 0) {
      console.log(chalk.gray("\nExtended nodes:"));
      console.log(createNodesTable(results.map((r) => r.node)));
      console.log(chalk.gray(`\nDuration extended by ${formattedDuration}`));
      console.log(
        chalk.gray(`Max price: $${options.maxPrice.toFixed(2)}/hour`),
      );
    }

    if (errors.length > 0) {
      console.log(chalk.gray("\nFailed to extend:"));
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
