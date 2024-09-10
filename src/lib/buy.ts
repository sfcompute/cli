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
  type Centicents,
  centicentsToDollarsFormatted,
  priceWholeToCenticents,
  roundEndDate,
  roundStartDate,
} from "../helpers/units";
import type { Nullable } from "../types/empty";
import { formatDuration } from "./orders";

dayjs.extend(relativeTime);
dayjs.extend(duration);

interface SfBuyOptions {
  type: string;
  nodes?: string;
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
    .requiredOption("-t, --type <type>", "Specify the type of node")
    .option("-n, --nodes <quantity>", "Specify the number of nodes")
    .requiredOption("-d, --duration <duration>", "Specify the duration", "1h")
    .option("-p, --price <price>", "Specify the price")
    .option("-s, --start <start>", "Specify the start date")
    .option("-y, --yes", "Automatically confirm the order")
    .option("--quote", "Only provide a quote for the order")
    .action(buyOrderAction);
}

// --

async function buyOrderAction(options: SfBuyOptions) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    return logLoginMessageAndQuit();
  }

  // normalize inputs
  const optionsNormalized = normalizeSfBuyOptions(options);

  if (options.quote) {
    await quoteBuyOrderAction(optionsNormalized);
  } else {
    await placeBuyOrderAction(optionsNormalized);
  }
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

// --

async function placeBuyOrderAction(options: SfBuyParamsNormalized) {
  const api = await apiClient();
  if (!options.priceCenticents) {
    console.log("getting quote", options);
    const { data, error, response } = await api.GET("/v0/quote", {
      params: {
        query: {
          side: "buy",
          instance_type: options.instanceType,
          quantity: options.totalNodes,
          duration: options.durationSeconds,
          min_start_date: options.startsAt.iso,
          max_start_date: options.startsAt.iso,
        },
      },
    });

    if (!response.ok) {
      switch (response.status) {
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

    if (!data.quote) {
      const durationInHours = options.durationSeconds / 3600;
      const quantity = options.totalNodes;

      // In the future, we should read from a price chart of yesterday's prices.
      const todoEstimatedPriceInCents = 250;
      const estimatedPrice =
        todoEstimatedPriceInCents * quantity * durationInHours;
      const estimatedPriceInDollars = estimatedPrice;

      console.log(`No one is selling this right now. To ask someone to sell it to you, add a price you're willing to pay. For example:

  sf buy -i ${options.instanceType} -d "${durationInHours}h" -n ${quantity} -p "$${(estimatedPriceInDollars / 100).toFixed(2)}" 
        `);

      return process.exit(1);
    }

    options.priceCenticents = data.quote.price;
    options.totalNodes = data.quote.quantity;
    options.startsAt = {
      iso: data.quote.start_at,
      date: new Date(data.quote.start_at),
    };

    options.durationSeconds = data.quote.duration;
    const end = dayjs(data.quote.start_at).add(data.quote.duration, "s");
    options.endsAt = {
      iso: end.toISOString(),
      date: end.toDate(),
    };
  } else {
    // if we didn't quote, we need to round the start and end date (quoting guaranteed to return valid start and end dates, modulo race conditions)
    // For start dates:
    //   - If it's before the next minute (including in the past), round it up to the next minute.
    //   - Otherwise, round it up to the nearest hour.
    // For end dates:
    //   - Always round it up to the nearest hour.
    const startDateRounded = roundStartDate(options.startsAt.date);
    const endDateRounded = roundEndDate(options.endsAt.date);
    options.startsAt = {
      iso: startDateRounded.toISOString(),
      date: startDateRounded,
    };
    options.endsAt = {
      iso: endDateRounded.toISOString(),
      date: endDateRounded,
    };
  }

  if (options.confirmWithUser) {
    const confirmationMessage = confirmPlaceOrderMessage(options);
    const confirmed = await confirm({
      message: confirmationMessage,
      default: false,
    });

    if (!confirmed) {
      logAndQuit("Order cancelled");
    }
  }

  const { data, error, response } = await api.POST("/v0/orders", {
    body: {
      side: "buy",
      instance_type: options.instanceType,
      quantity: options.totalNodes,
      // round start date again because the user might take a long time to confirm
      start_at: roundStartDate(options.startsAt.date).toISOString(),
      end_at: options.endsAt.iso,
      price: options.priceCenticents,
    },
  });

  if (!response.ok) {
    switch (response.status) {
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

  switch (data.status) {
    case "pending": {
      const orderId = data.id;
      const printOrderNumber = (status: string) =>
        console.log(`\n${c.dim(`${orderId}\n\n`)}`);

      const order = await tryToGetOrder(orderId);

      if (!order) {
        console.log(`\n${c.dim(`Order ${orderId} is pending`)}`);
        return;
      }
      printOrderNumber(order.status);

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
      } else {
        console.log(`Your order wasn't accepted yet. You can check it's status with:

    sf orders ls

  If you want to cancel the order, you can do so with:

    sf orders cancel ${orderId}

    `);

        return;
      }
    }
    default:
      return logAndQuit(
        `Failed to place order: Unexpected order status: ${data.status}`,
      );
  }
}

function actualDuration(options: SfBuyParamsNormalized): number {
  const now = new Date();
  const startAt = new Date(options.startsAt.iso);
  const requestedDuration = options.durationSeconds;

  // If start time is in the future, return the requested duration
  if (startAt > now) {
    return requestedDuration;
  }

  // Calculate the time to the next hour
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  const timeToNextHour = Math.ceil((nextHour.getTime() - now.getTime()) / 1000);

  // Return the sum of time to next hour and requested duration
  return timeToNextHour + requestedDuration;
}

function confirmPlaceOrderMessage(options: SfBuyParamsNormalized) {
  if (!options.priceCenticents) {
    return "";
  }

  const totalNodesLabel = c.green(options.totalNodes);
  const instanceTypeLabel = c.green(options.instanceType);
  const nodesLabel = options.totalNodes > 1 ? "nodes" : "node";
  const durationHumanReadable = formatDuration(actualDuration(options) * 1000);
  const endsAtLabel = c.green(
    dayjs(options.endsAt.iso).format("MM/DD/YYYY hh:mm A"),
  );
  const fromNowTime = dayjs(options.startsAt.iso).fromNow();

  let timeDescription: string;
  if (
    fromNowTime === "a few seconds ago" ||
    fromNowTime === "in a few seconds"
  ) {
    timeDescription = `from ${c.green("now")} until ${endsAtLabel}`;
  } else {
    const startAtLabel = c.green(
      dayjs(options.startsAt.iso).format("MM/DD/YYYY hh:mm A"),
    );
    timeDescription = `from ${startAtLabel} (${c.green(fromNowTime)}) until ${endsAtLabel}`;
  }

  const topLine = `${totalNodesLabel} ${instanceTypeLabel} ${nodesLabel} for ${c.green(durationHumanReadable)} ${timeDescription}`;

  const dollarsLabel = c.green(
    centicentsToDollarsFormatted(options.priceCenticents),
  );

  const priceLine = `\nBuy for ${dollarsLabel}?`;

  return `${topLine}\n${priceLine} `;
}

// --

async function quoteBuyOrderAction(options: SfBuyParamsNormalized) {
  const api = await apiClient();

  const { data, error, response } = await api.GET("/v0/quote", {
    params: {
      query: {
        side: "buy",
        instance_type: options.instanceType,
        quantity: options.totalNodes,
        duration: options.durationSeconds,
        min_start_date: options.startsAt.iso,
        max_start_date: options.startsAt.iso,
      },
    },
  });

  if (!response.ok) {
    switch (response.status) {
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

  if (!data.quote) {
    return logAndQuit("Not enough data exists to quote this order.");
  }

  const priceLabelUsd = c.green(centicentsToDollarsFormatted(data.quote.price));

  console.log(`This order is projected to cost ${priceLabelUsd}`);
}

// --

interface SfBuyParamsNormalized {
  instanceType: string;
  totalNodes: number;
  durationSeconds: number;
  priceCenticents: Nullable<number>;
  startsAt: {
    iso: string;
    date: Date;
  };
  endsAt: {
    iso: string;
    date: Date;
  };
  confirmWithUser: boolean;
  quoteOnly: boolean;
}
function normalizeSfBuyOptions(options: SfBuyOptions): SfBuyParamsNormalized {
  const isQuoteOnly = options.quote ?? false;

  // parse duration
  const durationSeconds = parseDuration(options.duration, "s");
  if (!durationSeconds) {
    logAndQuit(`Invalid duration: ${options.duration}`);
    process.exit(1); // make typescript happy
  }

  // parse price
  let priceCenticents: Nullable<Centicents> = null;
  if (options.price) {
    const { centicents: priceParsed, invalid: priceInputInvalid } =
      priceWholeToCenticents(options.price);
    if (priceInputInvalid) {
      logAndQuit(`Invalid price: ${options.price}`);
      process.exit(1);
    }
    priceCenticents = priceParsed;
  }

  // parse starts at
  const startDate = options.start
    ? chrono.parseDate(options.start)
    : new Date();
  if (!startDate) {
    logAndQuit("Invalid start date");
    process.exit(1);
  }

  const yesFlagOmitted = options.yes === undefined || options.yes === null;
  const confirmWithUser = yesFlagOmitted || !options.yes;

  return {
    instanceType: options.type,
    totalNodes: options.nodes ? Number(options.nodes) : 1,
    durationSeconds,
    priceCenticents,
    startsAt: {
      iso: startDate.toISOString(),
      date: startDate,
    },
    endsAt: {
      iso: dayjs(startDate).add(durationSeconds, "s").toISOString(),
      date: dayjs(startDate).add(durationSeconds, "s").toDate(),
    },
    confirmWithUser: confirmWithUser,
    quoteOnly: isQuoteOnly,
  };
}
