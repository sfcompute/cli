import chalk from "chalk";
import Table from "cli-table3";
import type { Command } from "commander";
import { apiClient } from "../apiClient.ts";
import { isLoggedIn } from "../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import type { Cents } from "../helpers/units.ts";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function registerBalance(program: Command) {
  program
    .command("balance")
    .description("Get account balance")
    .option("--json", "Output in JSON format")
    .action(async options => {
      const {
        available: { whole: availableWhole, cents: availableCents },
        reserved: { whole: reservedWhole, cents: reservedCents },
      } = await getBalance();

      if (options.json) {
        const jsonOutput = {
          available: {
            whole: availableWhole,
            cents: availableCents,
          },
          reserved: {
            whole: reservedWhole,
            cents: reservedCents,
          },
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
      } else {
        const formattedAvailable = usdFormatter.format(availableWhole);
        const formattedReserved = usdFormatter.format(reservedWhole);

        const table = new Table({
          head: [chalk.gray("Type"), chalk.gray("Amount"), chalk.gray("Cents")],
          colWidths: [15, 15, 35],
        });

        table.push(
          [
            "Available",
            chalk.green(formattedAvailable),
            chalk.green(availableCents.toLocaleString()),
          ],
          [
            "Reserved",
            chalk.gray(formattedReserved),
            chalk.gray(reservedCents.toLocaleString()),
          ]
        );

        console.log(table.toString() + "\n");
      }

      process.exit(0);
    });
}

export type BalanceUsdCents = {
  available: { cents: Cents; whole: number };
  reserved: { cents: Cents; whole: number };
};
export async function getBalance(): Promise<BalanceUsdCents> {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();

    return {
      available: { cents: 0, whole: 0 },
      reserved: { cents: 0, whole: 0 },
    };
  }
  const client = await apiClient();

  const { data, error, response } = await client.GET("/v0/balance");

  if (!response.ok) {
    switch (response.status) {
      case 401:
        return await logSessionTokenExpiredAndQuit();
      case 500:
        return logAndQuit(`Failed to get balance: ${error?.message}`);
      default:
        return logAndQuit(`Failed to get balance: ${response.statusText}`);
    }
  }

  if (!data) {
    return logAndQuit(
      `Failed to get balance: Unexpected response from server: ${response}`
    );
  }

  let available: number;
  switch (data.available.currency) {
    case "usd":
      available = data.available.amount;
      break;
    default:
      logAndQuit(`Unsupported currency: ${data.available.currency}`);
  }

  let reserved: number;
  switch (data.reserved.currency) {
    case "usd":
      reserved = data.reserved.amount;
      break;
    default:
      logAndQuit(`Unsupported currency: ${data.reserved.currency}`);
  }

  return {
    available: {
      cents: available,
      whole: available / 100,
    },
    reserved: {
      cents: reserved,
      whole: reserved / 100,
    },
  };
}
