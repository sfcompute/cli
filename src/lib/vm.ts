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
			const { data: _data, error: _error, response } = await client.GET("/v0/vms/instances");
			const data = _data as any;
			const error = _error as any;

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
				data.data.map((instance) => ({
					id: instance.id,
					instance_group_id: instance.instance_group_id,
					status: instance.status,
					last_updated_at: instance.last_updated_at,
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

			const { error, response } = await client.POST("/v0/vms/script", {
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
			const { data: _data, error: _error, response } = await client.GET("/v0/vms/logs");
			const data = _data as any;
			const error = _error as any;

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
				console.log(`(instance ${log.instance_id}) [${log.timestamp}] ${log.message}`);
			}
		});
}
