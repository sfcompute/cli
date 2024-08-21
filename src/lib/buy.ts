import { confirm } from "@inquirer/prompts";
import c from "chalk";
import * as chrono from "chrono-node";
import type { Command } from "commander";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import parseDuration from "parse-duration";
import { getAuthToken, isLoggedIn } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";
import {
  type PlaceOrderParameters,
  formatDuration,
  priceToCenticents,
} from "./orders";
import type { OrderStatus } from "../types/orders";

dayjs.extend(relativeTime);
dayjs.extend(duration);

interface SfBuyOptions {
  type: string;
  nodes?: string;
  duration: string;
  price: string;
  start?: string;
  yes?: boolean;
  quote?: boolean;
}

export function registerBuy(program: Command) {
  program
    .command("buy")
    .description("Place a buy order")
    .requiredOption("-t, --type <type>", "Specify the type of node")
    .option("-n, --nodes <quantity>", "Specify the number of nodes")
    .requiredOption("-d, --duration <duration>", "Specify the duration", "1h")
    .requiredOption("-p, --price <price>", "Specify the price")
    .option("-s, --start <start>", "Specify the start date")
    .option("-y, --yes", "Automatically confirm the order")
    .option("--quote", "Only provide a quote for the order")
    .action(buyOrderAction);
}

// --

async function buyOrderAction(options: SfBuyOptions) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    return logLoginMessageAndQuit();
  }

  // parse options
  const durationSecs = parseDuration(options.duration, "s");
  if (!durationSecs) {
    return logAndQuit("Invalid duration");
  }

  if (options.quote) {
    await quoteBuyOrder(options);
  } else {
    await placeBuyOrder(options);
  }
}

async function placeBuyOrderAction(options: SfBuyOptions) {}

async function quoteBuyOrderAction(options: SfBuyOptions) {}

// --

interface SfBuyParamsNormalized {
  instanceType: string;
  totalNodes: number;
  durationSeconds: number;
  priceCenticents: number;
}
function normalizeSfBuyOptions(options: SfBuyOptions): SfBuyParamsNormalized {
  const durationSeconds = parseDuration(options.duration, "s");
  if (!durationSeconds) {
    logAndQuit(`Invalid duration: ${options.duration}`);
    process.exit(1); // make typescript happy
  }

  return {
    instanceType: options.type,
    totalNodes: options.nodes ? Number(options.nodes) : 1,
    durationSeconds,
    priceCenticents: priceToCenticents(options.price),
  };
}

// --

function confirmPlaceOrderParametersMessage(params: PlaceOrderParameters) {
  const { quantity, price, instance_type, duration, start_at } = params;
  const nodesLabel = quantity > 1 ? "nodes" : "node";

  const startDate = new Date(start_at);

  const fromNowTime = dayjs(startDate).fromNow();
  const humanReadableStartAt = dayjs(startDate).format("MM/DD/YYYY hh:mm A");
  const centicentsAsDollars = (price / 10_000).toFixed(2);
  const durationHumanReadable = formatDuration(duration * 1000);

  const topLine = `${c.green(quantity)} ${c.green(instance_type)} ${nodesLabel} for ${c.green(durationHumanReadable)} starting ${c.green(humanReadableStartAt)} (${c.green(fromNowTime)})`;

  const priceLine = `\nBuy for ${c.green(`$${centicentsAsDollars}`)}? ${c.dim("(y/n)")}`;

  return `${topLine}\n${priceLine} `;
}

interface PostOrderResponse {
  object: "order";
  id: string;
  status: OrderStatus.Pending;
}

async function placeBuyOrder(props: PlaceBuyOrderArguments) {
  const { type, price, start } = props;

  const startDate = start ? chrono.parseDate(start) : new Date();
  if (!startDate) {
    return logAndQuit("Invalid start date");
  }

  const params: PlaceOrderParameters = {
    side: "buy",
    quantity: orderQuantity,
    price: priceToCenticents(price),
    instance_type: type,
    duration: durationSecs,
    start_at: startDate.toISOString(),
  };

  if (!props.yes) {
    const placeBuyOrderConfirmed = await confirm({
      message: confirmPlaceOrderParametersMessage(params),
      default: false,
    });

    if (!placeBuyOrderConfirmed) {
      return logAndQuit("Order cancelled");
    }
  }

  const response = await fetch(await getApiUrl("orders_create"), {
    method: "POST",
    body: JSON.stringify(params),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const resp = await response.json();
    return logAndQuit(`Failed to place order: ${resp.message}`);
  }

  const data = (await response.json()) as PostOrderResponse;
  console.log(`\n${c.green("Order placed successfully")}`);
}
