import chalk from "chalk";
import Table from "cli-table3";
import type { Command } from "commander";
import { apiClient } from "../apiClient";
import { isLoggedIn } from "../helpers/config";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors";
import type { Centicents } from "../helpers/units";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function registerBalance(program: Command) {
  program
    .command("balance")
    .description("Get account balance")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      const {
        available: { whole: availableWhole, centicents: availableCenticents },
        reserved: { whole: reservedWhole, centicents: reservedCenticents },
      } = await getBalance();

      if (options.json) {
        const jsonOutput = {
          available: {
            whole: availableWhole,
            centicents: availableCenticents,
          },
          reserved: {
            whole: reservedWhole,
            centicents: reservedCenticents,
          },
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
      } else {
        const formattedAvailable = usdFormatter.format(availableWhole);
        const formattedReserved = usdFormatter.format(reservedWhole);

        const table = new Table({
          head: [
            chalk.gray("Type"),
            chalk.gray("Amount"),
            chalk.gray("Centicents (1/100th of a cent)"),
          ],
          colWidths: [15, 15, 35],
        });

        table.push(
          [
            "Available",
            chalk.green(formattedAvailable),
            chalk.green(availableCenticents.toLocaleString()),
          ],
          [
            "Reserved",
            chalk.gray(formattedReserved),
            chalk.gray(reservedCenticents.toLocaleString()),
          ],
        );

        console.log(table.toString() + "\n");
      }

      process.exit(0);
    });
}

export type BalanceUsdCenticents = {
  available: { centicents: Centicents; whole: number };
  reserved: { centicents: Centicents; whole: number };
};
async function getBalance(): Promise<BalanceUsdCenticents> {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();

    return {
      available: { centicents: 0, whole: 0 },
      reserved: { centicents: 0, whole: 0 },
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
      `Failed to get balance: Unexpected response from server: ${response}`,
    );
  }

  let available: number;
  switch (data.available.currency) {
    case "usd":
      available = data.available.amount / 10_000;
      break;
    default:
      logAndQuit(`Unsupported currency: ${data.available.currency}`);
  }

  let reserved: number;
  switch (data.reserved.currency) {
    case "usd":
      reserved = data.reserved.amount / 10_000;
      break;
    default:
      logAndQuit(`Unsupported currency: ${data.reserved.currency}`);
  }

  return {
    available: {
      centicents: available,
      whole: available / 10_000,
    },
    reserved: {
      centicents: reserved,
      whole: reserved / 10_000,
    },
  };
}
