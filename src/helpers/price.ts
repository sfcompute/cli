import type { Cents } from "./units";

export function pricePerGPUHourToTotalPriceCents(
  pricePerGPUHourCents: Cents,
  durationSeconds: number,
  nodes: number,
  gpusPerNode: number,
): Cents {
  const totalGPUs = nodes * gpusPerNode;
  const totalHours = durationSeconds / 3600;

  return Math.ceil(pricePerGPUHourCents * totalGPUs * totalHours);
}

export function totalPriceToPricePerGPUHour(
  priceCents: number,
  durationSeconds: number,
  nodes: number,
  gpusPerNode: number,
): Cents {
  const totalGPUs = nodes * gpusPerNode;
  const totalHours = durationSeconds / 3600;

  return priceCents / totalGPUs / totalHours;
}
