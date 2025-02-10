import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import type { Command } from "commander";
import dayjs from "npm:dayjs@1.11.13";
import utc from "npm:dayjs@1.11.13/plugin/utc.js";
import {
  deleteConfig,
  getConfigPath,
  isLoggedIn,
  loadConfig,
} from "../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { currentEpoch, epochToDate } from "../helpers/units.ts";
import { getApiUrl } from "../helpers/urls.ts";

dayjs.extend(utc);

// development only commands
export function registerDev(program: Command) {
  if (process.env.IS_DEVELOPMENT_CLI_ENV) {
    // config
    registerConfig(program);

    // time
    registerEpoch(program);
    program.command("utc").action(async () => {
      const unixEpochSecondsNow = dayjs().unix();
      console.log(unixEpochSecondsNow);
      console.log(
        chalk.green(dayjs().utc().format("dddd, MMMM D, YYYY h:mm:ss A")),
      );

      // process.exit(0);
    });

    // connection
    program.command("ping").action(async () => {
      const data = await pingServer();
      console.log(data);

      // process.exit(0);
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
  // process.exit(0);
}

async function removeConfigAction() {
  const configFilePath = getConfigPath();
  const confirmedYes = await confirm({
    message: `Delete configuration file at ${configFilePath}?`,
  });
  if (confirmedYes) {
    await deleteConfig();
  }
  // process.exit(0);
}

// --

function registerEpoch(program: Command) {
  const epochCmd = program
    .command("epoch [timestamps...]")
    .description("Get current epoch timestamp or convert given timestamps")
    .action(async (timestamps: string[]) => {
      if (timestamps.length === 0) {
        const epoch = currentEpoch();
        console.log(epoch);
      } else {
        const colorDiffedEpochs = colorDiffEpochs(timestamps);

        timestamps.forEach((epochTimestamp, i) => {
          const date = epochToDate(Number.parseInt(epochTimestamp));
          console.log(
            `${colorDiffedEpochs[i]} | ${
              chalk.yellow(
                dayjs(date).format("hh:mm A MM-DD-YYYY"),
              )
            } Local`,
          );
        });
      }

      // process.exit(0);
    });

  epochCmd
    .command("now")
    .description("Get current epoch timestamp")
    .action(async () => {
      const epoch = currentEpoch();
      console.log(epoch);
      // process.exit(0);
    });
}

function colorDiffEpochs(epochStrings: string[]): string[] {
  const minLength = Math.min(...epochStrings.map((num) => num.length));

  // function to find the common prefix between all numbers
  const findCommonPrefix = (arr: string[]): string => {
    let prefix = "";
    for (let i = 0; i < minLength; i++) {
      const currentChar = arr[0][i];
      if (arr.every((num) => num[i] === currentChar)) {
        prefix += currentChar;
      } else {
        break;
      }
    }

    return prefix;
  };

  // find the common prefix for all numbers
  const commonPrefix = findCommonPrefix(epochStrings);

  return epochStrings.map((num) => {
    const prefix = num.startsWith(commonPrefix) ? commonPrefix : "";
    const rest = num.slice(prefix.length);

    // return the string with appropriate coloring (gray for common prefix, white for the rest)
    return chalk.gray(prefix) + chalk.white(rest);
  });
}

// --

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
