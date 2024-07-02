import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
	token?: string;
}

export async function saveConfig(config: Config): Promise<void> {
	const configDir = join(homedir(), ".sfcompute");
	const configPath = join(configDir, "config");
	const configData = JSON.stringify(config, null, 2);

	try {
		await Bun.write(configPath, configData);
		console.log("Config saved successfully.");
	} catch (error) {
		console.error("Failed to save config:", error);
	}
}

export async function loadConfig(): Promise<Config | null> {
	const configDir = join(homedir(), ".sfcompute");
	const configPath = join(configDir, "config");

	try {
		const file = Bun.file(configPath);
		const configData = await file.text();
		return JSON.parse(configData) as Config;
	} catch (error) {
		console.error("Failed to load config:", error);
		return null;
	}
}

export async function getToken() {
	const config = await loadConfig();
	return config?.token;
}

export async function getAuthorizationHeader() {
	const token = await getToken();
	return { Authorization: `Bearer ${token}` };
}
