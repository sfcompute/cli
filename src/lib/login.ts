import type { Command } from "@commander-js/extra-typings";
import { exec } from "node:child_process";
import * as console from "node:console";
import process from "node:process";
import { setTimeout } from "node:timers";
import ora from "ora";
import { saveConfig } from "../helpers/config.ts";
import { clearScreen } from "../helpers/prompt.ts";
import { getWebAppUrl } from "../helpers/urls.ts";
import { clearFeatureFlags } from "../helpers/feature-flags.ts";
import { getLoggedInAccountId } from "./me.ts";
import { randomInt } from "node:crypto";

export function registerLogin(program: Command) {
  program
    .command("login")
    .description("Login to the San Francisco Compute")
    .action(async () => {
      const spinner = ora("Logging in...\n").start();

      const validation = generateValidationString();
      const result = await createSession({ validation });
      if (!result) {
        console.error("Failed to login");
        process.exit(1);
      }
      const { url } = result;
      exec(`open ${url}`); // if this fails, that's okay

      clearScreen();
      console.log(`\n\n  Click here to login:\n  ${url}\n\n`);
      console.log(
        `  Do these numbers match your browser window?\n  ${validation}\n\n`,
      );

      const checkSession = async () => {
        const session = await getSession({ token: result.token });
        if (session?.token) {
          let accountId: undefined | string;

          try {
            accountId = await getLoggedInAccountId(session.token);
          } catch {
            // No-op
          }
          await saveConfig({
            auth_token: session.token,
            account_id: accountId,
          });
          await clearFeatureFlags();
          spinner.succeed("Logged in successfully");
          process.exit(0);
        } else {
          setTimeout(checkSession, 200);
        }
      };

      checkSession();
    });
}

async function createSession({ validation }: { validation: string }) {
  const url = await getWebAppUrl("cli_session_create");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ validation }),
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json() as {
      url: string;
      token: string;
    };
  } catch (error) {
    console.error("Error creating session:", error);
    return null;
  }
}

async function getSession({ token }: { token: string }) {
  try {
    const url = await getWebAppUrl("cli_session_get", { token });
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json() as {
      validation?: string;
      token?: string;
    };
  } catch (error) {
    console.error("Error getting session:", error);
    process.exit(1);
  }
}

function generateValidationString() {
  const getRandomNumber = () => randomInt(0, 100);
  return `${getRandomNumber()} ${getRandomNumber()} ${getRandomNumber()}`;
}
