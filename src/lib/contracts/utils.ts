export type ContractState = "Upcoming" | "Active" | "Expired";
export type ContractRange = { startsAt: Date; endsAt: Date };

export function getContractRange(shape: {
  intervals: string[];
  quantities: number[];
}): ContractRange {
  const startsAt = new Date(shape.intervals[0]);
  const endsAt = new Date(shape.intervals[shape.intervals.length - 1]);
  return { startsAt, endsAt };
}

export function getContractAcceleratorQuantity(shape: {
  intervals: string[];
  quantities: number[];
}): number {
  return shape.quantities[0];
}

export function getContractState(shape: {
  intervals: string[];
  quantities: number[];
}): ContractState {
  const now = new Date();
  const { startsAt, endsAt } = getContractRange(shape);

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
