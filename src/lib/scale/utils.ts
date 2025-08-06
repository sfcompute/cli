import parseDuration from "parse-duration";

import { logAndQuit } from "../../helpers/errors.ts";
import { dollarsToCents } from "../../helpers/units.ts";
import { apiClient } from "../../apiClient.ts";
import type { paths } from "../../schema.ts";

import { GPUS_PER_NODE } from "../constants.ts";
export type Procurement =
  paths["/v0/procurements"]["get"]["responses"]["200"]["content"]["application/json"]["data"][number];
export type ColocationStrategyName = Procurement["colocation_strategy"]["type"];

export const DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS = 265 as const; // Example default price
export const MIN_CONTRACT_MINUTES = 60 as const; // Minimum contract size is 1 hour
export const DEFAULT_LIMIT_PRICE_MULTIPLIER = 1.5 as const;

export function parseIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map(id => id.trim())));
}

export function parsePriceArg(price: string) {
  const parsedPrice = Number.parseFloat(price);
  if (Number.isNaN(parsedPrice)) {
    logAndQuit(`Failed to parse price: ${price}`);
  }
  return dollarsToCents(parsedPrice);
}

export function parseHorizonToMinutes(horizon: string) {
  const parsedHorizon = parseDuration(horizon, "m");
  if (!parsedHorizon) {
    logAndQuit(`Failed to parse horizon: ${horizon}`);
  }
  return Math.ceil(parsedHorizon);
}

export function parseHorizonArg(horizon: string) {
  const parsedHorizon = parseDuration(horizon, "m");
  if (!parsedHorizon) {
    logAndQuit(`Failed to parse horizon: ${horizon}`);
  }
  if (parsedHorizon < 1) {
    logAndQuit(`Minimum horizon is 1 minute`);
  }
  return Math.ceil(parsedHorizon);
}

export function parseAccelerators(accelerators: string) {
  const parsedAccelerators = Number.parseInt(accelerators);
  if (parsedAccelerators % GPUS_PER_NODE !== 0) {
    logAndQuit(`Only multiples of ${GPUS_PER_NODE} GPUs are allowed.`);
  }

  return parsedAccelerators;
}

export function acceleratorsToNodes(accelerators: number) {
  return Math.floor(accelerators / GPUS_PER_NODE);
}

export async function getProcurement({ id }: { id: string }) {
  const client = await apiClient();
  const res = await client.GET("/v0/procurements/{id}", {
    params: { path: { id: id } },
  });

  if (!res.response.ok) {
    throw new Error(res.error?.message || "Failed to get procurement");
  }

  return res.data ?? null;
}

export function formatColocationStrategy(
  colocationStrategy: Procurement["colocation_strategy"]
) {
  if (colocationStrategy.type === "pinned") {
    return `pinned (${colocationStrategy.cluster_name})`;
  }
  return colocationStrategy.type;
}
