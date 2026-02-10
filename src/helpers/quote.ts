import dayjs from "dayjs";
import { apiClient } from "../apiClient.ts";
import { GPUS_PER_NODE } from "../lib/constants.ts";
import { logAndQuit, logSessionTokenExpiredAndQuit } from "./errors.ts";
import { parseStartDateOrNow, roundDateUpToNextMinute } from "./units.ts";

export function getPricePerGpuHourFromQuote(
  quote: Pick<NonNullable<Quote>, "start_at" | "end_at" | "price" | "quantity">,
) {
  const startTimeOrNow = parseStartDateOrNow(quote.start_at);

  // from the market's perspective, "NOW" means at the beginning of the next minute.
  // when the order duration is very short, this can cause the rate to be computed incorrectly
  // if we implicitly assume it to mean `new Date()`.
  const coercedStartTime =
    startTimeOrNow === "NOW"
      ? roundDateUpToNextMinute(new Date())
      : startTimeOrNow;
  const durationSeconds = dayjs(quote.end_at).diff(dayjs(coercedStartTime));
  const durationHours = durationSeconds / 3600 / 1000;

  return quote.price / GPUS_PER_NODE / quote.quantity / durationHours;
}

type QuoteOptions = {
  instanceType?: string;
  quantity: number;
  minStartTime: Date | "NOW";
  maxStartTime: Date | "NOW";
  minDurationSeconds: number;
  maxDurationSeconds: number;
  cluster?: string;
  colocateWith?: string;
};

export async function getQuote(options: QuoteOptions) {
  const api = await apiClient();

  const params = {
    query: {
      side: "buy",
      instance_type: options.instanceType,
      quantity: options.quantity,
      min_start_date:
        options.minStartTime === "NOW"
          ? ("NOW" as const)
          : options.minStartTime.toISOString(),
      max_start_date:
        options.maxStartTime === "NOW"
          ? ("NOW" as const)
          : options.maxStartTime.toISOString(),
      min_duration: options.minDurationSeconds,
      max_duration: options.maxDurationSeconds,
      cluster: options.cluster,
      colocate_with: options.colocateWith,
    },
  } as const;

  const { data, error, response } = await api.GET("/v0/quote", {
    params,
    // timeout after 600 seconds
    signal: AbortSignal.timeout(600 * 1000),
  });

  if (!response.ok) {
    switch (response.status) {
      case 400:
        return logAndQuit(`Bad Request: ${JSON.stringify(error, null, 2)}`);
      case 401:
        return await logSessionTokenExpiredAndQuit();
      case 500:
        return logAndQuit(
          `Failed to get quote: ${JSON.stringify(error, null, 2)}`,
        );
      default:
        return logAndQuit(`Failed to get quote: ${response.statusText}`);
    }
  }

  if (!data) {
    return logAndQuit(
      `Failed to get quote: Unexpected response from server: ${response}`,
    );
  }

  if (!data.quote) {
    return null;
  }

  return {
    ...data.quote,
    price: Number(data.quote.price),
    quantity: Number(data.quote.quantity),
    start_at: data.quote.start_at,
    end_at: data.quote.end_at,
  };
}

export type Quote =
  | {
      price: number;
      quantity: number;
      start_at: string;
      end_at: string;
      instance_type: string;
      zone?: string;
    }
  | {
      price: number;
      quantity: number;
      start_at: string;
      end_at: string;
      contract_id: string;
      zone?: string;
    }
  | null;
