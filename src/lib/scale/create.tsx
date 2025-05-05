import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, render, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import { Command } from "@commander-js/extra-typings";

import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";

import ConfirmInput from "../ConfirmInput.tsx";
import { GPUS_PER_NODE } from "../constants.ts";
import { getQuote } from "../buy/index.tsx";

import {
  acceleratorsToNodes,
  DEFAULT_LIMIT_PRICE_MULTIPLIER,
  DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS,
  MIN_CONTRACT_MINUTES,
  parseAccelerators,
  parseHorizonArg,
  parsePriceArg,
  type Procurement,
} from "./utils.ts";
import ProcurementDisplay from "./ProcurementDisplay.tsx";
import ConfirmationMessage from "./ConfirmationMessage.tsx";

// TODO: When Ink supports React 19, use useTransition and startTransition
function useCreateProcurement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Procurement>();

  const createProcurement = useCallback(
    async (p: {
      type: string;
      horizonMinutes: number;
      nodesRequired: number;
      pricePerGpuHourInCents: number;
      cluster?: string;
    }) => {
      try {
        setIsLoading(true);
        const client = await apiClient();
        const { data, response, error } = await client.POST(
          "/v0/procurements",
          {
            body: {
              instance_type: p.type,
              desired_quantity: p.nodesRequired,
              buy_limit_price_per_gpu_hour: p.pricePerGpuHourInCents,
              sell_limit_price_per_gpu_hour: 25,
              horizon: Math.max(p.horizonMinutes, 1),
              status: "active",
              colocation_strategy: p.cluster
                ? { type: "pinned", cluster_name: p.cluster }
                : { type: "colocate-pinned" },
            },
          },
        );
        if (!response.ok) {
          throw new Error(error?.message || "Failed to create procurement");
        }
        setResult(data);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "An unknown error occurred during creation",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [setIsLoading, setResult, setError],
  );

  return {
    isLoading,
    error,
    result,
    createProcurement,
  };
}

type CreateProcurementCommandProps = {
  accelerators: number;
  type: string;
  horizon: number;
  cluster?: string;
  price?: number;
  yes?: boolean;
};

function CreateProcurementCommand(props: CreateProcurementCommandProps) {
  const { exit } = useApp();
  const [confirmationMessage, setConfirmationMessage] = useState<
    React.ReactNode
  >();

  const nodesRequired = useMemo(
    () => acceleratorsToNodes(props.accelerators),
    [props.accelerators],
  );

  const [isQuoting, setIsQuoting] = useState(false);
  const [displayedPricePerGpuHourInCents, setDisplayedPricePerGpuHourInCents] =
    useState<number>();
  useEffect(() => {
    (async function init() {
      try {
        let limitPricePerGpuHourInCents = props.price;
        // Get quote if price not specified and not skipping confirmation
        if (!props.yes && limitPricePerGpuHourInCents === undefined) {
          const quoteMinutes = Math.max(MIN_CONTRACT_MINUTES, props.horizon);
          setIsQuoting(true);

          const quoteQuantity = nodesRequired === 0 ? 1 : nodesRequired;
          const quote = await getQuote({
            instanceType: props.type,
            quantity: quoteQuantity,
            minStartTime: "NOW",
            maxStartTime: "NOW",
            minDurationSeconds: quoteMinutes * 60,
            maxDurationSeconds: quoteMinutes * 60 + 3600,
            cluster: props.cluster,
          });
          setIsQuoting(false);

          // Calculate market price from quote or use default
          limitPricePerGpuHourInCents = DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS;
          if (quote) {
            const quoteStart =
              (quote.start_at === "NOW" ? new Date() : new Date(quote.start_at))
                .getTime();
            const quoteEnd = new Date(quote.end_at).getTime();
            const quoteDurationHours = (quoteEnd - quoteStart) / 1000 / 60 / 60;
            limitPricePerGpuHourInCents = Math.ceil(
              DEFAULT_LIMIT_PRICE_MULTIPLIER *
                (quote.price /
                  (quoteDurationHours * (quoteQuantity * GPUS_PER_NODE))),
            );
          }
        }

        // Use default if still undefined (e.g., --yes without --price)
        limitPricePerGpuHourInCents ??= DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS;
        setDisplayedPricePerGpuHourInCents(limitPricePerGpuHourInCents);

        if (props.yes) {
          await createProcurement({
            horizonMinutes: props.horizon,
            nodesRequired,
            type: props.type,
            pricePerGpuHourInCents: limitPricePerGpuHourInCents,
            cluster: props.cluster,
          });
        } else {
          setConfirmationMessage(
            <ConfirmationMessage
              quote={props.price === undefined}
              horizonMinutes={props.horizon}
              pricePerGpuHourInCents={limitPricePerGpuHourInCents}
              accelerators={props.accelerators}
              type={props.type}
            />,
          );
        }
      } catch (err: unknown) {
        setIsQuoting(false);
        logAndQuit(
          err instanceof Error
            ? err.message
            : "An unknown error occurred during initialization",
        );
      }
    })();
  }, []);

  const {
    isLoading,
    error,
    result,
    createProcurement,
  } = useCreateProcurement();

  const handleSubmit = (submitValue: boolean) => {
    if (!submitValue) {
      exit();
      return;
    }

    if (displayedPricePerGpuHourInCents === undefined) {
      logAndQuit("Price per GPU hour could not be determined.");
    }

    createProcurement({
      horizonMinutes: props.horizon,
      nodesRequired,
      type: props.type,
      pricePerGpuHourInCents: displayedPricePerGpuHourInCents,
      cluster: props.cluster,
    });
  };

  if (error) return <Text color="red">Error: {error}</Text>;

  if (isLoading) {
    return (
      <Box gap={1}>
        <Spinner type="arc" />
        <Box gap={1}>
          <Text>Creating procurement...</Text>
        </Box>
      </Box>
    );
  }

  if (isQuoting) {
    return (
      <Box gap={1}>
        <Spinner type="dots" />
        <Box gap={1}>
          <Text>Getting quote...</Text>
        </Box>
      </Box>
    );
  }

  if (result) {
    return (
      <Box flexDirection="column">
        <Text color="green">
          Successfully created procurement for {props.accelerators} {props.type}
          {" "}
          instances!
        </Text>
        <ProcurementDisplay procurement={result} />
      </Box>
    );
  }

  if (confirmationMessage && !props.yes) {
    return (
      <Box flexDirection="column">
        {confirmationMessage}
        <Box>
          <Text>Create procurement? (y/N)</Text>
          <ConfirmInput
            isChecked={false}
            onSubmit={handleSubmit}
          />
        </Box>
      </Box>
    );
  }

  // Should not be reached if !props.yes, but handles the case where props.yes and submission is pending/failed silently
  return null;
}

const create = new Command("create")
  .description("Create a procurement to purchase the desired number of GPUs.")
  .addHelpText(
    "after",
    `
Examples:
\x1b[2m# Create a new procurement for 8 GPUs\x1b[0m
$ sf scale create -n 8

\x1b[2m# Maintain 32 GPUs, but only while the price is <= $1.50/GPU/hr\x1b[0m
$ sf scale create -n 32 -p 1.50

\x1b[2m# Maintain 8 GPUs, start buying the next reservation when there's 30 minutes left\x1b[0m
$ sf scale create -n 8 --horizon '30m'
`,
  )
  .configureHelp({
    optionDescription: (option) => {
      if (option.flags === "-h, --help") {
        return 'Display help for "scale create"';
      }
      return option.description;
    },
  })
  .showHelpAfterError()
  .requiredOption(
    "-n, --accelerators <accelerators>",
    "Desired number of GPUs (0 to turn off)",
    parseAccelerators,
  )
  .option("-t, --type <type>", "Specify node type", "h100i")
  .option(
    "-c, --cluster <cluster>",
    "Only buy on the specified cluster. If provided, \`-t\`/`--type` will be ignored.",
  )
  .option(
    "-d, --horizon <horizon>",
    "The minimum amount of time to reserve the GPUs for. That is, start buying more compute if the remaining time is less than this threshold.",
    parseHorizonArg,
    60,
  )
  .option(
    "-p, --price <price>",
    `Limit price per GPU per hour, in dollars. Buy compute only if it's at most this price. Defaults to the current market price times 1.5, or ${
      (DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS / 100).toFixed(2)
    } if we can't get a price estimate.`,
    parsePriceArg,
  )
  .option("-y, --yes", "Automatically confirm the command.")
  .action((options) => {
    render(
      <CreateProcurementCommand {...options} />,
    );
  });

export default create;
