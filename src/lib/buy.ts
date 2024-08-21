import { confirm } from "@inquirer/prompts";
import c from "chalk";
import * as chrono from "chrono-node";
import type { Command } from "commander";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import duration from "dayjs/plugin/duration";
import parseDuration from "parse-duration";
import { isLoggedIn } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import { formatDuration } from "./orders";
import {
  centicentsToDollarsFormatted,
  priceWholeToCenticents,
} from "../helpers/units";
import { OrderStatus, placeBuyOrderRequest } from "../api/orders";

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
    .requiredOption("-p, --price <price>", "Specify the price")
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

// --

async function placeBuyOrderAction(options: SfBuyParamsNormalized) {
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

  const { data: pendingOrder, err } = await placeBuyOrderRequest({
    instance_type: options.instanceType,
    quantity: options.totalNodes,
    duration: options.durationSeconds,
    start_at: options.startsAt.iso,
    price: options.priceCenticents,
  });
  if (err) {
    return logAndQuit(`Failed to place order: ${err.message}`);
  }

  if (pendingOrder && pendingOrder.status === OrderStatus.Pending) {
    const orderId = pendingOrder.id;

    console.log(`\n${c.green(`Order ${orderId} placed successfully`)}`);
  }
}

function confirmPlaceOrderMessage(options: SfBuyParamsNormalized) {
  const totalNodesLabel = c.green(options.totalNodes);
  const instanceTypeLabel = c.green(options.instanceType);
  const nodesLabel = options.totalNodes > 1 ? "nodes" : "node";
  const durationHumanReadable = formatDuration(options.durationSeconds * 1000);
  const startAtLabel = c.green(
    dayjs(options.startsAt.iso).format("MM/DD/YYYY hh:mm A"),
  );
  const fromNowTime = c.green(dayjs(options.startsAt.iso).fromNow());

  const topLine = `${totalNodesLabel} ${instanceTypeLabel} ${nodesLabel} for ${c.green(durationHumanReadable)} starting ${startAtLabel} (${c.green(fromNowTime)})`;

  const dollarsLabel = c.green(
    centicentsToDollarsFormatted(options.priceCenticents),
  );

  const priceLine = `\nBuy for ${dollarsLabel}?`;

  return `${topLine}\n${priceLine} `;
}

// --

async function quoteBuyOrderAction(options: SfBuyParamsNormalized) {}

// --

interface SfBuyParamsNormalized {
  instanceType: string;
  totalNodes: number;
  durationSeconds: number;
  priceCenticents: number;
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
  // parse duration
  const durationSeconds = parseDuration(options.duration, "s");
  if (!durationSeconds) {
    logAndQuit(`Invalid duration: ${options.duration}`);
    process.exit(1); // make typescript happy
  }

  // parse price
  const { centicents: priceCenticents, invalid: priceInputInvalid } =
    priceWholeToCenticents(options.price);
  if (priceInputInvalid || !priceCenticents) {
    logAndQuit(`Invalid price: ${options.price}`);
    process.exit(1); // make typescript happy
  }

  // parse starts at
  const startDate = options.start
    ? chrono.parseDate(options.start)
    : new Date();
  if (!startDate) {
    logAndQuit("Invalid start date");
    process.exit(1); // make typescript happy
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
    quoteOnly: options.quote ?? false,
  };
}
