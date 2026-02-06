import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

describe("Timezone conversion", () => {
  it("should correctly convert PST to UTC by adding 8 hours", () => {
    // Test the fix: 6pm PST should be 2am UTC (next day)
    // PST is UTC-8, so we add 8 hours to convert PST to UTC
    const pstDate = dayjs.tz("2026-02-06 18:00", "America/Los_Angeles");
    const utcDate = pstDate.utc();
    
    // 6pm PST + 8 hours = 2am UTC (next day)
    expect(utcDate.hour()).toBe(2);
    expect(utcDate.date()).toBe(7); // Next day
  });

  it("should correctly convert 7pm PST to UTC by adding 8 hours", () => {
    // 7pm PST should be 3am UTC (next day)
    const pstDate = dayjs.tz("2026-02-06 19:00", "America/Los_Angeles");
    const utcDate = pstDate.utc();
    
    // 7pm PST + 8 hours = 3am UTC (next day)
    expect(utcDate.hour()).toBe(3);
    expect(utcDate.date()).toBe(7); // Next day
  });

  it("utc() should convert timezone while utc(true) should NOT", () => {
    // This test demonstrates the bug that was fixed
    const pstDate = dayjs.tz("2026-02-06 18:00", "America/Los_Angeles");
    
    // Correct: .utc() converts 6pm PST to 2am UTC
    const correctConversion = pstDate.utc();
    expect(correctConversion.hour()).toBe(2);
    expect(correctConversion.date()).toBe(7);
    
    // Bug: .utc(true) keeps 6pm but marks it as UTC (wrong!)
    const incorrectConversion = pstDate.utc(true);
    expect(incorrectConversion.hour()).toBe(18); // Still 6pm - WRONG!
    expect(incorrectConversion.date()).toBe(6); // Same day - WRONG!
  });

  it("should handle EST to UTC conversion (adding 5 hours)", () => {
    // EST is UTC-5, so we add 5 hours
    const estDate = dayjs.tz("2026-02-06 20:00", "America/New_York");
    const utcDate = estDate.utc();
    
    // 8pm EST + 5 hours = 1am UTC (next day)
    expect(utcDate.hour()).toBe(1);
    expect(utcDate.date()).toBe(7);
  });
});
