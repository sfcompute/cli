import React from "react";
import { Box, Text } from "ink";

import { InstanceTypeMetadata } from "../../helpers/instance-types-meta.ts";

import { Row } from "../Row.tsx";
import { formatDuration } from "../orders/index.tsx";

import {
  formatColocationStrategy,
  MIN_CONTRACT_MINUTES,
  Procurement,
} from "./utils.ts";

export default function ConfirmationMessage(props: {
  horizonMinutes?: number;
  pricePerGpuHourInCents?: number;
  accelerators?: number;
  type?: string;
  quote: boolean;
  update?: boolean;
  colocationStrategy?: Procurement["colocation_strategy"];
}) {
  const horizonInMilliseconds = props.horizonMinutes
    ? Math.max(props.horizonMinutes, MIN_CONTRACT_MINUTES) * 60 * 1000
    : undefined;
  const isSupportedType = typeof props.type === "string" &&
    props.type in InstanceTypeMetadata;
  const typeLabel = isSupportedType
    ? InstanceTypeMetadata[props.type!].displayName
    : props.type;
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
        value={isSupportedType
          ? (
            <Box gap={1}>
              <Text>{typeLabel}</Text>
              <Text dimColor>
                ({props.type})
              </Text>
            </Box>
          )
          : props.type}
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
      {props.colocationStrategy && (
        <Row
          headWidth={30}
          head="Colocation Strategy"
          value={formatColocationStrategy(props.colocationStrategy)}
        />
      )}
    </Box>
  );
}
