import { Box, Text } from "ink";
import type { Nullable } from "../../types/empty";
import { centicentsToDollarsFormatted } from "../../helpers/units";
import Spinner from "ink-spinner";

export const SpendingPowerLabel = ({
  balance,
  loading,
}: { balance: Nullable<number>; loading: boolean }) => {
  if (loading) {
    return <Spinner type="dots" />;
  }

  if (balance === null || balance === undefined) {
    return <Text color="gray">$--.--</Text>;
  }

  const getBalanceColor = () => {
    if (balance === 0) {
      return "gray";
    }

    return "white";
  };
  const balanceColor = getBalanceColor();

  return (
    <Box>
      <Text color="gray">spending power </Text>
      <Text color={balanceColor}>{centicentsToDollarsFormatted(balance)}</Text>
    </Box>
  );
};
