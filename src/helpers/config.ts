import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
	token?: string;
	isDevelopment?: boolean;
	api_url: string;
	webapp_url: string;
}

const ProductionConfigDefaults = {
	api_url: "https://api.sfcompute.dev",
	webapp_url: "https://sfcompute.dev",
};

const DevelopmentConfigDefaults = {
	api_url: "http://localhost:8080",
	webapp_url: "http://localhost:3000",
};

const ConfigDefaults = process.env.IS_DEVELOPMENT_CLI_ENV
	? DevelopmentConfigDefaults
	: ProductionConfigDefaults;

export async function saveConfig(config: Partial<Config>): Promise<void> {
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

export async function loadConfig(): Promise<Config> {
	const configDir = join(homedir(), ".sfcompute");
	const configPath = join(configDir, "config");

	try {
		const file = Bun.file(configPath);
		const configData = await file.text();
		const config = JSON.parse(configData) as Config;
		return { ...ConfigDefaults, ...config };
	} catch (error) {
		return ConfigDefaults;
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
