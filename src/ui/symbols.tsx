import { Text } from "ink";

export const Check = <Text color="green">✓</Text>;
export const OpenCircle = ({
  color = "white",
  dimColor = false,
}: { color?: string; dimColor?: boolean }) => (
  <Text color={color} dimColor={dimColor}>
    ◯
  </Text>
);
