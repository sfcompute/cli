import { useState } from "react";
import { Text, Box } from "ink";
import { InstanceType } from "../../api/instances";
import { CLICommand } from "../../helpers/commands";
import { COMMAND_CONTAINER_MAX_WIDTH } from "../../ui/dimensions";
import type { Nullable } from "../../types/empty";
import { SpendingPowerLabel } from "../../ui/lib/SpendingPowerLabel";
import { useBalance } from "../../api/hooks/useBalance";
import { Emails } from "../../helpers/urls";
import Spinner from "ink-spinner";
import {
  centicentsToDollarsFormatted,
  formatSecondsShort,
  type Centicents,
} from "../../helpers/units";
import { Check, OpenCircle } from "../../ui/symbols";
import SelectInput from "ink-select-input";
import { UTCLive } from "../../ui/lib/UTCLive";
import { useWebUrl } from "../../hooks/urls";
import dayjs from "dayjs";

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

  return (
    <Box width={COMMAND_CONTAINER_MAX_WIDTH} flexDirection="column" marginY={1}>
      <InfoBanner balance={balance} loadingBalance={loadingBalance} />
      <OrderInfoCollection
        instanceType={instanceType}
        totalNodes={totalNodes}
        durationSeconds={durationSeconds}
        startAtIso={startAtIso}
        setTotalNodes={setTotalNodes}
        setDurationSeconds={setDurationSeconds}
        setStartAtIso={setStartAtIso}
        noFunds={noFunds}
        showLoading={showOrderInfoCollectionLoading}
      />
    </Box>
  );
};

// --

const OrderInfoCollection = ({
  instanceType,
  totalNodes,
  durationSeconds,
  startAtIso,
  setTotalNodes,
  setDurationSeconds,
  setStartAtIso,
  noFunds,
  showLoading,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
  setTotalNodes: (totalNodes: number) => void;
  setDurationSeconds: (durationSeconds: number) => void;
  setStartAtIso: (startAtIso: string) => void;
  noFunds: boolean;
  showLoading: boolean;
}) => {
  const {
    isSelectingTotalNodes,
    isSelectingDurationSeconds,
    isSelectingStartAtIso,
    allStepsComplete,
  } = useSteps({
    instanceType,
    totalNodes,
    durationSeconds,
    startAtIso,
  });

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

  const borderColor = !allStepsComplete ? "white" : "gray";

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
        <Box>
          <UTCLive color="gray" />
        </Box>
      </Box>
      <SelectInstanceType instanceType={instanceType} />
      <SelectTotalNodes
        totalNodes={totalNodes}
        setTotalNodes={setTotalNodes}
        selectionInProgress={isSelectingTotalNodes}
      />
      <SelectDuration
        durationSeconds={durationSeconds}
        setDurationSeconds={setDurationSeconds}
        selectionInProgress={isSelectingDurationSeconds}
      />
      <SelectStartAt
        startAtIso={startAtIso}
        setStartAtIso={setStartAtIso}
        selectionInProgress={isSelectingStartAtIso}
      />
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
        <Text color="green">✓</Text> Instance Type
        <Text color="gray" dimColor>
          {"  "}
          ~~~~~~~~{"  "}
        </Text>
        <Text color="gray">{label}</Text>
      </Text>
    </Box>
  );
};

const SelectTotalNodes = ({
  totalNodes,
  setTotalNodes,
  selectionInProgress,
}: {
  totalNodes: Nullable<number>;
  setTotalNodes: (totalNodes: number) => void;
  selectionInProgress: boolean;
}) => {
  const totalNodesSet = totalNodes !== null && totalNodes !== undefined;
  const StatusSymbol = totalNodesSet ? (
    Check
  ) : (
    <OpenCircle color="gray" dimColor={!selectionInProgress} />
  );

  const Label = () => {
    if (!totalNodesSet) {
      if (!selectionInProgress) {
        return (
          <Text color="gray" dimColor>
            Select Total Nodes
          </Text>
        );
      } else {
        return <Text color="magenta">Select Total Nodes</Text>;
      }
    }

    return (
      <Text>
        Total Nodes
        <Text color="gray" dimColor>
          {"  "}
          ~~~~~~~~~~{"  "}
        </Text>
        <Text color="gray">{totalNodes}</Text>
      </Text>
    );
  };

  const items = [1, 2].map((v) => ({
    label: v.toString(),
    value: v,
  }));
  const handleSelect = ({ value }: { label: string; value: number }) => {
    setTotalNodes(value);
  };

  return (
    <Box flexDirection="column">
      <Text>
        {StatusSymbol} <Label />
      </Text>
      {selectionInProgress && (
        <SelectInput items={items} isFocused onSelect={handleSelect} />
      )}
    </Box>
  );
};

const SelectDuration = ({
  durationSeconds,
  setDurationSeconds,
  selectionInProgress,
}: {
  durationSeconds: Nullable<number>;
  setDurationSeconds: (durationSeconds: number) => void;
  selectionInProgress: boolean;
}) => {
  const durationSecondsSet =
    durationSeconds !== null && durationSeconds !== undefined;
  const StatusSymbol = durationSecondsSet ? (
    Check
  ) : (
    <OpenCircle color="gray" dimColor={!selectionInProgress} />
  );

  const Label = () => {
    if (!durationSecondsSet) {
      if (!selectionInProgress) {
        return (
          <Text color="gray" dimColor>
            Select Duration
          </Text>
        );
      } else {
        return <Text color="magenta">Select Duration</Text>;
      }
    }

    return (
      <Text>
        Duration
        <Text color="gray" dimColor>
          {"  "}
          ~~~~~~~~~~~~~{"  "}
        </Text>
        <Text color="gray">{formatSecondsShort(durationSeconds)}</Text>
      </Text>
    );
  };

  const items = [
    ["1 hr", 60 * 60],
    ["2 hr", 2 * 60 * 60],
    ["3 hr", 3 * 60 * 60],
    ["4 hr", 4 * 60 * 60],
    ["5 hr", 5 * 60 * 60],
    ["6 hr", 6 * 60 * 60],
  ].map(([label, value]) => ({
    label: label as string,
    value: value as number,
  }));
  const handleSelect = ({ value }: { label: string; value: number }) => {
    setDurationSeconds(value);
  };

  return (
    <Box flexDirection="column">
      <Text>
        {StatusSymbol} <Label />
      </Text>
      {selectionInProgress && (
        <SelectInput items={items} isFocused onSelect={handleSelect} />
      )}
    </Box>
  );
};

const SelectStartAt = ({
  startAtIso,
  setStartAtIso,
  selectionInProgress,
}: {
  startAtIso: Nullable<string>;
  setStartAtIso: (startAtIso: string) => void;
  selectionInProgress: boolean;
}) => {
  const startAtIsoSet = startAtIso !== null && startAtIso !== undefined;
  const StatusSymbol = startAtIsoSet ? (
    Check
  ) : (
    <OpenCircle color="gray" dimColor={!selectionInProgress} />
  );

  const Label = () => {
    if (!startAtIsoSet) {
      if (!selectionInProgress) {
        return (
          <Text color="gray" dimColor>
            Select Start Time
          </Text>
        );
      } else {
        return <Text color="magenta">Select Start Time</Text>;
      }
    }

    return (
      <Text>
        Start Time
        <Text color="gray" dimColor>
          {"  "}
          ~~~~~~~~~~~{"  "}
        </Text>
        <Text color="gray">
          {dayjs(startAtIso).format("MM/DD/YYYY hh:mm A")}
        </Text>
      </Text>
    );
  };

  const items = Array(18)
    .fill(0)
    .map((_, i) => {
      const offset = i + 1; // start on next hour

      const date = dayjs().add(offset, "hour").startOf("hour");
      return {
        label: date.format("ddd h A"),
        value: date.toISOString(),
      };
    });
  const handleSelect = ({ value }: { label: string; value: string }) => {
    setStartAtIso(value);
  };

  return (
    <Box flexDirection="column">
      <Text>
        {StatusSymbol} <Label />
      </Text>
      {selectionInProgress && (
        <SelectInput items={items} isFocused onSelect={handleSelect} />
      )}
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
  const { stepsComplete, totalSteps, allStepsComplete } = useSteps({
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
const useSteps = ({
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

  const isSelectingInstanceType = !instanceTypeSet;
  const isSelectingTotalNodes = instanceTypeSet && !totalNodesSet;
  const isSelectingDurationSeconds =
    instanceTypeSet && totalNodesSet && !durationSecondsSet;
  const isSelectingStartAtIso =
    instanceTypeSet && totalNodesSet && durationSecondsSet && !startAtIsoSet;

  return {
    stepsComplete,
    totalSteps: 4,
    allStepsComplete,

    isSelectingInstanceType,
    isSelectingTotalNodes,
    isSelectingDurationSeconds,
    isSelectingStartAtIso,
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
