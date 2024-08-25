import type { Nullable } from "../helpers/empty";

export enum InstanceType {
  H100i = "h100i",
}
export const instanceTypeToLabel = (
  instanceType: Nullable<InstanceType>,
): string => {
  if (instanceType === InstanceType.H100i) {
    return "8x H100 InfiniBand";
  }

  return "";
};
