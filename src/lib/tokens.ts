import type { Command } from "commander";
import { isLoggedIn } from "../helpers/config";
import { logLoginMessageAndQuit } from "../helpers/errors";
import { input } from "@inquirer/prompts";
import ora from "ora";
import chalk from "chalk";

export const TOKEN_EXPIRATION_SECONDS = {
  IN_7_DAYS: 7 * 24 * 60 * 60,
  IN_14_DAYS: 14 * 24 * 60 * 60,
  IN_30_DAYS: 30 * 24 * 60 * 60,
  IN_60_DAYS: 60 * 24 * 60 * 60,
  IN_90_DAYS: 90 * 24 * 60 * 60,
  IN_100_YEARS: 100 * 365 * 24 * 60 * 60,
};

export function registerTokens(program: Command) {
  const tokens = program
    .command("tokens")
    .description("Manage account access tokens.");

  tokens
    .command("create")
    .description("Create a new access token")
    .action(createTokenAction);

  // tokens
  //   .command("ls")
  //   .description("List all tokens")
  //   .option("--include-system, -is", "Include system tokens")
  //   .action(listTokensAction);

  // tokens
  //   .command("delete")
  //   .description("Delete a token")
  //   .option("--name <name>", "Specify the token name")
  //   .option("--id <id>", "Specify the token ID")
  //   .action(deleteTokenAction);
}

// --

async function createTokenAction() {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  // collect duration
  const expiresInSeconds = await select({
    message: "Select token expiration:",
    default: TOKEN_EXPIRATION_SECONDS.IN_100_YEARS,
    choices: [
      { name: "1 week", value: TOKEN_EXPIRATION_SECONDS.IN_7_DAYS },
      { name: "2 weeks", value: TOKEN_EXPIRATION_SECONDS.IN_14_DAYS },
      { name: "1 month", value: TOKEN_EXPIRATION_SECONDS.IN_30_DAYS },
      { name: "2 months", value: TOKEN_EXPIRATION_SECONDS.IN_60_DAYS },
      { name: "3 months", value: TOKEN_EXPIRATION_SECONDS.IN_90_DAYS },
      {
        name: "Never Expire",
        value: TOKEN_EXPIRATION_SECONDS.IN_100_YEARS,
      },
    ],
  });

  // collect name & description
  const name = await input({
    message: `Name your token ${chalk.gray("(optional, ↵ to skip)")}:`,
    default: "",
  });
  const description = await input({
    message: `Description for your token ${chalk.gray("(optional, ↵ to skip)")}:`,
    default: "",
  });

  const loadingSpinner = ora("Generating token\n").start();

  // const response = await fetch(await getApiUrl("tokens_create"), {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${config.auth_token}`,
  //   },
  // });

  // console.log(expiresInSeconds);
  console.log(name);
  process.exit(0);
}

async function listTokensAction() {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  // const response = await fetch(await getApiUrl("tokens_create"), {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${config.auth_token}`,
  //   },
  // });

  console.log("Listing tokens...");
}

async function deleteTokenAction() {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  // const response = await fetch(await getApiUrl("tokens_create"), {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${config.auth_token}`,
  //   },
  // });

  console.log("Deleting tokens...");
}
