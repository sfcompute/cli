import type { Command } from "@commander-js/extra-typings";
import { confirm, input, select } from "@inquirer/prompts";
import { cyan, gray, green, magenta, red, white } from "jsr:@std/fmt/colors";
import Table from "cli-table3";
import * as console from "node:console";
import process from "node:process";
import ora from "ora";
import { getAuthToken, isLoggedIn } from "../helpers/config.ts";
import {
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";
import { formatDate } from "../helpers/format-date.ts";

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
    .alias("rm")
    .description("Delete a token")
    .requiredOption("--id <id>", "Specify the token ID")
    .option("--yes", "Force delete the token, skipping confirmation")
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
    message: `Name your token ${gray("(optional, ↵ to skip)")}:`,
    default: "",
  });
  const description = await input({
    message: `Description for your token ${
      gray(
        "(optional, ↵ to skip)",
      )
    }:`,
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
  loadingSpinner.succeed(gray("Access token created 🎉"));
  console.log(`${green(data.token)}\n`);

  // tell them they will set this in the Authorization header
  console.log(
    `${gray(`Pass this in the 'Authorization' header of API requests:`)}`,
  );
  console.log(
    [
      gray("{ "),
      white("Authorization"),
      gray(": "),
      green('"Bearer '),
      magenta("<token>"),
      green('"'),
      gray(" }"),
    ].join(""),
  );
  console.log("\n");

  // give them a sample curl
  const pingUrl = await getApiUrl("ping");
  console.log(`${gray("Here is a sample curl to get your started:")}`);
  console.log(
    white(
      // @ts-ignore: Deno has narrower types for fetch responses, but we know this code works atm.
      `curl --request GET --url ${pingUrl} --header 'Authorization: Bearer ${data.token}'`,
    ),
  );
  console.log("\n");

  // tip user on other commands
  const table = new Table({
    colWidths: [20, 30],
  });
  table.push(["View All Tokens", magenta("sf tokens list")]);
  table.push(["Delete a Token", magenta("sf tokens delete")]);

  console.log(`${gray("And other commands you can try:")}`);
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
  // @ts-ignore: Deno has narrower types for fetch responses, but we know this code works atm.
  const tokens = responseBody.data as Array<TokenObject>;

  // show empty table if no tokens
  if (tokens.length === 0) {
    const table = new Table({
      head: [cyan("Access Tokens")],
      colWidths: [50],
    });
    table.push([
      { colSpan: 1, content: "No access tokens found", hAlign: "center" },
    ]);
    console.log(`${table.toString()}\n`);

    // prompt user that they can generate one
    console.log(
      `${gray("Generate your first token with: ")}${
        magenta(
          `sf tokens create`,
        )
      }`,
    );

    process.exit(0);
  }

  // display table
  const tokensTable = new Table({
    head: [
      cyan("Token ID"),
      cyan("Name"),
      cyan("Expires"),
    ],
    colWidths: [40, 15, 25],
  });
  for (const token of tokens) {
    tokensTable.push([
      white(token.id),
      token.name ? token.name : gray("(empty)"),
      white(formatDate(new Date(token.expires_at))),
    ]);
  }
  console.log(tokensTable.toString());

  process.exit(0);
}

async function deleteTokenAction({
  id,
  yes,
}: {
  id: string;
  yes?: boolean;
}) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  if (yes) {
    await deleteTokenById(id);
    console.log(`${green("✓")} Token deleted successfully`);
    process.exit(0);
  }

  const deleteTokenConfirmed = await confirm({
    message: `Are you sure you want to delete this token? ${
      gray(
        "(it will stop working immediately.)",
      )
    }`,
    default: false,
  });
  if (!deleteTokenConfirmed) {
    process.exit(0);
  } else {
    const verySureConfirmed = await confirm({
      message: `${red("Very sure?")} ${
        gray(
          "(just double-checking)",
        )
      }`,
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

    const error = await response.json();
    // @ts-ignore: Deno has narrower types for fetch responses, but we know this code works atm.
    if (error.code === "token.not_found") {
      loadingSpinner.fail("Token not found");
      process.exit(1);
    }

    // TODO: handle more specific errors

    // generic catch-all
    loadingSpinner.fail("Failed to delete token");
    process.exit(1);
  }

  loadingSpinner.stop();
  console.log(gray("Token deleted. 🧼"));

  process.exit(0);
}
