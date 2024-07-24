import type { Command } from "commander";
import * as chrono from "chrono-node";
import type { PlaceOrderParameters, PlaceSellOrderParameters } from "./orders";
import { getApiUrl } from "../helpers/urls";
import { loadConfig } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import parseDuration from "parse-duration";

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

async function placeSellOrder(options: {
	price: number;
	contractId: string;
	quantity: number;
	start?: string;
	duration: string;
	flags?: Record<string, any>;
}) {
	const config = await loadConfig();
	if (!config.token) {
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
		quantity: options.quantity,
		price: options.price,
		contract_id: options.contractId,
		duration: durationMs,
		start_at: startDate.toISOString(),
		...flags,
	};

	const res = await postSellOrder(config.token, params);
	if (!res.ok) {
		return logAndQuit("Failed to place sell order");
	}
	const data = await res.json();
	console.log(data);
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
