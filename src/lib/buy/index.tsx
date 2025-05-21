import { type Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import { parseDate } from "chrono-node";
import { Box, render, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import ms from "ms";
import console from "node:console";
import process from "node:process";
import { clearInterval, setInterval, setTimeout } from "node:timers";
import dayjs from "npm:dayjs@1.11.13";
import duration from "npm:dayjs@1.11.13/plugin/duration.js";
import relativeTime from "npm:dayjs@1.11.13/plugin/relativeTime.js";
import parseDurationFromLibrary from "parse-duration";
import React, { useCallback, useEffect, useRef, useState } from "react";
import invariant from "tiny-invariant";
import { apiClient } from "../../apiClient.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { InstanceTypeMetadata } from "../../helpers/instance-types-meta.ts";
import {
  centsToDollarsFormatted,
  parseStartDate,
  parseStartDateOrNow,
  roundEndDate,
  roundStartDate,
} from "../../helpers/units.ts";
import ConfirmInput from "../ConfirmInput.tsx";
import type { Quote } from "../Quote.tsx";
import QuoteDisplay from "../Quote.tsx";
import { Row } from "../Row.tsx";
import { GPUS_PER_NODE } from "../constants.ts";
import { parseAccelerators } from "../index.ts";
import { analytics } from "../posthog.ts";

dayjs.extend(relativeTime);
dayjs.extend(duration);

export type SfBuyOptions = ReturnType<ReturnType<typeof _registerBuy>["opts"]>;

export function _registerBuy(program: Command) {
  return program
    .command("buy")
    .description("Place a buy order")
    .showHelpAfterError()
    .requiredOption("-t, --type <type>", "Type of GPU", "h100i")
    .option(
      "-n, --accelerators <quantity>",
      "Number of GPUs to purchase",
      (val) => parseAccelerators(val, "buy"),
      8,
    )
    .option(
      "-d, --duration <duration>",
      "Duration of reservation (rounded up to the nearest hour)",
      parseDuration,
    )
    .option(
      "-p, --price <price>",
      "Sets the maximize price per gpu/hr you're willing to pay. If the market rate is lower, then you'll pay the market rate",
    )
    .option(
      "-s, --start <start>",
      "Start time (date, relative time like '+1d', or 'NOW')",
      parseStartDateOrNow,
      "NOW",
    )
    .addOption(
      new Option(
        "-e, --end <end>",
        "End time (date or relative time like '+1d', rounded up to nearest hour)",
      )
        .argParser(parseEnd)
        .conflicts("duration"),
    )
    .hook("preAction", (command) => {
      const { duration, end } = command.opts();
      if ((!duration && !end) || (!!duration && !!end)) {
        console.error(
          chalk.yellow("Specify either --duration or --end, but not both"),
        );
        command.help();
        process.exit(1);
      }
    })
    .option("-y, --yes", "Automatically confirm the order")
    .option(
      "-colo, --colocate <contract_id>",
      "Colocate with existing contracts",
      (value) => value.split(","),
    )
    .option(
      "-q, --quote",
      "Get a price quote without placing an order. Useful for scripting.",
    )
    .option(
      "--standing",
      "Places a standing order. Default behavior is to place an order that auto-cancels if it can't be filled immediately.",
    )
    .option("-c, --cluster <cluster>", "Send into a specific cluster")
    .configureHelp({
      optionDescription: (option) => {
        if (option.flags === "-h, --help") {
          return "Display help for buy";
        }
        return option.description;
      },
    })
    .addHelpText(
      "before",
      `
Examples:
  \x1b[2m# Buy 8 H100s for 1 hour at market price\x1b[0m
  $ sf buy -n 8 -d 1h

  \x1b[2m# Buy 32 H100s for 6 hours starting in 3 hours\x1b[0m
  $ sf buy -n 32 -d 6h -s +3h

  \x1b[2m# Buy 64 H100s for 12 hours starting tomorrow at 9am\x1b[0m
  $ sf buy -n 64 -d 12h -s "tomorrow at 9am"

  \x1b[2m# Extend an existing contract that ends at 4pm by 4 hours\x1b[0m
  $ sf buy -s 4pm -d 4h -colo <contract_id>

  \x1b[2m# Place a standing order at a specific price\x1b[0m
  $ sf buy -n 16 -d 24h -p 1.50 --standing
`,
    )
    .action(function buyOrderAction(options) {
      /*
       * Flow is:
       * 1. If --quote, get quote and exit
       * 2. If -p is provided, use it as the price
       * 3. Otherwise, get a price by quoting the market
       * 4. If --yes isn't provided, ask for confirmation
       * 5. Place order
       */
      if (options.quote) {
        render(<QuoteComponent options={options} />);
      } else {
        render(<QuoteAndBuy options={options} />);
      }
    });
}

export function registerBuy(program: Command) {
  _registerBuy(program);
}

function parseEnd(value: string) {
  const parsed = parseDate(value);
  if (!parsed) logAndQuit(`Invalid end date: ${value}`);
  return roundEndDate(parsed);
}

export function parseDuration(duration?: string) {
  if (!duration) {
    return 1 * 60 * 60; // 1 hour
  }

  // Assumes the units is hours if no units are provided
  let durationStr = duration;
  if (!/[a-zA-Z]$/.test(duration)) {
    durationStr = `${duration}h`;
  }
  const parsed = parseDurationFromLibrary(durationStr);
  if (!parsed) {
    return logAndQuit(`Invalid duration: ${duration} (examples: 1h, 30m, 2d)`);
  }

  return parsed / 1000;
}

export function parsePricePerGpuHour(price?: string) {
  if (!price) {
    return null;
  }

  // Remove $ if present
  const priceWithoutDollar = price.replace("$", "");
  return Number.parseFloat(priceWithoutDollar) * 100;
}

export function QuoteComponent(props: { options: SfBuyOptions }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const quote = await getQuoteFromParsedSfBuyOptions(props.options);
      if (quote) setQuote(quote);
      setIsLoading(false);
    })();
  }, [props.options]);

  return isLoading
    ? (
      <Box gap={1}>
        <Spinner type="dots" />
        <Box gap={1}>
          <Text>Getting quote...</Text>
        </Box>
      </Box>
    )
    : <QuoteDisplay quote={quote} />;
}

export function QuoteAndBuy(props: { options: SfBuyOptions }) {
  const [orderProps, setOrderProps] = useState<BuyOrderProps | null>(null);

  // submit a quote request, handle loading state
  useEffect(() => {
    (async () => {
      const { start, duration, end } = props.options;
      // Grab the price per GPU hour, either
      let pricePerGpuHour = parsePricePerGpuHour(props.options.price);
      let startAt = start;
      let endsAt: Date;
      const coercedStart = parseStartDate(start);
      if (duration) {
        // If duration is set, calculate end from start + duration
        endsAt = roundEndDate(
          dayjs(coercedStart).add(duration, "seconds").toDate(),
        );
      } else if (end) {
        endsAt = end;
        props.options.duration = dayjs(endsAt).diff(
          dayjs(coercedStart),
          "seconds",
        );
      } else {
        throw new Error("Either duration or end must be set");
      }

      if (!pricePerGpuHour) {
        const quote = await getQuoteFromParsedSfBuyOptions(props.options);
        if (!quote) {
          return logAndQuit(
            "No quote found for the desired order. Try with a different start date, duration, or price.",
          );
        }

        pricePerGpuHour = getPricePerGpuHourFromQuote(quote);

        startAt = parseStartDateOrNow(quote.start_at);

        endsAt = dayjs(quote.end_at).toDate();
      }

      const { type, accelerators, colocate, yes, standing, cluster } =
        props.options;

      setOrderProps({
        type,
        price: pricePerGpuHour,
        size: accelerators / GPUS_PER_NODE,
        startAt,
        endsAt,
        yes,
        standing,
        colocate,
        cluster,
      });
    })();
  }, [props.options]);

  return orderProps === null
    ? (
      <Box gap={1}>
        <Spinner type="dots" />
        <Box gap={1}>
          <Text>Getting quote...</Text>
        </Box>
      </Box>
    )
    : <BuyOrder {...orderProps} />;
}

export function getTotalPrice(
  pricePerGpuHour: number,
  size: number,
  durationInHours: number,
) {
  return Math.ceil(pricePerGpuHour * size * GPUS_PER_NODE * durationInHours);
}

function BuyOrderPreview(props: {
  price: number;
  size: number;
  startAt: Date | "NOW";
  endsAt: Date;
  type: string;
}) {
  const startDate = props.startAt === "NOW" ? dayjs() : dayjs(props.startAt);
  const start = startDate.format("MMM D h:mm a").toLowerCase();

  const startFromNow = startDate.fromNow();

  const endDate = dayjs(roundEndDate(props.endsAt));
  const end = endDate.format("MMM D h:mm a").toLowerCase();

  const endFromNow = endDate.fromNow();

  const realDuration = endDate.diff(startDate);
  const realDurationHours = realDuration / 3600 / 1000;
  const realDurationString = ms(realDuration);

  const totalPrice = getTotalPrice(props.price, props.size, realDurationHours) /
    100;

  const isSupportedType = props.type in InstanceTypeMetadata;
  const typeLabel = isSupportedType
    ? InstanceTypeMetadata[props.type].displayName
    : props.type;

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={7}>
          <Text dimColor>start</Text>
        </Box>
        <Box gap={1}>
          <Text>{start}</Text>
          <Text dimColor>
            {props.startAt === "NOW" ? "(now)" : `(${startFromNow})`}
          </Text>
        </Box>
      </Box>
      <Box>
        <Box width={7}>
          <Text dimColor>end</Text>
        </Box>
        <Box gap={1}>
          <Text>{end}</Text>
          <Text dimColor>({endFromNow})</Text>
        </Box>
      </Box>
      <Row headWidth={7} head="dur" value={`~${realDurationString}`} />
      <Row
        headWidth={7}
        head="size"
        value={`${props.size * GPUS_PER_NODE} gpus`}
      />
      <Box>
        <Box width={7}>
          <Text dimColor>type</Text>
        </Box>
        <Box gap={1}>
          <Text>{typeLabel}</Text>
          {isSupportedType && (
            <Text dimColor>
              ({props.type})
            </Text>
          )}
        </Box>
      </Box>
      <Row
        headWidth={7}
        head="rate"
        value={`~$${(props.price / 100).toFixed(2)}/gpu/hr`}
      />
      <Row headWidth={7} head="total" value={`$${totalPrice.toFixed(2)}`} />
    </Box>
  );
}

const MemoizedBuyOrderPreview = React.memo(BuyOrderPreview);

type Order =
  | Awaited<ReturnType<typeof getOrder>>
  | Awaited<ReturnType<typeof placeBuyOrder>>;
type BuyOrderProps = {
  price: number;
  size: number;
  startAt: Date | "NOW";
  endsAt: Date;
  type: string;
  colocate?: Array<string>;
  yes?: boolean;
  standing?: boolean;
  cluster?: string;
};

function BuyOrder(props: BuyOrderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { exit } = useApp();
  const [order, setOrder] = useState<Order | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(
    "Placing order...",
  );

  const submitOrder = useCallback(async () => {
    const { startAt, endsAt } = props;
    const realDurationInHours =
      dayjs(endsAt).diff(dayjs(parseStartDate(startAt))) / 1000 / 3600;

    setIsLoading(true);
    const order = await placeBuyOrder({
      instanceType: props.type,
      totalPriceInCents: getTotalPrice(
        props.price,
        props.size,
        realDurationInHours,
      ),
      startsAt: props.startAt,
      endsAt,
      colocateWith: props.colocate || [],
      numberNodes: props.size,
      standing: props.standing,
      cluster: props.cluster,
    });
    setOrder(order);
  }, [props]);

  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const handleSubmit = useCallback(
    (submitValue: boolean) => {
      const { startAt, endsAt } = props;
      const realDurationInHours = dayjs(endsAt).diff(dayjs(startAt)) / 1000 /
        3600;
      const totalPriceInCents = getTotalPrice(
        props.price,
        props.size,
        realDurationInHours,
      );

      analytics.track({
        event: "buy_order_quoted",
        properties: {
          price: totalPriceInCents,
          startsAt: startAt,
          endsAt,
          numberNodes: props.size,
          instanceType: props.type,
          duration: realDurationInHours,
        },
      });
      if (submitValue === false) {
        setIsLoading(false);
        setResultMessage("Order not placed, use 'y' to confirm");
        setTimeout(() => {
          analytics.track({
            event: "buy_order_quoted_rejected",
            properties: {
              price: totalPriceInCents,
              startsAt: startAt,
              endsAt,
              numberNodes: props.size,
              instanceType: props.type,
              duration: realDurationInHours,
            },
          });
          exit();
        }, 0);
        return;
      }

      analytics.track({
        event: "buy_order_quoted_accepted",
        properties: {
          price: totalPriceInCents,
          startsAt: startAt,
          endsAt,
          numberNodes: props.size,
          instanceType: props.type,
          duration: realDurationInHours,
        },
      });
      submitOrder();
    },
    [props, exit, submitOrder],
  );

  useEffect(() => {
    if (isLoading && intervalRef.current == null) {
      intervalRef.current = setInterval(async () => {
        if (!order) {
          return;
        }

        const o = await getOrder(order.id);
        if (!o) {
          setLoadingMsg(
            "Can't find order. This could be a network issue, try ctrl-c and running 'sf orders ls' to see if it was placed.",
          );
          return;
        }
        if (o.status === "pending") {
          setLoadingMsg("Pending...");
          return;
        }
        setOrder(o);

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        exit();
        return;
      }, 200);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isLoading, order, exit]);

  useEffect(() => {
    if (!isLoading && props.yes) {
      submitOrder();
    }
  }, [isLoading, props.yes, submitOrder]);

  return (
    <Box gap={1} flexDirection="column">
      <MemoizedBuyOrderPreview {...props} />

      {!isLoading && !props.yes && (
        <Box gap={1}>
          <Text>Place order? (y/n)</Text>

          <ConfirmInput
            isChecked={false}
            onSubmit={handleSubmit}
          />
        </Box>
      )}

      {isLoading && (
        <Box gap={1} flexDirection="column">
          {(!order || order.status === "pending") && <Spinner type="dots" />}
          {!order && <Text>{loadingMsg}</Text>}
          {order && order.status === "open" && <Text color="yellow">•</Text>}
          {order && order.status === "cancelled" && (
            <Box gap={1} flexDirection="column">
              <Text color="red">Order could not be filled: {order.id}</Text>
              <Text>
                No charges applied. Try again with different parameters (price,
                duration, or quantity).
              </Text>
            </Box>
          )}
          {order && order.status !== "cancelled" && (
            <Box gap={1}>
              <Text>Order placed: {order.id}</Text>
              <Text>- ({order.status})</Text>
            </Box>
          )}

          {order &&
            order.status === "filled" &&
            (order as Awaited<ReturnType<typeof getOrder>>) &&
            order.execution_price && (
            <Box flexDirection="column">
              {order.start_at && order.end_at &&
                order.start_at !== order.end_at && (
                <Row
                  headWidth={16}
                  head="executed rate"
                  value={`~${
                    centsToDollarsFormatted(
                      Number(order.execution_price) /
                        ((Number(order.quantity)) *
                          GPUS_PER_NODE) /
                        dayjs(order.end_at).diff(
                          dayjs(order.start_at),
                          "hours",
                          true,
                        ),
                    )
                  }/gpu/hr`}
                />
              )}
              <Row
                headWidth={16}
                head="executed total"
                value={`~${
                  centsToDollarsFormatted(
                    Number(order.execution_price),
                  )
                }`}
              />
              {order.execution_price && Number(order.price) > 0 &&
                Number(order.execution_price) > 0 &&
                Number(order.execution_price) < Number(order.price) && (
                <Row
                  headWidth={16}
                  head="saved"
                  value={`~${
                    (
                      ((Number(order.price) - Number(order.execution_price)) *
                        100) /
                      Number(order.price)
                    ).toFixed(2)
                  }%`}
                />
              )}
            </Box>
          )}
        </Box>
      )}

      {resultMessage && <Text dimColor>{resultMessage}</Text>}

      {order && order.status === "open" && (
        <Box paddingY={1} paddingX={2} flexDirection="column" gap={1}>
          <Text>Order is open but not yet filled. Check status with:</Text>
          <Box paddingLeft={2}>
            <Text color="green">sf orders ls</Text>
          </Box>

          <Text>Cancel this order with:</Text>
          <Box paddingLeft={2}>
            <Text color="green">sf orders cancel {order.id}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export async function placeBuyOrder(options: {
  instanceType: string;
  totalPriceInCents: number;
  startsAt: Date | "NOW";
  endsAt: Date;
  colocateWith: Array<string>;
  numberNodes: number;
  standing?: boolean;
  cluster?: string;
}) {
  invariant(
    options.totalPriceInCents === Math.ceil(options.totalPriceInCents),
    "totalPriceInCents must be a whole number",
  );
  invariant(options.numberNodes > 0, "numberNodes must be greater than 0");
  invariant(
    options.numberNodes === Math.ceil(options.numberNodes),
    "numberNodes must be a whole number",
  );

  const api = await apiClient();

  // round start date again because the user might take a long time to confirm
  let start_at: string;
  if (options.startsAt === "NOW") {
    start_at = "NOW";
  } else {
    const roundedStartDate = roundStartDate(options.startsAt);
    if (roundedStartDate === "NOW") {
      start_at = "NOW" as const;
    } else {
      start_at = roundedStartDate.toISOString();
    }
  }

  const body = {
    side: "buy",
    instance_type: options.instanceType,
    quantity: options.numberNodes,
    start_at,
    end_at: roundEndDate(options.endsAt).toISOString(),
    price: options.totalPriceInCents,
    colocate_with: options.colocateWith,
    flags: {
      ioc: !options.standing,
    },
    cluster: options.cluster,
  } as const;
  const { data, error, response } = await api.POST("/v0/orders", {
    body,
  });

  if (!response.ok) {
    switch (response.status) {
      case 400: {
        if (error?.message === "Insufficient balance") {
          return logAndQuit(
            "Order not placed. You don't have enough funds. Add funds with\n\t🏦 Bank transfer: https://sfcompute.com/dashboard?bankTransferDialogOpen=true\n\t💳 Credit card: https://sfcompute.com/dashboard?payWithCardDialogOpen=true",
          );
        }

        return logAndQuit(
          `Bad Request: ${error?.message}; ${JSON.stringify(error, null, 2)}`,
        );
      }
      case 401:
        return await logSessionTokenExpiredAndQuit();
      case 500:
        return logAndQuit(`Failed to place order: ${error?.message}`);
      default:
        return logAndQuit(
          `Failed to place order: ${response.status} ${response.statusText} - ${
            error?.code ? `[${error.code}] ` : ""
          }${error?.message || "Unknown error"}`,
        );
    }
  }

  if (!data) {
    return logAndQuit(
      `Failed to place order: Unexpected response from server: ${response}`,
    );
  }

  return data;
}

export function getPricePerGpuHourFromQuote(quote: NonNullable<Quote>) {
  const durationSeconds = dayjs(quote.end_at).diff(
    parseStartDate(quote.start_at),
  );
  const durationHours = durationSeconds / 3600 / 1000;

  return quote.price / GPUS_PER_NODE / quote.quantity / durationHours;
}

async function getQuoteFromParsedSfBuyOptions(options: SfBuyOptions) {
  const startsAt = options.start === "NOW"
    ? "NOW"
    : roundStartDate(parseStartDate(options.start));
  const durationSeconds = options.duration
    ? options.duration
    : dayjs(options.end).diff(dayjs(parseStartDate(startsAt)), "seconds");
  const quantity = options.accelerators / GPUS_PER_NODE;

  const minDurationSeconds = Math.max(
    1,
    durationSeconds - Math.ceil(durationSeconds * 0.1),
  );
  const maxDurationSeconds = Math.max(
    durationSeconds + 3600,
    durationSeconds + Math.ceil(durationSeconds * 0.1),
  );

  return await getQuote({
    instanceType: options.type,
    quantity,
    minStartTime: startsAt,
    maxStartTime: startsAt,
    minDurationSeconds,
    maxDurationSeconds,
    cluster: options.cluster,
    colocateWith: options.colocate,
  });
}

type QuoteOptions = {
  instanceType: string;
  quantity: number;
  minStartTime: Date | "NOW";
  maxStartTime: Date | "NOW";
  minDurationSeconds: number;
  maxDurationSeconds: number;
  cluster?: string;
  colocateWith?: Array<string>;
};

export async function getQuote(options: QuoteOptions) {
  const api = await apiClient();

  const params = {
    query: {
      side: "buy",
      instance_type: options.instanceType,
      quantity: options.quantity,
      min_start_date: options.minStartTime === "NOW"
        ? ("NOW" as const)
        : options.minStartTime.toISOString(),
      max_start_date: options.maxStartTime === "NOW"
        ? ("NOW" as const)
        : options.maxStartTime.toISOString(),
      min_duration: options.minDurationSeconds,
      max_duration: options.maxDurationSeconds,
      cluster: options.cluster,
      colocate_with: options.colocateWith,
    },
  } as const;

  const { data, error, response } = await api.GET("/v0/quote", {
    params,
    // timeout after 600 seconds
    signal: AbortSignal.timeout(600 * 1000),
  });

  if (!response.ok) {
    switch (response.status) {
      case 400:
        return logAndQuit(`Bad Request: ${error?.message}`);
      case 401:
        return await logSessionTokenExpiredAndQuit();
      case 500:
        return logAndQuit(`Failed to get quote: ${error?.code}`);
      default:
        return logAndQuit(`Failed to get quote: ${response.statusText}`);
    }
  }

  if (!data) {
    return logAndQuit(
      `Failed to get quote: Unexpected response from server: ${response}`,
    );
  }

  if (!data.quote) {
    return null;
  }

  return {
    ...data.quote,
    price: Number(data.quote.price),
    quantity: Number(data.quote.quantity),
    start_at: data.quote.start_at,
    end_at: data.quote.end_at,
  };
}

export async function getOrder(orderId: string) {
  const api = await apiClient();

  const { data: order } = await api.GET("/v0/orders/{id}", {
    params: { path: { id: orderId } },
  });
  return order;
}

export async function getMostRecentIndexAvgPrice(instanceType: string) {
  const api = await apiClient();

  const { data } = await api.GET("/v0/prices", {
    params: {
      query: {
        instance_type: instanceType,
      },
    },
  });

  if (!data) {
    return logAndQuit("Failed to get prices: Unexpected response from server");
  }

  const sortedData = data.data.filter((item) => !item.no_data).sort((a, b) => {
    return dayjs(b.period_start).diff(dayjs(a.period_start));
  });

  return sortedData[0].gpu_hour;
}

export async function getAggressivePricePerHour(instanceType: string) {
  const mostRecentPrice = await getMostRecentIndexAvgPrice(instanceType);
  // We'll set a floor on the recommended price here, because the index price
  // will report 0 if there was no data, which might happen due to an outage.
  const minimumPrice = 75; // 75 cents

  if (!mostRecentPrice) {
    return minimumPrice;
  }

  const recommendedIndexPrice = (mostRecentPrice.avg + mostRecentPrice.max) / 2;
  if (recommendedIndexPrice < minimumPrice) {
    return minimumPrice;
  }

  return recommendedIndexPrice;
}
