import { type Command } from "@commander-js/extra-typings";
import { render } from "ink";
import dayjs from "npm:dayjs@1.11.13";
import duration from "npm:dayjs@1.11.13/plugin/duration.js";
import relativeTime from "npm:dayjs@1.11.13/plugin/relativeTime.js";
import { parseDuration, SfBuyOptions } from "../buy/index.tsx";
import React from "react";
import { getContract } from "../../helpers/fetchers.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { QuoteAndBuy, QuoteComponent } from "../buy/index.tsx";
import { ActiveContract } from "../contracts/types.ts";
import { GPUS_PER_NODE } from "../constants.ts";
import {
  getContractAcceleratorQuantity,
  getContractRange,
} from "../contracts/utils.ts";

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
      parseDuration,
    )
    .option("-p, --price <price>", "Price in dollars per GPU hour")
    .option("-y, --yes", "Automatically confirm the extension")
    .option(
      "-q, --quote",
      "Get a price quote without placing an extension order",
    )
    .option(
      "--standing",
      "Places a standing order. Default behavior is to place an order that auto-cancels if it can't be filled immediately.",
    )
    .configureHelp({
      optionDescription: (option) => {
        if (option.flags === "-h, --help") {
          return "Display help for extend";
        }
        return option.description;
      },
    })
    .addHelpText(
      "after",
      `
Examples:
  \x1b[2m# Get a Quote to extend a contract for 1 hour\x1b[0m
  $ sf extend --contract <contract_id> --duration 1h --quote

  \x1b[2m# Auto confirm extending a contract by 1 hour at market price\x1b[0m
  $ sf extend -c <contract_id> -d 1h --yes

  \x1b[2m# Extend a contract for 2 hours at a specific price\x1b[0m
  $ sf extend -c <contract_id> -d 2h --price 1.50
`,
    )
    .action(async function extendAction(options) {
      const contract = await getContract(options.contract);
      if (!contract) {
        logAndQuit(`Contract ${options.contract} not found`);
      }

      if (contract.status !== "active") {
        logAndQuit(
          `Contract ${contract.id} is ${contract.status}. Only active contracts can be extended.`,
        );
      }

      const activeContract = contract as ActiveContract;
      const activeContractRange = getContractRange(activeContract.shape);

      const quoteOptions: SfBuyOptions = {
        type: activeContract.instance_type,
        accelerators: getContractAcceleratorQuantity(activeContract.shape) *
          GPUS_PER_NODE,
        colocate: [activeContract.id],
        duration: options.duration,
        price: options.price,
        start: activeContractRange.endsAt,
        quote: options.quote,
        yes: options.yes,
        standing: options.standing,
      };

      if (options.quote) {
        render(<QuoteComponent options={quoteOptions} />);
      } else {
        render(<QuoteAndBuy options={quoteOptions} />);
      }
    });
}

export function registerExtend(program: Command) {
  _registerExtend(program);
}
