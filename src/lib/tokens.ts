import type { Command } from "commander";
import { getAuthToken, isLoggedIn } from "../helpers/config";
import {
  ApiErrorCode,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
  type ApiError,
} from "../helpers/errors";
import { input, select } from "@inquirer/prompts";
import ora from "ora";
import chalk from "chalk";
import { getApiUrl } from "../helpers/urls";
import { getCommandBase } from "../helpers/command";
import Table from "cli-table3";
import { confirm } from "@inquirer/prompts";
import dayjs from "dayjs";

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

  tokens
    .command("list")
    .alias("ls")
    .description("List all tokens")
    .action(listTokensAction);

  tokens
    .command("delete")
    .description("Delete a token")
    .requiredOption("--id <id>", "Specify the token ID")
    .option("--force", "Force delete the token, skipping confirmation")
    .action(deleteTokenAction);
}

// --

interface TokenObject {
  id: string;
  token?: string;
  name?: string;
  description?: string;
  is_sandbox: boolean;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  origin_client: string;
  is_system: boolean;
}

interface PostTokenRequestBody {
  expires_in_seconds: number;
  name?: string;
  description?: string;
  origin_client: string;
}

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

  // generate token
  console.log("\n");
  const loadingSpinner = ora("Generating token").start();

  const response = await fetch(await getApiUrl("tokens_create"), {
    method: "POST",
    body: JSON.stringify({
      expires_in_seconds: expiresInSeconds,
      name,
      description,
      origin_client: "cli",
    } as PostTokenRequestBody),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      await logSessionTokenExpiredAndQuit();
    }

    // TODO: handle specific errors

    loadingSpinner.fail("Failed to create token");
    process.exit(1);
  }

  // display token to user
  const data = await response.json();
  loadingSpinner.succeed(chalk.gray("Access token created 🎉"));
  console.log(chalk.green(data.token) + "\n");

  // tell them they will set this in the Authorization header
  console.log(
    `${chalk.gray(`Pass this in the 'Authorization' header of API requests:`)}`,
  );
  console.log(
    [
      chalk.gray("{ "),
      chalk.white("Authorization"),
      chalk.gray(": "),
      chalk.green('"Bearer '),
      chalk.magenta("<token>"),
      chalk.green('"'),
      chalk.gray(" }"),
    ].join(""),
  );
  console.log("\n");

  // give them a sample curl
  const pingUrl = await getApiUrl("ping");
  console.log(`${chalk.gray("Here is a sample curl to get your started:")}`);
  console.log(
    chalk.white(`curl --request GET \\
  --url ${pingUrl} \\
  --header 'Authorization: Bearer ${data.token}'`),
  );
  console.log("\n");

  // tip user on other commands
  const base = getCommandBase();

  const table = new Table({
    colWidths: [20, 30],
  });
  table.push(["View All Tokens", chalk.magenta(`${base} tokens list`)]);
  table.push(["Delete a Token", chalk.magenta(`${base} tokens delete`)]);

  console.log(`${chalk.gray("And other commands you can try:")}`);
  console.log(table.toString());

  process.exit(0);
}

// --

async function listTokensAction() {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  const loadingSpinner = ora("Fetching tokens...").start();

  // fetch tokens
  const tokensListUrl = await getApiUrl("tokens_list");
  const response = await fetch(tokensListUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      await logSessionTokenExpiredAndQuit();
    }

    // TODO: handle specific errors

    loadingSpinner.fail("Failed to fetch tokens");
    process.exit(1);
  }
  loadingSpinner.stop(); // hide spinner

  // show account tokens
  const responseBody = await response.json();
  const tokens = responseBody.data as Array<TokenObject>;

  // show empty table if no tokens
  if (tokens.length === 0) {
    const table = new Table({
      head: [chalk.gray("Access Tokens")],
      colWidths: [50],
    });
    table.push([
      { colSpan: 1, content: "No access tokens found", hAlign: "center" },
    ]);
    console.log(table.toString() + "\n");

    // prompt user that they can generate one
    const base = getCommandBase();
    console.log(
      chalk.gray("Generate your first token with: ") +
        chalk.magenta(`${base} tokens create`),
    );

    process.exit(0);
  }

  // display table
  const tokensTable = new Table({
    head: [
      chalk.gray("Token ID"),
      chalk.gray("Name"),
      chalk.gray("Last Active At"),
      chalk.gray("Expires"),
    ],
    colWidths: [40, 15, 25, 25],
  });
  for (const token of tokens) {
    tokensTable.push([
      chalk.gray(token.id),
      token.name ? token.name : chalk.gray("(empty)"),
      chalk.green(formatDate(token.last_active_at)),
      chalk.white(formatDate(token.expires_at)),
    ]);
  }
  console.log(tokensTable.toString());

  process.exit(0);
}

function formatDate(isoString: string): string {
  return dayjs(isoString).format("MMM D, YYYY [at] h:mma").toLowerCase();
}

// --

async function deleteTokenAction({
  id,
  force,
}: { id: string; force?: boolean }) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  if (force) {
    await deleteTokenById(id);
  }

  const deleteTokenConfirmed = await confirm({
    message: `Are you sure you want to delete this token? ${chalk.gray("(it will stop working immediately.)")}`,
    default: false,
  });
  if (!deleteTokenConfirmed) {
    process.exit(0);
  } else {
    const verySureConfirmed = await confirm({
      message:
        chalk.red("Very sure?") + " " + chalk.gray("(just double-checking)"),
      default: false,
    });

    if (!verySureConfirmed) {
      process.exit(0);
    } else {
      await deleteTokenById(id);
    }
  }
}
async function deleteTokenById(id: string) {
  const deleteTokenByIdUrl = await getApiUrl("tokens_delete_by_id", { id });
  const loadingSpinner = ora("Deleting token...").start();

  const response = await fetch(deleteTokenByIdUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      await logSessionTokenExpiredAndQuit();
    }

    const error = (await response.json()) as ApiError;
    if (error.code === ApiErrorCode.Tokens.TokenNotFound) {
      loadingSpinner.fail("Token not found");
      process.exit(1);
    }

    // TODO: handle more specific errors

    // generic catch-all
    loadingSpinner.fail("Failed to delete token");
    process.exit(1);
  }

  loadingSpinner.stop();
  console.log(chalk.gray("Token deleted. 🧼"));

  process.exit(0);
}
