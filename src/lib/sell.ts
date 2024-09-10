import * as chrono from "chrono-node";
import type { Command } from "commander";
import dayjs from "dayjs";
import parseDuration from "parse-duration";
import { apiClient } from "../apiClient";
import { isLoggedIn } from "../helpers/config";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors";
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

  let startDate = options.start ? chrono.parseDate(options.start) : new Date();
  if (!startDate) {
    return logAndQuit("Invalid start date");
  }

  startDate = roundStartDate(startDate);

  let endDate = dayjs(startDate).add(durationSecs, "s").toDate();
  endDate = roundEndDate(endDate);

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
  const { data, error, response } = await api.POST("/v0/orders", {
    body: params,
  });

  if (!response.ok) {
    switch (response.status) {
      case 400:
        return logAndQuit(
          `Bad Request: ${error?.message}: ${JSON.stringify(error?.details, null, 2)}`,
        );
      // return logAndQuit(`Bad Request: ${error?.message}`);
      case 401:
        return await logSessionTokenExpiredAndQuit();
      default:
        return logAndQuit(`Failed to place sell order: ${response.statusText}`);
    }
  }

  console.log(data);
  process.exit(0);
}
