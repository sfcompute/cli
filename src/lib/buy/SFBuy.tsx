import { useState } from "react";
import { Text, Box } from "ink";
import { InstanceType } from "../../api/instances";
import { CLICommand } from "../../helpers/commands";
import { COMMAND_CONTAINER_MAX_WIDTH } from "../../ui/dimensions";
import type { Nullable } from "../../types/empty";
import { SpendingPowerLabel } from "../../ui/lib/SpendingPowerLabel";
import { useBalance } from "../../api/hooks/useBalance";
import { Emails } from "../../helpers/urls";
import { useWebUrl } from "../../hooks/urls";
import Spinner from "ink-spinner";
import {
  centicentsToDollarsFormatted,
  type Centicents,
} from "../../helpers/units";
import { Check, OpenCircle } from "../../ui/symbols";
import SelectInput from "ink-select-input";

type SFBuyProps = {
  placeholder: string;
};

const SFBuy: React.FC<SFBuyProps> = () => {
  const [orderPlaced, setOrderPlaced] = useState<boolean>(false);
  const [orderId, setOrderId] = useState<Nullable<string>>(null);

  const [instanceType, _] = useState<InstanceType>(InstanceType.H100i);
  const [totalNodes, setTotalNodes] = useState<Nullable<number>>(null);
  const [durationSeconds, setDurationSeconds] =
    useState<Nullable<number>>(null);
  const [startAtIso, setStartAtIso] = useState<Nullable<string>>(null);

  const { balance, loadingBalance } = useBalance();

  const noFunds = balance !== null && balance !== undefined && balance === 0;
  const showOrderInfoCollectionLoading = loadingBalance;

  const { allStepsComplete } = useTotalSteps({
    instanceType,
    totalNodes,
    durationSeconds,
    startAtIso,
  });

  return (
    <Box width={COMMAND_CONTAINER_MAX_WIDTH} flexDirection="column" marginY={1}>
      <InfoBanner balance={balance} loadingBalance={loadingBalance} />
      <OrderInfoCollection
        instanceType={instanceType}
        totalNodes={totalNodes}
        setTotalNodes={setTotalNodes}
        durationSeconds={durationSeconds}
        setDurationSeconds={setDurationSeconds}
        startAtIso={startAtIso}
        setStartAtIso={setStartAtIso}
        noFunds={noFunds}
        showLoading={showOrderInfoCollectionLoading}
        isFocused={!allStepsComplete}
      />
    </Box>
  );
};

// --

const OrderInfoCollection = ({
  instanceType,
  totalNodes,
  setTotalNodes,
  durationSeconds,
  startAtIso,
  noFunds,
  showLoading,
  isFocused,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  setTotalNodes: (totalNodes: number) => void;
  durationSeconds: Nullable<number>;
  setDurationSeconds: (durationSeconds: number) => void;
  startAtIso: Nullable<string>;
  setStartAtIso: (startAtIso: string) => void;
  noFunds: boolean;
  showLoading: boolean;
  isFocused: boolean;
}) => {
  if (showLoading) {
    return (
      <Box marginTop={1}>
        <Spinner type="dots" />
      </Box>
    );
  }
  if (noFunds) {
    return <AddFundsGoToWebsite />;
  }

  const borderColor = isFocused ? "white" : "gray";

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingX={2}
      paddingY={1}
      borderColor={borderColor}
      borderStyle="single"
    >
      <Box flexDirection="row" width="100%" justifyContent="space-between">
        <LiveQuote />
        <Box>{/* <UTCLive color="gray" /> */}</Box>
      </Box>
      <SelectInstanceType instanceType={instanceType} />
      <SelectTotalNodes totalNodes={totalNodes} setTotalNodes={setTotalNodes} />
      <Box flexDirection="row" justifyContent="flex-end" marginTop={1}>
        <TotalStepsCompleteLabel
          instanceType={instanceType}
          totalNodes={totalNodes}
          durationSeconds={durationSeconds}
          startAtIso={startAtIso}
        />
      </Box>
    </Box>
  );
};

const instanceTypeToLabel = (instanceType: Nullable<InstanceType>): string => {
  if (instanceType === InstanceType.H100i) {
    return "8x H100 InfiniBand";
  }

  return "";
};
const SelectInstanceType = ({
  instanceType,
}: {
  instanceType: Nullable<InstanceType>;
}) => {
  const label = instanceTypeToLabel(instanceType);

  return (
    <Box marginTop={1}>
      <Text>
        <Text color="green">✓</Text> Instance Type{" "}
        <Text color="gray">{label}</Text>
      </Text>
    </Box>
  );
};

const SelectTotalNodes = ({
  totalNodes,
  setTotalNodes,
}: {
  totalNodes: Nullable<number>;
  setTotalNodes: (totalNodes: number) => void;
}) => {
  const totalNodesSet = totalNodes !== null && totalNodes !== undefined;
  const StatusSymbol = totalNodesSet ? Check : <OpenCircle color="gray" />;

  const HeaderLabel = totalNodesSet ? (
    <Text>
      Total Nodes <Text color="gray">{totalNodes}</Text>
    </Text>
  ) : (
    <Text color="magenta">Select Total Nodes</Text>
  );

  const handleSelect = ({ value }: { label: string; value: number }) => {
    setTotalNodes(value);
  };

  return (
    <Box flexDirection="column">
      <Text>
        {StatusSymbol} {HeaderLabel}
      </Text>
      <SelectInput
        items={[
          {
            label: "1",
            value: 1,
          },
          {
            label: "2",
            value: 2,
          },
        ]}
        isFocused
        onSelect={handleSelect}
      />
    </Box>
  );
};

const TotalStepsCompleteLabel = ({
  instanceType,
  totalNodes,
  durationSeconds,
  startAtIso,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
}) => {
  const { stepsComplete, totalSteps, allStepsComplete } = useTotalSteps({
    instanceType,
    totalNodes,
    durationSeconds,
    startAtIso,
  });

  const ratioLabelColor = allStepsComplete ? "green" : "white";

  return (
    <Text>
      <Text color={ratioLabelColor}>
        {stepsComplete}/{totalSteps}
      </Text>{" "}
      complete
    </Text>
  );
};
const useTotalSteps = ({
  instanceType,
  totalNodes,
  durationSeconds,
  startAtIso,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
}) => {
  const instanceTypeSet = instanceType !== null && instanceType !== undefined;
  const totalNodesSet = totalNodes !== null && totalNodes !== undefined;
  const durationSecondsSet =
    durationSeconds !== null && durationSeconds !== undefined;
  const startAtIsoSet = startAtIso !== null && startAtIso !== undefined;

  const stepsComplete = [
    instanceTypeSet,
    totalNodesSet,
    durationSecondsSet,
    startAtIsoSet,
  ].filter(Boolean).length;
  const allStepsComplete =
    instanceTypeSet && totalNodesSet && durationSecondsSet && startAtIsoSet;

  return {
    stepsComplete,
    totalSteps: 4,
    allStepsComplete,
  };
};

const LiveQuote = () => {
  const [quotePrice, setQuotePrice] = useState<Nullable<Centicents>>(null);
  const [loadingQuotePrice, setLoadingQuotePrice] = useState<boolean>(false);

  const QuoteLabel = () => {
    if (loadingQuotePrice) {
      return <Spinner type="dots" />;
    }
    if (quotePrice === null || quotePrice === undefined) {
      return (
        <Text color="gray" dimColor>
          (quote unavailable)
        </Text>
      );
    }

    return (
      <Text color="green">{centicentsToDollarsFormatted(quotePrice)}</Text>
    );
  };

  return (
    <Box flexDirection="row">
      <Text color="gray">estimated cost </Text>
      <QuoteLabel />
    </Box>
  );
};

const AddFundsGoToWebsite = () => {
  const dashboardUrl = useWebUrl("dashboard") ?? "";

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingX={2}
      paddingY={1}
      borderColor="white"
      borderStyle="single"
    >
      <Box>
        <Text>
          <Text bold>You have no funds to spend.</Text> Add funds to your
          account by visiting your dashboard: {dashboardUrl}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text color="gray">or,</Text> you can contact us at{" "}
          <Text bold>{Emails.Contact}</Text> 🌁
        </Text>
      </Box>
    </Box>
  );
};

// --

const InfoBanner = ({
  balance,
  loadingBalance,
}: { balance: Nullable<number>; loadingBalance: boolean }) => {
  return (
    <Box
      width={COMMAND_CONTAINER_MAX_WIDTH}
      flexDirection="column"
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
        <Box>
          <Text color="gray">{CLICommand.Buy}</Text>
        </Box>
        <SpendingPowerLabel balance={balance} loading={loadingBalance} />
      </Box>
      <Box marginBottom={1}>
        <Text>
          This is a compute marketplace. You are about to submit a{" "}
          <Text color="green">buy</Text> order. Compute is not granted
          immediately, instead, we try our best to get it for you at the{" "}
          <Text color="green">lowest</Text> price possible, as{" "}
          <Text color="green">soon</Text> as possible.
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text>Once a buy order is submitted, 1 of 3 things can happen:</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            — it can get <Text color="green">filled</Text>{" "}
            <Text color="gray">(you get the compute you requested)</Text>
          </Text>
          <Text>
            — you can <Text color="red">cancel</Text> it
          </Text>
          <Text>
            — <Text color="gray">or,</Text> the order can{" "}
            <Text color="yellow">expire</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default SFBuy;
