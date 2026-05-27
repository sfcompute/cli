import { spawn } from "node:child_process";
import * as console from "node:console";
import process from "node:process";
import type { Command } from "@commander-js/extra-typings";
import boxen from "boxen";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, saveConfig } from "../helpers/config.ts";

const NEW_CLI_INSTALL_URL = "https://cli.sfcompute.com";
const MIGRATION_GUIDE_URL = "https://sfcompute.com/migrate";

export function showMigrateBanner() {
  const message = `We've rewritten the sf CLI in Rust.

List idle capacity on the orderbook to
recoup up to 20% of your spend.

Run 'sf migrate' to switch. Your current
CLI stays as 'sf-old'.

Docs:  ${MIGRATION_GUIDE_URL}
Hide:  SF_CLI_DISABLE_MIGRATE_BANNER=1`;

  console.log(
    boxen(chalk.yellow(message), {
      padding: 1,
      borderColor: "yellow",
      borderStyle: "round",
    }),
  );
}

export function registerMigrate(program: Command) {
  return program
    .command("migrate")
    .description("Install the new Rust-based sf CLI")
    .action(async () => {
      const spinner = ora("Downloading install script").start();
      let script: string;
      try {
        const response = await fetch(NEW_CLI_INSTALL_URL);
        if (!response.ok) {
          spinner.fail("Failed to download install script.");
          process.exit(1);
        }
        script = await response.text();
        spinner.succeed();
      } catch (err) {
        spinner.fail("Failed to download install script.");
        console.error(err);
        process.exit(1);
      }

      console.log(chalk.cyan("\nInstalling the new Rust sf CLI...\n"));

      if (process.env.IS_DEVELOPMENT_CLI_ENV) {
        console.log(
          chalk.yellow(
            "[dev] Skipping install script execution (IS_DEVELOPMENT_CLI_ENV).\n",
          ),
        );
      } else {
        const bashProcess = spawn("bash", [], {
          stdio: ["pipe", "inherit", "inherit"],
          env: process.env,
        });

        // Without an error listener, spawn failures (ENOENT/EACCES on bash) emit
        // an unhandled 'error' event and crash the CLI instead of exiting cleanly.
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
            bashProcess.once("close", (code) =>
              resolve({ kind: "close", code }),
            );
          }),
          spawnError.then((err) => ({ kind: "error" as const, err })),
        ]);

        if (result.kind === "error") {
          console.error(chalk.red(`Failed to run bash: ${result.err.message}`));
          process.exit(1);
        }

        if (result.code !== 0) {
          console.error(chalk.red("\nMigration failed."));
          process.exit(1);
        }
      }

      // Persist a flag so future `sf-old` invocations don't nag the user with
      // the migration banner.
      try {
        const config = await loadConfig();
        await saveConfig({ ...config, migrated_to_rust_cli: true });
      } catch {
        // Best-effort: a failure here just means the banner keeps showing.
      }

      console.log(
        boxen(
          chalk.cyan(
            `You're on the new sf.

Your previous CLI is still available as 'sf-old'.

Next steps:
  sf login
  sf availability

Docs: ${MIGRATION_GUIDE_URL}`,
          ),
          {
            padding: 1,
            borderColor: "cyan",
            borderStyle: "round",
          },
        ),
      );
      process.exit(0);
    });
}
