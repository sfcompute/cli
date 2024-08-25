import { describe, expect, test } from "bun:test";
import {
  centicentsToDollarsFormatted,
  formatSecondsShort,
  priceWholeToCenticents,
  toGPUHours,
  totalSignificantDecimals,
  truncateToFourDecimals,
  type Centicents,
} from "../units";
import { InstanceType } from "../../api/instances";

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

  test("truncate to four decimals", () => {
    expect(truncateToFourDecimals(0)).toEqual(0);
    expect(truncateToFourDecimals(1.1)).toEqual(1.1);
    expect(truncateToFourDecimals(1.12345)).toEqual(1.1234);
    expect(truncateToFourDecimals(1.123456)).toEqual(1.1234);
    expect(truncateToFourDecimals(1.123456789)).toEqual(1.1234);
  });

  test("total significant decimals", () => {
    expect(totalSignificantDecimals(0)).toEqual(0);
    expect(totalSignificantDecimals(1)).toEqual(0);
    expect(totalSignificantDecimals(1.1)).toEqual(1);
    expect(totalSignificantDecimals(1.12345)).toEqual(5);
    expect(totalSignificantDecimals(1.123456)).toEqual(6);
    expect(totalSignificantDecimals(1.123456789)).toEqual(9);
    expect(totalSignificantDecimals(1.12345)).toEqual(5);
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

  test("to GPU hours", () => {
    expect(
      toGPUHours({
        instanceType: InstanceType.H100i,
        quantity: 1,
        durationSeconds: 1 * 60 * 60,
      }),
    ).toEqual(8);
    expect(
      toGPUHours({
        instanceType: InstanceType.H100i,
        quantity: 2,
        durationSeconds: 1 * 60 * 60,
      }),
    ).toEqual(16);
    expect(
      toGPUHours({
        instanceType: InstanceType.H100i,
        quantity: 1,
        durationSeconds: 2 * 60 * 60,
      }),
    ).toEqual(16);
    expect(
      toGPUHours({
        instanceType: InstanceType.H100i,
        quantity: 3,
        durationSeconds: 4.5 * 60 * 60,
      }),
    ).toEqual(108);
  });
});
