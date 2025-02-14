import type { Command } from "@commander-js/extra-typings";
import { isFeatureEnabled } from "./posthog.ts";
import { apiClient } from "../apiClient.ts";
import { readFileSync } from "node:fs";
import {
	logAndQuit,
	logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";

export async function registerVM(program: Command) {
	const isEnabled = await isFeatureEnabled("vms");

	if (!isEnabled) {
		return;
	}

	const vm = program
		.command("vm")
		.aliases(["v", "vms"])
		.description("Manage virtual machines");

	const client = await apiClient();

	vm.command("list")
		.description("List all virtual machines")
		.action(async () => {
			const { data, error, response } = await client.GET("/v0/vm/nodes");

			if (!response.ok) {
				if (response.status === 401) {
					await logSessionTokenExpiredAndQuit();
				}
				logAndQuit(`Failed to list VMs: ${error?.message}`);
			}

			if (!data?.data) {
				logAndQuit("No VMs found");
			}

			console.table(
				data.data.map((node) => ({
					id: node.id,
					status: node.status,
					created_at: node.created_at,
				})),
			);
		});

	vm.command("script")
		.description("Push a startup script to VMs")
		.requiredOption("-f, --file <file>", "Path to startup script file")
		.action(async (options) => {
			let script: string;
			try {
				script = readFileSync(options.file, "utf-8");
			} catch (err) {
				logAndQuit(`Failed to read script file: ${err.message}`);
			}

			const { error, response } = await client.POST("/v0/vm/script", {
				body: { script },
			});

			if (!response.ok) {
				if (response.status === 401) {
					await logSessionTokenExpiredAndQuit();
				}
				logAndQuit(`Failed to upload script: ${error?.message}`);
			}

			console.log("Successfully uploaded startup script");
		});

	vm.command("logs")
		.description("View VM logs")
		.action(async () => {
			const { data, error, response } = await client.GET("/v0/vm/logs");

			if (!response.ok) {
				if (response.status === 401) {
					await logSessionTokenExpiredAndQuit();
				}
				logAndQuit(`Failed to fetch logs: ${error?.message}`);
			}

			if (!data?.data?.length) {
				console.log("No logs found");
				return;
			}

			for (const log of data.data) {
				console.log(`[${log.timestamp}] ${log.message}`);
			}
		});
}
