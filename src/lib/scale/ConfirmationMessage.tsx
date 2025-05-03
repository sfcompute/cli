import React from "react";
import { Box, Text } from "ink";

import { Row } from "../Row.tsx";
import { formatDuration } from "../orders/index.tsx";

import { MIN_CONTRACT_MINUTES } from "./utils.ts";

export default function ConfirmationMessage(props: {
  horizonMinutes?: number;
  pricePerGpuHourInCents?: number;
  accelerators?: number;
  type?: string;
  quote: boolean;
  update?: boolean;
}) {
  const horizonInMilliseconds = props.horizonMinutes
    ? Math.max(props.horizonMinutes, MIN_CONTRACT_MINUTES) * 60 * 1000
    : undefined;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color="green">↑</Text>
        <Text color="yellow">
          {props.update ? "update procurement" : "start GPUs"}
        </Text>
      </Box>
      <Row
        headWidth={30}
        head="Type"
        value={props.type ?? "unchanged"}
      />
      <Row
        headWidth={30}
        head="GPUs"
        value={props.accelerators !== undefined
          ? `${props.accelerators}`
          : "unchanged"}
      />
      <Row
        headWidth={30}
        head={`Limit Price${
          (props.quote && props.pricePerGpuHourInCents !== undefined)
            ? " (1.5 x market)"
            : ""
        }`}
        value={props.pricePerGpuHourInCents !== undefined
          ? `$${(props.pricePerGpuHourInCents / 100).toFixed(2)}/gpu/hr`
          : "unchanged"}
      />
      <Row
        headWidth={30}
        head="Horizon"
        value={horizonInMilliseconds
          ? formatDuration(horizonInMilliseconds)
          : "unchanged"}
      />
    </Box>
  );
}
