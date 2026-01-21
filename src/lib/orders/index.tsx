import * as console from "node:console";
import { type Command, Option } from "@commander-js/extra-typings";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { render } from "ink";
import { getAuthToken, isLoggedIn } from "../../helpers/config.ts";
import { parseDurationArgument } from "../../helpers/duration.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { fetchAndHandleErrors } from "../../helpers/fetch.ts";
import { parseStartDate } from "../../helpers/units.ts";
import { getApiUrl } from "../../helpers/urls.ts";
import { OrderDisplay } from "./OrderDisplay.tsx";
import type { HydratedOrder, ListResponseBody } from "./types.ts";

dayjs.extend(relativeTime);
dayjs.extend(duration);

export function formatDuration(ms: number) {
  const d = dayjs.duration(ms);

  const years = Math.floor(d.asYears());
  const weeks = Math.floor(d.asWeeks()) % 52;
  const days = d.days();
  const hours = d.hours();
  const minutes = d.minutes();
  const seconds = d.seconds();
  const milliseconds = d.milliseconds();

  let result = "";

  if (years > 0) result += `${years}y`;
  if (weeks > 0) result += `${weeks}w`;
  if (days > 0) result += `${days}d`;
  if (hours > 0) result += `${hours}h`;
  if (minutes > 0) result += `${minutes}m`;
  if (seconds > 0) result += `${seconds}s`;
  if (milliseconds > 0) result += `${milliseconds}ms`;

  return result || "0ms";
}

export function registerOrders(program: Command) {
  const ordersCommand = program
    .command("orders")
    .alias("o")
    .alias("order")
    .description("Manage orders");

  ordersCommand
    .command("ls")
    .alias("list")
    .description("List orders")
    .addOption(
      new Option("--side <side>", "Filter by order side (buy or sell)").choices(
        ["buy", "sell"] as const,
      ),
    )
    .option("-t, --type <type>", "Filter by instance type")
    .option("-v, --verbose", "Show verbose output")
    .addOption(
      new Option(
        "--public",
        "This option is deprecated. It's no longer possible to view public orders.",
      )
        .conflicts(["onlyFilled", "onlyCancelled"])
        .implies({
          onlyOpen: true,
        }),
    )
    .option(
      "--min-price <price>",
      "Filter by minimum price (in cents)",
      Number.parseInt,
    )
    .option(
      "--max-price <price>",
      "Filter by maximum price (in cents)",
      Number.parseInt,
    )
    .option(
      "--min-start <date>",
      "Filter by minimum start date (ISO 8601 datestring)",
    )
    .option(
      "--max-start <date>",
      "Filter by maximum start date (ISO 8601 datestring)",
    )
    .option(
      "--min-duration <duration>",
      "Filter by minimum duration (in seconds)",
    )
    .option(
      "--max-duration <duration>",
      "Filter by maximum duration (in seconds)",
    )
    .option(
      "--min-quantity <quantity>",
      "Filter by minimum quantity",
      Number.parseInt,
    )
    .option(
      "--max-quantity <quantity>",
      "Filter by maximum quantity",
      Number.parseInt,
    )
    .option(
      "--contract-id <id>",
      "Filter by contract ID (only for sell orders)",
    )
    .addOption(
      new Option("--only-open", "Show only open orders").conflicts([
        "onlyFilled",
        "onlyCancelled",
      ]),
    )
    .addOption(
      new Option("--exclude-filled", "Exclude filled orders").conflicts([
        "onlyFilled",
      ]),
    )
    .addOption(
      new Option("--only-filled", "Show only filled orders").conflicts([
        "excludeFilled",
        "onlyCancelled",
        "onlyOpen",
        "public",
      ]),
    )
    .option(
      "--min-filled-at <date>",
      "Filter by minimum filled date (ISO 8601 datestring)",
    )
    .option(
      "--max-filled-at <date>",
      "Filter by maximum filled date (ISO 8601 datestring)",
    )
    .option(
      "--min-fill-price <price>",
      "Filter by minimum fill price (in cents)",
      Number.parseInt,
    )
    .option(
      "--max-fill-price <price>",
      "Filter by maximum fill price (in cents)",
      Number.parseInt,
    )
    .option("--include-cancelled", "Include cancelled orders")
    .addOption(
      new Option("--only-cancelled", "Show only cancelled orders")
        .conflicts(["onlyFilled", "onlyOpen", "public"])
        .implies({
          includeCancelled: true,
        }),
    )
    .option(
      "--min-cancelled-at <date>",
      "Filter by minimum cancelled date (ISO 8601 datestring)",
    )
    .option(
      "--max-cancelled-at <date>",
      "Filter by maximum cancelled date (ISO 8601 datestring)",
    )
    .option(
      "--min-placed-at <date>",
      "Filter by minimum placed date (ISO 8601 datestring)",
    )
    .option(
      "--max-placed-at <date>",
      "Filter by maximum placed date (ISO 8601 datestring)",
    )
    .option("--limit <number>", "Limit the number of results", Number.parseInt)
    .option(
      "--offset <number>",
      "Offset the results (for pagination)",
      Number.parseInt,
    )
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      const minDuration = parseDurationArgument(options.minDuration);
      const maxDuration = parseDurationArgument(options.maxDuration);
      const orders = await getOrders({
        side: options.side,
        instance_type: options.type,

        min_price: options.minPrice,
        max_price: options.maxPrice,
        min_start_date: options.minStart,
        max_start_date: options.maxStart,
        min_duration: minDuration,
        max_duration: maxDuration,
        min_quantity: options.minQuantity,
        max_quantity: options.maxQuantity,

        contract_id: options.contractId,

        only_open: options.onlyOpen,

        exclude_filled: options.excludeFilled,
        only_filled: options.onlyFilled,
        min_filled_at: options.minFilledAt,
        max_filled_at: options.maxFilledAt,
        min_fill_price: options.minFillPrice,
        max_fill_price: options.maxFillPrice,

        exclude_cancelled: !options.includeCancelled,
        only_cancelled: options.onlyCancelled,
        min_cancelled_at: options.minCancelledAt,
        max_cancelled_at: options.maxCancelledAt,

        min_placed_at: options.minPlacedAt,
        max_placed_at: options.maxPlacedAt,

        limit: options.limit,
        offset: options.offset,

        sort_by: "start_time",
        sort_direction: "ASC",
      });

      // Sort orders by start time ascending (present to future)
      const sortedOrders = [...orders].sort((a, b) => {
        const aStart = parseStartDate(a.start_at);
        const bStart = parseStartDate(b.start_at);
        return aStart.getTime() - bStart.getTime();
      });

      if (options.json) {
        console.log(JSON.stringify(sortedOrders, null, 2));
      } else {
        const { waitUntilExit } = render(
          <OrderDisplay orders={sortedOrders} expanded={options.verbose} />,
        );
        await waitUntilExit();
      }
    });

  ordersCommand
    .command("cancel <id>")
    .description("Cancel an order")
    .action(submitOrderCancellationByIdAction);
}

export async function getOrders(props: {
  side?: "buy" | "sell";
  instance_type?: string;

  min_price?: number;
  max_price?: number;
  min_start_date?: string;
  max_start_date?: string;
  min_duration?: number;
  max_duration?: number;
  min_quantity?: number;
  max_quantity?: number;

  contract_id?: string;

  only_open?: boolean;

  exclude_filled?: boolean;
  only_filled?: boolean;
  min_filled_at?: string;
  max_filled_at?: string;
  min_fill_price?: number;
  max_fill_price?: number;

  exclude_cancelled?: boolean;
  only_cancelled?: boolean;
  min_cancelled_at?: string;
  max_cancelled_at?: string;

  min_placed_at?: string;
  max_placed_at?: string;

  limit?: number;
  offset?: number;

  sort_by?: "created_at" | "start_time";
  sort_direction?: "ASC" | "DESC";
}) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      params.append(key, value.toString());
    }
  }

  const url = `${await getApiUrl("orders_list")}?${params.toString()}`;

  const response = await fetchAndHandleErrors(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });

  if (!response.ok) {
    switch (response.status) {
      case 401:
        return await logSessionTokenExpiredAndQuit();
      default:
        return logAndQuit(`Failed to fetch orders: ${response.statusText}`);
    }
  }

  const resp = (await response.json()) as ListResponseBody<HydratedOrder>;
  return resp.data;
}

export async function submitOrderCancellationByIdAction(orderId: string) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  const url = await getApiUrl("orders_cancel", { id: orderId });
  const response = await fetchAndHandleErrors(url, {
    method: "DELETE",
    body: JSON.stringify({}),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      return await logSessionTokenExpiredAndQuit();
    }

    const error = (await response.json()) as { code?: string };
    switch (error.code) {
      case "order.not_found":
        return logAndQuit(`Order ${orderId} not found`);
      case "order.already_cancelled":
        return logAndQuit(`Order ${orderId} is already cancelled`);
      default:
        // TODO: handle more specific errors
        return logAndQuit(`Failed to cancel order ${orderId}`);
    }
  }

  const resp = (await response.json()) as { object?: string };
  const cancellationSubmitted = resp.object === "pending";
  if (!cancellationSubmitted) {
    return logAndQuit(`Failed to cancel order ${orderId}`);
  }

  // cancellation submitted successfully
  console.log(`Cancellation for Order ${orderId} submitted.`);
  // process.exit(0);
}
