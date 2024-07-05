import type { Command } from "commander";
import * as chrono from "chrono-node";
import parseDuration from "parse-duration";
import { getApiUrl } from "../helpers/urls";
import { logAndQuit } from "../helpers/errors";
import { loadConfig } from "../helpers/config";

export function registerBuy(program: Command) {
	program
		.command("buy")
		.description("Place a buy order")
		.option("-t, --type <type>", "Specify the type of node", "h100i")
		.option("-d, --duration <duration>", "Specify the duration", "1h")
		.option("-p, --price <price>", "Specify a price")
		.option("-n, --quantity <quantity>", "Specify quantity")
		.option("-s, --start <start>", "Specify a start date")
		.action(async (options) => {
			await placeBuyOrder(options);
		});
}

interface PlaceBuyOrderArguments {
	type: string;
	duration: string;
	price: number;
	quantity?: number;
	start?: string;
}

async function placeBuyOrder(props: PlaceBuyOrderArguments) {
	const { type, duration, price, quantity, start } = props;
	const config = await loadConfig();
	if (!config.token) {
		return logAndQuit("You need to login first.\n\n\t$ sf login\n");
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

	const response = await fetch(await getApiUrl("orders_create"), {
		method: "POST",
		body: JSON.stringify({
			type,
			duration: durationMs,
			price,
			quantity: orderQuantity,
			start: startDate.toISOString(),
		}),
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.token}`,
		},
	});

	if (!response.ok) {
		console.log(await response.text());
		return logAndQuit(`Failed to place order: ${response.statusText}`);
	}

	const data = await response.json();

	console.log(data);
}
