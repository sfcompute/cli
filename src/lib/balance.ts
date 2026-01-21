import * as console from "node:console";
import type { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import Table from "cli-table3";
import { apiClient } from "../apiClient.ts";
import { isLoggedIn } from "../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";

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
      const loggedIn = await isLoggedIn();
      if (!loggedIn) {
        logLoginMessageAndQuit();
      }
      const client = await apiClient();

      const { data, response } = await client.GET("/v1/balances");

      if (!response.ok) {
        switch (response.status) {
          case 401:
            return await logSessionTokenExpiredAndQuit();
          default:
            return logAndQuit(`Failed to get balance: ${response.statusText}`);
        }
      }

      if (!data) {
        return logAndQuit(
          `Failed to get balance: Unexpected response from server: ${response}`,
        );
      }

      const { available_balance_cents, current_balance_cents } = data;

      const availableWhole = available_balance_cents / 100;
      const availableCents = available_balance_cents;
      const balanceWhole = current_balance_cents / 100;
      const balanceCents = current_balance_cents;

      if (options.json) {
        const jsonOutput = {
          available: {
            whole: availableWhole,
            cents: availableCents,
          },
          balance: {
            whole: balanceWhole,
            cents: balanceCents,
          },
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
      } else {
        const formattedAvailable = usdFormatter.format(availableWhole);
        const formattedBalance = usdFormatter.format(balanceWhole);

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
            "Balance",
            chalk.gray(formattedBalance),
            chalk.gray(balanceCents.toLocaleString()),
          ],
        );

        console.log(`${table.toString()}\n`);
      }
    });
}
