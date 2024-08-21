import { describe, expect, test } from "bun:test";
import { priceWholeToCenticents } from "../units";

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
});
