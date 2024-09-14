export function pricePerGPUHourToTotalPrice(
  pricePerGPUHourInCenticents: number,
  durationSeconds: number,
  nodes: number,
  gpusPerNode: number,
) {
  return Math.ceil(
    ((pricePerGPUHourInCenticents * durationSeconds) / 3600) *
      nodes *
      gpusPerNode,
  );
}

export function totalPriceToPricePerGPUHour(
  totalPriceInCenticents: number,
  durationSeconds: number,
  nodes: number,
  gpusPerNode: number,
) {
  return (
    totalPriceInCenticents / nodes / gpusPerNode / (durationSeconds / 3600)
  );
}
