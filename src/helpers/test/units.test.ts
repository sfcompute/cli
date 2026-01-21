import { expect, test } from "vitest";
import {
  type Cents,
  centsToDollarsFormatted,
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
    ["$1.234", 123.4],

    // formatted as numbers
    ["0", 0],
    ["1", 100],
    ["10", 10_00],
    ["100", 100_00],

    ["1.23", 123],
    ["1.234", 123.4],

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
