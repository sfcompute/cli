import * as console from "node:console";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { Command } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";

export function registerUninstall(program: Command) {
  return program
    .command("uninstall")
    .description("Remove sf config and binary from this machine")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--keep-binary", "Remove config but leave the sf binary in place")
    .action(async (options) => {
      const configDir = join(homedir(), ".sfcompute");
      const binaryPath = process.execPath;
      const willRemoveBinary = !options.keepBinary;

      if (!options.yes) {
        console.log(
          `This will remove:\n  ${chalk.cyan(configDir)} (config, cached tokens, feature flags)${
            willRemoveBinary ? `\n  ${chalk.cyan(binaryPath)} (sf binary)` : ""
          }\n`,
        );
        const proceed = await confirm({
          message: "Continue?",
          default: false,
        });
        if (!proceed) {
          console.log("Aborted.");
          process.exit(0);
        }
      }

      const spinner = ora("Removing sf config").start();
      try {
        await fs.rm(configDir, { recursive: true, force: true });
        spinner.succeed(`Removed ${configDir}`);
      } catch (err) {
        spinner.fail(`Failed to remove ${configDir}`);
        console.error(err);
        process.exit(1);
      }

      if (willRemoveBinary) {
        const binarySpinner = ora("Removing sf binary").start();
        try {
          await fs.rm(binaryPath, { force: true });
          binarySpinner.succeed(`Removed ${binaryPath}`);
        } catch (err) {
          binarySpinner.fail(`Failed to remove ${binaryPath}`);
          console.error(err);
          console.log(
            chalk.yellow(`\nDelete it manually with: rm ${binaryPath}`),
          );
          process.exit(1);
        }
      } else {
        console.log(
          chalk.yellow(
            `\nThe sf binary is still at ${binaryPath}. Delete it with: rm ${binaryPath}`,
          ),
        );
      }

      console.log(chalk.green("\nUninstalled sf."));
      process.exit(0);
    });
}
