import type { Command } from "@commander-js/extra-typings";
import Table from "cli-table3";
import * as console from "node:console";
import { gray, green } from "jsr:@std/fmt/colors";
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

      const {
        available,
        reserved,
      } = data;

      const availableWhole = available / 100;
      const availableCents = available;
      const reservedWhole = reserved / 100;
      const reservedCents = reserved;

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
          head: [gray("Type"), gray("Amount"), gray("Cents")],
          colWidths: [15, 15, 35],
        });

        table.push(
          [
            "Available",
            green(formattedAvailable),
            green(availableCents.toLocaleString()),
          ],
          [
            "Reserved",
            gray(formattedReserved),
            gray(reservedCents.toLocaleString()),
          ],
        );

        console.log(`${table.toString()}\n`);
      }
    });
}
