import { spawn } from "node:child_process";
import * as console from "node:console";
import process from "node:process";
import type { Command } from "@commander-js/extra-typings";
import boxen from "boxen";
import chalk from "chalk";
import ora from "ora";

const NEW_CLI_INSTALL_URL = "https://cli.sfcompute.com";
const MIGRATION_GUIDE_URL =
  "https://docs.sfcompute.com/preview/guides/migrating-from-nodes";

export function showMigrateBanner() {
  const message = `We've rewritten sf in Rust — faster, with new commands
like 'sf availability', 'sf capacities', and 'sf orders'.

Migrating also opts you into our public preview, which
lets you resell unused compute back on our orderbook
and earn credits.

Run 'sf migrate' to install it. Your current sf will
be moved to 'sf-old' so you can keep using it.

Docs:  ${MIGRATION_GUIDE_URL}
Hide:  SF_CLI_DISABLE_MIGRATE_BANNER=1`;

  console.log(
    boxen(chalk.cyan(message), {
      padding: 1,
      borderColor: "cyan",
      borderStyle: "round",
    }),
  );
}

async function fetchInstallScript(): Promise<string | null> {
  const spinner = ora("Downloading install script").start();
  try {
    const response = await fetch(NEW_CLI_INSTALL_URL);
    if (!response.ok) {
      spinner.fail("Failed to download install script.");
      return null;
    }
    const script = await response.text();
    spinner.succeed();
    return script;
  } catch (err) {
    spinner.fail("Failed to download install script.");
    console.error(err);
    return null;
  }
}

async function runInstallScript(script: string): Promise<boolean> {
  const bashProcess = spawn("bash", [], {
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env,
  });

  // Without an error listener, spawn failures (ENOENT/EACCES on bash) emit
  // an unhandled 'error' event and crash the CLI instead of returning false.
  const spawnError = new Promise<Error>((resolve) => {
    bashProcess.once("error", resolve);
  });

  try {
    bashProcess.stdin.write(script);
    bashProcess.stdin.end();
  } catch {
    // If stdin is already torn down (e.g. spawn failed synchronously), the
    // 'error' event handler below will surface the real reason.
  }

  const result = await Promise.race([
    new Promise<{ kind: "close"; code: number | null }>((resolve) => {
      bashProcess.once("close", (code) => resolve({ kind: "close", code }));
    }),
    spawnError.then((err) => ({ kind: "error" as const, err })),
  ]);

  if (result.kind === "error") {
    console.error(chalk.red(`Failed to run bash: ${result.err.message}`));
    return false;
  }

  return result.code === 0;
}

export async function handleMigrate(): Promise<boolean> {
  const script = await fetchInstallScript();
  if (!script) return false;

  console.log(chalk.cyan("\nInstalling the new Rust sf CLI...\n"));
  const ok = await runInstallScript(script);
  if (!ok) {
    console.error(chalk.red("\nMigration failed."));
    return false;
  }

  console.log(
    boxen(
      chalk.cyan(
        `You're on the new sf.

Your previous CLI is still available as 'sf-old'.

Next steps:
  sf login
  sf availability

Migration guide: ${MIGRATION_GUIDE_URL}`,
      ),
      {
        padding: 1,
        borderColor: "cyan",
        borderStyle: "round",
      },
    ),
  );
  return true;
}

export function registerMigrate(program: Command) {
  return program
    .command("migrate")
    .description("Install the new Rust-based sf CLI")
    .action(async () => {
      const success = await handleMigrate();
      process.exit(success ? 0 : 1);
    });
}
