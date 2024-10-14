import { unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { EmptyObject } from "../helpers/empty";

export interface Config {
  api_url: string;
  webapp_url: string;
  auth_token?: string;
}

const ProductionConfigDefaults = {
  api_url: "https://api.sfcompute.com",
  webapp_url: "https://sfcompute.com",
};

const DevelopmentConfigDefaults = {
  api_url: "http://localhost:8080",
  webapp_url: "http://localhost:3000",
};

const ConfigDefaults = process.env.IS_DEVELOPMENT_CLI_ENV
  ? DevelopmentConfigDefaults
  : ProductionConfigDefaults;

// --

export async function saveConfig(
  config: Partial<Config>,
): Promise<{ success: boolean }> {
  const configPath = getConfigPath();
  const configData = JSON.stringify(config, null, 2);

  try {
    await Bun.write(configPath, configData);

    return { success: true };
  } catch (error) {
    return { success: false };
  }
}

export async function loadConfig(): Promise<Config> {
  const configFileData = await readConfigFile();

  return { ...ConfigDefaults, ...configFileData };
}

export async function clearAuthFromConfig() {
  const config = await loadConfig();

  await saveConfig({
    ...config,
    auth_token: undefined,
  });
}

// only for development
export async function deleteConfig() {
  const exists = await configFileExists();
  if (!exists) {
    return;
  }

  const configPath = getConfigPath();

  try {
    unlinkSync(configPath);
    console.log("Config deleted successfully.");
  } catch (error) {
    console.error("Failed to delete config:", error);
  }
}

// --

export function getConfigPath(): string {
  const configDir = join(homedir(), ".sfcompute");
  const configPath = join(configDir, "config");

  return configPath;
}

function configFileExists(): Promise<boolean> {
  const configPath = getConfigPath();
  return Bun.file(configPath).exists();
}

async function readConfigFile(): Promise<Config | EmptyObject> {
  const exists = await configFileExists();
  if (!exists) {
    return {};
  }

  const configPath = getConfigPath();
  try {
    const configData = await Bun.file(configPath).text();
    const config = JSON.parse(configData);
    if (typeof config === "object" && config !== null) {
      return config;
    }

    return {};
  } catch (error) {
    console.error("Error reading config file:", error);
    return {};
  }
}

// --

export async function getAuthToken() {
  const config = await loadConfig();
  return config?.auth_token;
}

export async function getAuthorizationHeader() {
  const token = await getAuthToken();
  return { Authorization: `Bearer ${token}` };
}

export async function isLoggedIn() {
  const authToken = await getAuthToken();
  return !!authToken;
}
