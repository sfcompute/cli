import { useEffect, useState } from "react";
import { Text, Box, useInput } from "ink";
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
  priceWholeToCenticents,
  totalSignificantDecimals,
  type Centicents,
} from "../../helpers/units";
import { Check, OpenCircle } from "../../ui/symbols";
import SelectInput from "ink-select-input";
import { UTCLive } from "../../ui/lib/UTCLive";
import { useWebUrl } from "../../hooks/urls";
import dayjs from "dayjs";
import { quoteBuyOrderRequest } from "../../api/quoting";

type SFBuyProps = {
  placeholder: string;
};

const SFBuy: React.FC<SFBuyProps> = () => {
  const [orderId, setOrderId] = useState<Nullable<string>>(null);

  const [instanceType, _] = useState<InstanceType>(InstanceType.H100i);
  const [totalNodes, setTotalNodes] = useState<Nullable<number>>(1);
  const [durationSeconds, setDurationSeconds] = useState<Nullable<number>>(
    60 * 60,
  );
  const [startAtIso, setStartAtIso] = useState<Nullable<string>>(
    dayjs().add(1, "hour").startOf("hour").toISOString(),
  );
  const [limitPrice, setLimitPrice] = useState<Nullable<number>>(150_000);

  const { balance, loadingBalance } = useBalance();
  const { allStepsComplete } = useOrderInfoEntrySteps({
    instanceType,
    totalNodes,
    durationSeconds,
    startAtIso,
    limitPrice,
  });

  const noFunds = balance !== null && balance !== undefined && balance === 0;
  const showOrderInfoCollectionLoading = loadingBalance;
  const hidePlaceOrderScene = !allStepsComplete;

  return (
    <Box width={COMMAND_CONTAINER_MAX_WIDTH} flexDirection="column" marginY={1}>
      <InfoBanner balance={balance} loadingBalance={loadingBalance} />
      <OrderInfoCollection
        instanceType={instanceType}
        totalNodes={totalNodes}
        durationSeconds={durationSeconds}
        startAtIso={startAtIso}
        limitPrice={limitPrice}
        setTotalNodes={setTotalNodes}
        setDurationSeconds={setDurationSeconds}
        setStartAtIso={setStartAtIso}
        setLimitPrice={setLimitPrice}
        noFunds={noFunds}
        showLoading={showOrderInfoCollectionLoading}
      />
      <PlaceOrder
        instanceType={instanceType}
        totalNodes={totalNodes}
        durationSeconds={durationSeconds}
        startAtIso={startAtIso}
        limitPrice={limitPrice}
        hide={hidePlaceOrderScene}
      />
    </Box>
  );
};

// --

const PlaceOrder = ({
  instanceType,
  totalNodes,
  durationSeconds,
  startAtIso,
  limitPrice,
  hide,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
  limitPrice: Nullable<Centicents>;
  hide: boolean;
}) => {
  const [immediateOrCancel, setImmediateOrCancel] =
    useState<Nullable<boolean>>(null);
  const immediateOrCancelSet =
    immediateOrCancel !== null && immediateOrCancel !== undefined;

  if (hide) {
    return null;
  }
  if (
    instanceType === null ||
    totalNodes === null ||
    durationSeconds === null ||
    startAtIso === null ||
    limitPrice === null
  ) {
    return null; // make typescript happy
  }

  const instanceTypeLabel = instanceTypeToLabel(instanceType);
  const nodesLabel = totalNodes === 1 ? "node" : "nodes";

  const endsAtIso = dayjs(startAtIso)
    .add(durationSeconds as number, "seconds")
    .toISOString();
  const startAtLabelFormatted = dayjs(startAtIso).format(
    "ddd MMM D [at] h:mma",
  );
  const endAtLabelFormatted = dayjs(endsAtIso).format("ddd MMM D [at] h:mma");

  const limitPriceLabel = centicentsToDollarsFormatted(limitPrice);

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingX={2}
      paddingY={1}
      borderColor="white"
      borderStyle="single"
    >
      <Box flexDirection="row" width="100%" justifyContent="space-between">
        <Text color="gray">place order</Text>
        <Box>
          <UTCLive color="gray" />
        </Box>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          You are about to place a <Text color="green">buy</Text> order for{" "}
          <Text color="green">{totalNodes}</Text>{" "}
          <Text color="green">{instanceTypeLabel}</Text> {nodesLabel}, with a
          reservation starting{" "}
          <Text color="green">{startAtLabelFormatted}</Text>, and ending{" "}
          <Text color="green">{endAtLabelFormatted}</Text>. The maximum price
          you are willing to pay to get this compute block is{" "}
          <Text color="green">{limitPriceLabel}</Text>.
        </Text>
      </Box>
      <SelectExpirationBehavior
        immediateOrCancel={immediateOrCancel}
        setImmediateOrCancel={setImmediateOrCancel}
        selectionInProgress={!immediateOrCancelSet}
        endsAtIso={endsAtIso}
      />
    </Box>
  );
};

const SelectExpirationBehavior = ({
  immediateOrCancel,
  setImmediateOrCancel,
  selectionInProgress,
  endsAtIso,
}: {
  immediateOrCancel: Nullable<boolean>;
  setImmediateOrCancel: (immediateOrCancel: boolean) => void;
  selectionInProgress: boolean;
  endsAtIso: Nullable<string>;
}) => {
  const immediateOrCancelSet =
    immediateOrCancel !== null && immediateOrCancel !== undefined;

  const expiresAtLabel = dayjs(endsAtIso).format("ddd MMM D [at] h:mma");
  const Label = () => {
    if (!immediateOrCancelSet) {
      return (
        <Text>
          <OpenCircle color="gray" /> When should this order expire?
        </Text>
      );
    }

    return (
      <Text>
        {immediateOrCancel ? (
          <Text>
            If we cannot fill this order immediately, it will be{" "}
            <Text color="red">cancelled</Text> immediately.
          </Text>
        ) : (
          <Text>
            It will stay on the market until it expires at{" "}
            <Text color="yellow">{expiresAtLabel}</Text>{" "}
            <Text color="gray">(the end time will have passed)</Text>.
          </Text>
        )}
      </Text>
    );
  };

  const items = [
    [`Leave on market (expires ${expiresAtLabel})`, false],
    ["Cancel immediately if not filled", true],
  ].map(([label, value]) => ({
    label: label as string,
    value: value as boolean,
  }));
  const handleSelect = ({ value }: { label: string; value: boolean }) => {
    setImmediateOrCancel(value);
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      <Label />
      {selectionInProgress && (
        <SelectInput items={items} isFocused onSelect={handleSelect} />
      )}
    </Box>
  );
};

// --

const OrderInfoCollection = ({
  instanceType,
  totalNodes,
  durationSeconds,
  startAtIso,
  limitPrice,
  setTotalNodes,
  setDurationSeconds,
  setStartAtIso,
  setLimitPrice,
  noFunds,
  showLoading,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
  limitPrice: Nullable<Centicents>;
  setTotalNodes: (totalNodes: number) => void;
  setDurationSeconds: (durationSeconds: number) => void;
  setStartAtIso: (startAtIso: string) => void;
  setLimitPrice: (limitPrice: number) => void;
  noFunds: boolean;
  showLoading: boolean;
}) => {
  const {
    isSelectingTotalNodes,
    isSelectingDurationSeconds,
    isSelectingStartAtIso,
    isSelectingLimitPrice,
    allStepsComplete,
  } = useOrderInfoEntrySteps({
    instanceType,
    totalNodes,
    durationSeconds,
    startAtIso,
    limitPrice,
  });

  const [highlightedStartTimeIso, setHighlightedStartTimeIso] =
    useState<Nullable<string>>(null);

  const startAtIsoToQuoteFor = startAtIso ?? highlightedStartTimeIso ?? null;
  const { quotePrice, loadingQuotePrice } = useQuotePrice({
    instanceType,
    totalNodes,
    durationSeconds,
    startAtIso: startAtIsoToQuoteFor,
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
      <Box flexDirection="row">
        <MarketPriceLabel
          quotePrice={quotePrice}
          loadingQuotePrice={loadingQuotePrice}
        />
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
        setHighlightedStartTimeIso={setHighlightedStartTimeIso}
        selectionInProgress={isSelectingStartAtIso}
        durationSeconds={durationSeconds}
      />
      <SelectLimitPrice
        limitPrice={limitPrice}
        setLimitPrice={setLimitPrice}
        quotePrice={quotePrice}
        selectionInProgress={isSelectingLimitPrice}
      />
      <Box flexDirection="row" justifyContent="flex-end" marginTop={1}>
        <TotalStepsCompleteLabel
          instanceType={instanceType}
          totalNodes={totalNodes}
          durationSeconds={durationSeconds}
          startAtIso={startAtIso}
          limitPrice={limitPrice}
        />
      </Box>
    </Box>
  );
};
const MarketPriceLabel = ({
  quotePrice,
  loadingQuotePrice,
}: { quotePrice: Nullable<number>; loadingQuotePrice: boolean }) => {
  const QuoteLabel = () => {
    if (loadingQuotePrice) {
      return <Spinner type="dots" />;
    }

    const quoteUnavailable = quotePrice === null || quotePrice === undefined;
    if (quoteUnavailable) {
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
      <Text color="gray">market price </Text>
      <QuoteLabel />
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
  setHighlightedStartTimeIso,
  selectionInProgress,
  durationSeconds,
}: {
  startAtIso: Nullable<string>;
  setStartAtIso: (startAtIso: string) => void;
  setHighlightedStartTimeIso: (startAtIso: string) => void;
  selectionInProgress: boolean;
  durationSeconds: Nullable<number>;
}) => {
  const startAtIsoSet = startAtIso !== null && startAtIso !== undefined;
  const StatusSymbol = startAtIsoSet ? (
    Check
  ) : (
    <OpenCircle color="gray" dimColor={!selectionInProgress} />
  );

  const finalDisplayFormatter = "MM/DD/YYYY hh:mm A";
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
        <Text color="white">
          {dayjs(startAtIso).format(finalDisplayFormatter)}
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
  const handleHighlight = ({ value }: { label: string; value: string }) => {
    setHighlightedStartTimeIso(value);
  };

  const endAtIso = dayjs(startAtIso).add(durationSeconds ?? 0, "second");

  return (
    <Box flexDirection="column">
      <Text>
        {StatusSymbol} <Label />
      </Text>
      {startAtIsoSet && (
        <Box>
          <Text color="gray">{"    "}End Time</Text>
          <Text color="gray" dimColor>
            {"  "}
            ~~~~~~~~~~~{"  "}
          </Text>
          <Text color="gray">
            {dayjs(endAtIso).format(finalDisplayFormatter)}
          </Text>
        </Box>
      )}
      {selectionInProgress && (
        <SelectInput
          items={items}
          isFocused
          onSelect={handleSelect}
          onHighlight={handleHighlight}
        />
      )}
    </Box>
  );
};

const SelectLimitPrice = ({
  limitPrice,
  setLimitPrice,
  quotePrice,
  selectionInProgress,
}: {
  limitPrice: Nullable<Centicents>;
  setLimitPrice: (limitPrice: Centicents) => void;
  quotePrice: Nullable<Centicents>;
  selectionInProgress: boolean;
}) => {
  const quoteAvailable = quotePrice !== null && quotePrice !== undefined;
  const limitPriceSet = limitPrice !== null && limitPrice !== undefined;
  const StatusSymbol = limitPriceSet ? (
    Check
  ) : (
    <OpenCircle color="gray" dimColor={!selectionInProgress} />
  );

  const manualLimitPriceInputInProgress =
    selectionInProgress && !quoteAvailable && !limitPriceSet;
  const { limitPriceInputField } = useLimitPriceInput({ setLimitPrice });

  const Label = () => {
    const LabelText = () => {
      const getLabelColor = () => {
        if (limitPriceSet) {
          return "white";
        }
        if (selectionInProgress) {
          return "magenta";
        }

        return "gray";
      };
      const labelColor = getLabelColor();

      return <Text color={labelColor}>Limit Price</Text>;
    };
    const LabelValue = () => {
      if (manualLimitPriceInputInProgress) {
        return <Text color="magenta">{limitPriceInputField}</Text>;
      }
      if (limitPriceSet) {
        return (
          <Text color="green">{centicentsToDollarsFormatted(limitPrice)}</Text>
        );
      }

      return null;
    };

    return (
      <Text>
        <LabelText />
        <Text color="gray" dimColor>
          {"  "}
          ~~~~~~~~~~{"  "}
        </Text>
        <LabelValue />
      </Text>
    );
  };

  const showManualLimitPriceInputEducation = manualLimitPriceInputInProgress;

  return (
    <Box flexDirection="column">
      <Text>
        {StatusSymbol} <Label />
      </Text>
      {showManualLimitPriceInputEducation && <ManualLimitPriceEucation />}
    </Box>
  );
};
const useLimitPriceInput = ({
  setLimitPrice,
}: {
  setLimitPrice: (limitPrice: Centicents) => void;
}) => {
  const [limitPriceInputField, setLimitPriceInputField] = useState<string>("$");

  useInput((input, key) => {
    // remove or clear
    if (key.backspace || key.delete) {
      setLimitPriceInputField((prev) =>
        prev.length > 1 ? prev.slice(0, -1) : "$",
      );
      return;
    }
    if (key.escape) {
      setLimitPriceInputField("$");
      return;
    }

    // helpers
    const cleanFieldInput = (input: string): string => {
      return input.replace("$", "");
    };
    const inputValueIsValid = (input: string): boolean => {
      const num = Number(cleanFieldInput(input));

      const conditions = [
        !Number.isNaN(num),
        totalSignificantDecimals(num) <= 4,
        num >= 0,
        num <= 100_000,
      ];

      return conditions.every(Boolean);
    };

    // increment
    const incrementPrice = () => {
      setLimitPriceInputField((prev) => {
        const clean = cleanFieldInput(prev);
        const num = Number(clean);
        const newNum = num + 1;
        return `$${newNum}`;
      });
    };
    const decrementPrice = () => {
      setLimitPriceInputField((prev) => {
        const clean = cleanFieldInput(prev);
        const num = Number(clean);
        const newNum = num - 1;
        if (newNum >= 0) {
          return `$${newNum}`;
        }

        return prev;
      });
    };
    if (key.upArrow || key.rightArrow) {
      incrementPrice();

      return;
    }
    if (key.downArrow || key.leftArrow) {
      decrementPrice();

      return;
    }

    // submit
    if (key.return) {
      const isValid = inputValueIsValid(limitPriceInputField);
      if (isValid) {
        const { centicents, invalid } =
          priceWholeToCenticents(limitPriceInputField);
        if (!invalid && centicents !== null && centicents !== undefined) {
          setLimitPrice(centicents);
        }
      }

      return;
    }

    // digit input
    const inputIsDigitOrDot = /^[0-9.]$/.test(input);
    setLimitPriceInputField((prev) => {
      if (inputIsDigitOrDot) {
        const newInputValue = prev + input;
        if (inputValueIsValid(newInputValue)) {
          return newInputValue;
        }
      }

      return prev;
    });
  });

  return { limitPriceInputField };
};
const ManualLimitPriceEucation = () => {
  return (
    <Box flexDirection="column" width={60} marginTop={1} paddingLeft={2}>
      <Text>
        We could not quote a price for your order. You will have to manually set
        a <Text backgroundColor="black">limit price</Text>.
      </Text>
      <Box
        flexDirection="column"
        paddingX={2}
        paddingY={1}
        marginTop={1}
        borderStyle="singleDouble"
        borderColor="gray"
      >
        <Box flexDirection="column">
          <Text>
            A <Text backgroundColor="black">limit price</Text> is the{" "}
            <Text bold>most</Text> you are willing to pay to get the compute
            block. You will pay at most, or less, than this price (if your order
            gets filled).
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>
            For example, if you enter <Text color="green">$10</Text>, you will
            <Text bold> at most</Text> pay <Text color="green">$10</Text> for
            the compute block. You could also get it for,{" "}
            <Text color="yellow">$9.90</Text>, <Text color="yellow">$9.80</Text>
            , <Text color="gray">$9</Text>, <Text color="gray">$8</Text>, and so
            on (with the lower prices less & less likely to get filled).
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Type it now.{" "}
          <Text color="gray">
            (hit <Text color="magenta">enter ↵ </Text>when finished)
          </Text>
        </Text>
      </Box>
    </Box>
  );
};

const TotalStepsCompleteLabel = ({
  instanceType,
  totalNodes,
  durationSeconds,
  startAtIso,
  limitPrice,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
  limitPrice: Nullable<Centicents>;
}) => {
  const { stepsComplete, totalSteps, allStepsComplete } =
    useOrderInfoEntrySteps({
      instanceType,
      totalNodes,
      durationSeconds,
      startAtIso,
      limitPrice,
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
const useOrderInfoEntrySteps = ({
  instanceType,
  totalNodes,
  durationSeconds,
  startAtIso,
  limitPrice,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
  limitPrice: Nullable<Centicents>;
}) => {
  const instanceTypeSet = instanceType !== null && instanceType !== undefined;
  const totalNodesSet = totalNodes !== null && totalNodes !== undefined;
  const durationSecondsSet =
    durationSeconds !== null && durationSeconds !== undefined;
  const startAtIsoSet = startAtIso !== null && startAtIso !== undefined;
  const limitPriceSet = limitPrice !== null && limitPrice !== undefined;

  const stepsComplete = [
    instanceTypeSet,
    totalNodesSet,
    durationSecondsSet,
    startAtIsoSet,
    limitPriceSet,
  ].filter(Boolean).length;
  const allStepsComplete =
    instanceTypeSet &&
    totalNodesSet &&
    durationSecondsSet &&
    startAtIsoSet &&
    limitPriceSet;

  const isSelectingInstanceType = !instanceTypeSet;
  const isSelectingTotalNodes = instanceTypeSet && !totalNodesSet;
  const isSelectingDurationSeconds =
    instanceTypeSet && totalNodesSet && !durationSecondsSet;
  const isSelectingStartAtIso =
    instanceTypeSet && totalNodesSet && durationSecondsSet && !startAtIsoSet;
  const isSelectingLimitPrice =
    instanceTypeSet &&
    totalNodesSet &&
    durationSecondsSet &&
    startAtIsoSet &&
    !limitPriceSet;

  return {
    stepsComplete,
    totalSteps: 5,
    allStepsComplete,

    isSelectingInstanceType,
    isSelectingTotalNodes,
    isSelectingDurationSeconds,
    isSelectingStartAtIso,
    isSelectingLimitPrice,
  };
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

// --

export function useQuotePrice({
  instanceType,
  totalNodes,
  durationSeconds,
  startAtIso,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
}) {
  const [quotePrice, setQuotePrice] = useState<Nullable<Centicents>>(null);
  const [loadingQuotePrice, setLoadingQuotePrice] = useState<boolean>(false);

  useEffect(() => {
    if (!!instanceType && !!totalNodes && !!durationSeconds && !!startAtIso) {
      setLoadingQuotePrice(true);

      quoteBuyOrderRequest({
        instance_type: instanceType,
        quantity: totalNodes,
        duration: durationSeconds,
        min_start_date: startAtIso,
        max_start_date: startAtIso,
      }).then(({ data }) => {
        if (data) {
          setQuotePrice(data.price);
        }

        setLoadingQuotePrice(false);
      });
    }
  }, [instanceType, totalNodes, durationSeconds, startAtIso]);

  return { quotePrice, loadingQuotePrice };
}

export default SFBuy;
