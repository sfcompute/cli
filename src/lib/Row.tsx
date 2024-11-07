import { Box, Text } from "ink";

export function Row(props: {
  head: string;
  value: string;
  headWidth?: number;
}) {
  return (
    <Box>
      <Box width={props.headWidth}>
        <Text dimColor>{props.head}</Text>
      </Box>
      <Text>{props.value}</Text>
    </Box>
  );
}
