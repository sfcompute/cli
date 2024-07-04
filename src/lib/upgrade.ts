import type { Command } from "commander";

export function registerUpgrade(program: Command) {
	return program
		.command("upgrade")
		.argument("[version]", "The version to upgrade to")
		.description("Upgrade to the latest version or a specific version")
		.action(async (version) => {
			if (version) {
				const url = `https://github.com/sfcompute/cli/archive/refs/tags/${version}.zip`;
				const response = await fetch(url, { method: "HEAD" });

				if (response.status === 404) {
					console.error(`Version ${version} does not exist.`);
					process.exit(1);
				}
			}

			if (version) {
				await Bun.$`bash -c "$(curl -fsSL https://www.sfcompute.dev/cli/install)" -- ${version}`;
			} else {
				await Bun.$`bash -c "$(curl -fsSL https://www.sfcompute.dev/cli/install)"`;
			}
		});
}
