import type { Command } from "commander";
import dayjs from "npm:dayjs@1.11.13";
import duration from "npm:dayjs@1.11.13/plugin/duration.js";
import relativeTime from "npm:dayjs@1.11.13/plugin/relativeTime.js";
import { apiClient } from "../../apiClient.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { parseStartDate, roundStartDate } from "../../helpers/units.ts";
import parseDurationFromLibrary from "parse-duration";
import { Box, render, useApp, useInput } from "ink";
import { parseDate } from "chrono-node";
import { GPUS_PER_NODE } from "../constants.ts";
import type { Quote } from "../Quote.tsx";
import QuoteDisplay from "../Quote.tsx";
import { useCallback, useEffect, useState } from "react";
import { Text } from "ink";
import ConfirmInput from "../ConfirmInput.tsx";
import React from 'react'
import { Row } from "../Row.tsx";
import ms from "ms";
import Spinner from "ink-spinner";
import invariant from "tiny-invariant";

dayjs.extend(relativeTime);
dayjs.extend(duration);

interface SfBuyOptions {
  type: string;
  accelerators?: string;
  duration: string;
  price: string;
  start?: string;
  yes?: boolean;
  quote?: boolean;
  colocate?: Array<string>;
}



export function registerBuy(program: Command) {
  program
    .command("buy")
    .description("Place a buy order")
    .requiredOption("-t, --type <type>", "Specify the type of node", "h100i")
    .option("-n, --accelerators <quantity>", "Specify the number of GPUs", "8")
    .requiredOption("-d, --duration <duration>", "Specify the duration", "1h")
    .option("-p, --price <price>", "The price in dollars, per GPU hour")
    .option(
      "-s, --start <start>",
      "Specify the start date. Can be a date, relative time like '+1d', or the string 'NOW'",
    )
    .option("-y, --yes", "Automatically confirm the order")
    .option(
      "-colo, --colocate <contracts_to_colocate_with>",
      "Colocate with existing contracts",
      (value) => value.split(","),
      [],
    )
    .option("--quote", "Only provide a quote for the order")
    .action(buyOrderAction);
}

function parseStart(start?: string) {
  if (!start) {
    return "NOW";
  }

  if (start === "NOW" || start === "now") {
    return "NOW";
  }

  const parsed = parseDate(start);
  if (!parsed) {
    return logAndQuit(`Invalid start date: ${start}`);
  }

  return parsed;
}

function parseStartAsDate(start?: string) {
  const date = parseStart(start);
  if (date === "NOW") {
    return new Date();
  }

  return date;
}

function parseAccelerators(accelerators?: string) {
  if (!accelerators) {
    return 1;
  }

  return Number.parseInt(accelerators) / GPUS_PER_NODE;
}

function parseDuration(duration?: string) {
  if (!duration) {
    return 1 * 60 * 60; // 1 hour
  }

  const parsed = parseDurationFromLibrary(duration);
  if (!parsed) {
    return logAndQuit(`Invalid duration: ${duration}`);
  }

  return parsed / 1000;
}

function parsePricePerGpuHour(price?: string) {
  if (!price) {
    return null;
  }

  // Remove $ if present
  const priceWithoutDollar = price.replace("$", "");
  return Number.parseFloat(priceWithoutDollar) * 100;
}

async function quoteAction(options: SfBuyOptions) {
  const quote = await getQuoteFromParsedSfBuyOptions(options);
  render(<QuoteDisplay quote={quote} />);
}


/*
Flow is:
1. If --quote, get quote and exit
2. If -p is provided, use it as the price
3. Otherwise, get a price by quoting the market
4. If --yes isn't provided, ask for confirmation
5. Place order
 */
async function buyOrderAction(options: SfBuyOptions) {

  if (options.quote) {
    return quoteAction(options);
  }

  // Grab the price per GPU hour, either
  let pricePerGpuHour: number | null = parsePricePerGpuHour(options.price);
  if (!pricePerGpuHour) {
    const quote = await getQuoteFromParsedSfBuyOptions(options);
    if (!quote) {
      pricePerGpuHour = await getAggressivePricePerHour(options.type);
    } else {
      pricePerGpuHour = getPricePerGpuHourFromQuote(quote);
    }
  }

  const duration = parseDuration(options.duration);
  const startDate = parseStartAsDate(options.start);
  const endsAt = roundEndDate(dayjs(startDate).add(duration, "seconds").toDate()).toDate();

  render(<BuyOrder price={pricePerGpuHour} size={parseAccelerators(options.accelerators)} startAt={startDate} type={options.type} endsAt={endsAt} colocate={options.colocate} />);
}

function roundEndDate(endDate: Date) {
  return dayjs(endDate).add(1, "hour").startOf("hour")
}

function getTotalPrice(pricePerGpuHour: number, size: number, durationInHours: number) {
  return Math.ceil(pricePerGpuHour * size * GPUS_PER_NODE * durationInHours)
}

function BuyOrderPreview(props: { price: number, size: number, startAt: Date | "NOW", endsAt: Date, type: string }) {
  const startDate = props.startAt === "NOW" ? dayjs() : dayjs(props.startAt);
  const start = startDate.format("MMM D h:mm a").toLowerCase();

  // @ts-ignore fromNow not typed
  const startFromNow = startDate.fromNow();

  const endDate = roundEndDate(props.endsAt);
  const end = endDate.format("MMM D h:mm a").toLowerCase();

  // @ts-ignore fromNow not typed
  const endFromNow = endDate.fromNow();

  const realDuration = endDate.diff(startDate);
  const realDurationHours = realDuration / 3600 / 1000;
  const realDurationString = ms(realDuration);

  const totalPrice = getTotalPrice(props.price, props.size, realDurationHours) / 100;

  return (<Box flexDirection="column">
    <Text color="yellow">Buy Order</Text>
    <Row headWidth={7} head="type" value={props.type} />
    <Box>
      <Box width={7}>
        <Text dimColor>start</Text>
      </Box>
      <Box gap={1}>
        <Text>{start}</Text>
        <Text dimColor>{props.startAt === "NOW" ? "(now)" : `(${startFromNow})`}</Text>
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
    <Row headWidth={7} head="size" value={`${props.size * GPUS_PER_NODE} gpus`} />
    <Row headWidth={7} head="rate" value={`$${(props.price / 100).toFixed(2)}/gpu/hr`} />
    <Row headWidth={7} head="total" value={`$${totalPrice.toFixed(2)}`} />
  </Box>)
}

type Order = Awaited<ReturnType<typeof getOrder>> | Awaited<ReturnType<typeof placeBuyOrder>>;

function BuyOrder(props: { price: number, size: number, startAt: Date | "NOW", endsAt: Date, type: string, colocate?: Array<string> }) {
  const [isLoading, setIsLoading] = useState(false);
  const [value, setValue] = useState("");
  const { exit } = useApp();
  const [order, setOrder] = useState<Order | null>(null);

  async function submitOrder() {
    const endsAt = roundEndDate(props.endsAt);
    const startAt = props.startAt === "NOW" ? parseStartAsDate(props.startAt) : props.startAt;
    const realDurationInHours = dayjs(endsAt).diff(dayjs(startAt)) / 1000 / 3600;

    setIsLoading(true);
    const order = await placeBuyOrder({
      instanceType: props.type,
      totalPriceInCents: getTotalPrice(props.price, props.size, realDurationInHours),
      startsAt: props.startAt,
      endsAt: endsAt.toDate(),
      colocateWith: props.colocate || [],
      numberNodes: props.size,
    })
    setOrder(order);
  }

  const handleSubmit = useCallback((submitValue: boolean) => {
    if (submitValue === false) {
      setIsLoading(false);
      exit();
      return;
    }

    submitOrder();
  }, [exit]);


  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isLoading) {
      interval = setInterval(async () => {
        if (!isLoading) {
          exit();
        }

        if (!order) {
          return;
        }

        const o = await getOrder(order!.id);
        setOrder(o);

        if (o && o.status != "pending") {
          exit()
          return
        }
      }, 200);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLoading, exit, value, order]);

  return (
    <Box gap={1} flexDirection="column">
      <BuyOrderPreview {...props} />

      {!isLoading && <Box gap={1}>
        <Text>Place order? (y/n)</Text>

        <ConfirmInput
          isChecked={false}
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
        />

      </Box>}

      {isLoading && <Box gap={1}>
        {(!order || order.status === "pending") && <Spinner type="dots" />}
        {order && order.status === "open" && <Text color={"yellow"}>•</Text>}
        {!order && <Text>Placing order...</Text>}
        {order && <Box gap={1}><Text>Order placed: {order.id}</Text><Text>- ({order.status})</Text></Box>}
      </Box>}

      {order && order.status === "open" && <Box paddingY={1} paddingX={2} flexDirection="column" gap={1}>
        <Text>Your order is open, but not filled. You can check it's status with... </Text>
        <Box paddingLeft={2}>
          <Text color="green">sf orders ls</Text>
        </Box>

        <Text>Or you can cancel it with... </Text>
        <Box paddingLeft={2}>
          <Text color="green">sf orders cancel {order.id}</Text>
        </Box>
      </Box>}
    </Box>
  );
}


export async function placeBuyOrder(
  options: {
    instanceType: string;
    totalPriceInCents: number;
    startsAt: Date | "NOW";
    endsAt: Date;
    colocateWith: Array<string>;
    numberNodes: number;
  }
) {
  invariant(options.totalPriceInCents == Math.ceil(options.totalPriceInCents), "totalPriceInCents must be a whole number");
  invariant(options.numberNodes > 0, "numberNodes must be greater than 0");

  const api = await apiClient();
  const { data, error, response } = await api.POST("/v0/orders", {
    body: {
      side: "buy",
      instance_type: options.instanceType,
      quantity: options.numberNodes,
      // round start date again because the user might take a long time to confirm
      start_at: options.startsAt === "NOW"
        ? "NOW"
        : roundStartDate(options.startsAt).toISOString(),
      end_at: options.endsAt.toISOString(),
      price: options.totalPriceInCents,
      colocate_with: options.colocateWith,
    },
  });

  if (!response.ok) {
    switch (response.status) {
      case 400:
        return logAndQuit(`Bad Request: ${error?.message}`);
      case 401:
        return await logSessionTokenExpiredAndQuit();
      case 500:
        return logAndQuit(`Failed to place order: ${error?.message}`);
      default:
        return logAndQuit(`Failed to place order: ${response.statusText}`);
    }
  }

  if (!data) {
    return logAndQuit(
      `Failed to place order: Unexpected response from server: ${response}`,
    );
  }

  return data;
}

function getPricePerGpuHourFromQuote(quote: NonNullable<Quote>) {
  const durationSeconds = dayjs(quote.end_at).diff(
    parseStartAsDate(quote.start_at),
  );
  const durationHours = durationSeconds / 3600 / 1000;

  return quote.price / GPUS_PER_NODE / quote.quantity / durationHours;
}

async function getQuoteFromParsedSfBuyOptions(options: SfBuyOptions) {
  return await getQuote({
    instanceType: options.type,
    quantity: parseAccelerators(options.accelerators),
    startsAt: parseStart(options.start),
    durationSeconds: parseDuration(options.duration),
  });
}

type QuoteOptions = {
  instanceType: string;
  quantity: number;
  startsAt: Date | "NOW";
  durationSeconds: number;
};
export async function getQuote(options: QuoteOptions) {
  const api = await apiClient();

  const { data, error, response } = await api.GET("/v0/quote", {
    params: {
      query: {
        side: "buy",
        instance_type: options.instanceType,
        quantity: options.quantity,
        duration: options.durationSeconds,
        min_start_date: options.startsAt === "NOW"
          ? "NOW"
          : options.startsAt.toISOString(),
        max_start_date: options.startsAt === "NOW"
          ? "NOW"
          : options.startsAt.toISOString(),
      },
    },
  });

  if (!response.ok) {
    switch (response.status) {
      case 400:
        console.log("Error:", error);
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

  return data.quote;
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

  data.data.sort((a, b) => {
    return dayjs(b.period_start).diff(dayjs(a.period_start));
  });

  return data.data[0].gpu_hour;
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
