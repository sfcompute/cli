import Table from "cli-table3";
import type { Command } from "commander";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { getAuthToken, isLoggedIn } from "../config";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors";
import { fetchAndHandleErrors } from "../helpers/fetch";
import { getApiUrl } from "../helpers/urls";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

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

export type OrderType = "buy" | "sell";
export enum OrderStatus {
  Pending = "pending",
  Rejected = "rejected",
  Open = "open",
  Cancelled = "cancelled",
  Filled = "filled",
  Expired = "expired",
}
export interface OrderFlags {
  market: boolean;
  post_only: boolean;
  ioc: boolean;
  prorate: boolean;
}

export interface HydratedOrder {
  object: "order";
  id: string;
  side: OrderType;
  instance_type: string;
  price: number;
  start_at: string;
  end_at: string;
  quantity: number;
  flags: OrderFlags;
  created_at: string;
  executed: boolean;
  execution_price?: number;
  cancelled: boolean;
  status: OrderStatus;
}

export type PlaceSellOrderParameters = {
  side: "sell";
  quantity: number;
  price: number;
  start_at: string;
  end_at: string;
  contract_id: string;
};

export type PlaceOrderParameters = {
  side: "buy";
  quantity: number;
  price: number;
  instance_type: string;
  duration: number;
  start_at: string;
};

interface ListResponseBody<T> {
  data: T[];
  object: "list";
}

function printAsTable(orders: Array<HydratedOrder>) {
  orders.sort((a, b) => a.start_at.localeCompare(b.start_at));
  const table = new Table({
    head: [
      "ID",
      "Side",
      "Type",
      "Price",
      "Quantity",
      "Duration",
      "Start",
      "Status",
      "Execution Price",
    ],
  });
  for (const order of orders) {
    if (order.status === "pending") {
      table.push([order.id, "-", "-", "-", "-", "-", "-", order.status]);
    } else {
      let status: string;
      let executionPrice: number | undefined;
      if (order.cancelled) {
        status = "cancelled";
      } else if (order.executed) {
        status = "filled";
        executionPrice = order.execution_price;
      } else {
        status = order.status;
      }

      const startDate = new Date(order.start_at);
      const duration = formatDuration(
        dayjs(order.end_at).diff(dayjs(startDate), "ms"),
      );
      table.push([
        order.id,
        order.side,
        order.instance_type,
        usdFormatter.format(order.price / 100),
        order.quantity.toString(),
        duration,
        startDate.toLocaleString(),
        status,
        executionPrice ? usdFormatter.format(executionPrice / 100) : "-",
      ]);
    }
  }

  console.log(table.toString() + "\n");
}

export function registerOrders(program: Command) {
  const ordersCommand = program.command("orders").description("Manage orders");

  ordersCommand
    .command("ls")
    .alias("list")
    .description("List orders")
    .option("--side <side>", "Filter by order side (buy or sell)")
    .option("-t, --type <type>", "Filter by instance type")
    .option("--public", "Include public orders")
    .option("--min-price <price>", "Filter by minimum price (in cents)")
    .option("--max-price <price>", "Filter by maximum price (in cents)")
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
    .option("--min-quantity <quantity>", "Filter by minimum quantity")
    .option("--max-quantity <quantity>", "Filter by maximum quantity")
    .option(
      "--contract-id <id>",
      "Filter by contract ID (only for sell orders)",
    )
    .option("--only-open", "Show only open orders")
    .option("--exclude-filled", "Exclude filled orders")
    .option("--only-filled", "Show only filled orders")
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
    )
    .option(
      "--max-fill-price <price>",
      "Filter by maximum fill price (in cents)",
    )
    .option("--exclude-cancelled", "Exclude cancelled orders")
    .option("--only-cancelled", "Show only cancelled orders")
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
    .option("--limit <number>", "Limit the number of results")
    .option("--offset <number>", "Offset the results (for pagination)")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      const orders = await getOrders({
        side: options.side,
        instance_type: options.type,

        include_public: options.public,

        min_price: options.minPrice,
        max_price: options.maxPrice,
        min_start_date: options.minStart,
        max_start_date: options.maxStart,
        min_duration: options.minDuration,
        max_duration: options.maxDuration,
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

        exclude_cancelled: options.excludeCancelled,
        only_cancelled: options.onlyCancelled,
        min_cancelled_at: options.minCancelledAt,
        max_cancelled_at: options.maxCancelledAt,

        min_placed_at: options.minPlacedAt,
        max_placed_at: options.maxPlacedAt,

        limit: options.limit,
        offset: options.offset,
      });

      if (options.json) {
        console.log(JSON.stringify(orders, null, 2));
      } else {
        printAsTable(orders);
      }

      process.exit(0);
    });

  ordersCommand
    .command("cancel <id>")
    .description("Cancel an order")
    .action(submitOrderCancellationByIdAction);
}

export async function getOrders(props: {
  side?: "buy" | "sell";
  instance_type?: string;

  include_public?: boolean;

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
    logAndQuit(`Failed to fetch orders: ${response.statusText}`);
  }

  const resp = (await response.json()) as ListResponseBody<HydratedOrder>;
  return resp.data;
}

export async function submitOrderCancellationByIdAction(
  orderId: string,
): Promise<never> {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  const url = await getApiUrl("orders_cancel", { id: orderId });
  const response = await fetchAndHandleErrors(url, {
    method: "DELETE",
    body: JSON.stringify({}),
    headers: {
      "Content-ype": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      return await logSessionTokenExpiredAndQuit();
    }

    const error = await response.json();
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

  const resp = await response.json();
  const cancellationSubmitted = resp.object === "pending";
  if (!cancellationSubmitted) {
    return logAndQuit(`Failed to cancel order ${orderId}`);
  }

  // cancellation submitted successfully
  console.log(`Cancellation for Order ${orderId} submitted.`);
  process.exit(0);
}
