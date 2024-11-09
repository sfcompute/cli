import { Box, Text } from "ink";
import type { Contract } from "./types.ts";
import { Row } from "../Row.tsx";
import dayjs from "npm:dayjs@1.11.13";
import ms from "ms";
import React from 'react';

const STARTED = "▶";
const UPCOMING = "⏸";

export function ContractDisplay(props: { contract: Contract }) {
  if (props.contract.status === "pending") {
    return null;
  }

  const startsAt = new Date(props.contract.shape.intervals[0]);
  const statusIcon = startsAt < new Date() ? STARTED : UPCOMING;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text>{statusIcon}</Text>
        <Text color={"yellow"}>{props.contract.id}</Text>
      </Box>
      <Row headWidth={6} head="type" value={props.contract.instance_type} />
      <Row
        headWidth={6}
        head="colo"
        value={props.contract.colocate_with.length > 0
          ? props.contract.colocate_with.join(", ")
          : "-"}
      />

      <Box paddingY={1} paddingLeft={2} flexDirection="column">
        {props.contract.shape.intervals.slice(0, -1).map((interval) => {
          const start = new Date(interval);
          const next = new Date(
            props.contract.shape
              .intervals[props.contract.shape.intervals.indexOf(interval) + 1],
          );

          const duration = next.getTime() - start.getTime();
          const startString = dayjs(start).format("MMM D h:mm a").toLowerCase();
          const nextString = dayjs(next).format("MMM D h:mm a").toLowerCase();
          const durationString = ms(duration);

          const quantity = props.contract.shape
            .quantities[props.contract.shape.intervals.indexOf(interval)];

          return (
            <Box key={interval} gap={1}>
              <Box width={10}>
                <Text>{quantity} x {props.contract.instance_type}</Text>
              </Box>
              <Text dimColor>│</Text>
              <Box gap={1}>
                <Text>{startString}</Text>
                <Text>→</Text>
                <Text>{nextString}</Text>
              </Box>
              <Text>({durationString})</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export function ContractList(props: { contracts: Contract[] }) {
  if (props.contracts.length === 0) {
    return (
      <Box flexDirection="column" gap={1} paddingBottom={1}>
        <Text>No contracts found.</Text>

        <Box paddingLeft={4} flexDirection="column">
          <Text dimColor># Place a buy order to get started</Text>
          <Text color="yellow">sf buy</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1} paddingBottom={1}>
      {props.contracts.map((contract) => (
        <ContractDisplay contract={contract} key={contract.id} />
      ))}
    </Box>
  );
}
