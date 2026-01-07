import { Box, measureElement, Text, useInput } from "ink";
import process from "node:process";
import dayjs from "dayjs";
import React, { useEffect } from "react";
import { Row } from "../Row.tsx";
import { GPUS_PER_NODE } from "../constants.ts";
import { formatDuration } from "./index.tsx";
import type { HydratedOrder } from "./types.ts";

export function orderDetails(order: HydratedOrder) {
  const duration = dayjs(order.end_at).diff(order.start_at);
  const durationInHours = duration === 0 ? 1 : duration / 1000 / 60 / 60;
  const pricePerGPUHour = order.price /
    (order.quantity * durationInHours * GPUS_PER_NODE) / 100;
  const durationFormatted = formatDuration(duration);

  const executedPriceDollarsPerGPUHour =
    typeof order.execution_price === "number"
      ? order.execution_price / // cents
        (order.quantity * GPUS_PER_NODE * durationInHours) / // cents per gpu-hour
        100 // dollars per gpu-hour
      : undefined;

  return {
    pricePerGPUHour,
    durationFormatted,
    executedPriceDollarsPerGPUHour,
  };
}

const formatDateTime = (date: string) =>
  dayjs(date).format("MMM D h:mm a").toLowerCase();

function Order(props: { order: HydratedOrder }) {
  const { pricePerGPUHour, durationFormatted } = orderDetails(props.order);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color={props.order.side === "buy" ? "green" : "red"}>
          {props.order.side === "buy" ? "↑" : "↓"}
        </Text>
        <Text color="yellow">{props.order.side}</Text>
        <Text color="yellow">{props.order.id}</Text>
        <Text dimColor>({props.order.status})</Text>
      </Box>
      <Row
        headWidth={7}
        head="nodes"
        value={`${props.order.quantity} x ${props.order.instance_type} (${
          props.order.quantity * GPUS_PER_NODE
        } gpus)`}
      />
      <Row headWidth={7} head="zone" value={props.order.cluster ?? "N/A"} />
      <Row
        headWidth={7}
        head="price"
        value={`$${pricePerGPUHour.toFixed(2)}/gpu/hr`}
      />
      <Row headWidth={7} head="time" value={durationFormatted} />
      <Row
        headWidth={7}
        head="total"
        value={`$${props.order.price / 100}/total`}
      />
      <Row
        headWidth={7}
        head="start"
        value={dayjs(props.order.start_at).format("MMM D h:mm a").toLowerCase()}
      />
      <Row
        headWidth={7}
        head="end"
        value={dayjs(props.order.end_at).format("MMM D h:mm a").toLowerCase()}
      />
    </Box>
  );
}

function OrderMinimal(props: {
  order: HydratedOrder;
  activeTab: "all" | "sell" | "buy";
}) {
  const { pricePerGPUHour, durationFormatted, executedPriceDollarsPerGPUHour } =
    orderDetails(props.order);

  return (
    <Box gap={1}>
      <Box width={6}>
        <Text color={props.order.side === "buy" ? "green" : "red"}>
          {props.order.side}
        </Text>
      </Box>

      <Box width={18}>
        {executedPriceDollarsPerGPUHour &&
            executedPriceDollarsPerGPUHour.toFixed(2) !==
              pricePerGPUHour.toFixed(2)
          ? (
            <>
              <Text strikethrough dimColor>
                ${pricePerGPUHour.toFixed(2)}
                <Text dimColor>/gpu/hr</Text>
              </Text>
              <Text>${executedPriceDollarsPerGPUHour.toFixed(2)}</Text>
            </>
          )
          : (
            <Text>
              ${pricePerGPUHour.toFixed(2)}
              <Text dimColor>/gpu/hr</Text>
            </Text>
          )}
      </Box>
      <Box width={44}>
        <Box width={8}>
          <Text>{durationFormatted}</Text>
        </Box>
        <Box marginRight={1} flexDirection="row" gap={1}>
          <Box>
            <Text dimColor>{formatDateTime(props.order.start_at)}</Text>
          </Box>
          <Box alignItems="center">
            <Text dimColor>→</Text>
          </Box>
          <Box alignItems="flex-end" justifyContent="flex-end">
            <Text dimColor>
              {dayjs(props.order.start_at).isSame(props.order.end_at, "day")
                ? dayjs(props.order.end_at).format("h:mm a").toLowerCase()
                : formatDateTime(props.order.end_at)}
            </Text>
          </Box>
        </Box>
      </Box>
      <Box width={6}>
        <Text dimColor>{props.order.status}</Text>
      </Box>
      <Box>
        <Text dimColor>{props.order.id}</Text>
      </Box>
    </Box>
  );
}

const NUMBER_OF_ORDERS_TO_DISPLAY = 20;

export function OrderDisplay(props: {
  orders: HydratedOrder[];
  expanded?: boolean;
}) {
  const [activeTab, setActiveTab] = React.useState<"all" | "sell" | "buy">(
    "all",
  );

  useInput((input, key) => {
    if (key.escape || input === "q") {
      process.exit(0);
    }
    if (input === "a") {
      setActiveTab("all");
    }

    if (input === "s") {
      setActiveTab("sell");
    }

    if (input === "b") {
      setActiveTab("buy");
    }
  });

  useEffect(() => {
    if (props.orders.length === 0) {
      process.exit(0);
    }
  }, [props.orders]);

  if (props.orders.length === 0) {
    return (
      <Box flexDirection="column" gap={1} paddingBottom={1}>
        <Text>No orders found.</Text>

        <Box paddingLeft={4} flexDirection="column">
          <Text dimColor># Place an order to buy compute</Text>
          <Text color="yellow">sf buy</Text>
        </Box>
      </Box>
    );
  }

  const orders = activeTab === "all"
    ? props.orders
    : props.orders.filter((order) => order.side === activeTab);

  const { sellOrdersCount, buyOrdersCount } = React.useMemo(() => {
    return {
      sellOrdersCount: props.orders.filter((order) => order.side === "sell")
        .length,
      buyOrdersCount: props.orders.filter((order) =>
        order.side === "buy"
      ).length,
    };
  }, [props.orders]);

  return (
    <>
      <ScrollArea
        height={NUMBER_OF_ORDERS_TO_DISPLAY}
        orders={orders}
        activeTab={activeTab}
        sellOrdersCount={sellOrdersCount}
        buyOrdersCount={buyOrdersCount}
      >
        {orders.map((order) => {
          return props.expanded
            ? <Order order={order} key={order.id} />
            : (
              <OrderMinimal
                order={order}
                key={order.id}
                activeTab={activeTab}
              />
            );
        })}

        {orders.length === 0 && (
          <Box>
            <Text>
              There are 0 outstanding {activeTab === "all" ? "" : activeTab}
              {" "}
              orders right now.
            </Text>
          </Box>
        )}
      </ScrollArea>
    </>
  );
}

interface ScrollState {
  innerHeight: number;
  height: number;
  scrollTop: number;
}

type ScrollAction =
  | { type: "SET_INNER_HEIGHT"; innerHeight: number }
  | { type: "SCROLL_DOWN" }
  | { type: "SCROLL_DOWN_BULK" }
  | { type: "SCROLL_UP" }
  | { type: "SCROLL_UP_BULK" }
  | { type: "SCROLL_TO_TOP" }
  | { type: "SCROLL_TO_BOTTOM" }
  | { type: "SWITCHED_TAB" };

const reducer = (state: ScrollState, action: ScrollAction): ScrollState => {
  switch (action.type) {
    case "SET_INNER_HEIGHT":
      return {
        ...state,
        innerHeight: action.innerHeight,
      };

    case "SCROLL_DOWN":
      return {
        ...state,
        scrollTop: Math.min(
          state.innerHeight - state.height,
          state.scrollTop + 1,
        ),
      };

    case "SCROLL_DOWN_BULK":
      return {
        ...state,
        scrollTop: Math.min(
          state.innerHeight - state.height,
          state.scrollTop + NUMBER_OF_ORDERS_TO_DISPLAY,
        ),
      };

    case "SCROLL_UP":
      return {
        ...state,
        scrollTop: Math.max(0, state.scrollTop - 1),
      };

    case "SCROLL_UP_BULK":
      return {
        ...state,
        scrollTop: Math.max(0, state.scrollTop - NUMBER_OF_ORDERS_TO_DISPLAY),
      };

    case "SCROLL_TO_TOP":
      return {
        ...state,
        scrollTop: 0,
      };

    case "SCROLL_TO_BOTTOM":
      return {
        ...state,
        scrollTop: state.innerHeight - state.height,
      };

    case "SWITCHED_TAB": {
      return {
        ...state,
        scrollTop: 0,
      };
    }

    default:
      return state;
  }
};

export function ScrollArea({
  height,
  children,
  orders,
  activeTab,
  sellOrdersCount,
  buyOrdersCount,
}: {
  height: number;
  children: React.ReactNode;
  orders: HydratedOrder[];
  activeTab: "all" | "sell" | "buy";
  sellOrdersCount: number;
  buyOrdersCount: number;
}) {
  const [state, dispatch] = React.useReducer<
    React.Reducer<ScrollState, ScrollAction>
  >(reducer, {
    height,
    scrollTop: 0,
    innerHeight: 0,
  });

  const innerRef = React.useRef(null);
  const canScrollUp = state.scrollTop > 0 && orders.length > 0;
  const numberOfOrdersAboveScrollArea = state.scrollTop;
  const dateRangeAboveScrollArea = orders.length > 0
    ? `${formatDateTime(orders[0].start_at)} → ${
      formatDateTime(
        orders[numberOfOrdersAboveScrollArea - 1]?.end_at || "0",
      )
    }`
    : "";
  const numberOfOrdersBelowScrollArea = orders.length -
    (state.scrollTop + state.height);
  const dateRangeBelowScrollArea = orders.length > 0
    ? `${
      formatDateTime(
        orders[state.scrollTop + state.height]?.start_at || "0",
      )
    } → ${formatDateTime(orders[orders.length - 1].end_at)}`
    : "";
  const canScrollDown = state.scrollTop + state.height < state.innerHeight &&
    numberOfOrdersBelowScrollArea >= 0;

  useEffect(() => {
    if (!innerRef.current) {
      return;
    }

    const dimensions = measureElement(innerRef.current);

    dispatch({
      type: "SET_INNER_HEIGHT",
      innerHeight: dimensions.height,
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    dispatch({ type: "SWITCHED_TAB" });
  }, [activeTab]);

  useInput((input, key) => {
    if (key.downArrow || input === "j") {
      dispatch({
        type: "SCROLL_DOWN",
      });
    }

    if (key.upArrow || input === "k") {
      dispatch({
        type: "SCROLL_UP",
      });
    }

    if (input === "u") {
      dispatch({
        type: "SCROLL_UP_BULK",
      });
    }

    if (input === "d") {
      dispatch({
        type: "SCROLL_DOWN_BULK",
      });
    }

    if (input === "g") {
      dispatch({
        type: "SCROLL_TO_TOP",
      });
    }

    if (input === "G") {
      dispatch({
        type: "SCROLL_TO_BOTTOM",
      });
    }
  });

  return (
    <Box flexDirection="column" gap={0}>
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text dimColor>
            {canScrollUp
              ? `↑ ${numberOfOrdersAboveScrollArea.toLocaleString()} more (${dateRangeAboveScrollArea})`
              : " "}
          </Text>
          <Box gap={2}>
            <Text color={activeTab === "all" ? "cyan" : "white"}>
              [a]ll <Text dimColor>{sellOrdersCount + buyOrdersCount}</Text>
            </Text>
            <Text color={activeTab === "sell" ? "cyan" : "white"}>
              [s]ell <Text dimColor>{sellOrdersCount}</Text>
            </Text>
            <Text color={activeTab === "buy" ? "cyan" : "white"}>
              [b]uy <Text dimColor>{buyOrdersCount}</Text>
            </Text>
          </Box>
        </Box>

        <Box height={height} flexDirection="column" overflow="hidden">
          <Box
            ref={innerRef}
            flexShrink={0}
            flexDirection="column"
            marginTop={-state.scrollTop}
          >
            {children}
          </Box>
        </Box>

        <Box>
          <Text dimColor>
            {canScrollDown
              ? `↓ ${numberOfOrdersBelowScrollArea.toLocaleString()} more (${dateRangeBelowScrollArea})`
              : " "}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
