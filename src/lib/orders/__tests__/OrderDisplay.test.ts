import { assertEquals } from "https://deno.land/std@0.112.0/testing/asserts.ts";
import { GPUS_PER_NODE } from "../../constants.ts";
import { orderDetails } from "../OrderDisplay.tsx";
import type { HydratedOrder } from "../types.ts";
import { OrderStatus } from "../types.ts";

const baseOrder: HydratedOrder = {
  object: "order",
  id: "test-id",
  side: "buy",
  instance_type: "A100",
  price: 10_000, // 100 USD in cents
  start_at: "2024-02-20T00:00:00Z",
  end_at: "2024-02-20T01:00:00Z", // 1 hour duration
  quantity: 1,
  flags: {
    market: false,
    post_only: false,
    ioc: false,
    prorate: false,
  },
  created_at: "2024-02-19T00:00:00Z",
  executed: false,
  cancelled: false,
  status: OrderStatus.Open,
};

Deno.test("orderDetails - calculates price per GPU hour correctly", () => {
  const result = orderDetails(baseOrder);
  // $100 / (1 quantity * 1 hour * GPUS_PER_NODE)
  const expectedPricePerGPUHour = 100 / (1 * 1 * GPUS_PER_NODE);
  assertEquals(result.pricePerGPUHour, expectedPricePerGPUHour);
});

Deno.test(
  "orderDetails - handles zero duration by using 1 hour minimum",
  () => {
    const zeroOrder = {
      ...baseOrder,
      start_at: "2024-02-20T00:00:00Z",
      end_at: "2024-02-20T00:00:00Z",
    };
    const result = orderDetails(zeroOrder);
    const expectedPricePerGPUHour = 100 / (1 * 1 * GPUS_PER_NODE);
    assertEquals(result.pricePerGPUHour, expectedPricePerGPUHour);
  },
);

Deno.test(
  "orderDetails - calculates executed price per GPU hour when available",
  () => {
    const executedOrder = {
      ...baseOrder,
      executed: true,
      execution_price: 8000, // 80 USD in cents
    };
    const result = orderDetails(executedOrder);
    const expectedExecutedPrice = 80 / (1 * 1 * GPUS_PER_NODE);
    assertEquals(result.executedPriceDollarsPerGPUHour, expectedExecutedPrice);
  },
);

Deno.test(
  "orderDetails - returns undefined for executedPriceDollarsPerGPUHour when no execution price",
  () => {
    const result = orderDetails(baseOrder);
    assertEquals(result.executedPriceDollarsPerGPUHour, undefined);
  },
);

Deno.test("orderDetails - formats duration correctly", () => {
  const result = orderDetails(baseOrder);
  assertEquals(result.durationFormatted, "1h"); // Assuming formatDuration returns "1h" for 1 hour
});

Deno.test("orderDetails - handles multiple nodes and longer duration", () => {
  const multiNodeOrder = {
    ...baseOrder,
    quantity: 2,
    end_at: "2024-02-20T03:00:00Z", // 3 hours duration
  };
  const result = orderDetails(multiNodeOrder);
  // $100 / (2 quantity * 3 hours * GPUS_PER_NODE)
  const expectedPricePerGPUHour = 100 / (2 * 3 * GPUS_PER_NODE);
  assertEquals(result.pricePerGPUHour, expectedPricePerGPUHour);
});
