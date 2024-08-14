import Table from "cli-table3";
import type { Command } from "commander";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { getAuthToken, isLoggedIn } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";
import type { ListResponseBody, Order } from "./types";

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

  if (years > 0) return `${years}y`;
  if (weeks > 0) return `${weeks}w`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  if (seconds > 0) return `${seconds}s`;
  if (milliseconds > 0) return `${milliseconds}ms`;
  return "0ms";
}

export type PlaceSellOrderParameters = {
  side: "sell";
  quantity: number;
  price: number;
  duration: number;
  start_at: string;
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

export function priceToCenticents(price: string | number): number {
  if (typeof price === "number") {
    return price;
  }

  try {
    // Remove any leading dollar sign and convert to a number
    const numericPrice = Number.parseFloat(price.replace(/^\$/, ""));

    // Convert dollars to centicents
    return Math.round(numericPrice * 10000);
  } catch (error) {
    logAndQuit("Invalid price");
  }
  return 0;
}

function printAsTable(orders: Order[]) {
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
    ],
    colWidths: [10, 8, 10, 10, 10, 10, 25, 10],
  });
  for (const order of orders) {
    if (order.status === "pending") {
      table.push([
        order.id.slice(0, 8),
        "-",
        "-",
        "-",
        "-",
        "-",
        "-",
        order.status,
      ]);
    } else {
      const startDate = new Date(order.start_at);
      table.push([
        order.id.slice(0, 8),
        order.side,
        order.instance_type,
        usdFormatter.format(order.price / 10000),
        order.quantity.toString(),
        formatDuration(order.duration * 1000),
        startDate.toLocaleString(),
        order.status,
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

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });

  if (!response.ok) {
    logAndQuit(`Failed to fetch orders: ${response.statusText}`);
  }

  const resp = (await response.json()) as ListResponseBody<Order>;
  return resp.data;
}
