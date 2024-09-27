import { confirm } from "@inquirer/prompts";
import c from "chalk";
import * as chrono from "chrono-node";
import type { Command } from "commander";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import parseDuration from "parse-duration";
import { apiClient } from "../apiClient";
import { isLoggedIn } from "../helpers/config";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors";
import {
  pricePerGPUHourToTotalPriceCents,
  totalPriceToPricePerGPUHour,
} from "../helpers/price";
import {
  type Cents,
  centsToDollarsFormatted,
  priceWholeToCents,
  roundEndDate,
  roundStartDate,
} from "../helpers/units";
import { waitForOrderToNotBePending } from "../helpers/waitingForOrder";
import type { Nullable } from "../types/empty";
import { GPUS_PER_NODE } from "./constants";
import { formatDuration } from "./orders";

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
}

export function registerBuy(program: Command) {
  program
    .command("buy")
    .description("Place a buy order")
    .requiredOption("-t, --type <type>", "Specify the type of node", "h100i")
    .option("-n, --accelerators <quantity>", "Specify the number of GPUs", "8")
    .requiredOption("-d, --duration <duration>", "Specify the duration", "1h")
    .option("-p, --price <price>", "The price in dollars, per GPU hour")
    .option("-s, --start <start>", "Specify the start date")
    .option("-y, --yes", "Automatically confirm the order")
    .option("--quote", "Only provide a quote for the order")
    .action(buyOrderAction);
}

async function buyOrderAction(options: SfBuyOptions) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    return logLoginMessageAndQuit();
  }

  // normalize inputs

  const isQuoteOnly = options.quote ?? false;

  // parse duration
  let durationSeconds = parseDuration(options.duration, "s");
  if (!durationSeconds) {
    return logAndQuit(`Invalid duration: ${options.duration}`);
  }

  // default to 1 node if not specified
  const accelerators = options.accelerators ? Number(options.accelerators) : 1;

  if (accelerators % GPUS_PER_NODE !== 0) {
    const exampleCommand = `sf buy -n ${GPUS_PER_NODE} -d "${options.duration}"`;
    return logAndQuit(
      `At the moment, only entire-nodes are available, so you must have a multiple of ${GPUS_PER_NODE} GPUs. Example command:\n\n${exampleCommand}`,
    );
  }
  const quantity = Math.ceil(accelerators / GPUS_PER_NODE);

  // parse price
  let priceCents: Nullable<Cents> = null;
  if (options.price) {
    const { cents: priceCentsParsed, invalid: priceInputInvalid } =
      priceWholeToCents(options.price);
    if (priceInputInvalid) {
      return logAndQuit(`Invalid price: ${options.price}`);
    }
    priceCents = priceCentsParsed;
  }

  // Convert the price to the total price of the contract
  // (price per gpu hour * gpus per node * quantity * duration in hours)
  if (priceCents) {
    priceCents = pricePerGPUHourToTotalPriceCents(
      priceCents,
      durationSeconds,
      quantity,
      GPUS_PER_NODE,
    );
  }

  const yesFlagOmitted = options.yes === undefined || options.yes === null;
  const confirmWithUser = yesFlagOmitted || !options.yes;

  // parse starts at
  let startDate = options.start ? chrono.parseDate(options.start) : new Date();
  if (!startDate) {
    return logAndQuit("Invalid start date");
  }

  if (options.quote) {
    const quote = await getQuote({
      instanceType: options.type,
      quantity: quantity,
      startsAt: startDate,
      durationSeconds,
    });

    if (!quote) {
      return logAndQuit("Not enough data exists to quote this order.");
    }

    const priceLabelUsd = c.green(centsToDollarsFormatted(quote.price));
    const priceLabelPerGPUHour = c.green(
      centsToDollarsFormatted(
        totalPriceToPricePerGPUHour(
          quote.price,
          durationSeconds,
          quantity,
          GPUS_PER_NODE,
        ),
      ),
    );

    console.log(
      `This order is projected to cost ${priceLabelUsd} total or ${priceLabelPerGPUHour} per GPU hour`,
    );
  } else {
    // quote if no price was provided
    if (!priceCents) {
      const quote = await getQuote({
        instanceType: options.type,
        quantity: quantity,
        startsAt: startDate,
        durationSeconds,
      });

      if (!quote) {
        const durationInHours = durationSeconds / 3600;

        console.log(`No one is selling this right now. To ask someone to sell it to you, add a price you're willing to pay. For example:

    sf buy -d "${durationInHours}h" -n ${quantity * GPUS_PER_NODE} -p "2.50" 
          `);

        return process.exit(1);
      }

      priceCents = quote.price;
      durationSeconds = quote.duration;
      startDate = new Date(quote.start_at);
    }

    if (!durationSeconds) {
      throw new Error("unexpectly no duration provided");
    }
    if (!priceCents) {
      throw new Error("unexpectly no price provided");
    }

    // round the start and end dates. If we came from a quote, they should already be rounded,
    // however, there may have been a delay between the quote and now, so we may need to move the start time up to the next minute
    startDate = roundStartDate(startDate);
    let endDate = dayjs(startDate).add(durationSeconds, "s").toDate();
    endDate = roundEndDate(endDate);

    if (confirmWithUser) {
      const confirmationMessage = confirmPlaceOrderMessage({
        instanceType: options.type,
        priceCents,
        quantity,
        startsAt: startDate,
        endsAt: endDate,
        confirmWithUser,
        quoteOnly: isQuoteOnly,
      });
      const confirmed = await confirm({
        message: confirmationMessage,
        default: false,
      });

      if (!confirmed) {
        logAndQuit("Order cancelled");
      }
    }
    console.log(priceCents);

    const res = await placeBuyOrder({
      instanceType: options.type,
      priceCents,
      quantity,
      // round start date again because the user might have taken a long time to confirm
      // most of the time this will do nothing, but when it does it will move the start date forwrd one minute
      startsAt: roundStartDate(startDate),
      endsAt: endDate,
      confirmWithUser,
      quoteOnly: isQuoteOnly,
    });

    const order = await waitForOrderToNotBePending(res.id);
    if (!order) {
      return;
    }

    if (order.status === "filled") {
      const now = new Date();
      const startAt = new Date(order.start_at);
      const timeDiff = startAt.getTime() - now.getTime();
      const oneMinuteInMs = 60 * 1000;

      if (now >= startAt || timeDiff <= oneMinuteInMs) {
        console.log(`Your nodes are currently spinning up. Once they're online, you can view them using:

  sf instances ls

`);
      } else {
        const contractStartTime = dayjs(startAt);
        const timeFromNow = contractStartTime.fromNow();
        console.log(`Your contract begins ${c.green(timeFromNow)}. You can view more details using:

  sf contracts ls

`);
      }
      return;
    }

    if (order.status === "open") {
      console.log(`Your order wasn't accepted yet. You can check it's status with:

        sf orders ls
  
      If you want to cancel the order, you can do so with:
  
        sf orders cancel ${order.id}
  
        `);
      return;
    }

    console.error(`Order likely did not execute. Check the status with:

      sf orders ls

    `);
  }
}

function confirmPlaceOrderMessage(options: BuyOptions) {
  if (!options.priceCents) {
    return "";
  }

  const totalNodesLabel = c.green(options.quantity);
  const instanceTypeLabel = c.green(options.instanceType);
  const nodesLabel = options.quantity > 1 ? "nodes" : "node";

  const durationHumanReadable = formatDuration(
    options.endsAt.getTime() - options.startsAt.getTime(),
  );
  const endsAtLabel = c.green(
    dayjs(options.endsAt).format("MM/DD/YYYY hh:mm A"),
  );
  const fromNowTime = dayjs(options.startsAt).fromNow();

  let timeDescription: string;
  if (
    fromNowTime === "a few seconds ago" ||
    fromNowTime === "in a few seconds"
  ) {
    timeDescription = `from ${c.green("now")} until ${endsAtLabel}`;
  } else {
    const startAtLabel = c.green(
      dayjs(options.startsAt).format("MM/DD/YYYY hh:mm A"),
    );
    timeDescription = `from ${startAtLabel} (${c.green(fromNowTime)}) until ${endsAtLabel}`;
  }

  const durationInSeconds = Math.ceil(
    (options.endsAt.getTime() - options.startsAt.getTime()) / 1000,
  );
  const pricePerGPUHour = totalPriceToPricePerGPUHour(
    options.priceCents,
    durationInSeconds,
    options.quantity,
    GPUS_PER_NODE,
  );
  const pricePerHourLabel = c.green(centsToDollarsFormatted(pricePerGPUHour));

  const topLine = `${totalNodesLabel} ${instanceTypeLabel} ${nodesLabel} (${GPUS_PER_NODE * options.quantity} GPUs) at ${pricePerHourLabel} per GPU hour for ${c.green(durationHumanReadable)} ${timeDescription}`;

  const dollarsLabel = c.green(centsToDollarsFormatted(pricePerGPUHour));

  const gpusLabel = c.green(options.quantity * GPUS_PER_NODE);

  const priceLine = `\nBuy ${gpusLabel} GPUs at ${dollarsLabel} per GPU hour?`;

  return `${topLine}\n${priceLine} `;
}

type BuyOptions = {
  instanceType: string;
  priceCents: number;
  quantity: number;
  startsAt: Date;
  endsAt: Date;
  confirmWithUser: boolean;
  quoteOnly: boolean;
};
export async function placeBuyOrder(options: BuyOptions) {
  const api = await apiClient();
  const { data, error, response } = await api.POST("/v0/orders", {
    body: {
      side: "buy",
      instance_type: options.instanceType,
      quantity: options.quantity,
      // round start date again because the user might take a long time to confirm
      start_at: roundStartDate(options.startsAt).toISOString(),
      end_at: options.endsAt.toISOString(),
      price: options.priceCents,
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
  startsAt: Date;
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
        min_start_date: options.startsAt.toISOString(),
        max_start_date: options.startsAt.toISOString(),
      },
    },
  });

  if (!response.ok) {
    switch (response.status) {
      case 400:
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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOrder(orderId: string) {
  const api = await apiClient();

  const { data: order } = await api.GET("/v0/orders/{id}", {
    params: { path: { id: orderId } },
  });
  return order;
}

async function tryToGetOrder(orderId: string) {
  for (let i = 0; i < 10; i++) {
    const order = await getOrder(orderId);
    if (order) {
      return order;
    }
    await sleep(50);
  }

  return undefined;
}
