import { logAndQuit } from "../helpers/errors.ts";
import { GPUS_PER_NODE } from "./constants.ts";

export function parseAccelerators(accelerators: string, type: "buy" | "sell") {
  if (!accelerators) {
    return 1;
  }

  const parsedValue = Number.parseInt(accelerators, 10);
  if (!Number.isInteger(parsedValue / GPUS_PER_NODE)) {
    return logAndQuit(
      `You can only ${type} whole nodes, or multiples of ${GPUS_PER_NODE} GPUs at a time. Got: ${accelerators}`,
    );
  }
  return parsedValue;
}
