import readline from "node:readline";
import c from "chalk";
import * as chrono from "chrono-node";
import type { Command } from "commander";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import parseDuration from "parse-duration";
import { loadConfig } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";
import {
  type PlaceOrderParameters,
  formatDuration,
  priceToCenticents,
} from "./orders";

dayjs.extend(relativeTime);
dayjs.extend(duration);

export function registerBuy(program: Command) {
  program
    .command("buy")
    .description("Place a buy order")
    .requiredOption("-t, --type <type>", "Specify the type of node")
    .requiredOption("-d, --duration <duration>", "Specify the duration", "1h")
    .requiredOption("-p, --price <price>", "Specify a price")
    .option("-n, --quantity <quantity>", "Specify quantity")
    .option("-s, --start <start>", "Specify a start date")
    .option("-y, --yes", "Automatically confirm the order")
    .action(async (options) => {
      await placeBuyOrder(options);
    });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function prompt(msg: string) {
  const answer = await new Promise((resolve) =>
    rl.question(msg, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );

  return answer;
}

function confirmPlaceOrderParametersMessage(params: PlaceOrderParameters) {
  const { quantity, price, instance_type, duration, start_at } = params;

  const fromNowTime = dayjs(start_at).fromNow();
  const humanReadableStartAt = dayjs(start_at).format("MM/DD/YYYY hh:mm A");
  const centicentsAsDollars = (price / 10000).toFixed(2);
  const durationHumanReadable = formatDuration(duration * 1000);

  const topLine = `${c.green(quantity)} ${c.green(instance_type)} nodes for ${c.green(durationHumanReadable)} starting ${c.green(humanReadableStartAt)} (${c.green(fromNowTime)})`;

  const priceLine = `\nBuy for ${c.green(`$${centicentsAsDollars}`)}? ${c.dim("(y/n)")}`;

  return `\n${topLine}\n${priceLine} `;
}

interface PostOrderResponse {
  object: "order";
  id: string;
  side: "buy" | "sell";
  instance_type: string;
  price: number;
  starts_at: string;
  duration: number;
  quantity: number;
  flags: {
    market: boolean;
    post_only: boolean;
    ioc: boolean;
  };
  created_at: string;
  executed: boolean;
  cancelled: boolean;
}

interface PlaceBuyOrderArguments {
  type: string;
  duration: string;
  price: string | number;
  quantity?: number;
  start?: string;
  yes?: boolean;
}

async function placeBuyOrder(props: PlaceBuyOrderArguments) {
  const { type, duration, price, quantity, start } = props;
  const config = await loadConfig();
  if (!config.auth_token) {
    return logLoginMessageAndQuit();
  }

  const orderQuantity = quantity ?? 1;
  const durationMs = parseDuration(duration);
  if (!durationMs) {
    return logAndQuit("Invalid duration");
  }
  const startDate = start ? chrono.parseDate(start) : new Date();
  if (!startDate) {
    return logAndQuit("Invalid start date");
  }

  const params: PlaceOrderParameters = {
    side: "buy",
    quantity: orderQuantity,
    price: priceToCenticents(price),
    instance_type: type,
    duration: durationMs / 1000, // Convert milliseconds to seconds
    start_at: startDate.toISOString(),
  };

  const msg = confirmPlaceOrderParametersMessage(params);

  if (!props.yes) {
    const answer = await prompt(msg);
    if (answer !== "y") {
      return logAndQuit("Order cancelled");
    }
  }

  console.log(`\n${c.green("Order placed successfully")}`);

  const response = await fetch(await getApiUrl("orders_create"), {
    method: "POST",
    body: JSON.stringify(params),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.auth_token}`,
    },
  });

  if (!response.ok) {
    const resp = await response.json();
    return logAndQuit(`Failed to place order: ${resp.message}`);
  }

  const data = (await response.json()) as PostOrderResponse;
  console.log("Order placed");
}
