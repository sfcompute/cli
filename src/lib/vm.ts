import type { Command } from "@commander-js/extra-typings";
import { isFeatureEnabled } from "./posthog.ts";
import { readFileSync } from "node:fs";
import {
	logAndQuit,
	logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";
import { getAuthToken } from "../helpers/config.ts";
import console from "node:console";

export async function registerVM(program: Command) {
	const isEnabled = await isFeatureEnabled("vms");

	if (!isEnabled) {
		return;
	}

	const vm = program
		.command("vm")
		.aliases(["v", "vms"])
		.description("Manage virtual machines");

	vm.command("list")
		.description("List all virtual machines")
		.action(async () => {
			const url = await getApiUrl("vms_instances_list");
			const response = await fetch(url, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await getAuthToken()}`,
				},
			});

			if (!response.ok) {
				if (response.status === 401) {
					await logSessionTokenExpiredAndQuit();
				}
				logAndQuit(`Failed to list VMs: ${response.statusText}`);
			}

			const { data } = await response.json();

			if (!data?.length) {
				logAndQuit("No VMs found");
			}

			console.table(
				data.map(
					(instance: {
						id: string;
						instance_group_id: string;
						current_status: string;
						last_updated_at: string;
					}) => ({
						id: instance.id,
						instance_group_id: instance.instance_group_id,
						status: instance.current_status,
						last_updated_at: instance.last_updated_at,
					}),
				),
			);
		});

	vm.command("script")
		.description("Push a startup script to VMs")
		.requiredOption("-f, --file <file>", "Path to startup script file")
		.action(async (options) => {
			let script: string;
			try {
				script = readFileSync(options.file, "utf-8");
			} catch {
				logAndQuit("Failed to read script file");
			}

			const url = await getApiUrl("vms_script_post");
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await getAuthToken()}`,
				},
				body: JSON.stringify({ script }),
			});

			if (!response.ok) {
				if (response.status === 401) {
					await logSessionTokenExpiredAndQuit();
				}
				logAndQuit(`Failed to upload script: ${response.statusText}`);
			}

			console.log("Successfully uploaded startup script");
		});

	vm.command("logs")
		.description("View VM logs")
		.action(async () => {
			const url = await getApiUrl("vms_logs_list");
			const response = await fetch(url, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await getAuthToken()}`,
				},
			});

			if (!response.ok) {
				if (response.status === 401) {
					await logSessionTokenExpiredAndQuit();
				}
				logAndQuit(`Failed to fetch logs: ${response.statusText}`);
			}

			const { data } = await response.json();

			if (!data?.length) {
				console.log("No logs found");
				return;
			}

			try {
				for (const log of data) {
					// Format timestamp to be more human-readable and consistent length
					const timestamp = new Date(log.timestamp);
					const formattedTime = timestamp
						.toISOString()
						.replace("T", " ")
						.replace(/\.\d+Z$/, "")
						.padEnd(19); // ISO format: YYYY-MM-DD HH:MM:SS

					if (log.message.includes("\n")) {
						// If the message contains newlines, preserve them
						const prefix = `(instance ${log.instance_id}) [${formattedTime}] `;
						const lines = log.message.split("\n");

						// Remove empty line at the end if it exists
						if (lines[lines.length - 1] === "") {
							lines.pop();
						}

						try {
							console.log(prefix + lines[0]);
							for (let i = 1; i < lines.length; i++) {
								console.log(lines[i]);
							}
						} catch (err: any) {
							// If pipe is broken, stop processing
							if (
								err.message?.includes("Broken pipe") ||
								err.name === "BrokenPipe"
							) {
								return;
							}
							throw err;
						}
					} else {
						// For single line messages, print as before
						try {
							console.log(
								`(instance ${log.instance_id}) [${formattedTime}] ${log.message}`,
							);
						} catch (err: any) {
							// If pipe is broken, stop processing
							if (
								err.message?.includes("Broken pipe") ||
								err.name === "BrokenPipe"
							) {
								return;
							}
							throw err;
						}
					}
				}
			} catch (err: any) {
				// Handle broken pipe errors at the top level too
				if (err.message?.includes("Broken pipe") || err.name === "BrokenPipe") {
					return;
				}
				throw err;
			}
		});
}
