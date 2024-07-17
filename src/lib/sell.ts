import type { Command } from "commander";

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
