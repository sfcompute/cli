import * as chrono from "chrono-node";
import type { Command } from "commander";
import parseDuration from "parse-duration";
import { loadConfig } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";
import { priceToCenticents, type PlaceSellOrderParameters } from "./orders";

export function registerSell(program: Command) {
  program
    .command("sell")
    .description("Place a sell order")
    .requiredOption("-p, --price <price>", "Specify the price in centicents")
    .requiredOption("-c, --contract-id <id>", "Specify the contract ID")
    .requiredOption("-q, --quantity <quantity>", "Specify the quantity")
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
  const config = await loadConfig();
  if (!config.auth_token) {
    return logLoginMessageAndQuit();
  }

  const flags = options.flags || {};
  const durationMs = parseDuration(options.duration);
  if (!durationMs) {
    return logAndQuit("Invalid duration");
  }
  const startDate = options.start
    ? chrono.parseDate(options.start)
    : new Date();
  if (!startDate) {
    return logAndQuit("Invalid start date");
  }

  const params: PlaceSellOrderParameters = {
    side: "sell",
    quantity: forceAsNumber(options.quantity),
    price: priceToCenticents(options.price),
    contract_id: options.contractId,
    duration: durationMs,
    start_at: startDate.toISOString(),
    ...flags,
  };

  const res = await postSellOrder(config.auth_token, params);
  if (!res.ok) {
    return logAndQuit("Failed to place sell order");
  }
  const data = await res.json();
  console.log(data);
  process.exit(0);
}

async function postSellOrder(token: string, params: PlaceSellOrderParameters) {
  return await fetch(await getApiUrl("orders_create"), {
    method: "POST",
    body: JSON.stringify(params),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}
