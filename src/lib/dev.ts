import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import {
  deleteConfig,
  getConfigPath,
  isLoggedIn,
  loadConfig,
} from "../helpers/config";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";

// development only commands
export function registerDev(program: Command) {
  if (process.env.IS_DEVELOPMENT_CLI_ENV) {
    registerConfig(program);

    program.command("me").action(async () => {
      const accountId = await getLoggedInAccountId();
      console.log(accountId);

      process.exit(0);
    });
    program.command("epoch").action(async () => {
      const MILLS_PER_EPOCH = 1000 * 60;
      console.log(Math.floor(Date.now() / MILLS_PER_EPOCH));

      process.exit(0);
    });
    program.command("ping").action(async () => {
      const data = await pingServer();
      console.log(data);

      process.exit(0);
    });
  }
}

// --

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

// --

async function getLoggedInAccountId() {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }
  const config = await loadConfig();

  const response = await fetch(await getApiUrl("me"), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.auth_token}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      logSessionTokenExpiredAndQuit();
    }

    logAndQuit("Failed to fetch account info");
  }

  const data = await response.json();

  return data.id;
}

async function pingServer() {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }
  const config = await loadConfig();

  const response = await fetch(await getApiUrl("ping"), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.auth_token}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      logSessionTokenExpiredAndQuit();
    }

    logAndQuit("Failed to ping server");
  }

  const data = await response.json();

  return data;
}
