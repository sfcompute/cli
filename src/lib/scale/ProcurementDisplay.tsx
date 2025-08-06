import React from "react";
import { Box, Text } from "ink";
import { Badge } from "@inkjs/ui";

import { InstanceTypeMetadata } from "../../helpers/instance-types-meta.ts";

import { Row } from "../Row.tsx";
import { GPUS_PER_NODE } from "../constants.ts";
import { formatDuration } from "../orders/index.tsx";

import { formatColocationStrategy, Procurement } from "./utils.ts";

export function ProcurementHeader({
  id,
  quantity,
  status,
}: {
  id: string;
  quantity: number;
  status: "active" | "disabled";
}) {
  const isActive = quantity > 0 && status === "active";
  return (
    <Box gap={1}>
      <Box width={11}>
        {isActive ? (
          <Badge color="cyan">Active</Badge>
        ) : (
          <Badge color="gray">Disabled</Badge>
        )}
      </Box>
      <Box paddingLeft={0.1}>
        <Text color={isActive ? "cyan" : "gray"}>{id}</Text>
      </Box>
    </Box>
  );
}

export default function ProcurementDisplay({
  procurement: {
    id,
    instance_type,
    status,
    desired_quantity,
    buy_limit_price_per_gpu_hour,
    horizon,
    colocation_strategy,
  },
}: {
  procurement: Procurement;
}) {
  const horizonMinutes = horizon;
  const quantity = desired_quantity * GPUS_PER_NODE;
  const pricePerGpuHourInCents = buy_limit_price_per_gpu_hour;
  const isSupportedType = instance_type in InstanceTypeMetadata;
  const typeLabel = isSupportedType
    ? InstanceTypeMetadata[instance_type].displayName
    : instance_type;
  return (
    <Box flexDirection="column">
      <ProcurementHeader id={id} quantity={quantity} status={status} />
      <Box flexDirection="column" paddingTop={0.5}>
        <Row
          headWidth={15}
          head="Type"
          value={
            isSupportedType ? (
              <Box gap={1}>
                <Text>{typeLabel}</Text>
                <Text dimColor>({instance_type})</Text>
              </Box>
            ) : (
              instance_type
            )
          }
        />
        <Row headWidth={15} head="GPUs" value={String(quantity)} />
        <Row
          headWidth={15}
          head="Limit Price"
          value={`$${(pricePerGpuHourInCents / 100).toFixed(2)}/gpu/hr`}
        />
        <Row
          headWidth={15}
          head="Horizon"
          value={formatDuration(horizonMinutes * 60 * 1000)}
        />
        <Row
          headWidth={15}
          head="Colocation Strategy"
          value={formatColocationStrategy(colocation_strategy)}
        />
      </Box>
    </Box>
  );
}
