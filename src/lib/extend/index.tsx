import { type Command } from "@commander-js/extra-typings";
import dayjs from "npm:dayjs@1.11.13";
import duration from "npm:dayjs@1.11.13/plugin/duration.js";
import relativeTime from "npm:dayjs@1.11.13/plugin/relativeTime.js";
import boxen from "npm:boxen@8.0.1";
import console from "node:console";
import process from "node:process";
import ora from "ora";
import { getContractRange } from "../contracts/utils.ts";
import { apiClient } from "../../apiClient.ts";

dayjs.extend(relativeTime);
dayjs.extend(duration);

function _registerExtend(program: Command) {
  return program
    .command("extend")
    .description("Extend an existing contract")
    .requiredOption(
      "-c, --contract <contract>",
      "Contract ID to extend e.g. cont_a9IcKaLesUBTHEY",
    )
    .requiredOption(
      "-d, --duration <duration>",
      "Extension duration (rounded up to the nearest hour)",
    )
    .option(
      "-p, --price <price>",
      "Sets the maximize price per gpu/hr you're willing to pay. If the market rate is lower, then you'll pay the market rate",
    )
    .option("-y, --yes", "Automatically confirm the extension")
    .option(
      "-q, --quote",
      "Get a price quote without placing an extension order",
    )
    .option(
      "--standing",
      "Places a standing order. Default behavior is to place an order that auto-cancels if it can't be filled immediately.",
    )
    .addHelpText(
      "before",
      `
${
        boxen(
          `\x1b[31m\x1b[97msf extend\x1b[31m is deprecated.\x1b[0m
  \x1b[31mTo create, extend, and release specific machines directly, use \x1b[97msf nodes\x1b[31m.\x1b[0m
  \x1b[31mTo "extend" a contract, use \x1b[97msf buy -colo <contract_id> -s <contract_end_time> -d <duration>\x1b[31m.\x1b[0m
  \x1b[31mHowever, contracts don't map to specific machines, so you can't choose which will persist.\x1b[0m
  \x1b[31mWe strongly recommend using \x1b[97msf nodes\x1b[31m instead.\x1b[0m`,
          {
            padding: 0.75,
            borderColor: "red",
          },
        )
      }
`,
    )
    .action(async function extendAction(options) {
      const spinner = ora().start(`Fetching contract ${options.contract}...`);
      const api = await apiClient();

      const { data: contract, response } = await api.GET("/v0/contracts/{id}", {
        params: {
          path: { id: options.contract },
        },
      });

      const fetchFailed = !response.ok || !contract;
      if (fetchFailed) {
        spinner.fail(
          `Failed to fetch contract ${options.contract}: ${response.statusText}`,
        );
      } else {
        spinner.clear();
      }

      const contractRange = contract?.shape &&
        getContractRange(contract?.shape);

      // Build the equivalent sf buy command
      let equivalentCommand = `sf buy -colo ${options.contract} -s ${
        contractRange?.endsAt?.toISOString?.() ?? "<contract_end_time>"
      } -d ${options.duration}`;

      if (options.price) {
        equivalentCommand += ` -p ${options.price}`;
      }
      if (options.yes) {
        equivalentCommand += ` -y`;
      }
      if (options.quote) {
        equivalentCommand += ` -q`;
      }
      if (options.standing) {
        equivalentCommand += ` --standing`;
      }

      console.error(boxen(
        `\x1b[31m\x1b[97msf extend\x1b[31m is deprecated.\x1b[0m
  \x1b[31mTo create, extend, and release specific machines directly, use \x1b[97msf nodes\x1b[31m.\x1b[0m
  \x1b[31mTo "extend" a contract, use: \x1b[97m${equivalentCommand}\x1b[31m.\x1b[0m
  \x1b[31mHowever, contracts don't map to specific machines, so you can't choose which will persist.\x1b[0m
  \x1b[31mWe strongly recommend using \x1b[97msf nodes\x1b[31m instead.\x1b[0m`,
        {
          padding: 0.75,
          borderColor: "red",
        },
      ));

      if (fetchFailed) {
        process.exit(1);
      }
      process.exit(0);
    });
}

export function registerExtend(program: Command) {
  _registerExtend(program);
}
