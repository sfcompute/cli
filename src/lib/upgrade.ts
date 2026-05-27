import { spawn } from "node:child_process";
import * as console from "node:console";
import { basename, dirname } from "node:path";
import process from "node:process";
import type { Command } from "@commander-js/extra-typings";
import ora from "ora";

/**
 * Returns true if the current version is the same as the latest release version.
 */
const getIsOnLatestVersion = async (currentVersion: string | undefined) => {
  if (!currentVersion) {
    return false;
  }

  const latestVersionUrl =
    "https://api.github.com/repos/sfcompute/cli/releases/latest";
  const latestVersionResponse = await fetch(latestVersionUrl);

  if (latestVersionResponse.ok) {
    const latestVersionData = (await latestVersionResponse.json()) as {
      tag_name: string;
    };
    const latestVersion = latestVersionData.tag_name;

    return latestVersion === currentVersion;
  }

  return false;
};

export async function handleUpgrade(
  currentVersion?: string,
  version?: string,
): Promise<boolean> {
  const spinner = ora();

  if (version) {
    spinner.start(`Checking if version ${version} exists`);
    const url =
      `https://github.com/sfcompute/cli/archive/refs/tags/${version}.zip` as const;
    const response = await fetch(url, { method: "HEAD" });

    if (response.status === 404) {
      spinner.fail(`Version ${version} does not exist.`);
      return false;
    }
    spinner.succeed();
  } else {
    const isOnLatestVersion = await getIsOnLatestVersion(currentVersion);
    if (isOnLatestVersion) {
      spinner.succeed(
        `You are already on the latest version (${currentVersion}).`,
      );
      return true;
    }
  }

  // Fetch the install script
  spinner.start("Downloading install script");
  const scriptResponse = await fetch("https://www.sfcompute.com/cli/install");

  if (!scriptResponse.ok) {
    spinner.fail("Failed to download install script.");
    return false;
  }

  const script = await scriptResponse.text();
  spinner.succeed();

  // Execute the script with bash
  spinner.start("Installing upgrade");

  // Tell the install script to write back to this exact binary's path. Without
  // this, the installer hardcodes ~/.local/bin/sf — which would clobber the
  // Rust `sf` if we're running as `sf-old`, and would silently drop a
  // duplicate copy when `sf` is installed somewhere else (e.g. /usr/local/bin).
  const bashProcess = spawn("bash", [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(version ? { SF_CLI_VERSION: version } : {}),
      SF_CLI_TARGET_DIR: dirname(process.execPath),
      SF_CLI_BINARY_NAME: basename(process.execPath),
    },
  });

  let stdout = "";
  let stderr = "";

  bashProcess.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  bashProcess.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  bashProcess.stdin.write(script);
  bashProcess.stdin.end();

  const code = await new Promise<number | null>((resolve) => {
    bashProcess.on("close", resolve);
  });

  if (code !== 0) {
    spinner.fail("Upgrade failed");
    console.error(stderr);
    console.log(stdout);
    return false;
  }

  spinner.succeed("Upgrade completed successfully");
  return true;
}

export function registerUpgrade(program: Command) {
  return program
    .command("upgrade")
    .argument("[version]", "The version to upgrade to")
    .description("Upgrade to the latest version or a specific version")
    .action(async (version) => {
      const success = await handleUpgrade(program.version(), version);
      process.exit(success ? 0 : 1);
    });
}
