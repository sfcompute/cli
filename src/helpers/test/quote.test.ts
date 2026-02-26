import { describe, expect, it } from "vitest";
import { getPricePerGpuHourFromQuote } from "../quote.ts";
import { GPUS_PER_NODE } from "../../lib/constants.ts";

function makeQuote(opts: {
  priceCents: number;
  quantity: number;
  durationHours: number;
}) {
  const start = new Date("2025-06-01T00:00:00Z");
  const end = new Date(
    start.getTime() + opts.durationHours * 3600 * 1000,
  );
  return {
    price: opts.priceCents,
    quantity: opts.quantity,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

function pricePerNodeHourFromQuote(
  quote: ReturnType<typeof makeQuote>,
): number {
  const pricePerGpuHour = getPricePerGpuHourFromQuote(quote);
  return (pricePerGpuHour * GPUS_PER_NODE) / 100;
}

describe("getPricePerGpuHourFromQuote", () => {
  it("returns correct per-GPU-hour price for a single node", () => {
    // 1 node, 4 hours, $12/node/hr = $48 total = 4800 cents
    const quote = makeQuote({ priceCents: 4800, quantity: 1, durationHours: 4 });
    const pricePerNodeHour = pricePerNodeHourFromQuote(quote);
    expect(pricePerNodeHour).toBeCloseTo(12.0);
  });

  it("normalizes correctly regardless of quantity in quote", () => {
    // 8 nodes, 4 hours, $12/node/hr = $384 total = 38400 cents
    const quote = makeQuote({ priceCents: 38400, quantity: 8, durationHours: 4 });
    const pricePerNodeHour = pricePerNodeHourFromQuote(quote);
    expect(pricePerNodeHour).toBeCloseTo(12.0);
  });
});

describe("multi-node total price calculation (extend confirmation)", () => {
  it("computes correct total using per-node-hour rates", () => {
    // Simulates extending 16 nodes for 4 hours at $12/node/hr
    // Each quote is for 1 node (quantity: 1)
    const requestedDurationHours = 4;
    const nodeCount = 16;

    const quotes = Array.from({ length: nodeCount }, () =>
      makeQuote({ priceCents: 4800, quantity: 1, durationHours: 4 }),
    );

    const totalPricePerHour = quotes.reduce((acc, quote) => {
      const pricePerGpuHour = getPricePerGpuHourFromQuote(quote);
      const pricePerNodeHour = (pricePerGpuHour * GPUS_PER_NODE) / 100;
      return acc + pricePerNodeHour;
    }, 0);
    const totalEstimate = totalPricePerHour * requestedDurationHours;

    // 16 nodes * $12/hr * 4 hours = $768
    expect(totalEstimate).toBeCloseTo(768);
  });

  it("handles quotes with longer duration than requested without overestimating", () => {
    // Quote returned for 5 hours (due to flexibility), but we only want 4 hours
    const requestedDurationHours = 4;
    const nodeCount = 16;

    // 1 node, 5 hours, $12/node/hr = $60 total = 6000 cents
    const quotes = Array.from({ length: nodeCount }, () =>
      makeQuote({ priceCents: 6000, quantity: 1, durationHours: 5 }),
    );

    const totalPricePerHour = quotes.reduce((acc, quote) => {
      const pricePerGpuHour = getPricePerGpuHourFromQuote(quote);
      const pricePerNodeHour = (pricePerGpuHour * GPUS_PER_NODE) / 100;
      return acc + pricePerNodeHour;
    }, 0);
    const totalEstimate = totalPricePerHour * requestedDurationHours;

    // Rate is $12/hr, so 16 * 4 * 12 = $768 (not $960)
    expect(totalEstimate).toBeCloseTo(768);
  });

  it("OLD BUG: raw price sum with quantity=8 would have been 8x too high", () => {
    // This test demonstrates the old bug:
    // Each quote was requested with quantity=8 (nodes) instead of 1,
    // and the total was computed as raw sum of prices / 100
    const nodeCount = 16;

    // 8 nodes, 4 hours, $12/node/hr = $384 total = 38400 cents per quote
    const quotes = Array.from({ length: nodeCount }, () =>
      makeQuote({ priceCents: 38400, quantity: 8, durationHours: 4 }),
    );

    // Old calculation: sum raw prices / 100
    const oldTotal = quotes.reduce((acc, q) => acc + q.price, 0) / 100;
    // This gave $6,144 (8x the correct $768)
    expect(oldTotal).toBeCloseTo(6144);

    // With 5-hour quotes (duration flexibility), it would have been ~10x
    const quotesWithFlexDuration = Array.from({ length: nodeCount }, () =>
      makeQuote({ priceCents: 48000, quantity: 8, durationHours: 5 }),
    );
    const oldTotalFlex =
      quotesWithFlexDuration.reduce((acc, q) => acc + q.price, 0) / 100;
    // $7,680 - exactly matching the user's reported bug
    expect(oldTotalFlex).toBeCloseTo(7680);
  });
});
