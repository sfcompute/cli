import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import { deleteConfig, getConfigPath, loadConfig } from "../helpers/config";

// development only commands
export function registerDev(program: Command) {
  if (process.env.IS_DEVELOPMENT_CLI_ENV) {
    program.command("ping").action(async () => {
      console.log("pong");
      process.exit(0);
    });

    registerConfig(program);
  }
}

function registerConfig(program: Command) {
  const configCmd = program
    .command("config")
    .description("Manage cli config file.")
    .option("-rm, --remove", "Remove config file");

  // sf config
  // sf config [-rm, --remove]
  configCmd.action(async (options) => {
    if (options.remove) {
      await removeConfigAction();
    } else {
      await showConfigAction();
    }
  });

  // sf config show
  configCmd
    .command("show")
    .description("Display config settings")
    .action(showConfigAction);

  // sf config remove
  configCmd
    .command("remove")
    .alias("rm")
    .description("Remove config file")
    .action(removeConfigAction);
}

// --

async function showConfigAction() {
  const config = await loadConfig();
  console.log(config);
  process.exit(0);
}

async function removeConfigAction() {
  const configFilePath = getConfigPath();
  const confirmedYes = await confirm({
    message: `Delete configuration file at ${configFilePath}?`,
  });
  if (confirmedYes) {
    await deleteConfig();
  }
  process.exit(0);
}
