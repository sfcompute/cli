import type { Command } from "commander";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { apiClient } from "../../apiClient";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors";
import { roundStartDate } from "../../helpers/units";
import parseDurationFromLibrary from "parse-duration";
import { Box, render, useApp, useInput } from "ink";
import { parseDate } from 'chrono-node'
import { GPUS_PER_NODE } from "../constants";
import type { Quote } from "./types";
import QuoteDisplay from "./Quote";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useState } from "react";
import { Text } from "ink";
import ConfirmInput from "../ConfirmInput";


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

const Counter = () => {
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCounter(previousCounter => previousCounter + 1);
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return <Text color="green">{counter} tests passed</Text>;
};

render(<Robot />);

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
    .action(() => {
      render(<Robot />)
    });
}

function parseStart(start?: string) {
  if (!start) {
    return "NOW";
  }

  if (start === "NOW") {
    return "NOW";
  }

  const parsed = parseDate(start);
  if (!parsed) {
    return logAndQuit(`Invalid start date: ${start}`);
  }

  return parsed;
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
  const priceWithoutDollar = price.replace('$', '');
  return Number.parseFloat(priceWithoutDollar);
}

async function quoteAction(options: SfBuyOptions) {
  const quote = await getQuoteFromParsedSfBuyOptions(options);
  render(<QuoteDisplay quote={quote} />)
}

function Robot() {
  const { exit } = useApp();
  const [x, setX] = useState(1);
  const [y, setY] = useState(1);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
    }

    if (key.leftArrow) {
      setX(Math.max(1, x - 1));
    }

    if (key.rightArrow) {
      setX(Math.min(20, x + 1));
    }

    if (key.upArrow) {
      setY(Math.max(1, y - 1));
    }

    if (key.downArrow) {
      setY(Math.min(10, y + 1));
    }
  });

  return (
    <Box flexDirection="column">
      <Text>Use arrow keys to move the face. Press “q” to exit.</Text>
      <Box height={12} paddingLeft={x} paddingTop={y}>
        <Text>^_^</Text>
      </Box>
    </Box>
  );
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

  render(<Robot />);

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

  const inst = render(<BuyOrder />, {
    exitOnCtrlC: true,
    patchConsole: true,
  });
  inst.rerender(<BuyOrder />);
}

function BuyOrder() {

  return <Robot />
  const [answer, setAnswer] = useState('');
  const [value, setValue] = useState('');
  const handleSubmit = useCallback((submitValue: boolean) => {
    if (submitValue === false) {
      setAnswer('You are heartless…');
      return;
    }

    setAnswer('You love unicorns!');
  }, []);

  return (
    <Box>
      <Text>Do you like unicorns? (Y/n)</Text>

      <ConfirmInput
        isChecked
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
      />

      <Text>{answer}</Text>
    </Box>
  );
}

type BuyOptions = {
  instanceType: string;
  priceCents: number;
  quantity: number;
  startsAt: Date | "NOW";
  endsAt: Date;
  durationSeconds: number;
  quoteOnly: boolean;
  colocate_with: Array<string>;
};
export async function placeBuyOrder(
  options: Omit<BuyOptions, "durationSeconds">,
) {
  const api = await apiClient();
  const { data, error, response } = await api.POST("/v0/orders", {
    body: {
      side: "buy",
      instance_type: options.instanceType,
      quantity: options.quantity,
      // round start date again because the user might take a long time to confirm
      start_at:
        options.startsAt === "NOW"
          ? "NOW"
          : roundStartDate(options.startsAt).toISOString(),
      end_at: options.endsAt.toISOString(),
      price: options.priceCents,
      colocate_with: options.colocate_with,
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
  const durationSeconds = dayjs(quote.end_at).diff(dayjs(quote.start_at), 'seconds');
  const durationHours = durationSeconds / 3600;

  return quote.price / 100 / GPUS_PER_NODE / quote.quantity / durationHours;
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
        min_start_date:
          options.startsAt === "NOW" ? "NOW" : options.startsAt.toISOString(),
        max_start_date:
          options.startsAt === "NOW" ? "NOW" : options.startsAt.toISOString(),
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
