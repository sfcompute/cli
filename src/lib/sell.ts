import * as chrono from "chrono-node";
import type { Command } from "commander";
import dayjs from "dayjs";
import parseDuration from "parse-duration";
import { apiClient } from "../apiClient";
import { isLoggedIn } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import {
  priceWholeToCenticents,
  roundEndDate,
  roundStartDate,
} from "../helpers/units";
import type { PlaceSellOrderParameters } from "./orders";

export function registerSell(program: Command) {
  program
    .command("sell")
    .description("Place a sell order")
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
  nodes: number;
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

  if (startDate !== roundStartDate(startDate)) {
    return logAndQuit(
      "Start date must either be the next minute or on the hour",
    );
  }

  const endDate = dayjs(startDate).add(durationSecs, "s").toDate();
  if (endDate !== roundEndDate(endDate)) {
    return logAndQuit("End date must be in the on the hour");
  }

  const { centicents: priceCenticents, invalid } = priceWholeToCenticents(
    options.price,
  );
  if (invalid || !priceCenticents) {
    return logAndQuit(`Invalid price: ${options.price}`);
  }

  const params: PlaceSellOrderParameters = {
    side: "sell",
    quantity: forceAsNumber(options.nodes),
    price: priceCenticents,
    contract_id: options.contractId,
    start_at: startDate.toISOString(),
    end_at: endDate.toISOString(),
    ...flags,
  };

  const api = await apiClient();
  const { response } = await api.POST("/v0/orders", {
    body: params,
  });

  if (!response.ok) {
    return logAndQuit("Failed to place sell order");
  }
  const data = await response.json();
  console.log(data);
  process.exit(0);
}
