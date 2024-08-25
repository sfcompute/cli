import dayjs from "dayjs";
import type { Nullable, Optional } from "./empty";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { InstanceType } from "../api/instances";

dayjs.extend(relativeTime);
dayjs.extend(duration);

// --

export type Cents = number;
export type Centicents = number;

// --

interface PriceWholeToCenticentsReturn {
  centicents: Nullable<Centicents>;
  invalid: boolean;
}
export function priceWholeToCenticents(
  price: Optional<string | number>,
): PriceWholeToCenticentsReturn {
  if (
    price === null ||
    price === undefined ||
    (typeof price !== "number" && typeof price !== "string")
  ) {
    return { centicents: null, invalid: true };
  }

  if (typeof price === "number") {
    if (price < 0) {
      return { centicents: null, invalid: true };
    }

    return { centicents: price * 10_000, invalid: false };
  } else if (typeof price === "string") {
    // remove any whitespace, dollar signs, negative signs, single and double quotes
    const priceCleaned = price.replace(/[\s\$\-\'\"]/g, "");
    if (priceCleaned === "") {
      return { centicents: null, invalid: true };
    }

    const parsedPrice = Number.parseFloat(priceCleaned);

    return { centicents: parsedPrice * 10_000, invalid: false };
  }

  // default invalid
  return { centicents: null, invalid: true };
}

export function centicentsToDollarsFormatted(centicents: Centicents): string {
  return `$${(centicents / 10_000).toFixed(2)}`;
}

export function centicentsToWhole(centicents: Centicents): number {
  return centicents / 10_000;
}

export function truncateToFourDecimals(num: number): number {
  return Math.floor(num * 10000) / 10000;
}
export function totalSignificantDecimals(num: number): number {
  return num.toString().split(".")[1]?.length || 0;
}

// -- duration

export function formatSecondsShort(secs: number) {
  const d = dayjs.duration(secs * 1000); // convert seconds to milliseconds

  const units = [
    { unit: "y", value: d.years() },
    { unit: "w", value: d.weeks() % 52 },
    { unit: "d", value: d.days() % 7 },
    { unit: "h", value: d.hours() },
    { unit: "m", value: d.minutes() },
    { unit: "s", value: d.seconds() },
  ];

  const parts = units
    .filter(({ value }) => value > 0)
    .map(({ unit, value }) => `${value}${unit}`);

  return parts.length > 0 ? parts.join(" ") : "0s";
}

// --

export function toGPUHours({
  instanceType,
  quantity,
  durationSeconds,
}: {
  instanceType: Nullable<InstanceType>;
  quantity: Nullable<number>;
  durationSeconds: Nullable<number>;
}): Nullable<number> {
  if (instanceType === null || quantity === null || durationSeconds === null) {
    return null;
  }

  if (instanceType === InstanceType.H100i) {
    return (quantity * 8 * durationSeconds) / (60 * 60);
  }

  return null;
}
