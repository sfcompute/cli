import type { Command } from "commander";
import { exec } from "node:child_process";
import ora from "ora";
import { saveConfig } from "../helpers/config.ts";
import { clearScreen } from "../helpers/prompt.ts";
import { getWebAppUrl } from "../helpers/urls.ts";

// We're using Axios here because there's a bug
// where the fetch API in Bun isn't passing the body
// through redirects correctly
import axios from "axios";

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
          await saveConfig({ auth_token: session.token });
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
    const response = await axios.post(
      url,
      { validation },
      {
        headers: {
          "Content-Type": "application/json",
        },
        maxRedirects: 5,
      },
    );

    return response.data as {
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
    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    return response.data as {
      validation?: string;
      token?: string;
    };
  } catch (error) {
    console.error("Error getting session:", error);
    process.exit(1);
  }
}

function generateValidationString() {
  const getRandomNumber = () => Math.floor(Math.random() * 100);
  return `${getRandomNumber()} ${getRandomNumber()} ${getRandomNumber()}`;
}
