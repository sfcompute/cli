import { expect, test } from "vitest";
import {
  type Cents,
  centsToDollarsFormatted,
  dollarsToCents,
  priceWholeToCents,
} from "../units.ts";

test("price whole to cents", () => {
  const inputToExpectedValids = [
    // formatted as USD
    ["$0", 0],
    ["$1", 100],
    ["$10", 10_00],
    ["$100", 100_00],

    ["$0.0", 0],
    ["$0.00", 0],
    ["$0.000", 0],

    ["$1.0", 100],
    ["$1.00", 100],
    ["$1.000", 100],

    ["$1.23", 123],
    ["$1.234", 123],

    // formatted as numbers
    ["0", 0],
    ["1", 100],
    ["10", 10_00],
    ["100", 100_00],

    ["1.23", 123],
    ["1.234", 123],

    // nested quotes (double)
    ['"$0"', 0],
    ['"$1"', 100],
    ['"$10"', 10_00],
    ['"0"', 0],
    ['"1"', 100],
    ['"10"', 10_00],

    // nested quotes (single)
    ["'$0'", 0],
    ["'$1'", 100],
    ["'$10'", 10_00],
    ["'$0'", 0],
    ["'$1'", 100],
    ["'$10'", 10_00],
  ];

  for (const [input, centsExpected] of inputToExpectedValids) {
    const { cents, invalid } = priceWholeToCents(input);

    expect(cents !== null).toBe(true);
    expect(cents).toEqual(centsExpected);
    expect(invalid === false).toBe(true);
  }

  const invalidPrices = [null, undefined, [], {}];
  for (const input of invalidPrices) {
    // biome-ignore lint/suspicious/noExplicitAny: these are invalid inputs and will not typecheck
    const { cents, invalid } = priceWholeToCents(input as any);

    expect(cents).toBeNull();
    expect(invalid).toBe(true);
  }
});

test("cents to dollars formatted", () => {
  const inputToExpectedValids = [
    // whole
    [0, "$0.00"],
    [100, "$1.00"],
    [10_00, "$10.00"],
    [100_00, "$100.00"],

    [9_99, "$9.99"],

    // with cents
    [1, "$0.01"],
    [2, "$0.02"],
    [10, "$0.10"],
    [90, "$0.90"],
  ];

  for (const [input, expected] of inputToExpectedValids) {
    const result = centsToDollarsFormatted(input as Cents);

    expect(result).toEqual(expected);
  }
});

test("dollarsToCents returns integer cents without floating point errors", () => {
  // These prices are known to produce floating point precision errors
  // e.g. 17.60 * 100 = 1760.0000000000002 in IEEE 754
  const cases: [number, number][] = [
    [17.6, 1760],
    [12.5, 1250],
    [9.99, 999],
    [0.1, 10],
    [3.33, 333],
    [7.77, 777],
    [11.11, 1111],
    [20.0, 2000],
    [0.01, 1],
    [99.99, 9999],
  ];

  for (const [dollars, expectedCents] of cases) {
    const cents = dollarsToCents(dollars);
    expect(cents).toBe(expectedCents);
    expect(Number.isInteger(cents)).toBe(true);
  }
});

test("priceWholeToCents returns integer cents for prices with floating point issues", () => {
  // Regression test: $17.60 was sent to API as 1760.0000000000002
  // which failed deserialization as i64
  const cases: [string, number][] = [
    ["$17.60", 1760],
    ["17.60", 1760],
    ["$12.50", 1250],
    ["$9.99", 999],
    ["$0.10", 10],
    ["$20.00", 2000],
  ];

  for (const [input, expectedCents] of cases) {
    const { cents, invalid } = priceWholeToCents(input);
    expect(invalid).toBe(false);
    expect(cents).toBe(expectedCents);
    expect(Number.isInteger(cents)).toBe(true);
  }
});

test("priceWholeToCents handles numeric input without floating point errors", () => {
  const cases: [number, number][] = [
    [17.6, 1760],
    [12.5, 1250],
    [9.99, 999],
  ];

  for (const [input, expectedCents] of cases) {
    const { cents, invalid } = priceWholeToCents(input);
    expect(invalid).toBe(false);
    expect(cents).toBe(expectedCents);
    expect(Number.isInteger(cents)).toBe(true);
  }
});
