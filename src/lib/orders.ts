import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { logAndQuit } from "../helpers/errors";

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
