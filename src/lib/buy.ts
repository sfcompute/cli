import type { Command } from "commander";
import * as chrono from "chrono-node";
import parseDuration from "parse-duration";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import { loadConfig } from "../helpers/config";
import c from "chalk";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import duration from "dayjs/plugin/duration";
import readline from "node:readline";
import { getApiUrl } from "../helpers/urls";

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

interface PlaceBuyOrderArguments {
	type: string;
	duration: string;
	price: string | number;
	quantity?: number;
	start?: string;
	yes?: boolean;
}

function priceToCenticents(price: string | number): number {
	if (typeof price === "number") {
		return price;
	}

	try {
		// Remove any leading dollar sign and convert to a number
		const numericPrice = Number.parseFloat(price.replace(/^\$/, ""));

		// Convert dollars to centicents
		return Math.round(numericPrice * 10000);
	} catch (error) {
		logAndQuit("Invalid price");
	}
	return 0;
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

function formatDuration(ms: number) {
	const d = dayjs.duration(ms);

	const years = Math.floor(d.asYears());
	const weeks = Math.floor(d.asWeeks()) % 52;
	const days = d.days();
	const hours = d.hours();
	const minutes = d.minutes();
	const seconds = d.seconds();
	const milliseconds = d.milliseconds();

	if (years > 0) return `${years}y`;
	if (weeks > 0) return `${weeks}w`;
	if (days > 0) return `${days}d`;
	if (hours > 0) return `${hours}h`;
	if (minutes > 0) return `${minutes}m`;
	if (seconds > 0) return `${seconds}s`;
	if (milliseconds > 0) return `${milliseconds}ms`;
	return "0ms";
}

interface PlaceOrderParameters {
	side: "buy" | "sell";
	quantity: number;
	price: number;
	instance_type: string;
	duration: number;
	start_at: string;
}

function confirmPlaceOrderParametersMessage(params: PlaceOrderParameters) {
	const { side, quantity, price, instance_type, duration, start_at } = params;

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

async function placeBuyOrder(props: PlaceBuyOrderArguments) {
	const { type, duration, price, quantity, start } = props;
	const config = await loadConfig();
	if (!config.token) {
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
			Authorization: `Bearer ${config.token}`,
		},
	});

	if (!response.ok) {
		const resp = await response.json();
		return logAndQuit(`Failed to place order: ${resp.message}`);
	}

	const data = (await response.json()) as PostOrderResponse;
	console.log("Order placed");
}
