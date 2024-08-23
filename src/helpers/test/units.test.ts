import { describe, expect, test } from "bun:test";
import {
  centicentsToDollarsFormatted,
  formatSecondsShort,
  priceWholeToCenticents,
  type Centicents,
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

  test("format seconds short", () => {
    expect(formatSecondsShort(0)).toEqual("0s");
    expect(formatSecondsShort(1)).toEqual("1s");
    expect(formatSecondsShort(59)).toEqual("59s");
    expect(formatSecondsShort(60)).toEqual("1m");
    expect(formatSecondsShort(61)).toEqual("1m 1s");
    expect(formatSecondsShort(3599)).toEqual("59m 59s");
    expect(formatSecondsShort(3600)).toEqual("1h");
    expect(formatSecondsShort(86_399)).toEqual("23h 59m 59s");
    expect(formatSecondsShort(86_400)).toEqual("1d");
    expect(formatSecondsShort(86_401)).toEqual("1d 1s");
    expect(formatSecondsShort(86_401)).toEqual("1d 1s");
    expect(formatSecondsShort(604_800)).toEqual("1w");
    expect(formatSecondsShort(864_000)).toEqual("1w 3d");
  });
});
