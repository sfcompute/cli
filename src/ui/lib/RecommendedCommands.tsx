import { Box } from "ink";
import type React from "react";

interface Props {
  items: Array<{
    Label: React.ReactNode;
    Command: React.ReactNode;
  }>;
  commandColumnWidth?: number;
}

export const RecommendedCommands: React.FC<Props> = ({
  items = [],
  commandColumnWidth = 20,
}) => {
  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        return (
          <Box key={i} flexDirection="row">
            <Box width={commandColumnWidth}>{item.Label}</Box>
            <Box>{item.Command}</Box>
          </Box>
        );
      })}
    </Box>
  );
};
