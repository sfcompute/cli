import type { Nullable } from "../types/empty";

export type Cents = number;
export type Centicents = number;

// --

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
