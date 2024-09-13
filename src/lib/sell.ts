import * as chrono from "chrono-node";
import type { Command } from "commander";
import dayjs from "dayjs";
import parseDuration from "parse-duration";
import { apiClient } from "../apiClient";
import { isLoggedIn } from "../helpers/config";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors";
import {
  priceWholeToCenticents,
  roundEndDate,
  roundStartDate,
} from "../helpers/units";
import type { PlaceSellOrderParameters } from "./orders";
import { GPUS_PER_NODE } from "./constants";
import { pricePerGPUHourToTotalPrice } from "../helpers/price";
import ora from "ora";

export function registerSell(program: Command) {
  program
    .command("sell")
    .description("Place a sell order")
    .requiredOption("-p, --price <price>", "The price in dollars, per GPU hour")
    .requiredOption("-c, --contract-id <id>", "Specify the contract ID")
    .option("-n, --accelerators <quantity>", "Specify the number of GPUs", "8")
    .option(
      "-s, --start <start>",
      "Specify the start time (ISO 8601 format)",
    )
    .option(
      "-d, --duration <duration>",
      "Specify the duration in seconds",
    )
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

async function getContract(contractId: string) {
  const api = await apiClient();
  const { data, response } = await api.GET("/v0/contracts/{id}", {
    params: {
      path: { id: contractId },
    },
  });
  if (!response.ok) {
    return logAndQuit(`Failed to get contract: ${response.statusText}`);
  }
  return data;
}

function contractStartAndEnd(contract: {
  shape: {
    intervals: string[] // date strings
    quantities: number[]
  }
}) {
  const startDate = dayjs(contract.shape.intervals[0]).toDate();
  const endDate = dayjs(contract.shape.intervals[contract.shape.intervals.length - 1]).toDate();

  return { startDate, endDate };
}

async function getOrder(orderId: string) {
  const api = await apiClient();
  const { data, response, error } = await api.GET("/v0/orders/{id}", {
    params: {
      path: { id: orderId },
    },
  });
  if (!response.ok) {
    // @ts-ignore
    if (error?.code === "order.not_found") {
      return null;
    }
    return logAndQuit(`Failed to get order: ${response.statusText}`);
  }
  return data;
}

async function waitForOrderToNotBePending(orderId: string) {
  const spinner = ora(`Order ${orderId} - pending`).start();
  const maxTries = 10;
  for (let i = 0; i < maxTries; i++) {
    const order = await getOrder(orderId);

    if (order && order?.status !== "pending") {
      spinner.text = `Order ${orderId} - ${order?.status}`;
      spinner.succeed();
      return order;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  spinner.fail();
  return logAndQuit(`Order ${orderId} - possibly failed`);
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

  const { centicents: priceCenticents, invalid } = priceWholeToCenticents(
    options.price,
  );
  if (invalid || !priceCenticents) {
    return logAndQuit(`Invalid price: ${options.price}`);
  }

  const contract = await getContract(options.contractId);
  if (!contract) {
    return logAndQuit(`Contract ${options.contractId} not found`);
  }

  if (contract?.status === "pending") {
    return logAndQuit(`Contract ${options.contractId} is currently pending. Please try again in a few seconds.`);
  }

  const { startDate: contractStartDate, endDate: contractEndDate } = contractStartAndEnd({
    shape: {
      intervals: contract.shape.intervals,
      quantities: contract.shape.quantities,
    }
  });

  let startDate = options.start ? chrono.parseDate(options.start) : contractStartDate;
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
    endDate = contractEndDate;
  }
  const totalDurationSecs = dayjs(endDate).diff(startDate, "s");

  const totalPrice = pricePerGPUHourToTotalPrice(priceCenticents, totalDurationSecs, options.accelerators, GPUS_PER_NODE);

  const params: PlaceSellOrderParameters = {
    side: "sell",
    quantity: forceAsNumber(options.accelerators) * GPUS_PER_NODE,
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
          `Bad Request: ${error?.message}: ${JSON.stringify(error?.details, null, 2)}`,
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
  process.exit(0);
}
