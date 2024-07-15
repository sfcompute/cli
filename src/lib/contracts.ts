import { Command } from "commander";
import { getApiUrl } from "../helpers/urls";
import { loadConfig } from "../helpers/config";
import { logLoginMessageAndQuit } from "../helpers/errors";

export function registerContracts(program: Command) {
	program
		.command("contracts")
		.description("Manage contracts")
		.addCommand(
			new Command("list").description("List all contracts").action(async () => {
				await listContracts();
			}),
		);
}

async function listContracts() {
	const config = await loadConfig();
	if (!config.token) {
		return logLoginMessageAndQuit();
	}

	const response = await fetch(await getApiUrl("contracts_list"), {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.token}`,
		},
	});

	const data = await response.json();
	console.log(data);
}
