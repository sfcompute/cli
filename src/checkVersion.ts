import boxen from "boxen";
import chalk from "chalk";
import { execSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import semver from "semver";
import pkg from "../package.json" with { type: "json" };

const CACHE_FILE = join(homedir(), ".sfcompute", "version-cache");
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

interface VersionCache {
  version: string;
  timestamp: number;
}

async function checkCacheExists(): Promise<boolean> {
  try {
    await stat(CACHE_FILE);
    return true;
  } catch {
    return false;
  }
}

async function readCache(): Promise<VersionCache | null> {
  try {
    const cacheData = await readFile(CACHE_FILE, "utf-8");
    const cache = JSON.parse(cacheData);
    if (typeof cache === "object" && cache !== null) {
      return cache as VersionCache;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(version: string): Promise<void> {
  const cacheDir = join(homedir(), ".sfcompute");
  const cacheData = JSON.stringify({
    version,
    timestamp: Date.now(),
  });

  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(CACHE_FILE, cacheData);
  } catch {
    // Ignore cache write failures
  }
}

async function checkProductionCLIVersion() {
  // Check cache first
  const exists = await checkCacheExists();
  if (exists) {
    const cache = await readCache();
    if (cache) {
      const now = Date.now();
      if (now - cache.timestamp < CACHE_TTL) {
        return cache.version;
      }
    }
  }

  // Fetch from network
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/sfcompute/cli/refs/heads/main/package.json"
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    await writeCache(data.version);
    return data.version;
  } catch (error) {
    console.error("boba failed to check latest CLI version:", error);
    return null;
  }
}

export async function checkVersion() {
  const version = pkg.version;
  const latestVersion = await checkProductionCLIVersion();

  if (!latestVersion) return;

  if (version === latestVersion) return;

  const isOutdated = semver.lt(version, latestVersion);
  if (!isOutdated) return;

  // Only auto-upgrade for patch changes
  const isPatchUpdate = semver.diff(version, latestVersion) === "patch";

  if (isPatchUpdate) {
    console.log(
      chalk.cyan(`Automatically upgrading ${version} → ${latestVersion}`)
    );
    try {
      execSync("sf upgrade", { stdio: "inherit" });
      console.log(chalk.gray("\n☁☁☁️\n"));

      // Re-run the original command
      const args = process.argv.slice(2);
      execSync(`sf ${args.join(" ")}`, { stdio: "inherit" });
      process.exit(0);
    } catch {
      // Silent error, just run the command the user wanted to run
    }
  } else {
    // For non-patch updates, show the update message
    const message = `
Please update your CLI.

Your version:   ${version}
Latest version: ${latestVersion}

Run 'sf upgrade' to update to the latest version
`;
    console.log(
      boxen(chalk.yellow(message), {
        padding: 1,
        borderColor: "yellow",
        borderStyle: "round",
      })
    );
  }
}
