import { Text } from "ink";

export const Check = <Text color="green">✓</Text>;
export const OpenCircle = ({ color = "white" }: { color?: string }) => (
  <Text color={color}>◯</Text>
);
