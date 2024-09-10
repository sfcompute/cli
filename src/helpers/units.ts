import type { Nullable } from "../types/empty";

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
export type Centicents = number;

interface PriceWholeToCenticentsReturn {
  centicents: Nullable<Centicents>;
  invalid: boolean;
}
export function priceWholeToCenticents(
  price: string | number,
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
