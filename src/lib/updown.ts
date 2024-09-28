import { confirm } from "@inquirer/prompts";
import c from "chalk";
import type { Command } from "commander";
import parseDuration from "parse-duration";
import { apiClient } from "../apiClient";
import { logAndQuit } from "../helpers/errors";
import {
  type Cents,
  centsToDollarsFormatted,
  dollarsToCents,
} from "../helpers/units";
import { getBalance } from "./balance";
import { getQuote } from "./buy";
import { formatDuration } from "./orders";

export function registerUp(program: Command) {
  const cmd = program
    .command("up")
    .description("Automatically buy nodes until you have the desired quantity")
    .option(
      "-n <quantity>",
      "The number of nodes to purchase continuously",
      "1",
    )
    .option("-t, --type <type>", "Specify the type of node", "h100i")
    .option("-d, --duration <duration>", "Specify the minimum duration")
    .option(
      "-p, --price <price>",
      "Specify the maximum price per node-hour, in dollars",
    );

  cmd.action(async (options) => {
    up(options);
  });
}

export function registerDown(program: Command) {
  const cmd = program
    .command("down")
    .description("Turn off nodes")
    .option("-t, --type <type>", "Specify the type of node", "h100i");

  cmd.action(async (options) => {
    down(options);
  });
}

const DEFAULT_PRICE_PER_NODE_HOUR_IN_CENTS = 2.65 * 8 * 100;

async function getDefaultProcurementOptions(props: {
  duration?: string;
  n?: string;
  pricePerNodeHourDollars?: string;
  type?: string;
}) {
  // Minimum block duration is 2 hours
  // which is a bit of a smoother experience (we might want to increase this)
  const duration = props.duration ?? "2h";
  let durationHours = parseDuration(duration, "h");
  if (!durationHours) {
    logAndQuit(`Failed to parse duration: ${duration}`);
  }
  durationHours = Math.ceil(durationHours);
  const n = Number.parseInt(props.n ?? "1");
  const type = props.type ?? "h100i";

  const quote = await getQuote({
    instanceType: type,
    quantity: n,
    // Start immediately
    startsAt: new Date(),
    durationSeconds: durationHours * 60 * 60,
  });

  // Eventually we should replace this price with yesterday's index price
  let quotePrice = DEFAULT_PRICE_PER_NODE_HOUR_IN_CENTS;
  if (quote) {
    // per hour price in cents
    quotePrice = quote.price / durationHours;
  }

  console.log("props.pricePerNodeHour", props.pricePerNodeHourDollars);

  const pricePerNodeHourInCents = props.pricePerNodeHourDollars
    ? dollarsToCents(Number.parseFloat(props.pricePerNodeHourDollars))
    : quotePrice;

  const totalPriceInCents =
    pricePerNodeHourInCents * Number.parseInt(props.n ?? "1") * durationHours;

  return {
    durationHours,
    pricePerNodeHourInCents,
    n,
    type,
    totalPriceInCents,
  };
}

// Instruct the user to set a price that's lower
function getSuggestedCommandWhenBalanceLow(props: {
  durationHours: number;
  pricePerNodeHourInCents: Cents;
  n: number;
  totalPriceInCents: Cents;
  balance: Cents;
}) {
  const affordablePrice = props.balance / 100 / (props.n * props.durationHours);

  const cmd = `sf up -n ${props.n} -d ${props.durationHours}h -p ${affordablePrice.toFixed(2)}`;
  return `You could try setting a lower price and your nodes will turn on\nif the market price dips this low:\n\n\t${cmd}\n`;
}

function confirmPlaceOrderMessage(options: {
  durationHours: number;
  pricePerNodeHourInCents: number;
  n: number;
  totalPriceInCents: number;
  type: string;
}) {
  const totalNodesLabel = c.green(options.n);
  const instanceTypeLabel = c.green(options.type);
  const nodesLabel = options.n > 1 ? "nodes" : "node";
  const durationInMilliseconds = options.durationHours * 60 * 60 * 1000;

  const timeDescription = `starting ${c.green("ASAP")} until you turn it off`;

  const topLine = `Turning on ${totalNodesLabel} ${instanceTypeLabel} ${nodesLabel} continuously for ${c.green(formatDuration(durationInMilliseconds))} ${timeDescription}`;

  const dollarsLabel = c.green(
    centsToDollarsFormatted(options.pricePerNodeHourInCents),
  );

  const priceLine = `\n Pay ${dollarsLabel} per node hour?`;

  return `${topLine}\n${priceLine} `;
}

async function up(props: {
  n: string;
  type: string;
  duration?: string;
  price?: string;
  y: boolean;
}) {
  const client = await apiClient();

  const { durationHours, n, type, pricePerNodeHourInCents, totalPriceInCents } =
    await getDefaultProcurementOptions(props);

  if (durationHours && durationHours < 1) {
    console.error("Minimum duration is 1 hour");
    return;
  }

  if (!props.y) {
    const confirmationMessage = confirmPlaceOrderMessage({
      durationHours,
      pricePerNodeHourInCents,
      n,
      totalPriceInCents,
      type,
    });
    const confirmed = await confirm({
      message: confirmationMessage,
      default: false,
    });

    if (!confirmed) {
      logAndQuit("Order cancelled");
    }
  }

  const balance = await getBalance();

  if (balance.available.cents < totalPriceInCents) {
    console.log(
      `You can't afford this. Available balance: $${(balance.available.cents / 100).toFixed(2)}, Minimum price: $${(totalPriceInCents / 100).toFixed(2)}\n`,
    );
    const cmd = getSuggestedCommandWhenBalanceLow({
      durationHours,
      pricePerNodeHourInCents,
      n,
      totalPriceInCents,
      balance: balance.available.whole,
    });
    console.log(cmd);
    return;
  }

  // check if there's already a procurement like this
  const procurements = await client.GET("/v0/procurements");
  if (!procurements.response.ok) {
    console.error(procurements.error?.message, procurements.error?.details);
    throw new Error("Failed to list procurements");
  }

  for (const procurement of procurements.data?.data ?? []) {
    // Currently instance groups are the same name as the instance type
    // in the future they might be different.
    if (procurement.instance_group === props.type) {
      const res = await client.PUT("/v0/procurements/{id}", {
        params: {
          path: {
            id: procurement.id,
          },
        },
        body: {
          quantity: n,

          // we only update the duration & price if it's set
          min_duration_in_hours: props.duration ? durationHours : undefined,
          max_price_per_node_hour: props.price
            ? pricePerNodeHourInCents
            : undefined,
        },
      });
      return res.data;
    }
  }

  const res = await client.POST("/v0/procurements", {
    body: {
      instance_type: type,
      quantity: n,
      max_price_per_node_hour: pricePerNodeHourInCents,
      min_duration_in_hours: Math.max(durationHours, 1),
    },
  });

  if (!res.response.ok) {
    console.error(res.error?.message, res.error?.details);
    throw new Error("Failed to purchase nodes");
  }

  return res.data;
}

async function down(props: {
  type: string;
}) {
  const client = await apiClient();

  // check if there's already a procurement like this
  const procurements = await client.GET("/v0/procurements");
  if (!procurements.response.ok) {
    console.error(procurements.error?.message, procurements.error?.details);
    throw new Error("Failed to list procurements");
  }

  const procurement = procurements.data?.data.find(
    (p: any) => p.instance_group === props.type,
  );

  if (!procurement) {
    console.error(`No procurement found for ${props.type}`);
    return;
  }

  const res = await client.PUT("/v0/procurements/{id}", {
    params: {
      path: {
        id: procurement.id,
      },
    },
    body: {
      quantity: 0,
      block_duration_in_hours: 0,
    },
  });

  if (!res.response.ok) {
    console.error(res.error?.message, res.error?.details);
    throw new Error("Failed to turn off nodes");
  }

  return res.data;
}
