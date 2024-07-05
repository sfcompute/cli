import type { Command } from "commander";
import { loadConfig } from "../helpers/config";

export async function registerDev(program: Command) {
	const config = await loadConfig();
	if (config?.isDevelopment) {
		// development only commands
		program.command("ping").action(async () => {
			console.log("pong");
		});

		program.command("env").action(async () => {
			console.log(config);
		});
	}
}
