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
const MIN_CONTRACT_MINUTES = 60; // Minimum contract size is 1 hour

export function registerScale(program: Command) {
  const scale = program
    .command("scale")
    .description("Scale GPUs or show current procurement details");

  // Main scale command as a default subcommand
  const scaleDefault = new Command("create")
    .alias("default")
    .description("Scale GPUs up or down (default command)")
    .requiredOption(
      "-n, --accelerators <accelerators>",
      "Set number of GPUs (0 to turn off)",
    )
    .option("-t, --type <type>", "Specify node type", "h100i")
    .option(
      "-c, --cluster <cluster>",
      "Send/colocate into a specific cluster. If provided, the instance type will be ignored.",
    )
    .option(
      "-h, --horizon <horizon>",
      "The minimum amount of time to reserve in minutes. The procurement will buy more compute if the remaining contract time is less than this threshold.",
      "60m",
    )
    .option("-p, --price <price>", "Max price per GPU hour, in dollars")
    .option("-y, --yes", "Automatically confirm the order")
    .option("--id <id>", "Specify a procurement ID to scale directly")
    .action((options) => {
      render(<ScaleCommand {...options} />);
    });

  // Show subcommand
  const showCommand = new Command("show")
    .alias("list")
    .alias("ls")
    .description("Show current procurement details")
    .option("-t, --type <type>", "Specify node type", "h100i")
    .option("--id <id>", "Specify a procurement ID to show directly")
    .action((options) => {
      render(<ProcurementsList {...options} />);
    });

  // Add both commands
  scale
    .addCommand(scaleDefault, { isDefault: true }) // Make it the default command
    .addCommand(showCommand);
}

function ScaleCommand(props: {
  accelerators: string;
  type: string;
  horizon: string;
  cluster?: string;
  price?: string;
  yes?: boolean;
  id?: string;
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
  const [procurementResult, setProcurementResult] = useState<
    true | Procurement | Procurement[] | null
  >(null);
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
          await scaleDown(props);
          setProcurementResult(true);
          exit();
          return;
        }

        // Scale up logic
        const { horizonMinutes, accelerators, type, nodesRequired, cluster } =
          convertProcurementParams(props);

        let pricePerNodeHourInCents: number;
        if (props.price) {
          const price = Number.parseFloat(props.price);
          if (Number.isNaN(price)) {
            logAndQuit(`Failed to parse price: ${props.price}`);
          }
          pricePerNodeHourInCents = GPUS_PER_NODE * dollarsToCents(price);
        } else {
          const quoteMinutes = Math.max(MIN_CONTRACT_MINUTES, horizonMinutes);
          const quote = await getQuote({
            instanceType: type,
            quantity: nodesRequired,
            minStartTime: new Date(),
            maxStartTime: new Date(),
            minDurationSeconds: quoteMinutes * 60,
            maxDurationSeconds: quoteMinutes * 60 + 3600,
            cluster,
          });

          let quotePricePerNodeHourInCents: number;
          if (quote) {
            quotePricePerNodeHourInCents = Math.ceil(
              quote.price / ((quoteMinutes / 60) * nodesRequired),
            );
          } else {
            quotePricePerNodeHourInCents = DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS;
          }
          pricePerNodeHourInCents = quotePricePerNodeHourInCents;
        }

        const totalPriceInCents = pricePerNodeHourInCents * nodesRequired *
          (horizonMinutes / 60);

        setDisplayedPricePerNodeHourInCents(pricePerNodeHourInCents);
        const pricePerGpuHourInCents = Math.ceil(pricePerNodeHourInCents) /
          GPUS_PER_NODE;

        if (horizonMinutes < 1) {
          setError("Minimum horizon is 1 minute");
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
            horizonMinutes={horizonMinutes}
            pricePerGpuHourInCents={pricePerGpuHourInCents}
            accelerators={accelerators}
            totalPriceInCents={totalPriceInCents}
            type={type}
          />,
        );

        if (props.yes) {
          await submitProcurement({
            horizonMinutes,
            nodesRequired,
            type,
            pricePerNodeHourInCents,
            cluster,
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
      horizonMinutes,
      nodesRequired,
      type,
      pricePerNodeHourInCents,
      cluster,
    }: {
      horizonMinutes: number;
      nodesRequired: number;
      type: string;
      pricePerNodeHourInCents: number;
      cluster?: string;
    }) => {
      try {
        setIsLoading(true);
        const result = await scaleToCount({
          horizonMinutes,
          nodesRequired,
          type,
          cluster,
          pricePerNodeHourInCents,
          id: props.id,
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
    [props.horizon, props.price, props.id, exit],
  );

  const handleSubmit = useCallback(
    (submitValue: boolean) => {
      if (!submitValue) {
        exit();
        return;
      }

      const { horizonMinutes, nodesRequired, type } = convertProcurementParams(
        props,
      );

      if (!displayedPricePerNodeHourInCents) {
        throw new Error("Price per node hour not set.");
      }

      submitProcurement({
        horizonMinutes,
        nodesRequired,
        type,
        cluster: props.cluster,
        pricePerNodeHourInCents: displayedPricePerNodeHourInCents,
      });
    },
    [submitProcurement, props.cluster, displayedPricePerNodeHourInCents, exit],
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

function ProcurementsList(props: { type: string; id?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [info, setInfo] = useState<Procurement | null>(null);

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

        let current: Procurement | undefined;

        // Find procurement by ID if provided, otherwise find by type
        if (props.id) {
          current = procurements.data?.data.find((p) => p.id === props.id);
          if (!current) {
            throw new Error(`No procurement found with ID ${props.id}`);
          }
        } else {
          current = procurements.data?.data.find((p) =>
            p.instance_type === props.type
          );
        }

        setInfo(current ?? null);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
      } finally {
        setIsLoading(false);
      }
    }
    fetchInfo();
  }, [props.type, props.id]);

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
    if (props.id) {
      return (
        <Box>
          <Text>No procurement found with ID {props.id}</Text>
        </Box>
      );
    }
    return (
      <Box>
        <Text>No procurement found for {props.type}</Text>
      </Box>
    );
  }

  const horizonMinutes = info.horizon;
  const quantity = info.desired_quantity * GPUS_PER_NODE;
  const pricePerNodeHourInCents = info.buy_limit_price_per_node_hour;
  const pricePerGpuHourInCents = Math.ceil(
    pricePerNodeHourInCents / GPUS_PER_NODE,
  );

  return (
    <Box flexDirection="column">
      <Row headWidth={15} head="ID" value={info.id} />
      <Row headWidth={15} head="Type" value={info.instance_type} />
      <Row headWidth={15} head="GPUs" value={String(quantity)} />
      <Row
        headWidth={15}
        head="LimitPrice"
        value={`$${(pricePerGpuHourInCents / 100).toFixed(2)}/gpu/hr`}
      />
      <Row
        headWidth={15}
        head="Horizon (Min Duration)"
        value={formatDuration(horizonMinutes * 60 * 1000)}
      />
      <Text color="green">
        Current procurement details fetched successfully.
      </Text>
    </Box>
  );
}

function ConfirmationMessage(props: {
  horizonMinutes: number;
  pricePerGpuHourInCents: number;
  accelerators: number;
  totalPriceInCents: number;
  type: string;
}) {
  const horizonInMilliseconds = props.horizonMinutes * 60 * 1000;
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
        value={formatDuration(horizonInMilliseconds)}
      />
      <Row
        headWidth={15}
        head="initial total"
        value={`$${(props.totalPriceInCents / 100).toFixed(2)} for ${
          formatDuration(
            horizonInMilliseconds,
          )
        }`}
      />
    </Box>
  );
}

function convertProcurementParams({
  horizon,
  accelerators: acceleratorsString,
  type,
  cluster,
}: {
  horizon: string;
  accelerators: string;
  type: string;
  cluster?: string;
}) {
  const parsedHorizon = parseDuration(horizon, "m");
  if (!parsedHorizon) {
    logAndQuit(`Failed to parse horizon: ${horizon}`);
  }
  const horizonMinutes = Math.ceil(parsedHorizon);

  const accelerators = Number.parseInt(acceleratorsString);
  if (accelerators % GPUS_PER_NODE !== 0) {
    logAndQuit(`Only multiples of ${GPUS_PER_NODE} GPUs are allowed.`);
  }
  const nodesRequired = accelerators / GPUS_PER_NODE;

  return {
    horizonMinutes,
    accelerators,
    nodesRequired,
    type,
    cluster,
  };
}

async function scaleToCount({
  horizonMinutes,
  nodesRequired,
  type,
  cluster,
  pricePerNodeHourInCents,
  id,
}: {
  horizonMinutes: number;
  nodesRequired: number;
  type: string;
  cluster?: string;
  pricePerNodeHourInCents: number;
  id?: string;
}) {
  const client = await apiClient();
  const procurements = await client.GET("/v0/procurements");

  if (!procurements.response.ok) {
    throw new Error(
      procurements.error?.message || "Failed to list procurements",
    );
  }

  let existingProcurement: Procurement | undefined;

  // Find procurement by ID if provided, otherwise find by type
  if (id) {
    existingProcurement = procurements.data?.data.find((p) => p.id === id);
    if (!existingProcurement) {
      throw new Error(`No procurement found with ID ${id}`);
    }
  } else {
    existingProcurement = procurements.data?.data.find((p) =>
      p.instance_type === type
    );
  }

  if (existingProcurement) {
    const res = await client.PATCH("/v0/procurements/{id}", {
      params: { path: { id: existingProcurement.id } },
      body: {
        instance_type: type,
        desired_quantity: nodesRequired,
        buy_limit_price_per_node_hour: pricePerNodeHourInCents,
        sell_limit_price_per_node_hour: 25, // TODO: Make this configurable
        horizon: horizonMinutes,
        colocate_on_cluster: cluster,
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
        desired_quantity: nodesRequired,
        buy_limit_price_per_node_hour: pricePerNodeHourInCents,
        horizon: Math.max(horizonMinutes, 1),

        // Defaults I'm not going to change
        status: "active",
        sell_limit_price_per_node_hour: 25,
        colocate: true,
        colocate_on_restart: true,
        colocate_on_cluster: cluster,
      },
    });
    if (!res.response.ok) {
      throw new Error(res.error?.message || "Failed to create procurement");
    }
    return res.data ?? null;
  }
}

async function scaleDown({
  type,
  id,
}: {
  type?: string;
  id?: string;
}) {
  const client = await apiClient();
  let found = false;
  let procurementId: string | undefined;

  if (id) {
    // If ID provided, get specific procurement
    const procurement = await client.GET("/v0/procurements/{id}", {
      params: { path: { id } },
    });

    if (!procurement.response.ok) {
      throw new Error(
        procurement.error?.message || `Failed to get procurement ${id}`,
      );
    }

    if (procurement.data) {
      procurementId = id;
    }
  } else {
    // Otherwise list all and find by type
    const procurements = await client.GET("/v0/procurements");

    if (!procurements.response.ok) {
      throw new Error(
        procurements.error?.message || "Failed to list procurements",
      );
    }

    if (procurements.data) {
      const procurement = procurements.data.data.find(
        (p) => p.instance_type === type,
      );
      if (procurement) {
        procurementId = procurement.id;
      }
    }
  }

  if (procurementId) {
    const res = await client.PATCH("/v0/procurements/{id}", {
      params: { path: { id: procurementId } },
      body: {
        desired_quantity: 0,
      },
    });

    if (!res.response.ok) {
      throw new Error(
        res.error?.message ||
          `Failed to turn off nodes for procurement ${procurementId}`,
      );
    }

    found = true;
  }

  if (!found) {
    if (id) {
      throw new Error(`No procurement found with ID ${id}`);
    } else {
      throw new Error(`No procurement found for ${type}`);
    }
  }

  return true;
}
