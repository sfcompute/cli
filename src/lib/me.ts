import type { Command } from "@commander-js/extra-typings";
import * as console from "node:console";
import { isLoggedIn, loadConfig } from "../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";
import { apiClient } from "../apiClient.ts";

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

  const client = await apiClient(token);

  const { data, response } = await client.GET("/v0/me", {});

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

  if (!data) {
    logAndQuit("Failed to fetch account info");
  }

  return data.id;
}
