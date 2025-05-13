import { Box, Text } from "ink";
import React from "react";

export function Row({
  head,
  value,
  headWidth,
}: {
  head: string;
  value: string | React.ReactNode;
  headWidth?: number;
}) {
  const valueIsString = typeof value === "string";
  return (
    <Box>
      <Box width={headWidth}>
        <Text dimColor>{head}</Text>
      </Box>
      {valueIsString ? <Text>{value}</Text> : value}
    </Box>
  );
}
