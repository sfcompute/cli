import * as chrono from "chrono-node";
import type { Command } from "commander";
import dayjs from "dayjs";
import parseDuration from "parse-duration";
import { apiClient } from "../apiClient.ts";
import { isLoggedIn } from "../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { getContract } from "../helpers/fetchers.ts";
import { pricePerGPUHourToTotalPriceCents } from "../helpers/price.ts";
import {
  priceWholeToCents,
  roundEndDate,
  roundStartDate,
} from "../helpers/units.ts";
import { waitForOrderToNotBePending } from "../helpers/waitingForOrder.ts";
import { GPUS_PER_NODE } from "./constants.ts";
import type { PlaceSellOrderParameters } from "./orders/types.ts";

export function registerSell(program: Command) {
  program
    .command("sell")
    .description("Place a sell order")
    .requiredOption("-p, --price <price>", "The price in dollars, per GPU hour")
    .requiredOption("-c, --contract-id <id>", "Specify the contract ID")
    .option("-n, --accelerators <quantity>", "Specify the number of GPUs", "8")
    .option("-s, --start <start>", "Specify the start time (ISO 8601 format)")
    .option("-d, --duration <duration>", "Specify the duration, like '1h'")
    .option(
      "-f, --flags <flags>",
      "Specify additional flags as JSON",
      JSON.parse,
    )
    .action(async (options) => {
      await placeSellOrder(options);
    });
}

function forceAsNumber(value: string | number): number {
  if (typeof value === "number") {
    return value;
  }
  return Number.parseFloat(value);
}

function contractStartAndEnd(contract: {
  shape: {
    intervals: string[]; // date strings
    quantities: number[];
  };
}) {
  const startDate = dayjs(contract.shape.intervals[0]).toDate();
  const endDate = dayjs(
    contract.shape.intervals[contract.shape.intervals.length - 1],
  ).toDate();

  return { startDate, endDate };
}

async function placeSellOrder(options: {
  price: number;
  contractId: string;
  accelerators: number;
  start?: string;
  duration?: string;
}) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    return logLoginMessageAndQuit();
  }

  const { cents: priceCents, invalid } = priceWholeToCents(options.price);
  if (invalid || !priceCents) {
    return logAndQuit(`Invalid price: ${options.price}`);
  }

  const contract = await getContract(options.contractId);
  if (!contract) {
    return logAndQuit(`Contract ${options.contractId} not found`);
  }

  if (contract?.status === "pending") {
    return logAndQuit(
      `Contract ${options.contractId} is currently pending. Please try again in a few seconds.`,
    );
  }

  if (options.accelerators % GPUS_PER_NODE !== 0) {
    const exampleCommand =
      `sf sell -n ${GPUS_PER_NODE} -c ${options.contractId}`;
    return logAndQuit(
      `At the moment, only entire-nodes are available, so you must have a multiple of ${GPUS_PER_NODE} GPUs. Example command:\n\n${exampleCommand}`,
    );
  }

  const { startDate: contractStartDate, endDate: contractEndDate } =
    contractStartAndEnd({
      shape: {
        intervals: contract.shape.intervals,
        quantities: contract.shape.quantities,
      },
    });

  let startDate = options.start
    ? chrono.parseDate(options.start)
    : contractStartDate;
  if (!startDate) {
    return logAndQuit("Invalid start date");
  }

  startDate = roundStartDate(startDate);

  let endDate = contractEndDate;
  if (options.duration) {
    const durationSecs = parseDuration(options.duration, "s");
    if (!durationSecs) {
      return logAndQuit("Invalid duration");
    }
    endDate = dayjs(startDate).add(durationSecs, "s").toDate();
  }

  endDate = roundEndDate(endDate);
  // if the end date is longer than the contract, use the contract end date
  if (endDate > contractEndDate) {
    endDate = roundEndDate(contractEndDate);
  }
  const totalDurationSecs = dayjs(endDate).diff(startDate, "s");
  const nodes = Math.ceil(options.accelerators / GPUS_PER_NODE);

  const totalPrice = pricePerGPUHourToTotalPriceCents(
    priceCents,
    totalDurationSecs,
    nodes,
    GPUS_PER_NODE,
  );

  const params: PlaceSellOrderParameters = {
    side: "sell",
    quantity: forceAsNumber(options.accelerators) / GPUS_PER_NODE,
    price: totalPrice,
    contract_id: options.contractId,
    start_at: startDate.toISOString(),
    end_at: endDate.toISOString(),
  };

  const api = await apiClient();
  const { data, error, response } = await api.POST("/v0/orders", {
    body: params,
  });

  if (!response.ok) {
    switch (response.status) {
      case 400:
        return logAndQuit(
          `Bad Request: ${error?.message}: ${
            JSON.stringify(
              error?.details,
              null,
              2,
            )
          }`,
        );
      // return logAndQuit(`Bad Request: ${error?.message}`);
      case 401:
        return await logSessionTokenExpiredAndQuit();
      default:
        return logAndQuit(`Failed to place sell order: ${response.statusText}`);
    }
  }

  if (!data?.id) {
    return logAndQuit("Order ID not found");
  }

  await waitForOrderToNotBePending(data.id);
  // process.exit(0);
}
