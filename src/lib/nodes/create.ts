import { Command, CommanderError, Option } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import { readFileSync } from "node:fs";
import { cyan, gray, red, yellow } from "jsr:@std/fmt/colors";
import console from "node:console";
import process from "node:process";
import ora from "ora";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";

import {
  createNodesTable,
  durationOption,
  endOption,
  jsonOption,
  maxPriceOption,
  pluralizeNodes,
  startOption,
  yesOption,
  zoneOption,
} from "./utils.ts";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { getPricePerGpuHourFromQuote, getQuote } from "../buy/index.tsx";
import {
  parseStartDate,
  roundEndDate,
  roundStartDate,
} from "../../helpers/units.ts";
import { GPUS_PER_NODE } from "../constants.ts";

/**
 * Create a formatted node type description with count
 * @param count Number of nodes
 * @param nodeType Type of node ("autoreserved" or "reserved")
 * @returns Formatted string like "1 auto reserved node" or "3 reserved nodes"
 */
function formatNodeDescription(
  count: number,
  nodeType: "reserved" | "autoreserved",
): string {
  const plural = pluralizeNodes(count);
  return `${count} ${nodeType} ${plural}`;
}

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
      "Count must be a positive integer",
    );
  }
  return parsed;
}

const create = new Command("create")
  .description("Create reserved or auto reserved nodes")
  .showHelpAfterError()
  .argument(
    "[names...]",
    "Names of the nodes to create (must be unique across your account)",
  )
  .option(
    "-n, --count <number>",
    "Number of nodes to create with auto-generated names",
    validateCount,
  )
  .addOption(zoneOption)
  .addOption(maxPriceOption)
  .addOption(
    new Option(
      "--reserved",
      "Create reserved nodes. Reserved nodes have an explicit start and end time.",
    ).conflicts("auto"),
  )
  .addOption(
    new Option(
      "--auto",
      "Create auto-reserved nodes. Auto-reserved nodes self-extend until they are released.",
    ).conflicts("reserved"),
  )
  .addOption(startOption)
  .addOption(endOption.conflicts("duration"))
  .addOption(durationOption.conflicts("end"))
  .option(
    "-u, --user-data <script>",
    "cloud-init user data script to run during VM boot",
  )
  .addOption(
    new Option(
      "-U, --user-data-file <file>",
      "Path to a cloud-init user data script to run during VM boot",
    )
      .conflicts("user-data")
      .argParser((val) => {
        try {
          return readFileSync(val, "utf-8");
        } catch {
          throw new CommanderError(
            1,
            "INVALID_USER_DATA",
            "Failed to read user data file. Please check that the file exists and is readable.",
          );
        }
      }),
  )
  .addOption(yesOption)
  .addOption(jsonOption)
  .hook("preAction", (command) => {
    const names = command.args;
    const { count, start, duration, end, auto, reserved } = command
      .opts();

    // Validate arguments
    if (names.length === 0 && !count) {
      console.error(
        red("Must specify either node names or use \`--count\` option\n"),
      );
      command.help();
      process.exit(1);
    }

    if (names.length > 0 && count) {
      if (names.length !== count) {
        console.error(red(
          `You specified ${names.length} ${
            names.length === 1 ? "node name" : "node names"
          } but \`--count\` is set to ${count}. The number of names must match the \`count\`.\n`,
        ));
        command.help();
        process.exit(1);
      }
    }

    if (reserved && auto) {
      console.error(red("Specify either --reserved or --auto, but not both\n"));
      command.help();
      process.exit(1);
    }

    // Validate duration/end like buy command
    if (typeof end !== "undefined" && typeof duration !== "undefined") {
      console.error(red("Specify either --duration or --end, but not both\n"));
      command.help();
      process.exit(1);
    }

    // Validate that timing flags are only used with reserved nodes
    if (
      auto &&
      (start !== "NOW" || typeof duration !== "undefined" ||
        typeof end !== "undefined")
    ) {
      console.error(
        red(
          "Auto-reserved nodes start immediately and cannot have a start time, duration, or end time.\n",
        ),
      );
      command.help();
      process.exit(1);
    }

    if (
      !auto && typeof duration === "undefined" && typeof end === "undefined"
    ) {
      console.error(
        red(
          "You must specify either --duration or --end to create a reserved node.\n",
        ),
      );
      command.help();
      process.exit(1);
    }
  })
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# Create a single reserved node (default behavior)\x1b[0m
  $ sf nodes create --zone hayesvalley --max-price 12.50

  \x1b[2m# Create multiple auto-reserved nodes explicitly with a specific name\x1b[0m
  $ sf nodes create node-1 node-2 node-3 --zone hayesvalley --auto --max-price 9.00

  \x1b[2m# Create 3 auto-reserved nodes with auto-generated names\x1b[0m
  $ sf nodes create -n 3 --zone hayesvalley --auto --max-price 10.00

  \x1b[2m# Create a reserved node with specific start/end times\x1b[0m
  $ sf nodes create node-1 --zone hayesvalley --reserved --start "2024-01-15T10:00:00Z" --end "2024-01-15T12:00:00Z" -p 15.00

  \x1b[2m# Create a reserved node for 2 hours starting now\x1b[0m
  $ sf nodes create node-1 --zone hayesvalley --reserved --duration 2h -p 13.50

  \x1b[2m# Create a reserved node starting in 1 hour for 6 hours\x1b[0m
  $ sf nodes create node-1 --zone hayesvalley --reserved --start "+1h" --duration 6h -p 11.25
`,
  )
  .action(createNodesAction);

async function createNodesAction(
  names: typeof create.args,
  options: ReturnType<typeof create.opts>,
) {
  try {
    const client = await nodesClient();
    const count = options.count ?? names.length;
    // Because we validate that --reserved and --auto are mutually exclusive,
    // we can use the presence of --auto to determine if the nodes are auto-reserved.
    const isReserved = !options.auto;
    const nodeType = options.auto
      ? "autoreserved" as const
      : "reserved" as const;

    // Only show pricing and get confirmation if not using --yes
    if (!options.yes) {
      // Determine node type and prepare confirmation message
      let confirmationMessage = `Create ${
        formatNodeDescription(count, nodeType)
      }`;

      if (isReserved) {
        // Reserved nodes - get quote for accurate pricing
        const spinner = ora(
          `Quoting ${formatNodeDescription(count, nodeType)}...`,
        )
          .start();

        // Calculate duration for quote
        let durationSeconds: number = 3600; // Default 1 hour
        if (options.duration) {
          durationSeconds = options.duration;
        } else if (options.end) {
          const startDate = typeof options.start === "string"
            ? new Date()
            : options.start;
          durationSeconds = Math.floor(
            (options.end.getTime() - startDate.getTime()) / 1000,
          );
        }

        // Add flexibility to duration for better quote matching (matches buy command logic)
        const startsAt = options.start === "NOW"
          ? "NOW"
          : roundStartDate(parseStartDate(options.start));
        const minDurationSeconds = Math.max(
          1,
          durationSeconds - Math.ceil(durationSeconds * 0.1),
        );
        const maxDurationSeconds = Math.max(
          durationSeconds + 3600,
          durationSeconds + Math.ceil(durationSeconds * 0.1),
        );

        // Use default instance type h100i and zone if provided
        const quote = await getQuote({
          instanceType: "h100v", // This should get ignored by the zone
          quantity: count,
          minStartTime: startsAt,
          maxStartTime: startsAt,
          minDurationSeconds: minDurationSeconds,
          maxDurationSeconds: maxDurationSeconds,
          cluster: options.zone,
        });

        spinner.stop();

        if (quote) {
          const pricePerGpuHour = getPricePerGpuHourFromQuote(quote);
          const pricePerNodeHour = (pricePerGpuHour * GPUS_PER_NODE) / 100;
          confirmationMessage += ` for ~$${
            pricePerNodeHour.toFixed(2)
          }/node/hr`;
        } else {
          logAndQuit(
            red(
              "No nodes available matching your requirements. This is likely due to insufficient capacity.",
            ),
          );
        }
      } else if (options.maxPrice) {
        // Auto Reserved nodes - show max price they're willing to pay
        confirmationMessage += ` for up to $${
          options.maxPrice.toFixed(2)
        }/node/hr`;
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

    const spinner = ora(`Creating ${formatNodeDescription(count, nodeType)}...`)
      .start();

    const userData = (options.userData ?? options.userDataFile)
      ? Array.from(
        (new TextEncoder()).encode(options.userData ?? options.userDataFile),
      )
      : undefined;

    try {
      // Convert CLI options to SDK parameters
      const createParams: SFCNodes.NodeCreateParams = {
        desired_count: count,
        max_price_per_node_hour: options.maxPrice * 100,
        names: names.length > 0 ? names : undefined,
        zone: options.zone,
        cloud_init_user_data: userData,
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
        const actualStartDate = typeof startDate === "string"
          ? new Date()
          : startDate;
        const endDate = roundEndDate(
          new Date(
            actualStartDate.getTime() + (options.duration * 1000),
          ),
        );
        createParams.end_at = Math.floor(endDate.getTime() / 1000);
        createParams.node_type = "reserved";
      } else {
        // Neither provided - auto reserved
        createParams.node_type = "autoreserved";
      }

      const { data: createdNodes } = await client.nodes.create(createParams);

      spinner.succeed(
        `Successfully created ${
          formatNodeDescription(createdNodes.length, nodeType)
        }`,
      );

      if (options.json) {
        console.log(JSON.stringify(createdNodes, null, 2));
        process.exit(0);
      }

      if (createdNodes.length > 0) {
        console.log(gray("\nCreated nodes:"));
        console.log(createNodesTable(createdNodes));
        console.log(
          `\n${gray("Next steps:")}`,
        );
        console.log(
          `  sf nodes list`,
        );
        // Auto Reserved nodes can't be extended, so only suggest it for reserved nodes
        if (isReserved) {
          console.log(
            `  sf nodes extend ${cyan(createdNodes?.[0]?.name ?? "my-node")}`,
          );
        } else {
          console.log(
            `  sf nodes set ${
              cyan(createdNodes?.[0]?.name ?? "my-node")
            } --max-price ${cyan("12.50")}`,
          );
        }
        console.log(
          `  sf nodes release ${cyan(createdNodes?.[0]?.name ?? "my-node")}`,
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
