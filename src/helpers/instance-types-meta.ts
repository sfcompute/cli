export const InstanceTypeMetadata: Record<string, {
  displayName: string;
}> = {
  "h100i": {
    displayName: "Kubernetes",
  },
  "h100v": {
    displayName: "Virtual Machine",
  },
} as const;
