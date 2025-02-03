import { assertEquals } from "https://deno.land/std@0.112.0/testing/asserts.ts";
import { parseDurationArgument } from "../duration.ts";

Deno.test("parseDurationArgument", () => {
  const testCases: [string, number | undefined][] = [
    ["", undefined],
    ["0", 0],
    ["100", 100],
    ["3600", 3600],
    ["1w", 604800],
    ["1d", 86400],
    ["1hr", 3600],
    ["30s", 30],
    ["4s", 4],
    ["0s", 0],
    ["invalid", undefined],
    ["123abc", undefined],
    ["s30", undefined],
    ["1H", 3600],
    ["1HR", 3600],
    ["1Hour", 3600],
    ["1W", 604800],
    ["1D", 86400],
    ["1h30m", 5400],
    ["1d 12h", 129600],
    ["2w3d", 1468800],
    ["1.5h", undefined],
    ["2.5d", undefined],
    ["-1h", undefined],
    ["-30s", undefined],
    ["-100", undefined],
    ["1 h", 3600],
    ["2  d", 172800],
    ["1_d", 86400],
  ];

  for (const [input, expected] of testCases) {
    const result = parseDurationArgument(input);
    assertEquals(result, expected);
  }
});
