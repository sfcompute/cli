import { Badge } from "@inkjs/ui";
import { Box, Text } from "ink";
import { formatDateRange } from "little-date";
import ms from "ms";
// biome-ignore lint/style/useImportType: <explanation>
import * as React from "react";
import { Row } from "../Row.tsx";
import { GPUS_PER_NODE } from "../constants.ts";
import type { Contract } from "./types.ts";

interface IntervalData {
  /**
   * e.g. "1d" or "7w"
   */
  durationString: string;
  /**
   * e.g. "Jan 1 → Jan 2"
   */
  dateRangeLabel: string;
  /**
   * The number of GPUs in the interval.
   */
  quantity: number;
  instanceType: string;
  start: Date;
  end: Date;
  state: "Upcoming" | "Active" | "Expired";
}

function createIntervalData(
  shape: Contract["shape"],
  instanceType: string,
): IntervalData[] {
  const now = new Date();

  return shape.intervals.slice(0, -1).map((interval, index) => {
    const start = new Date(interval);
    const end = new Date(shape.intervals[index + 1]);
    const duration = end.getTime() - start.getTime();
    const state = start > now ? "Upcoming" : end < now ? "Expired" : "Active";

    return {
      dateRangeLabel: formatDateRange(start, end, { separator: "→" }),
      durationString: ms(duration),
      quantity: shape.quantities[index],
      instanceType,
      start,
      end,
      state,
    };
  });
}

function IntervalDisplay({ data }: { data: IntervalData }) {
  const isDimmed = data.state === "Expired";

  return (
    <Box gap={1}>
      <Box width={8} alignItems="flex-end">
        <Text dimColor={isDimmed}>{data.quantity * GPUS_PER_NODE} gpus</Text>
      </Box>
      <Text dimColor>│</Text>
      <Box gap={1}>
        <Text dimColor={isDimmed}>{data.dateRangeLabel}</Text>
      </Box>
      <Text dimColor>({data.durationString})</Text>
      <Text dimColor={isDimmed}>[{data.state}]</Text>
    </Box>
  );
}

const COLUMN_WIDTH = 12;

export function ContractDisplay(props: { contract: Contract }) {
  if (props.contract.status === "pending") {
    return null;
  }

  const startsAt = new Date(props.contract.shape.intervals[0]);
  const endsAt = new Date(
    props.contract.shape.intervals[props.contract.shape.intervals.length - 1],
  );
  const now = new Date();
  let color: React.ComponentProps<typeof Badge>["color"] | undefined;
  let statusIcon: React.ReactNode;
  if (startsAt > now) {
    statusIcon = <Badge color="green">Upcoming</Badge>;
    color = "green";
  } else if (endsAt < now) {
    color = "gray";
    statusIcon = <Badge color="gray">Expired</Badge>;
  } else {
    color = "cyan";
    statusIcon = <Badge color="cyan">Active</Badge>;
  }

  const intervalData = createIntervalData(
    props.contract.shape,
    props.contract.instance_type,
  );

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text>{statusIcon}</Text>
        <Text color={color}>{props.contract.id}</Text>
      </Box>
      <Box flexDirection="column" paddingTop={0.5}>
        <Row
          headWidth={COLUMN_WIDTH}
          head="Type"
          value={props.contract.instance_type}
        />
        {props.contract.colocate_with.length > 0 && (
          <Row
            headWidth={COLUMN_WIDTH}
            head="Colocate"
            value={props.contract.colocate_with.join(", ")}
          />
        )}

        <Box flexDirection="column">
          {intervalData.map((data, index) => {
            return (
              <Box
                key={`${index}-${data.quantity}`}
                paddingLeft={index === 0 ? 0 : COLUMN_WIDTH}
              >
                {index === 0 && (
                  <Box paddingRight={6}>
                    <Text dimColor>Orders</Text>
                  </Box>
                )}
                <IntervalDisplay
                  data={data}
                />
              </Box>
            );
          })}
        </Box>
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
    <Box flexDirection="column" gap={2} paddingBottom={1}>
      {props.contracts.map((contract) => (
        <ContractDisplay
          contract={contract}
          key={contract.id}
        />
      ))}
    </Box>
  );
}
