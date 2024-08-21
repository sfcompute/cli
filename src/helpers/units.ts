import type { Nullable } from "../types/empty";

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
    return { centicents: price * 10_000, invalid: false };
  } else if (typeof price === "string") {
    // remove any whitespace and dollar signs
    const numericPrice = Number.parseFloat(price.replace(/[\s\$]/g, ""));

    return { centicents: numericPrice * 10_000, invalid: false };
  }

  // default invalid
  return { centicents: null, invalid: true };
}
