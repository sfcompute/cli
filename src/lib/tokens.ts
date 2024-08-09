import type { Command } from "commander";
import { isLoggedIn } from "../helpers/config";
import { logLoginMessageAndQuit } from "../helpers/errors";

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

  // const response = await fetch(await getApiUrl("tokens_create"), {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${config.auth_token}`,
  //   },
  // });

  console.log("Creating token...");
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
