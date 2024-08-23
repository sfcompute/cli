import * as chrono from "chrono-node";
import type { Command } from "commander";
import parseDuration from "parse-duration";
import { getAuthToken, isLoggedIn } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";
import type { PlaceSellOrderParameters } from "./orders";
import { priceWholeToCenticents } from "../helpers/units";

export function registerSell(program: Command) {
  program
    .command("sell")
    .description("Place a sell order for compute you own")
    .requiredOption("-p, --price <price>", "Specify the price in centicents")
    .requiredOption("-c, --contract-id <id>", "Specify the contract ID")
    .option("-n, --nodes <quantity>", "Specify the number of nodes")
    .requiredOption(
      "-s, --start <start>",
      "Specify the start time (ISO 8601 format)",
    )
    .requiredOption(
      "-d, --duration <duration>",
      "Specify the duration in seconds",
    )
    .option(
      "-f, --flags <flags>",
      "Specify additional flags as JSON",
      JSON.parse,
    )
    .action(async (options) => {
      await placeSellOrder(options);
    });
}

function forceAsNumber(value: string | number): number {
  if (typeof value === "number") {
    return value;
  }
  return Number.parseFloat(value);
}

async function placeSellOrder(options: {
  price: number;
  contractId: string;
  quantity: number;
  start?: string;
  duration: string;
  flags?: Record<string, any>;
}) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    return logLoginMessageAndQuit();
  }

  const flags = options.flags || {};
  const durationSecs = parseDuration(options.duration, "s");
  if (!durationSecs) {
    return logAndQuit("Invalid duration");
  }
  const startDate = options.start
    ? chrono.parseDate(options.start)
    : new Date();
  if (!startDate) {
    return logAndQuit("Invalid start date");
  }

  const { centicents: priceCenticents, invalid } = priceWholeToCenticents(
    options.price,
  );
  if (invalid || !priceCenticents) {
    return logAndQuit(`Invalid price: ${options.price}`);
  }

  const params: PlaceSellOrderParameters = {
    side: "sell",
    quantity: forceAsNumber(options.quantity),
    price: priceCenticents,
    contract_id: options.contractId,
    duration: durationSecs,
    start_at: startDate.toISOString(),
    ...flags,
  };

  const res = await postSellOrder(params);
  if (!res.ok) {
    return logAndQuit("Failed to place sell order");
  }
  const data = await res.json();
  console.log(data);
  process.exit(0);
}

async function postSellOrder(params: PlaceSellOrderParameters) {
  return await fetch(await getApiUrl("orders_create"), {
    method: "POST",
    body: JSON.stringify(params),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });
}
