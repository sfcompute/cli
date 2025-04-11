import { Badge } from "@inkjs/ui";
import { Box, Text } from "ink";
import { formatDateRange } from "little-date";
import ms from "ms";
import * as React from "react";
import { Row } from "../Row.tsx";
import { GPUS_PER_NODE } from "../constants.ts";
import type { ActiveContract, Contract } from "./types.ts";
import {
  type ContractState,
  getContractState,
  getContractStateColor,
} from "./utils.ts";

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
  state: ContractState;
}

export function createIntervalData(
  shape: ActiveContract["shape"],
  instanceType: string
): IntervalData[] {
  return shape.intervals.slice(0, -1).map((interval, index) => {
    const start = new Date(interval);
    const end = new Date(shape.intervals[index + 1]);
    const duration = end.getTime() - start.getTime();

    return {
      dateRangeLabel: formatDateRange(start, end, { separator: "→" }),
      durationString: ms(duration),
      quantity: shape.quantities[index],
      instanceType,
      start,
      end,
      state: getContractState({
        intervals: [interval, shape.intervals[index + 1]],
        quantities: [],
      }),
    };
  });
}

export function IntervalDisplay({ data }: { data: IntervalData }) {
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

  const state = getContractState(props.contract.shape);
  const color = getContractStateColor(state);
  const statusIcon = <Badge color={color}>{state}</Badge>;

  const intervalData = createIntervalData(
    props.contract.shape,
    props.contract.instance_type
  );

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Box width={11}>
          <Text>{statusIcon}</Text>
        </Box>
        <Box paddingLeft={0.1}>
          <Text color={color}>{props.contract.id}</Text>
        </Box>
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
                <IntervalDisplay data={data} />
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
        <Text>No active or upcoming contracts found.</Text>

        <Box paddingLeft={4} flexDirection="column">
          <Text dimColor># To show expired contracts</Text>
          <Text color="yellow">sf contracts ls --all</Text>
        </Box>

        <Box paddingLeft={4} flexDirection="column">
          <Text dimColor># Place a buy order to get started</Text>
          <Text color="yellow">sf buy</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={2} paddingBottom={1}>
      {props.contracts.map(contract => (
        <ContractDisplay contract={contract} key={contract.id} />
      ))}
    </Box>
  );
}
