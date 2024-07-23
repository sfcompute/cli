import type { Command } from "commander";
import { loadConfig } from "../helpers/config";
import { logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";

export function registerBalance(program: Command) {
	program
		.command("balance")
		.description("Get account balance")
		.action(async () => {
			await getBalance();
		});
}

async function getBalance() {
	const config = await loadConfig();
	if (!config.auth_token) {
		return logLoginMessageAndQuit();
	}

	const response = await fetch(await getApiUrl("balance_get"), {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.auth_token}`,
		},
	});

	const data = await response.json();
	console.log(data);
}
