import type { ActiveContract } from "./types.ts";

export type ContractState = "Upcoming" | "Active" | "Expired";

export function getContractState(contract: ActiveContract): ContractState {
  const now = new Date();
  const startsAt = new Date(contract.shape.intervals[0]);
  const endsAt = new Date(
    contract.shape.intervals[contract.shape.intervals.length - 1],
  );

  if (startsAt > now) {
    return "Upcoming";
  }

  if (endsAt < now) {
    return "Expired";
  }
  return "Active";
}

export function getContractStateColor(
  state: ContractState,
): "green" | "gray" | "cyan" {
  switch (state) {
    case "Upcoming":
      return "green";
    case "Expired":
      return "gray";
    case "Active":
      return "cyan";
  }
}
