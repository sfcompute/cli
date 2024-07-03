import type { Command } from "commander";

export function registerUpgrade(program: Command) {
	return program
		.command("upgrade")
		.description("Upgrade to the latest version or a specific version")
		.action(async () => {
			await Bun.$`curl -fsSL https://sfcompute.com/cli/install | bash`;
		});
}
