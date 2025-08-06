import { Command, CommanderError } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import { cyan, gray, red, yellow } from "jsr:@std/fmt/colors";
import console from "node:console";
import process from "node:process";
import ora from "ora";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";

import {
  createNodesTable,
  durationOption,
  endOption,
  forceOption,
  jsonOption,
  maxPriceOption,
  startOption,
  zoneOption,
} from "./utils.ts";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { getPricePerGpuHourFromQuote, getQuote } from "../buy/index.tsx";
import { roundEndDate } from "../../helpers/units.ts";
import { GPUS_PER_NODE } from "../constants.ts";

/**
 * Validates that a count value is a positive integer
 * @param val String value to validate
 * @returns Parsed count value
 * @throws CommanderError if invalid
 */
function validateCount(val: string): number {
  const parsed = parseInt(val, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new CommanderError(
      1,
      "INVALID_COUNT",
      "Count must be a positive integer"
    );
  }
  return parsed;
}

const create = new Command("create")
  .description("Create one or more compute nodes")
  .showHelpAfterError()
  .argument(
    "[names...]",
    "Names of the nodes to create (must be unique across your account)"
  )
  .option(
    "-n, --count <number>",
    "Number of nodes to create with auto-generated names",
    validateCount
  )
  .addOption(zoneOption)
  .addOption(maxPriceOption)
  .addOption(startOption)
  .addOption(endOption.conflicts("duration"))
  .addOption(durationOption.conflicts("end"))
  .addOption(forceOption)
  .addOption(jsonOption)
  .hook("preAction", command => {
    const names = command.args;
    const { count, duration, end, zone } = command.opts();

    // Validate arguments
    if (names.length === 0 && !count) {
      console.error(
        red("Must specify either node names or use \`--count\` option\n")
      );
      command.help();
      process.exit(1);
    }

    if (names.length > 0 && count) {
      if (names.length !== count) {
        console.error(
          red(
            `You specified ${names.length} node name(s) but \`--count\` is set to ${count}. The number of names must match the \`count\`.\n`
          )
        );
        command.help();
        process.exit(1);
      }
    }

    // Validate duration/end like buy command
    if (end && duration) {
      console.error(red("Specify either --duration or --end, but not both\n"));
      command.help();
      process.exit(1);
    }

    const isReserved = !!(duration || end);
    if (!isReserved && !zone) {
      console.error(red("Must specify --zone when creating spot nodes\n"));
      command.help();
      process.exit(1);
    }
  })
  .addHelpText(
    "after",
    `
Examples:
  \x1b[2m# Create a single node with a specific name\x1b[0m
  $ sf nodes create node-1 --zone alamo --max-price 12.50

  \x1b[2m# Create multiple nodes with specific names\x1b[0m
  $ sf nodes create node-1 node-2 node-3 --zone hayesvalley --max-price 9

  \x1b[2m# Create 3 nodes with auto-generated names\x1b[0m
  $ sf nodes create -n 3 --zone seacliff --max-price 10.00

  \x1b[2m# Create a reserved node with specific start/end times\x1b[0m
  $ sf nodes create node-1 --start "2024-01-15T10:00:00Z" --end "2024-01-15T12:00:00Z"

  \x1b[2m# Create a reserved node for 2 hours starting now\x1b[0m
  $ sf nodes create node-1 --duration 2h

  \x1b[2m# Create a reserved node starting in 1 hour for 6 hours\x1b[0m
  $ sf nodes create node-1 --start "+1h" --duration 6h
`
  )
  .action(createNodesAction);

async function createNodesAction(
  names: typeof create.args,
  options: ReturnType<typeof create.opts>
) {
  try {
    const client = await nodesClient();
    const count = options.count ?? names.length;
    const isReserved = !!(options.duration || options.end);

    // Only show pricing and get confirmation if not using --force
    if (!options.force) {
      // Determine node type and prepare confirmation message
      let confirmationMessage = `Create ${count} node(s)`;

      if (isReserved) {
        // Reserved nodes - get quote for accurate pricing
        const spinner = ora(`Quoting ${count} node(s)...`).start();

        // Calculate duration for quote
        let durationSeconds: number = 3600; // Default 1 hour
        if (options.duration) {
          durationSeconds = options.duration;
        } else if (options.end) {
          const startDate =
            typeof options.start === "string" ? new Date() : options.start;
          durationSeconds = Math.floor(
            (options.end.getTime() - startDate.getTime()) / 1000
          );
        }

        // Add flexibility to duration for better quote matching (matches buy command logic)
        const minDurationSeconds = Math.max(
          1,
          durationSeconds - Math.ceil(durationSeconds * 0.1)
        );
        const maxDurationSeconds = Math.max(
          durationSeconds + 3600,
          durationSeconds + Math.ceil(durationSeconds * 0.1)
        );

        // Use default instance type h100i and zone if provided
        const quote = await getQuote({
          instanceType: "h100v", // This should get ignored by the zone
          quantity: count,
          minStartTime:
            typeof options.start === "string" ? "NOW" : options.start,
          maxStartTime:
            typeof options.start === "string" ? "NOW" : options.start,
          minDurationSeconds: minDurationSeconds,
          maxDurationSeconds: maxDurationSeconds,
          cluster: options.zone,
        });

        spinner.stop();

        if (quote) {
          const pricePerGpuHour = getPricePerGpuHourFromQuote(quote);
          const pricePerNodeHour = (pricePerGpuHour * GPUS_PER_NODE) / 100;
          confirmationMessage += ` for ~$${pricePerNodeHour.toFixed(
            2
          )}/node/hr`;
        } else {
          logAndQuit(
            red(
              "No nodes available matching your requirements. This is likely due to insufficient capacity."
            )
          );
        }
      } else if (options.maxPrice) {
        // Spot nodes - show max price they're willing to pay
        confirmationMessage += ` for up to $${options.maxPrice.toFixed(
          2
        )}/node/hr`;
      }

      // Add node names at the end after a colon
      if (names.length > 0) {
        confirmationMessage += `: ${names.join(", ")}`;
      }

      const confirmed = await confirm({
        message: confirmationMessage + "?",
        default: false,
      });
      if (!confirmed) process.exit(0);
    }

    const spinner = ora(`Creating ${count} node(s)...`).start();

    try {
      // Convert CLI options to SDK parameters
      const createParams: SFCNodes.NodeCreateParams = {
        desired_count: count,
        max_price_per_node_hour: options.maxPrice * 100,
        names: names.length > 0 ? names : undefined,
        zone: options.zone,
      };

      // Handle start time (options.start comes from parseStartDateOrNow parser)
      const startDate = options.start;
      if (typeof startDate !== "string") {
        createParams.start_at = Math.floor(startDate.getTime() / 1000);
      } else if (isReserved) {
        createParams.start_at = Math.floor(new Date().getTime() / 1000);
      }

      // Handle end time vs duration
      if (options.end) {
        // End time provided - create reservation
        createParams.end_at = Math.floor(options.end.getTime() / 1000);
        createParams.node_type = "reserved";
      } else if (options.duration) {
        // Duration provided - calculate end time
        const actualStartDate =
          typeof startDate === "string" ? new Date() : startDate;
        const endDate = roundEndDate(
          new Date(actualStartDate.getTime() + options.duration * 1000)
        );
        createParams.end_at = Math.floor(endDate.getTime() / 1000);
        createParams.node_type = "reserved";
      } else {
        // Neither provided - spot
        createParams.node_type = "spot";
      }

      const { data: createdNodes } = await client.nodes.create(createParams);

      spinner.succeed(`Successfully created ${createdNodes.length} node(s)`);

      if (options.json) {
        console.log(JSON.stringify(createdNodes, null, 2));
        process.exit(0);
      }

      if (createdNodes.length > 0) {
        console.log(gray("\nCreated nodes:"));
        console.log(createNodesTable(createdNodes));
        console.log(`\n${gray("Next steps:")}`);
        console.log(`  sf nodes list`);
        console.log(
          `  sf nodes extend ${cyan(createdNodes?.[0]?.name ?? "my-node")}`
        );
        console.log(
          `  sf nodes set ${cyan(
            createdNodes?.[0]?.name ?? "my-node"
          )} --max-price ${cyan("12.50")}`
        );
        console.log(
          `  sf nodes release ${cyan(createdNodes?.[0]?.name ?? "my-node")}`
        );
      } else {
        console.log(yellow("No nodes created.\n"));
        create.help();
      }
    } catch (err) {
      spinner.fail("Failed to create nodes");
      throw err;
    }
  } catch (err) {
    handleNodesError(err);
  }
}

export default create;
