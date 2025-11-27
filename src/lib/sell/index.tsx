import type { Command } from "@commander-js/extra-typings";
import { clearInterval, setInterval } from "node:timers";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { apiClient } from "../../apiClient.ts";
import { components } from "../../schema.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import parseDurationFromLibrary from "parse-duration";
import { Box, render, useApp } from "ink";
import { parseStartDate } from "../../helpers/units.ts";
import { GPUS_PER_NODE } from "../constants.ts";
import { useCallback, useEffect, useState } from "react";
import { Text } from "ink";
import ConfirmInput from "../ConfirmInput.tsx";
import React from "react";
import { Row } from "../Row.tsx";
import ms from "ms";
import Spinner from "ink-spinner";
import invariant from "tiny-invariant";
import { getContract } from "../../helpers/fetchers.ts";
import { isLoggedIn } from "../../helpers/config.ts";

type SellOrderFlags = components["schemas"]["market-api_OrderFlags"];

dayjs.extend(relativeTime);
dayjs.extend(duration);

export function registerSell(program: Command) {
  program
    .command("sell")
    .description("Place a sell order")
    .requiredOption("-p, --price <price>", "The price in dollars, per GPU hour")
    .requiredOption("-c, --contract-id <id>", "Specify the contract ID")
    .option("-n, --accelerators <quantity>", "Specify the number of GPUs", "8")
    .option(
      "-s, --start <start>",
      "Specify the start date. Can be a date, relative time like '+1d', or the string 'NOW'",
    )
    .option("-d, --duration <duration>", "Specify the duration", "1h")
    .option(
      "-f, --flags <flags>",
      "Specify additional flags as JSON",
      JSON.parse,
    )
    .option("-y, --yes", "Automatically confirm the order")
    .action(async function sellOrderAction(options) {
      if (!(await isLoggedIn())) {
        return logLoginMessageAndQuit();
      }

      const pricePerGpuHour = parsePricePerGpuHour(options.price);
      if (!pricePerGpuHour) {
        return logAndQuit(`Invalid price: ${options.price}`);
      }

      const contractId = options.contractId;

      if (!contractId || !contractId.startsWith("cont_")) {
        return logAndQuit(`Invalid contract ID: ${contractId}`);
      }

      const size = parseAccelerators(options.accelerators);
      if (isNaN(size) || size <= 0) {
        return logAndQuit(
          `Invalid number of accelerators: ${options.accelerators}`,
        );
      }

      const durationSeconds = parseDuration(options.duration);
      if (!durationSeconds || durationSeconds <= 0) {
        return logAndQuit(`Invalid duration: ${options.duration}`);
      }

      const startDate = parseStartDate(options.start);
      if (!startDate) {
        return logAndQuit(`Invalid start date: ${options.start}`);
      }

      const endDate = roundEndDate(
        dayjs(startDate).add(durationSeconds, "seconds").toDate(),
      ).toDate();

      // Fetch contract details
      const contract = await getContract(contractId);
      if (!contract) {
        return logAndQuit(`Contract not found: ${contractId}`);
      }

      // Prepare order details
      const orderDetails = {
        price: pricePerGpuHour,
        contractId: contractId,
        size: size,
        startAt: startDate,
        endsAt: endDate,
        flags: options.flags as SellOrderFlags, // TODO: explicitly parse and validate this
        autoConfirm: options.yes || false,
      };

      // Render the SellOrder component
      render(<SellOrder {...orderDetails} />);
    });
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

function roundEndDate(endDate: Date) {
  return dayjs(endDate).add(1, "hour").startOf("hour");
}

function getTotalPrice(
  pricePerGpuHour: number,
  size: number,
  durationInHours: number,
) {
  return Math.ceil(pricePerGpuHour * size * GPUS_PER_NODE * durationInHours);
}

type Order =
  | Awaited<ReturnType<typeof getOrder>>
  | Awaited<ReturnType<typeof placeSellOrder>>;

function SellOrder(props: {
  price: number;
  contractId: string;
  size: number;
  startAt: Date | "NOW";
  endsAt: Date;
  flags?: SellOrderFlags;
  autoConfirm?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { exit } = useApp();
  const [order, setOrder] = useState<Order | null>(null);

  const handleSubmit = useCallback(
    (submitValue: boolean) => {
      if (submitValue === false) {
        setIsLoading(false);
        exit();
        return;
      }

      submitOrder();
    },
    [exit],
  );

  async function submitOrder() {
    setIsLoading(true);
    // Place the sell order
    const order = await placeSellOrder({
      price: props.price,
      contractId: props.contractId,
      quantity: props.size,
      startAt: props.startAt,
      endsAt: props.endsAt,
      flags: props.flags,
    });
    setOrder(order);
  }

  useEffect(() => {
    if (props.autoConfirm) {
      submitOrder();
    }
  }, [props.autoConfirm]);

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
      }, 200);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLoading, exit, order]);

  return (
    <Box gap={1} flexDirection="column">
      <SellOrderPreview {...props} />

      {!isLoading && !props.autoConfirm && (
        <Box gap={1}>
          <Text>Place order? (y/n)</Text>

          <ConfirmInput
            isChecked={false}
            onSubmit={handleSubmit}
          />
        </Box>
      )}

      {isLoading && (
        <Box gap={1}>
          {(!order || order.status === "pending") && <Spinner type="arc" />}
          {order && order.status === "open" && <Text color="yellow">•</Text>}
          {!order && <Text>Placing order...</Text>}
          {order && (
            <Box gap={1}>
              <Text>Order placed: {order.id}</Text>
              <Text>- ({order.status})</Text>
            </Box>
          )}
        </Box>
      )}

      {order && order.status === "open" && (
        <Box paddingY={1} paddingX={2} flexDirection="column" gap={1}>
          <Text>
            Your order is open, but not filled. You can check its status with...
          </Text>
          <Box paddingLeft={2}>
            <Text color="green">sf orders ls</Text>
          </Box>

          <Text>Or you can cancel it with...</Text>
          <Box paddingLeft={2}>
            <Text color="green">sf orders cancel {order.id}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function SellOrderPreview(props: {
  price: number;
  contractId: string;
  size: number;
  startAt: Date | "NOW";
  endsAt: Date;
  flags?: SellOrderFlags;
}) {
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

  const totalPrice = getTotalPrice(props.price, props.size, realDurationHours) /
    100;

  return (
    <Box flexDirection="column">
      <Text color="yellow">Sell Order</Text>
      <Row headWidth={12} head="contract-id" value={props.contractId} />
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
      <Row
        headWidth={7}
        head="rate"
        value={`$${(props.price / 100).toFixed(2)}/gpu/hr`}
      />
      <Row headWidth={7} head="total" value={`$${totalPrice.toFixed(2)}`} />
    </Box>
  );
}

export async function placeSellOrder(options: {
  price: number;
  contractId: string;
  quantity: number;
  startAt: Date | "NOW";
  endsAt: Date;
  flags?: SellOrderFlags;
}) {
  const realDurationHours = dayjs(options.endsAt).diff(
    dayjs(options.startAt === "NOW" ? new Date() : options.startAt),
  ) /
    3600 /
    1000;
  const totalPrice = getTotalPrice(
    options.price,
    options.quantity,
    realDurationHours,
  );
  invariant(
    totalPrice == Math.ceil(totalPrice),
    "totalPrice must be a whole number",
  );

  const api = await apiClient();
  const { data, error, response } = await api.POST("/v0/orders", {
    body: {
      side: "sell",
      price: totalPrice,
      contract_id: options.contractId,
      quantity: options.quantity,
      start_at: options.startAt === "NOW"
        ? "NOW"
        : options.startAt.toISOString(),
      end_at: options.endsAt.toISOString(),
      flags: options.flags || {},
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

export async function getOrder(orderId: string) {
  const api = await apiClient();

  const { data: order, error, response } = await api.GET("/v0/orders/{id}", {
    params: { path: { id: orderId } },
  });

  if (error) {
    // @ts-ignore -- TODO: FIXME: include error in OpenAPI schema output
    if (error?.code === "order.not_found" || response.status === 404) {
      return undefined;
    }

    return logAndQuit(`Failed to get order: ${error.message}`);
  }

  return order;
}
