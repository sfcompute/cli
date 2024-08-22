import { useEffect, useState } from "react";
import { Text, Box } from "ink";
import { InstanceType } from "../../api/instances";
import { CLICommand } from "../../helpers/commands";
import { COMMAND_CONTAINER_MAX_WIDTH } from "../../ui/dimensions";
import type { Nullable } from "../../types/empty";
import { getBalance } from "../../api/balance";
import {
  centicentsToDollarsFormatted,
  centicentsToWhole,
} from "../../helpers/units";

type SFBuyProps = {
  light: string;
};

const SFBuy: React.FC<SFBuyProps> = () => {
  const [instanceType, _] = useState<InstanceType>(InstanceType.H100i);
  const [totalNodes, setTotalNodes] = useState<Nullable<number>>(0);

  return (
    <Box width={COMMAND_CONTAINER_MAX_WIDTH}>
      <InfoBanner />
    </Box>
  );
};

const InfoBanner = () => {
  return (
    <Box
      width={COMMAND_CONTAINER_MAX_WIDTH}
      flexDirection="column"
      marginTop={1}
      marginBottom={1}
      paddingX={2}
      paddingY={1}
      borderColor="gray"
      borderStyle="double"
    >
      <Box
        width="100%"
        flexDirection="row"
        justifyContent="space-between"
        marginBottom={1}
      >
        <Box alignItems="flex-start">
          <Text color="gray">{CLICommand.Buy}</Text>
        </Box>
        <AvailableBalance />
      </Box>
      <Box alignItems="flex-start">
        <Text>
          This is a compute marketplace. You are about to submit a{" "}
          <Text color="green">buy</Text> order. Compute is not granted
          immediately, instead, we try our best to get it for you, at the{" "}
          <Text color="green">lowest</Text> price possible, as{" "}
          <Text color="green">soon</Text> as possible.
        </Text>
      </Box>
    </Box>
  );
};

const AvailableBalance = () => {
  const [balance, setBalance] = useState<Nullable<number>>(0);
  const [fetching, setFetching] = useState<boolean>(false);
  useEffect(() => {
    setFetching(true);

    getBalance().then(({ data }) => {
      if (data) {
        setBalance(centicentsToWhole(data.available.amount));
      }

      setFetching(false);
    });
  }, []);
  return <AvailableBalanceLabel balance={balance} loading={fetching} />;
};
const AvailableBalanceLabel = ({
  balance,
  loading,
}: { balance: Nullable<number>; loading: boolean }) => {
  if (loading) {
    return <Text color="gray">(loading balance)</Text>;
  }

  if (!balance) {
    return <Text color="gray">$--.--</Text>;
  }

  const getBalanceColor = () => {
    if (balance === 0) {
      return "white";
    }

    return "green";
  };
  const balanceColor = getBalanceColor();

  return (
    <Box>
      <Text color="gray">spending power: </Text>
      <Text color={balanceColor}>{centicentsToDollarsFormatted(balance)}</Text>
    </Box>
  );
};

export default SFBuy;
