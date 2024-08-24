import React, { useEffect, useState } from "react";
import { Text, Box, useInput } from "ink";
import { InstanceType } from "../../api/instances";
import { CLICommand } from "../../helpers/commands";
import { COMMAND_CONTAINER_MAX_WIDTH } from "../../ui/dimensions";
import type { Nullable } from "../../helpers/empty";
import { SpendingPowerLabel } from "../../ui/lib/SpendingPowerLabel";
import { useBalance } from "../../api/hooks/useBalance";
import { Emails } from "../../helpers/urls";
import Spinner from "ink-spinner";
import {
  centicentsToDollarsFormatted,
  centicentsToWhole,
  formatSecondsShort,
  priceWholeToCenticents,
  totalSignificantDecimals,
  type Centicents,
} from "../../helpers/units";
import { Check, OpenCircle } from "../../ui/symbols";
import SelectInput from "ink-select-input";
import { useWebUrl } from "../../hooks/urls";
import dayjs from "dayjs";
import { quoteBuyOrderRequest } from "../../api/quoting";
import { NowLive } from "../../ui/lib/NowLive";
import { OrderStatus, placeBuyOrderRequest } from "../../api/orders";
import type { ApiError } from "../../api";
import { RecommendedCommands } from "../../ui/lib/RecommendedCommands";

type SFBuyProps = {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
  limitPrice: Nullable<Centicents>;
  immediateOrCancel: Nullable<boolean>;
  forceAutomaticallyPlaceOrder: boolean;
};

const SFBuy: React.FC<SFBuyProps> = ({
  instanceType: argInstanceType,
  totalNodes: argTotalNodes,
  durationSeconds: argDurationSeconds,
  startAtIso: argStartAtIso,
  limitPrice: argLimitPrice,
  immediateOrCancel: argImmediateOrCancel,
  forceAutomaticallyPlaceOrder,
}) => {
  // fields to collect
  const [instanceType, _] = useState<Nullable<InstanceType>>(
    argInstanceType ?? InstanceType.H100i,
  );
  const [totalNodes, setTotalNodes] = useState<Nullable<number>>(argTotalNodes);
  const [durationSeconds, setDurationSeconds] =
    useState<Nullable<number>>(argDurationSeconds);
  const [startAtIso, setStartAtIso] = useState<Nullable<string>>(argStartAtIso);
  const [limitPrice, setLimitPrice] = useState<Nullable<number>>(argLimitPrice);
  const [immediateOrCancel, setImmediateOrCancel] =
    useState<Nullable<boolean>>(argImmediateOrCancel);

  // quote fields
  const [highlightedStartTimeIso, setHighlightedStartTimeIso] =
    useState<Nullable<string>>(null);

  const startAtIsoToQuoteFor = startAtIso ?? highlightedStartTimeIso ?? null;
  const { quotePrice, loadingQuotePrice } = useQuotePrice({
    instanceType,
    totalNodes,
    durationSeconds,
    startAtIso: startAtIsoToQuoteFor,
  });

  // place order utils
  const {
    placeBuyOrder,
    orderRequestInitiated,
    placingOrder,
    placeOrderError,
    orderId,
  } = usePlaceBuyOrder({
    instanceType,
    totalNodes,
    durationSeconds,
    startAtIso,
    limitPrice,
    immediateOrCancel,
  });

  const { balance, loadingBalance } = useBalance();
  const { allStepsComplete } = useOrderInfoEntrySteps({
    instanceType,
    totalNodes,
    durationSeconds,
    startAtIso,
    limitPrice,
  });

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
        quotePrice={quotePrice}
        loadingQuotePrice={loadingQuotePrice}
        setHighlightedStartTimeIso={setHighlightedStartTimeIso}
        balance={balance}
        showLoading={showOrderInfoCollectionLoading}
      />
      <PlaceOrder
        instanceType={instanceType}
        totalNodes={totalNodes}
        durationSeconds={durationSeconds}
        startAtIso={startAtIso}
        limitPrice={limitPrice}
        immediateOrCancel={immediateOrCancel}
        setImmediateOrCancel={setImmediateOrCancel}
        quotePrice={quotePrice}
        placeBuyOrder={placeBuyOrder}
        orderRequestInitiated={orderRequestInitiated}
        placingOrder={placingOrder}
        hide={hidePlaceOrderScene}
        forceAutomaticallyPlaceOrder={forceAutomaticallyPlaceOrder}
      />
      <OrderPlacementStatus
        orderRequestInflight={placingOrder}
        placeOrderError={placeOrderError}
        orderId={orderId}
        hide={!orderRequestInitiated}
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
  immediateOrCancel,
  setImmediateOrCancel,
  quotePrice,
  placeBuyOrder,
  orderRequestInitiated,
  placingOrder,
  hide,
  forceAutomaticallyPlaceOrder,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
  limitPrice: Nullable<Centicents>;
  immediateOrCancel: Nullable<boolean>;
  setImmediateOrCancel: (immediateOrCancel: boolean) => void;
  quotePrice: Nullable<number>;
  placeBuyOrder: () => void;
  orderRequestInitiated: boolean;
  placingOrder: boolean;
  hide: boolean;
  forceAutomaticallyPlaceOrder: boolean;
}) => {
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

  const isSelectingImmediateOrCancelFlag = !immediateOrCancelSet;
  const isReadyToPlaceOrder =
    instanceType !== null &&
    totalNodes !== null &&
    durationSeconds !== null &&
    startAtIso !== null &&
    limitPrice !== null &&
    immediateOrCancel !== null;
  const canPlaceOrder =
    isReadyToPlaceOrder && !orderRequestInitiated && !placingOrder;

  const getBorderColor = () => {
    if (orderRequestInitiated) {
      return "gray";
    }
    if (isReadyToPlaceOrder) {
      return "magenta";
    }

    return "white";
  };
  const borderColor = getBorderColor();

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
        <Text color="gray">place order</Text>
        <Box>
          <NowLive color="gray" />
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
        selectionInProgress={isSelectingImmediateOrCancelFlag}
        endsAtIso={endsAtIso}
        quoteUnavailable={quotePrice === null || quotePrice === undefined}
      />
      <EnterToPlaceOrder
        placeBuyOrder={placeBuyOrder}
        canPlaceOrder={canPlaceOrder}
        shouldAutomaticallyPlaceOrder={forceAutomaticallyPlaceOrder}
        hide={!isReadyToPlaceOrder || orderRequestInitiated}
      />
    </Box>
  );
};

const EnterToPlaceOrder = ({
  placeBuyOrder,
  canPlaceOrder,
  shouldAutomaticallyPlaceOrder,
  hide,
}: {
  placeBuyOrder: () => void;
  canPlaceOrder: boolean;
  shouldAutomaticallyPlaceOrder: boolean;
  hide: boolean;
}) => {
  // place order on enter
  useInput((_, key) => {
    if (hide) {
      return;
    }

    if (key.return && canPlaceOrder) {
      placeBuyOrder();
    }
  });

  // also, handle automatically placing the order if that flag is set
  useEffect(() => {
    if (canPlaceOrder && shouldAutomaticallyPlaceOrder) {
      placeBuyOrder();
    }
  }, [canPlaceOrder]);

  const PressEnterBlinking = () => {
    const [blinking, setBlinking] = useState(false);
    useEffect(() => {
      const interval = setInterval(() => {
        setBlinking((blinking) => !blinking);
      }, 750);
      return () => clearInterval(interval);
    }, []);

    return (
      <Text backgroundColor="magenta" color="white">
        {blinking ? "Press enter ↵ to place it." : ""}
      </Text>
    );
  };

  if (hide) {
    return null;
  }

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box marginRight={2}>
        <Text bold>Your order is ready.</Text>
      </Box>
      <Box>
        <PressEnterBlinking />
      </Box>
    </Box>
  );
};

const SelectExpirationBehavior = ({
  immediateOrCancel,
  setImmediateOrCancel,
  selectionInProgress,
  endsAtIso,
  quoteUnavailable,
}: {
  immediateOrCancel: Nullable<boolean>;
  setImmediateOrCancel: (immediateOrCancel: boolean) => void;
  selectionInProgress: boolean;
  endsAtIso: Nullable<string>;
  quoteUnavailable: boolean;
}) => {
  const immediateOrCancelSet =
    immediateOrCancel !== null && immediateOrCancel !== undefined;
  useEffect(() => {
    if (selectionInProgress && quoteUnavailable) {
      setImmediateOrCancel(false);
    }
  }, [selectionInProgress, quoteUnavailable]);

  const expiresAtLabel = dayjs(endsAtIso).format("ddd MMM D [at] h:mma");
  const Label = () => {
    if (!immediateOrCancelSet) {
      return (
        <Text>
          <OpenCircle color="gray" /> When should this order{" "}
          <Text color="yellow">expire</Text>?
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
            It will stay on the market until it expires{" "}
            <Text color="yellow">{expiresAtLabel}</Text>.
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

const OrderPlacementStatus = ({
  orderRequestInflight,
  placeOrderError,
  orderId,
  hide,
}: {
  orderRequestInflight: boolean;
  placeOrderError: Nullable<ApiError>;
  orderId: Nullable<string>;
  hide: boolean;
}) => {
  const orderSuccessfullyPlaced = orderId !== null && orderId !== undefined;
  const orderPlacementFailed =
    placeOrderError !== null && placeOrderError !== undefined;

  // exit if order is successfully placed or placement failed
  useEffect(() => {
    if (orderSuccessfullyPlaced || orderPlacementFailed) {
      setTimeout(() => {
        process.exit(0); // allow Ink to update UI before exiting (TODO: find a better way to do this)
      }, 500);
    }
  }, [orderSuccessfullyPlaced, orderPlacementFailed]);

  if (hide) {
    return null;
  }

  const getBorderColor = () => {
    if (orderRequestInflight) {
      return "blue";
    }
    if (placeOrderError) {
      return "red";
    }
    if (orderId) {
      return "green";
    }

    return "white";
  };
  const borderColor = getBorderColor();

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingX={2}
      paddingY={1}
      borderColor={borderColor}
      borderStyle="single"
    >
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Text color="gray">order status</Text>
        <OrderStatusIndicator
          orderRequestInflight={orderRequestInflight}
          orderId={orderId}
          placeOrderError={placeOrderError}
        />
      </Box>
      <Box marginTop={1}>
        {orderRequestInflight && (
          <Box>
            <Box marginRight={2}>
              <Text color="gray">Placing order</Text>
            </Box>
            <Spinner type="dots" />
          </Box>
        )}
        {orderSuccessfullyPlaced && (
          <Box flexDirection="column">
            <Box flexDirection="column">
              <Text>
                Your order has been{" "}
                <Text color="green">successfully placed</Text>. It will be on
                the market shortly.
              </Text>
            </Box>
            <Box flexDirection="column" marginTop={1}>
              <Text>Your order id:</Text>
              <Box
                flexDirection="row"
                width="70%"
                justifyContent="center"
                borderStyle="classic"
                borderColor="gray"
                borderDimColor
              >
                <Text color="magenta">{orderId}</Text>
              </Box>
            </Box>
            <Box flexDirection="column" marginTop={1}>
              <Text>Here are some helpful follow-on commands:</Text>
              <Box
                flexDirection="column"
                paddingX={1}
                borderStyle="single"
                borderColor="gray"
                borderDimColor
              >
                <RecommendedCommands
                  commandColumnWidth={15}
                  items={[
                    {
                      Label: <Text color="red">cancel order</Text>,
                      Command: (
                        <Text>
                          {CLICommand.Orders.Cancel.Bare}{" "}
                          <Text color="magenta">{orderId}</Text>
                        </Text>
                      ),
                    },
                    {
                      Label: <Text color="gray">check status</Text>,
                      Command: (
                        <Text>
                          {CLICommand.Orders.Status.Bare}{" "}
                          <Text color="magenta">{orderId}</Text>
                        </Text>
                      ),
                    },
                    {
                      Label: <Text color="gray">list orders</Text>,
                      Command: <Text>{CLICommand.Orders.List}</Text>,
                    },
                  ]}
                />
              </Box>
            </Box>
          </Box>
        )}
        {orderPlacementFailed && (
          <Box>
            <Text color="red">{placeOrderError?.message}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

const OrderStatusIndicator = ({
  orderRequestInflight,
  orderId,
  placeOrderError,
}: {
  orderRequestInflight: boolean;
  orderId: Nullable<string>;
  placeOrderError: Nullable<ApiError>;
}) => {
  if (orderRequestInflight) {
    return <Spinner type="dots" />;
  }
  if (placeOrderError) {
    return <Text color="red">order placement failed</Text>;
  }

  const orderIdAvailable = orderId !== null && orderId !== undefined;
  if (orderIdAvailable) {
    return <Text color="magenta">{orderId}</Text>;
  }

  return null;
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
  quotePrice,
  loadingQuotePrice,
  setHighlightedStartTimeIso,
  balance,
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
  quotePrice: Nullable<number>;
  loadingQuotePrice: boolean;
  setHighlightedStartTimeIso: (startAtIso: string) => void;
  balance: Nullable<Centicents>;
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

  if (showLoading) {
    return (
      <Box marginTop={1}>
        <Spinner type="dots" />
      </Box>
    );
  }

  const noFunds = balance !== null && balance !== undefined && balance === 0;
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
        balance={balance}
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

  const items = React.useMemo(() => {
    return Array(18)
      .fill(0)
      .map((_, i) => {
        const offset = i + 1; // start on next hour

        const date = dayjs().add(offset, "hour").startOf("hour");
        return {
          label: date.format("ddd h A"),
          value: date.toISOString(),
        };
      });
  }, []);
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
  balance,
}: {
  limitPrice: Nullable<Centicents>;
  setLimitPrice: (limitPrice: Centicents) => void;
  quotePrice: Nullable<Centicents>;
  selectionInProgress: boolean;
  balance: Nullable<Centicents>;
}) => {
  const quoteAvailable = quotePrice !== null && quotePrice !== undefined;
  const limitPriceSet = limitPrice !== null && limitPrice !== undefined;
  const StatusSymbol = limitPriceSet ? (
    Check
  ) : (
    <OpenCircle color="gray" dimColor={!selectionInProgress} />
  );

  const { limitPriceInputField, limitPriceInputFieldValue } =
    useLimitPriceInput({
      setLimitPrice,
      balance,
      disable: !selectionInProgress,
    });

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

      return (
        <Text color={labelColor} dimColor={!selectionInProgress}>
          Limit Price
        </Text>
      );
    };
    const LabelValue = () => {
      if (selectionInProgress) {
        if (quoteAvailable) {
          const belowQuote =
            limitPriceInputFieldValue && limitPriceInputFieldValue < quotePrice;
          if (belowQuote || !limitPriceInputFieldValue) {
            return <Text color="white">{limitPriceInputField}</Text>;
          }

          // otherwise at or above quote — highlight green (good)
          return <Text color="green">{limitPriceInputField}</Text>;
        }

        // if no quote just highlight magenta
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
        {(selectionInProgress || limitPriceSet) && (
          <Text color="gray" dimColor>
            {"  "}
            ~~~~~~~~~~{"  "}
          </Text>
        )}
        <LabelValue />
      </Text>
    );
  };

  return (
    <Box flexDirection="column">
      <Text>
        {StatusSymbol} <Label />
      </Text>
      {selectionInProgress && <LimitPriceEucation quotePrice={quotePrice} />}
    </Box>
  );
};
const useLimitPriceInput = ({
  setLimitPrice,
  balance,
  disable,
}: {
  setLimitPrice: (limitPrice: Centicents) => void;
  balance: Nullable<Centicents>;
  disable: boolean;
}) => {
  const balanceSet = balance !== null && balance !== undefined;

  const [limitPriceInputField, setLimitPriceInputField] = useState<string>("$");
  const [limitPriceInputFieldValue, setLimitPriceInputFieldValue] =
    useState<Nullable<Centicents>>(null);

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
      balanceSet && num <= centicentsToWhole(balance),
    ];

    return conditions.every(Boolean);
  };

  // parse actual numeric value
  useEffect(() => {
    const isValid = inputValueIsValid(limitPriceInputField);
    if (isValid) {
      const { centicents, invalid } =
        priceWholeToCenticents(limitPriceInputField);

      if (!invalid && centicents !== null && centicents !== undefined) {
        setLimitPriceInputFieldValue(centicents);
      }
    }
  }, [limitPriceInputField]);

  useInput((input, key) => {
    if (disable) {
      return;
    }

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
      if (limitPriceInputFieldValue) {
        setLimitPrice(limitPriceInputFieldValue);
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

  return { limitPriceInputField, limitPriceInputFieldValue };
};
const LimitPriceEucation = ({
  quotePrice,
}: {
  quotePrice: Nullable<Centicents>;
}) => {
  const quoteAvailable = quotePrice !== null && quotePrice !== undefined;

  return (
    <Box flexDirection="column" width={60} marginTop={1} paddingLeft={2}>
      {quoteAvailable ? (
        <Box flexDirection="column">
          <Text>
            Set a <Text backgroundColor="black">limit price</Text> for your
            order.
          </Text>
          <Box marginTop={1}>
            <Text>
              The current market price for this block is{" "}
              <Text color="green">
                {centicentsToDollarsFormatted(quotePrice)}
              </Text>
              . If you bid{" "}
              <Text color="green">
                {centicentsToDollarsFormatted(quotePrice)}
              </Text>{" "}
              or more, your order is very likely to get filled.
            </Text>
          </Box>
        </Box>
      ) : (
        <Text>
          We could not quote a price for your order. You will have to manually
          set a <Text backgroundColor="black">limit price</Text>.
        </Text>
      )}
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

function useQuotePrice({
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

function usePlaceBuyOrder({
  instanceType,
  totalNodes,
  durationSeconds,
  startAtIso,
  limitPrice,
  immediateOrCancel,
}: {
  instanceType: Nullable<InstanceType>;
  totalNodes: Nullable<number>;
  durationSeconds: Nullable<number>;
  startAtIso: Nullable<string>;
  limitPrice: Nullable<Centicents>;
  immediateOrCancel: Nullable<boolean>;
}) {
  const [orderId, setOrderId] = useState<Nullable<string>>(null);
  const [orderRequestInitiated, setOrderRequestInitiated] =
    useState<boolean>(false);
  const [placingOrder, setPlacingOrder] = useState<boolean>(false);
  const [placeOrderError, setPlaceOrderError] =
    useState<Nullable<ApiError>>(null);

  const canPlaceOrder = [
    instanceType !== null && instanceType !== undefined,
    totalNodes !== null && totalNodes !== undefined,
    durationSeconds !== null && durationSeconds !== undefined,
    startAtIso !== null && startAtIso !== undefined,
    limitPrice !== null && limitPrice !== undefined,
    immediateOrCancel !== null && immediateOrCancel !== undefined,
  ].every(Boolean);
  const placeBuyOrder = () => {
    if (canPlaceOrder) {
      setPlacingOrder(true);
      setOrderRequestInitiated(true);

      placeBuyOrderRequest({
        instance_type: instanceType!,
        quantity: totalNodes!,
        duration: durationSeconds!,
        start_at: startAtIso!,
        price: limitPrice!,
        flags: {
          ioc: immediateOrCancel!,
        },
      }).then(({ data, err }) => {
        Bun.sleep(3000).then(() => {
          if (!!data && data.status === OrderStatus.Pending) {
            setOrderId(data.id);
          } else if (err) {
            setPlaceOrderError(err);
          }

          setPlacingOrder(false);
        });
      });
    }
  };

  return {
    placeBuyOrder,
    orderRequestInitiated,
    placingOrder,
    placeOrderError,
    orderId,
  };
}

export default SFBuy;
