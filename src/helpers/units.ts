import * as chrono from "chrono-node";
import dayjs from "dayjs";
import type { Nullable } from "../types/empty.ts";

// -- time

export type Epoch = number;

const MILLS_PER_EPOCH = 1000 * 60; // 1 minute
const EPOCHS_PER_HOUR = (3600 * 1000) / MILLS_PER_EPOCH;

export function currentEpoch(): Epoch {
  return Math.floor(Date.now() / MILLS_PER_EPOCH);
}

export function epochToDate(epoch: Epoch): Date {
  return new Date(epoch * MILLS_PER_EPOCH);
}

export function roundStartDate(startDate: Date): Date {
  const now = currentEpoch();
  const startEpoch = dateToEpoch(startDate);
  if (startEpoch <= now + 1) {
    return epochToDate(now + 1);
  } else {
    return epochToDate(roundEpochUpToHour(startEpoch));
  }
}

export function computeApproximateDurationSeconds(
  startDate: Date | "NOW",
  endDate: Date,
): number {
  const startEpoch = startDate === "NOW"
    ? currentEpoch()
    : dateToEpoch(startDate);
  const endEpoch = dateToEpoch(endDate);
  return dayjs(epochToDate(endEpoch)).diff(dayjs(epochToDate(startEpoch)), "s");
}

export function roundEndDate(endDate: Date): Date {
  return epochToDate(roundEpochUpToHour(dateToEpoch(endDate)));
}

function dateToEpoch(date: Date): number {
  return Math.ceil(date.getTime() / MILLS_PER_EPOCH);
}
function roundEpochUpToHour(epoch: number): number {
  return Math.ceil(epoch / EPOCHS_PER_HOUR) * EPOCHS_PER_HOUR;
}

// -- currency

export type Cents = number;

interface PriceWholeToCentsReturn {
  cents: Nullable<Cents>;
  invalid: boolean;
}
export function priceWholeToCents(
  price: string | number,
): PriceWholeToCentsReturn {
  if (
    price === null ||
    price === undefined ||
    (typeof price !== "number" && typeof price !== "string")
  ) {
    return { cents: null, invalid: true };
  }

  if (typeof price === "number") {
    if (price < 0) {
      return { cents: null, invalid: true };
    }

    return { cents: price * 100, invalid: false };
  } else if (typeof price === "string") {
    // remove any whitespace, dollar signs, negative signs, single and double quotes
    const priceCleaned = price.replace(/[\s\$\-\'\"]/g, "");
    if (priceCleaned === "") {
      return { cents: null, invalid: true };
    }

    const parsedPrice = Number.parseFloat(priceCleaned);

    return { cents: parsedPrice * 100, invalid: false };
  }

  // default invalid
  return { cents: null, invalid: true };
}

export function centsToDollarsFormatted(cents: Cents): string {
  return `$${centsToDollars(cents).toFixed(2)}`;
}

export function centsToDollars(cents: Cents): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): Cents {
  return Math.ceil(dollars * 100);
}

export function parseStartDate(startDate: string): Date | "NOW" | null {
  const nowRe = /\b(?:"|')?[nN][oO][wW](?:"|')?\b/;
  if (nowRe.test(startDate)) {
    return "NOW";
  }

  const chronoDate = chrono.parseDate(startDate);
  if (!chronoDate) {
    return null;
  }

  return chronoDate;
}
