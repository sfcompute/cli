import * as console from "node:console";
import { unlinkSync } from "node:fs";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { EmptyObject } from "../types/empty.ts";

export interface Config {
  api_url: string;
  webapp_url: string;
  auth_token?: string;
  account_id?: string;
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
  const configDir = join(homedir(), ".sfcompute");
  const configData = JSON.stringify(config, null, 2);

  try {
    // Ensure config directory exists
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, configData);

    return { success: true };
  } catch (error) {
    console.error("Error saving config:", error);
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
    account_id: undefined,
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

async function configFileExists(): Promise<boolean> {
  const configPath = getConfigPath();
  try {
    await fs.stat(configPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readConfigFile(): Promise<Config | EmptyObject> {
  const exists = await configFileExists();
  if (!exists) {
    return {};
  }

  const configPath = getConfigPath();
  try {
    const configData = await fs.readFile(configPath, "utf-8");
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
