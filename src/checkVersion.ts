import boxen from "boxen";
import chalk from "chalk";
import pkg from "../package.json" with { type: "json" };
import semver from "semver";

async function checkProductionCLIVersion() {
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/sfcompute/cli/refs/heads/main/package.json"
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const latestVersion = data.version;
    return latestVersion;
  } catch (error) {
    console.error("Failed to check for latest CLI version:", error);
    return null;
  }
}

export async function checkVersion() {
  const version = pkg.version;
  const latestVersion = await checkProductionCLIVersion();
  if (latestVersion && version !== latestVersion) {
    const isOutdated = semver.lt(version, latestVersion);
    if (isOutdated) {
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
}
