import { Box, render, Text, useApp } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import parseDuration from "parse-duration";
import { apiClient } from "../apiClient.ts";
import type { paths } from "../schema.ts";
import { logAndQuit } from "../helpers/errors.ts";
import { dollarsToCents } from "../helpers/units.ts";
import { getBalance } from "./balance.ts";
import { getQuote } from "./buy/index.tsx";
import { formatDuration } from "./orders/index.tsx";
import ConfirmInput from "./ConfirmInput.tsx";
import Spinner from "ink-spinner";
import { GPUS_PER_NODE } from "./constants.ts";
import { Row } from "./Row.tsx";
import { Command } from "@commander-js/extra-typings";

type Procurement =
  paths["/v0/procurements"]["get"]["responses"]["200"]["content"][
    "application/json"
  ]["data"][number];

const DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS = 265; // Example default price

export function registerScale(program: Command) {
  const scale = program
    .command("scale")
    .description("Scale GPUs or show current procurement details")
    .requiredOption(
      "-n, --accelerators <accelerators>",
      "Set number of GPUs (0 to turn off)",
    )
    .option("-t, --type <type>", "Specify node type", "h100i")
    .option("-d, --duration <duration>", "Minimum duration", "2h")
    .option("-p, --price <price>", "Max price per GPU hour, in dollars")
    .option("-y, --yes", "Automatically confirm the order");

  // "show" subcommand
  scale
    .command("show")
    .description("Show current procurement details")
    .option("-t, --type <type>", "Specify node type", "h100i")
    .action((options) => {
      render(<ShowCommand {...options} />);
    });

  // Default action when running "fly scale" without "show"
  scale.action((options) => {
    // If -n is provided, attempt to scale
    if (options.accelerators !== undefined) {
      render(<ScaleCommand {...options} />);
    } else {
      // No -n and no "show" - just print help
      scale.outputHelp();
    }
  });
}

function ScaleCommand(props: {
  accelerators: string;
  type: string;
  duration: string;
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
  const [
    procurementResult,
    setProcurementResult,
  ] = useState<true | Procurement | Procurement[] | null>(null);
  const [
    displayedPricePerNodeHourInCents,
    setDisplayedPricePerNodeHourInCents,
  ] = useState<number | undefined>(undefined);

  const isDown = Number(props.accelerators) === 0;

  useEffect(() => {
    async function init() {
      try {
        if (isDown) {
          // Scale down (0 GPUs)
          await scaleDown(props.type);
          setProcurementResult(true);
          exit();
          return;
        }

        // Scale up logic
        const {
          durationHours,
          nodesRequired,
          accelerators,
          type,
          pricePerNodeHourInCents,
          totalPriceInCents,
        } = await getDefaultProcurementOptions(props);

        setDisplayedPricePerNodeHourInCents(pricePerNodeHourInCents);
        const pricePerGpuHourInCents = Math.ceil(pricePerNodeHourInCents) /
          GPUS_PER_NODE;

        if (durationHours < 1) {
          setError("Minimum duration is 1 hour");
          return;
        }

        const balance = await getBalance();
        if (balance.available.cents < totalPriceInCents) {
          setBalanceLowMessage(
            <Text>
              You can't afford this. Available: $
              {(balance.available.cents / 100).toFixed(2)}, Needed: $
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
            nodesRequired,
            type,
            pricePerNodeHourInCents,
          });
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      }
    }

    init();
  }, []);

  const submitProcurement = useCallback(
    async ({
      durationHours,
      nodesRequired,
      type,
      pricePerNodeHourInCents,
    }: {
      durationHours: number;
      nodesRequired: number;
      type: string;
      pricePerNodeHourInCents: number;
    }) => {
      try {
        setIsLoading(true);
        const result = await scaleToCount({
          durationHours,
          nodesRequired,
          type,
          pricePerNodeHourInCents,
        });
        setProcurementResult(result);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
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

      const { durationHours, nodesRequired, type } = getProcurementOptions(
        props,
      );

      if (!displayedPricePerNodeHourInCents) {
        throw new Error("Price per node hour not set.");
      }

      submitProcurement({
        durationHours,
        nodesRequired,
        type,
        pricePerNodeHourInCents: displayedPricePerNodeHourInCents,
      });
    },
    [submitProcurement, displayedPricePerNodeHourInCents, exit],
  );

  return (
    <Box flexDirection="column">
      {error && <Text color="red">Error: {error}</Text>}
      {balanceLowMessage && <Box>{balanceLowMessage}</Box>}
      {!error && confirmationMessage && !props.yes && !isLoading && (
        <Box flexDirection="column">
          {confirmationMessage}
          <Box>
            <Text>Start GPUs? (y/N)</Text>
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
          <Spinner type="arc" />
          <Text>Placing procurement...</Text>
        </Box>
      )}
      {procurementResult && !isDown && (
        <Box>
          <Text color="green">Procurement successful!</Text>
        </Box>
      )}
      {procurementResult && isDown && (
        <Box>
          <Text color="green">Nodes turned off successfully!</Text>
        </Box>
      )}
    </Box>
  );
}

function ShowCommand(props: { type: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [info, setInfo] = useState<
    Procurement | null
  >(null);

  useEffect(() => {
    async function fetchInfo() {
      try {
        const client = await apiClient();
        const procurements = await client.GET("/v0/procurements");
        if (!procurements.response.ok) {
          throw new Error(
            procurements.error?.message || "Failed to list procurements",
          );
        }

        const current = procurements.data?.data.find(
          (p) => p.instance_type === props.type,
        );
        if (!current) {
          setInfo(null);
        } else {
          setInfo(current);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchInfo();
  }, [props.type]);

  if (isLoading) {
    return (
      <Box>
        <Spinner type="arc" />
        <Text>Fetching procurement details...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!info) {
    return (
      <Box>
        <Text>No procurement found for {props.type}</Text>
      </Box>
    );
  }

  const duration = info.min_duration_in_hours;
  const quantity = info.quantity * GPUS_PER_NODE;
  const pricePerNodeHourInCents = info.max_price_per_node_hour;
  const pricePerGpuHourInCents = Math.ceil(
    pricePerNodeHourInCents / GPUS_PER_NODE,
  );

  return (
    <Box flexDirection="column">
      <Row headWidth={15} head="Type" value={props.type} />
      <Row headWidth={15} head="GPUs" value={String(quantity)} />
      <Row
        headWidth={15}
        head="Price"
        value={`$${(pricePerGpuHourInCents / 100).toFixed(2)}/gpu/hr`}
      />
      <Row
        headWidth={15}
        head="Min Duration"
        value={formatDuration(duration * 3600 * 1000)}
      />
      <Text color="green">
        Current procurement details fetched successfully.
      </Text>
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
        headWidth={15}
        head="GPUs"
        value={`${props.accelerators} x ${props.type}`}
      />
      <Row
        headWidth={15}
        head="price"
        value={`$${(props.pricePerGpuHourInCents / 100).toFixed(2)}/gpu/hr`}
      />
      <Row
        headWidth={15}
        head="min time"
        value={formatDuration(durationInMilliseconds)}
      />
      <Row
        headWidth={15}
        head="initial total"
        value={`$${(props.totalPriceInCents / 100).toFixed(2)} for ${
          formatDuration(durationInMilliseconds)
        }`}
      />
    </Box>
  );
}

function getProcurementOptions(props: {
  duration: string;
  accelerators: string;
  type: string;
}) {
  const duration = props.duration;
  let durationHours = parseDuration(duration, "h");
  if (!durationHours) {
    logAndQuit(`Failed to parse duration: ${duration}`);
  }
  durationHours = Math.ceil(durationHours);

  const accelerators = Number.parseInt(props.accelerators);
  if (accelerators % GPUS_PER_NODE !== 0) {
    logAndQuit(`Only multiples of ${GPUS_PER_NODE} GPUs are allowed.`);
  }
  const nodesRequired = accelerators / GPUS_PER_NODE;
  const type = props.type;

  return {
    durationHours,
    accelerators,
    nodesRequired,
    type,
  };
}

async function getDefaultProcurementOptions(props: {
  duration: string;
  accelerators: string;
  price?: string;
  type: string;
}) {
  const { durationHours, accelerators, type, nodesRequired } =
    getProcurementOptions(props);

  let pricePerNodeHourInCents: number;
  if (props.price) {
    const price = Number.parseFloat(props.price);
    if (Number.isNaN(price)) {
      logAndQuit(`Failed to parse price: ${props.price}`);
    }
    pricePerNodeHourInCents = GPUS_PER_NODE * dollarsToCents(price);
  } else {
    const quote = await getQuote({
      instanceType: type,
      quantity: nodesRequired,
      minStartTime: new Date(),
      maxStartTime: new Date(),
      minDurationSeconds: durationHours * 3600,
      maxDurationSeconds: durationHours * 3600 + 3600,
    });

    let quotePricePerNodeHourInCents: number;
    if (quote) {
      quotePricePerNodeHourInCents = Math.ceil(
        quote.price / (durationHours * nodesRequired),
      );
    } else {
      quotePricePerNodeHourInCents = DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS;
    }
    pricePerNodeHourInCents = quotePricePerNodeHourInCents;
  }

  const totalPriceInCents = pricePerNodeHourInCents * nodesRequired *
    durationHours;

  return {
    durationHours,
    pricePerNodeHourInCents,
    nodesRequired,
    accelerators,
    type,
    totalPriceInCents,
  };
}

async function scaleToCount({
  durationHours,
  nodesRequired,
  type,
  pricePerNodeHourInCents,
}: {
  durationHours: number;
  nodesRequired: number;
  type: string;
  pricePerNodeHourInCents: number;
}) {
  const client = await apiClient();

  const procurements = await client.GET("/v0/procurements");
  if (!procurements.response.ok) {
    throw new Error(
      procurements.error?.message || "Failed to list procurements",
    );
  }

  const existingProcurement = procurements.data?.data.find(
    (p) => p.instance_type === type,
  );

  if (existingProcurement) {
    const res = await client.PUT("/v0/procurements/{id}", {
      params: { path: { id: existingProcurement.id } },
      body: {
        instance_type: type,
        quantity: nodesRequired,
        min_duration_in_hours: durationHours,
        max_price_per_node_hour: pricePerNodeHourInCents,
      },
    });
    if (!res.response.ok) {
      throw new Error(res.error?.message || "Failed to update procurement");
    }
    return res.data ?? null;
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
      throw new Error(res.error?.message || "Failed to create procurement");
    }
    return res.data ?? null;
  }
}

async function scaleDown(type: string) {
  const client = await apiClient();
  const procurements = await client.GET("/v0/procurements");
  if (!procurements.response.ok) {
    throw new Error(
      procurements.error?.message || "Failed to list procurements",
    );
  }

  let found = false;
  if (procurements.data) {
    for (const procurement of procurements.data.data) {
      if (procurement.instance_type === type) {
        const res = await client.PUT("/v0/procurements/{id}", {
          params: { path: { id: procurement.id } },
          body: {
            instance_type: type,
            quantity: 0,
            max_price_per_node_hour: procurement.max_price_per_node_hour,
            min_duration_in_hours: procurement.min_duration_in_hours,
          },
        });

        if (!res.response.ok) {
          throw new Error(res.error?.message || "Failed to turn off nodes");
        }

        found = true;
      }
    }
  }

  if (!found) {
    throw new Error(`No procurement found for ${type}`);
  }

  return true;
}
