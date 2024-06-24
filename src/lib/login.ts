import { exec } from "node:child_process";
import type { Command } from "commander";
import ora from "ora";
import { saveConfig } from "../helpers/config";
import { WebPaths } from "../helpers/urls";

export function registerLogin(program: Command) {
	program
		.command("login")
		.description("Login to the San Francisco Compute")
		.action(async () => {
			const spinner = ora("Logging in...").start();

			const validation = generateValidationString();
			const result = await createSession({ validation });
			if (!result) {
				console.error("Failed to login");
				process.exit(1);
			}
			const { url } = result;
			exec(`open ${url}`); // if this fails, that's okay

			process.stdout.write("\x1Bc");
			console.log(`\n\n  Click here to login:\n  ${url}\n\n`);
			console.log(
				`  Do these numbers match your browser window?\n  ${validation}\n\n`,
			);

			const checkSession = async () => {
				const session = await getSession({ token: result.token });
				if (session?.token) {
					spinner.succeed("Logged in successfully");
					console.log(`Session token: ${session.token}`);

					await saveConfig({ token: session.token });
				} else {
					setTimeout(checkSession, 200);
				}
			};

			checkSession();
		});
}

async function createSession({
	validation,
}: {
	validation: string;
}) {
	const response = await fetch(WebPaths.cli.session.create, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ validation }),
	});
	if (!response.ok) {
		console.error("Response not ok", response.status, response.statusText);
		return null;
	}

	const body = (await response.json()) as {
		url: string;
		token: string;
	};

	return body;
}

async function getSession({
	token,
}: {
	token: string;
}) {
	const response = await fetch(WebPaths.cli.session.get({ token }), {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	});
	if (!response.ok) {
		return null;
	}

	const body = (await response.json()) as {
		validation?: string;
		token?: string;
	};
	return body;
}

function generateValidationString() {
	const getRandomNumber = () => Math.floor(Math.random() * 100);
	return `${getRandomNumber()} ${getRandomNumber()} ${getRandomNumber()}`;
}
