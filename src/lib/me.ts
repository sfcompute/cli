import type { Command } from "@commander-js/extra-typings";
import * as console from "node:console";
import { isLoggedIn, loadConfig } from "../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";

export function registerMe(program: Command) {
  program.command("me").action(async () => {
    const accountId = await getLoggedInAccountId();
    console.log(accountId);

    // process.exit(0);
  });
}

export async function getLoggedInAccountId() {
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
