import chalk from "chalk";
import Table from "cli-table3";
import type { Command } from "commander";
import { loadConfig } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import type { Centicents } from "../helpers/units";
import { getApiUrl } from "../helpers/urls";

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

async function getBalance(): Promise<{
  available: { centicents: Centicents; whole: number };
  reserved: { centicents: Centicents; whole: number };
}> {
  const config = await loadConfig();
  if (!config.auth_token) {
    logLoginMessageAndQuit();
    return {
      available: { centicents: 0, whole: 0 },
      reserved: { centicents: 0, whole: 0 },
    };
  }

  const response = await fetch(await getApiUrl("balance_get"), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.auth_token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      logLoginMessageAndQuit();
      return {
        available: { centicents: 0, whole: 0 },
        reserved: { centicents: 0, whole: 0 },
      };
    }

    logAndQuit(`Failed to fetch balance: ${response.statusText}`);
    return {
      available: { centicents: 0, whole: 0 },
      reserved: { centicents: 0, whole: 0 },
    };
  }

  const data = await response.json();

  return {
    available: {
      centicents: data.available.amount,
      whole: data.available.amount / 10_000,
    },
    reserved: {
      centicents: data.reserved.amount,
      whole: data.reserved.amount / 10_000,
    },
  };
}
