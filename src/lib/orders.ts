import Table from "cli-table3";
import type { Command } from "commander";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { getAuthToken, isLoggedIn } from "../helpers/config";
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
        status = "executed";
        // ! this could be undefined if the order was placed before this feature was implemented
        executionPrice = order.execution_price;
      } else {
        status = order.status;
      }

      const startDate = new Date(order.start_at);
      const duration = formatDuration(
        dayjs(order.end_at).diff(dayjs(startDate), "ms"),
      );
      console.log(order.price);
      table.push([
        order.id,
        order.side,
        order.instance_type,
        usdFormatter.format(order.price / 10000),
        order.quantity.toString(),
        duration,
        startDate.toLocaleString(),
        status,
        executionPrice ? usdFormatter.format(executionPrice / 10000) : "-",
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
    .option("--public", "Include public orders")
    .option("-t, --type <type>", "Filter by instance type")
    .option("-s, --start <date>", "Filter by minimum start date")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      const orders = await getOrders({
        include_public: options.public,
        instance_type: options.type,
        min_start_date: options.start,
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
  instance_type?: string;
  limit?: number;
  offset?: number;
  min_start_date?: string;
  max_start_date?: string;
  min_duration?: string;
  max_duration?: string;
  min_quantity?: string;
  max_quantity?: string;
  side?: "buy" | "sell";
  include_public?: boolean;
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
