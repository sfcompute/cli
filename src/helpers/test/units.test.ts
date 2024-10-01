import { describe, expect, test } from "bun:test";
import {
  type Cents,
  centsToDollarsFormatted,
  priceWholeToCents,
} from "../units";

describe("units", () => {
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

      expect(cents).not.toBeNull();
      expect(cents).toEqual(centsExpected as number);
      expect(invalid).toBe(false);
    }

    const invalidPrices = [null, undefined, [], {}];
    for (const input of invalidPrices) {
      const { cents, invalid } = priceWholeToCents(input as any);

      expect(cents).toBeNull();
      expect(invalid).toBeTrue();
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

      expect(result).toEqual(expected as string);
    }
  });
});
