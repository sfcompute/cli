// Remove Inquirer and Chalk imports
// import { confirm } from "@inquirer/prompts";
// import c from "chalk";

// Import necessary modules from Ink
import { Box, render, Text, useApp } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import parseDuration from "parse-duration";
import { apiClient } from "../apiClient.ts";
import { logAndQuit } from "../helpers/errors.ts";
import {
  type Cents,
  centsToDollarsFormatted,
  dollarsToCents,
} from "../helpers/units.ts";
import { getBalance } from "./balance.ts";
import { getQuote } from "./buy/index.tsx";
import { formatDuration } from "./orders/index.tsx";
import ConfirmInput from "./ConfirmInput.tsx";
import Spinner from "ink-spinner";
import { GPUS_PER_NODE } from "./constants.ts";
import { Row } from "./Row.tsx";
import { Command } from "commander";

export function registerDown(program: Command) {
  const cmd = program
    .command("down")
    .description("Turn off nodes")
    .option("-t, --type <type>", "Specify the type of node", "h100i");

  cmd.action((options) => {
    render(<DownCommand {...options} />);
  });
}

function parseAccelerators(accelerators?: string) {
  if (!accelerators) {
    return 1;
  }

  return Number.parseInt(accelerators) / GPUS_PER_NODE;
}

const DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS = 265; // Adjust as needed (e.g., $2.65 per GPU per hour)

export function registerUp(program: Command) {
  const cmd = program
    .command("up")
    .description("Automatically buy GPUs until you have the desired quantity")
    .option(
      "-n, --accelerators <accelerators>",
      "The number of GPUs to purchase continuously",
      "1",
    )
    .option("-t, --type <type>", "Specify the type of node", "h100i")
    .option("-d, --duration <duration>", "Specify the minimum duration")
    .option(
      "-p, --price <price>",
      "Specify the maximum price per GPU hour, in dollars",
    )
    .option("-y, --yes", "Automatically confirm the order");

  cmd.action((options) => {
    render(<UpCommand {...options} />);
  });
}

function UpCommand(props: {
  accelerators: string;
  type: string;
  duration?: string;
  price?: string;
  yes?: boolean;
}) {
  const { exit } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<
    React.ReactNode
  >(null);
  const [balanceLowMessage, setBalanceLowMessage] = useState<React.ReactNode>(
    null,
  );
  const [procurementResult, setProcurementResult] = useState<any>(null);

  useEffect(() => {
    // Initial setup
    async function init() {
      try {
        const {
          durationHours,
          accelerators,
          type,
          pricePerGpuHourInCents,
          totalPriceInCents,
        } = await getDefaultProcurementOptions(props);

        if (durationHours < 1) {
          setError("Minimum duration is 1 hour");
          return;
        }

        const balance = await getBalance();
        if (balance.available.cents < totalPriceInCents) {
          setBalanceLowMessage(
            <Text>
              You can't afford this. Available balance: $
              {(balance.available.cents / 100).toFixed(2)}, Minimum price: $
              {(totalPriceInCents / 100).toFixed(2)}
            </Text>,
          );
          return;
        }

        setConfirmationMessage(
          <ConfirmationMessage
            durationHours={durationHours}
            pricePerGpuHourInCents={pricePerGpuHourInCents}
            accelerators={accelerators}
            totalPriceInCents={totalPriceInCents}
            type={type}
          />,
        );

        if (props.yes) {
          await submitProcurement({
            durationHours,
            accelerators,
            type,
            pricePerGpuHourInCents,
          });
        }
      } catch (err: any) {
        setError(err.message);
      }
    }

    init();
  }, []);

  const submitProcurement = useCallback(
    async ({
      durationHours,
      accelerators,
      type,
      pricePerGpuHourInCents,
    }: {
      durationHours: number;
      accelerators: number;
      type: string;
      pricePerGpuHourInCents: number;
    }) => {
      try {
        setIsLoading(true);
        const client = await apiClient();

        // Calculate price per node-hour
        const pricePerNodeHourInCents = pricePerGpuHourInCents * GPUS_PER_NODE;

        // Check existing procurements
        const procurements = await client.GET("/v0/procurements");
        if (!procurements.response.ok) {
          throw new Error(
            procurements.error?.message || "Failed to list procurements",
          );
        }

        const existingProcurement = procurements.data?.data.find(
          (p: any) => p.instance_group === type,
        );

        const nodesRequired = Math.ceil(accelerators / GPUS_PER_NODE);
        if (existingProcurement) {
          const res = await client.PUT("/v0/procurements/{id}", {
            params: {
              path: {
                id: existingProcurement.id,
              },
            },
            body: {
              quantity: nodesRequired,
              min_duration_in_hours: props.duration ? durationHours : undefined,
              max_price_per_node_hour: props.price
                ? pricePerNodeHourInCents
                : undefined,
            },
          });
          setProcurementResult(res.data);
        } else {
          const res = await client.POST("/v0/procurements", {
            body: {
              instance_type: type,
              quantity: nodesRequired,
              max_price_per_node_hour: pricePerNodeHourInCents,
              min_duration_in_hours: Math.max(durationHours, 1),
            },
          });

          if (!res.response.ok) {
            throw new Error(res.error?.message || "Failed to purchase nodes");
          }
          setProcurementResult(res.data);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
        exit();
      }
    },
    [props.duration, props.price, exit],
  );

  const handleSubmit = useCallback(
    (submitValue: boolean) => {
      if (!submitValue) {
        exit();
        return;
      }

      const durationHours = parseDuration(props.duration ?? "2h", "h");
      if (!durationHours) {
        logAndQuit(`Failed to parse duration: ${props.duration}`);
      }
      const accelerators = parseAccelerators(props.accelerators);
      const type = props.type ?? "h100i";
      const pricePerGpuHourInCents = dollarsToCents(
        Number.parseFloat(props.price ?? "0"),
      );

      submitProcurement({
        durationHours,
        accelerators,
        type,
        pricePerGpuHourInCents,
      });
    },
    [submitProcurement, exit],
  );

  return (
    <Box flexDirection="column">
      {error && (
        <Text color="red">
          Error: {error}
        </Text>
      )}
      {balanceLowMessage && <Box>{balanceLowMessage}</Box>}
      {!error && confirmationMessage && !props.yes && !isLoading && (
        <Box flexDirection="column">
          {confirmationMessage}
          <Box>
            <Text>Start GPUs? (y/n)</Text>
            <ConfirmInput
              isChecked={false}
              value={value}
              onChange={setValue}
              onSubmit={handleSubmit}
            />
          </Box>
        </Box>
      )}
      {isLoading && (
        <Box>
          <Spinner type="dots" />
          <Text>Placing procurement...</Text>
        </Box>
      )}
      {procurementResult && (
        <Box>
          <Text color="green">Procurement successful!</Text>
        </Box>
      )}
    </Box>
  );
}

function ConfirmationMessage(props: {
  durationHours: number;
  pricePerGpuHourInCents: number;
  accelerators: number;
  totalPriceInCents: number;
  type: string;
}) {
  const durationInMilliseconds = props.durationHours * 60 * 60 * 1000;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color="green">↑</Text>
        <Text color="yellow">start GPUs</Text>
      </Box>
      <Row
        headWidth={10}
        head="GPUs"
        value={`${props.accelerators} x ${props.type}`}
      />
      <Row
        headWidth={10}
        head="price"
        value={`$${(props.pricePerGpuHourInCents / 100).toFixed(2)}/gpu/hr`}
      />
      <Row
        headWidth={10}
        head="min time"
        value={formatDuration(durationInMilliseconds)}
      />
      <Row
        headWidth={10}
        head="total"
        value={`$${(props.totalPriceInCents / 100).toFixed(2)}/hr`}
      />
    </Box>
  );
}

async function getDefaultProcurementOptions(props: {
  duration?: string;
  accelerators?: string;
  price?: string;
  type?: string;
}) {
  const duration = props.duration ?? "2h";
  let durationHours = parseDuration(duration, "h");
  if (!durationHours) {
    logAndQuit(`Failed to parse duration: ${duration}`);
  }
  durationHours = Math.ceil(durationHours);

  const accelerators = Number.parseInt(props.accelerators ?? "1");
  const nodesRequired = Math.ceil(accelerators / GPUS_PER_NODE);
  const type = props.type ?? "h100i";

  const quote = await getQuote({
    instanceType: type,
    quantity: nodesRequired,
    startsAt: new Date(),
    durationSeconds: durationHours * 60 * 60,
  });

  let quotePricePerGpuHourInCents = DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS;
  if (quote) {
    // Total price divided by duration in hours, GPUs, and nodes
    quotePricePerGpuHourInCents = quote.price / durationHours / GPUS_PER_NODE /
      nodesRequired;
  }

  const pricePerGpuHourInCents = props.price
    ? dollarsToCents(Number.parseFloat(props.price))
    : quotePricePerGpuHourInCents;

  const totalPriceInCents = pricePerGpuHourInCents * accelerators *
    durationHours;

  return {
    durationHours,
    pricePerGpuHourInCents,
    accelerators,
    nodesRequired,
    type,
    totalPriceInCents,
  };
}

function DownCommand(props: {
  type: string;
}) {
  const { exit } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    async function turnOffNodes() {
      try {
        setIsLoading(true);
        const client = await apiClient();

        const procurements = await client.GET("/v0/procurements");
        if (!procurements.response.ok) {
          throw new Error(
            procurements.error?.message || "Failed to list procurements",
          );
        }

        const procurement = procurements.data?.data.find(
          (p: any) => p.instance_group === props.type,
        );

        if (!procurement) {
          throw new Error(`No procurement found for ${props.type}`);
        }

        const res = await client.PUT("/v0/procurements/{id}", {
          params: {
            path: {
              id: procurement.id,
            },
          },
          body: {
            quantity: 0,
            block_duration_in_hours: 0,
          },
        });

        if (!res.response.ok) {
          throw new Error(res.error?.message || "Failed to turn off nodes");
        }

        setResult(res.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
        exit();
      }
    }

    turnOffNodes();
  }, [props.type, exit]);

  return (
    <Box flexDirection="column">
      {isLoading && (
        <Box>
          <Spinner type="dots" />
          <Text>Turning off nodes...</Text>
        </Box>
      )}
      {error && (
        <Text color="red">
          Error: {error}
        </Text>
      )}
      {result && <Text color="green">Nodes turned off successfully!</Text>}
    </Box>
  );
}
