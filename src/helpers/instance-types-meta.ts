export const InstanceTypeMetadata: Record<string, {
  displayName: string;
}> = {
  "h100i": {
    displayName: "Kubernetes",
  },
  "h100v": {
    displayName: "Virtual Machine",
  },
  "h200ki": {
    displayName: "Kubernetes",
  },
} as const;
