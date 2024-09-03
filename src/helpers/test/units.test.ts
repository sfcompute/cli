import { describe, expect, test } from "bun:test";
import {
  type Centicents,
  centicentsToDollarsFormatted,
  priceWholeToCenticents,
} from "../units";

describe("units", () => {
  test("price whole to centicents", () => {
    const inputToExpectedValids = [
      // formatted as USD
      ["$0", 0],
      ["$1", 10_000],
      ["$10", 100_000],
      ["$100", 1_000_000],

      ["$0.0", 0],
      ["$0.00", 0],
      ["$0.000", 0],

      ["$1.0", 10_000],
      ["$1.00", 10_000],
      ["$1.000", 10_000],

      ["$1.23", 12_300],
      ["$1.234", 12_340],
      ["$1.2345", 12_345],
      ["$$1.2345", 12_345],

      // formatted as numbers
      ["0", 0],
      ["1", 10_000],
      ["10", 100_000],
      ["100", 1_000_000],

      ["1.23", 12_300],
      ["1.234", 12_340],
      ["1.2345", 12_345],

      // nested quotes (double)
      ['"$0"', 0],
      ['"$1"', 10_000],
      ['"$10"', 100_000],
      ['"0"', 0],
      ['"1"', 10_000],
      ['"10"', 100_000],

      // nested quotes (single)
      ["'$0'", 0],
      ["'$1'", 10_000],
      ["'$10'", 100_000],
      ["'$0'", 0],
      ["'$1'", 10_000],
      ["'$10'", 100_000],
    ];

    for (const [input, centicentsExpected] of inputToExpectedValids) {
      const { centicents, invalid } = priceWholeToCenticents(input);

      expect(centicents).not.toBeNull();
      expect(centicents).toEqual(centicentsExpected as number);
      expect(invalid).toBe(false);
    }

    const invalidPrices = [null, undefined, [], {}];
    for (const input of invalidPrices) {
      const { centicents, invalid } = priceWholeToCenticents(input as any);

      expect(centicents).toBeNull();
      expect(invalid).toBeTrue();
    }
  });

  test("centicents to dollars formatted", () => {
    const inputToExpectedValids = [
      // whole
      [0, "$0.00"],
      [10_000, "$1.00"],
      [100_000, "$10.00"],
      [1_000_000, "$100.00"],

      [99_910, "$9.99"],

      // with cents
      [100, "$0.01"],
      [200, "$0.02"],
      [1_000, "$0.10"],
      [9000, "$0.90"],

      // rounding
      [1, "$0.00"],
      [49, "$0.00"],
      [50, "$0.01"],
      [99, "$0.01"],
      [100, "$0.01"],
    ];

    for (const [input, expected] of inputToExpectedValids) {
      const result = centicentsToDollarsFormatted(input as Centicents);

      expect(result).toEqual(expected as string);
    }
  });
});
