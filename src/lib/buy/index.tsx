import type { Command } from "commander";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { apiClient } from "../../apiClient";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors";
import { roundStartDate } from "../../helpers/units";

dayjs.extend(relativeTime);
dayjs.extend(duration);

interface SfBuyOptions {
  type: string;
  accelerators?: string;
  duration: string;
  price: string;
  start?: string;
  yes?: boolean;
  quote?: boolean;
  colocate?: Array<string>;
}

export function registerBuy(program: Command) {
  program
    .command("buy")
    .description("Place a buy order")
    .requiredOption("-t, --type <type>", "Specify the type of node", "h100i")
    .option("-n, --accelerators <quantity>", "Specify the number of GPUs", "8")
    .requiredOption("-d, --duration <duration>", "Specify the duration", "1h")
    .option("-p, --price <price>", "The price in dollars, per GPU hour")
    .option(
      "-s, --start <start>",
      "Specify the start date. Can be a date, relative time like '+1d', or the string 'NOW'",
    )
    .option("-y, --yes", "Automatically confirm the order")
    .option(
      "-colo, --colocate <contracts_to_colocate_with>",
      "Colocate with existing contracts",
      (value) => value.split(","),
      [],
    )
    .option("--quote", "Only provide a quote for the order")
    .action(buyOrderAction);
}

function buyOrderAction(options: SfBuyOptions) { }

type BuyOptions = {
  instanceType: string;
  priceCents: number;
  quantity: number;
  startsAt: Date | "NOW";
  endsAt: Date;
  durationSeconds: number;
  quoteOnly: boolean;
  colocate_with: Array<string>;
};
export async function placeBuyOrder(
  options: Omit<BuyOptions, "durationSeconds">,
) {
  const api = await apiClient();
  const { data, error, response } = await api.POST("/v0/orders", {
    body: {
      side: "buy",
      instance_type: options.instanceType,
      quantity: options.quantity,
      // round start date again because the user might take a long time to confirm
      start_at:
        options.startsAt === "NOW"
          ? "NOW"
          : roundStartDate(options.startsAt).toISOString(),
      end_at: options.endsAt.toISOString(),
      price: options.priceCents,
      colocate_with: options.colocate_with,
    },
  });

  if (!response.ok) {
    switch (response.status) {
      case 400:
        return logAndQuit(`Bad Request: ${error?.message}`);
      case 401:
        return await logSessionTokenExpiredAndQuit();
      case 500:
        return logAndQuit(`Failed to place order: ${error?.message}`);
      default:
        return logAndQuit(`Failed to place order: ${response.statusText}`);
    }
  }

  if (!data) {
    return logAndQuit(
      `Failed to place order: Unexpected response from server: ${response}`,
    );
  }

  return data;
}

type QuoteOptions = {
  instanceType: string;
  quantity: number;
  startsAt: Date | "NOW";
  durationSeconds: number;
};
export async function getQuote(options: QuoteOptions) {
  const api = await apiClient();

  const { data, error, response } = await api.GET("/v0/quote", {
    params: {
      query: {
        side: "buy",
        instance_type: options.instanceType,
        quantity: options.quantity,
        duration: options.durationSeconds,
        min_start_date:
          options.startsAt === "NOW" ? "NOW" : options.startsAt.toISOString(),
        max_start_date:
          options.startsAt === "NOW" ? "NOW" : options.startsAt.toISOString(),
      },
    },
  });

  if (!response.ok) {
    switch (response.status) {
      case 400:
        console.log("Error:", error);
        return logAndQuit(`Bad Request: ${error?.message}`);
      case 401:
        return await logSessionTokenExpiredAndQuit();
      case 500:
        return logAndQuit(`Failed to get quote: ${error?.code}`);
      default:
        return logAndQuit(`Failed to get quote: ${response.statusText}`);
    }
  }

  if (!data) {
    return logAndQuit(
      `Failed to get quote: Unexpected response from server: ${response}`,
    );
  }

  return data.quote;
}

export async function getOrder(orderId: string) {
  const api = await apiClient();

  const { data: order } = await api.GET("/v0/orders/{id}", {
    params: { path: { id: orderId } },
  });
  return order;
}

export async function getMostRecentIndexAvgPrice(instanceType: string) {
  const api = await apiClient();

  const { data } = await api.GET("/v0/prices", {
    params: {
      query: {
        instance_type: instanceType,
      },
    },
  });

  if (!data) {
    return logAndQuit("Failed to get prices: Unexpected response from server");
  }

  data.data.sort((a, b) => {
    return dayjs(b.period_start).diff(dayjs(a.period_start));
  });

  return data.data[0].gpu_hour;
}

export async function getAggressivePricePerHour(instanceType: string) {
  const mostRecentPrice = await getMostRecentIndexAvgPrice(instanceType);
  // We'll set a floor on the recommended price here, because the index price
  // will report 0 if there was no data, which might happen due to an outage.
  const minimumPrice = 75; // 75 cents

  if (!mostRecentPrice) {
    return minimumPrice;
  }

  const recommendedIndexPrice = (mostRecentPrice.avg + mostRecentPrice.max) / 2;
  if (recommendedIndexPrice < minimumPrice) {
    return minimumPrice;
  }

  return recommendedIndexPrice;
}
