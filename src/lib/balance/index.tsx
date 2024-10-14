import type { Command } from "commander";
import { isLoggedIn } from "../../config";
import { logLoginMessageAndQuit } from "../../helpers/errors";
import { renderCommand } from "../../ui/render";
import SFBalance from "./SFBalance";

interface BalanceOptions {
  json?: boolean;
}

export function registerBalance(program: Command) {
  program
    .command("balance")
    .description("Get a breakdown of your account’s balance.")
    .option("--json", "Output in JSON format")
    .action(async (options: BalanceOptions) => {
      // check auth
      const loggedIn = await isLoggedIn();
      if (!loggedIn) {
        logLoginMessageAndQuit();
      }

      renderCommand(<SFBalance json={options.json} />);
      // const {
      //   available: { whole: availableWhole, cents: availableCents },
      //   reserved: { whole: reservedWhole, cents: reservedCents },
      // } = await getBalance();

      // if (options.json) {
      //   const jsonOutput = {
      //     available: {
      //       whole: availableWhole,
      //       cents: availableCents,
      //     },
      //     reserved: {
      //       whole: reservedWhole,
      //       cents: reservedCents,
      //     },
      //   };
      //   console.log(JSON.stringify(jsonOutput, null, 2));
      // } else {
      //   const formattedAvailable = usdFormatter.format(availableWhole);
      //   const formattedReserved = usdFormatter.format(reservedWhole);

      //   const table = new Table({
      //     head: [chalk.gray("Type"), chalk.gray("Amount"), chalk.gray("Cents")],
      //     colWidths: [15, 15, 35],
      //   });

      //   table.push(
      //     [
      //       "Available",
      //       chalk.green(formattedAvailable),
      //       chalk.green(availableCents.toLocaleString()),
      //     ],
      //     [
      //       "Reserved",
      //       chalk.gray(formattedReserved),
      //       chalk.gray(reservedCents.toLocaleString()),
      //     ],
      //   );

      //   console.log(table.toString() + "\n");
      // }
    });
}
