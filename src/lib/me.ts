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

export async function getLoggedInAccountId(tokenOverride?: string) {
  let token = tokenOverride;

  if (!token) {
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      logLoginMessageAndQuit();
    }
    const config = await loadConfig();
    token = config.auth_token;
  }

  const response = await fetch(await getApiUrl("me"), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      logSessionTokenExpiredAndQuit();
    }

    if (response.status === 403) {
      logAndQuit(
        "Your SF Compute account is still under review. You cannot use the CLI until your account is approved.\n\nIf you have any questions you can reach out to onboarding@sfcompute.com",
      );
    }

    logAndQuit("Failed to fetch account info");
  }

  const data = await response.json();

  // @ts-ignore: Deno has narrower types for fetch responses, but we know this code works atm.
  return data.id;
}
