import { useState } from "react";
import { Text, Box } from "ink";
import { InstanceType } from "../../api/instances";
import { getCommandBase } from "../../helpers/command";
import { COMMAND_CONTAINER_MAX_WIDTH } from "../../ui/dimensions";
import type { Nullable } from "../../types/empty";

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
  const commandBase = getCommandBase();
  const rootCommand = `${commandBase} buy`;

  return (
    <Box
      width={COMMAND_CONTAINER_MAX_WIDTH}
      flexDirection="column"
      marginTop={1}
      marginBottom={1}
      padding={1}
      borderColor="gray"
      borderStyle="double"
    >
      <Box width="100%" flexDirection="row" marginBottom={1}>
        <Box alignItems="flex-start">
          <Text color="gray">{rootCommand}</Text>
        </Box>
        <Box alignItems="flex-end">
          <Text color="gray">{rootCommand}</Text>
        </Box>
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

export default SFBuy;
