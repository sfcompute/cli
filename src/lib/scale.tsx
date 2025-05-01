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
import { Badge } from "@inkjs/ui";
import { isFeatureEnabled } from "./posthog.ts";

type Procurement =
  paths["/v0/procurements"]["get"]["responses"]["200"]["content"][
    "application/json"
  ]["data"][number];

const DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS = 265; // Example default price
const MIN_CONTRACT_MINUTES = 60; // Minimum contract size is 1 hour
const DEFAULT_LIMIT_PRICE_MULTIPLIER = 1.5;

export async function registerScale(program: Command) {
  const isEnabled = await isFeatureEnabled("procurements");

  if (!isEnabled) {
    return;
  }

  registerScaleInner(program);
}

function registerScaleInner(program: Command) {
  const scale = program
    .command("procurements")
    .alias("procurement")
    .alias("scale")
    .description(
      "Create and manage procurements that purchase a desired number of GPUs on a rolling basis.",
    )
    .addHelpText(
      "after",
      `
A procurement is an automated purchasing strategy that will attempt to constantly maintain a desired number of GPUs by buying and selling spot reservations.

See https://docs.sfcompute.com/using-sf-scale for more information.
    `,
    )
    .showHelpAfterError();

  // "create" command
  const create = new Command("create")
    .description("Create a procurement to purchase the desired number of GPUs.")
    .requiredOption(
      "-n, --accelerators <accelerators>",
      "Desired number of GPUs (0 to turn off)",
    )
    .option("-t, --type <type>", "Specify node type", "h100i")
    .option(
      "-c, --cluster <cluster>",
      "Only buy on the specified cluster. If provided, `-t`/`--type` will be ignored.",
    )
    .option(
      "-d, --horizon <horizon>",
      "The minimum amount of time to reserve the GPUs for. That is, start buying more compute if the remaining time is less than this threshold.",
      "60m",
    )
    .option(
      "-p, --price <price>",
      "Ceiling price per GPU hour, in dollars. Buy compute only if it's at most this price. Defaults to the current market price times 1.5, or $2.65 if if we can't get a price estimate.",
    )
    .option("-y, --yes", "Automatically confirm the command.")
    .action((options) => {
      render(
        <CreateOrUpdateProcurementCommand {...options} command="create" />,
      );
    });

  // "update" command
  const update = new Command("update")
    .description("Update a procurement.")
    .argument("<ID>", "ID of the procurement to update")
    .requiredOption(
      "-n, --accelerators <accelerators>",
      "Desired number of GPUs (0 to turn off)",
    )
    .option(
      "-d, --horizon <horizon>",
      "The minimum amount of time to reserve the GPUs for. That is, start buying more compute if the remaining time is less than this threshold.",
      "60m",
    )
    .option(
      "-p, --price <price>",
      "Ceiling price per GPU hour, in dollars. Buy compute only if it's at most this price. Defaults to the current market price times 1.5, or $2.65 if if we can't get a price estimate.",
    )
    .option("-y, --yes", "Automatically confirm the command.")
    .action((id, options) => {
      render(
        <CreateOrUpdateProcurementCommand
          {...options}
          id={id}
          command="update"
        />,
      );
    });

  // Show subcommand
  const show = new Command("show")
    .alias("list")
    .alias("ls")
    .description("Show current scale details")
    .option("-i, --id <id>", "Show a specific procurement by ID")
    .option("-t, --type <type>", "Show procurements of a specific node type")
    .action((options) => {
      // TODO handle id
      render(<ProcurementsList {...options} />);
    });

  // Add both commands
  scale
    .addCommand(create)
    .addCommand(update)
    .addCommand(show);
}

type CreateProcurementCommandProps = {
  command: "create";
  accelerators: string;
  type: string;
  horizon: string;
  cluster?: string;
  price?: string;
  yes?: boolean;
} | {
  command: "update";
  id: string;
  accelerators: string;
  horizon: string;
  price?: string;
  yes?: boolean;
};

function CreateOrUpdateProcurementCommand(
  props: CreateProcurementCommandProps,
) {
  const { exit } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
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
    displayedPricePerGpuHourInCents,
    setDisplayedPricePerGpuHourInCents,
  ] = useState<number | undefined>(undefined);

  useEffect(() => {
    async function init() {
      try {
        if (props.command === "update") {
          const horizonMinutes = parseHorizonToMinutes(props.horizon);
          const accelerators = parseAccelerators(props.accelerators);
          const nodesRequired = acceleratorsToNodes(accelerators);
          const procurement = await getProcurement({
            id: props.id,
          });

          let limitPricePerGpuHourInCents: number | undefined;
          if (props.price) {
            const price = Number.parseFloat(props.price);
            if (Number.isNaN(price)) {
              logAndQuit(`Failed to parse price: ${props.price}`);
            }
            limitPricePerGpuHourInCents = dollarsToCents(price);
            setDisplayedPricePerGpuHourInCents(limitPricePerGpuHourInCents);
          }

          if (props.yes) {
            setConfirmationMessage(
              <ConfirmationMessage
                quote={props.price === undefined}
                horizonMinutes={horizonMinutes}
                pricePerGpuHourInCents={limitPricePerGpuHourInCents}
                accelerators={accelerators}
              />,
            );
          } else {
            setIsLoading(true);
            await submitUpdateProcurement({
              procurement,
              horizonMinutes,
              nodesRequired,
              pricePerGpuHourInCents: props.price,
            });
          }
        } else {
          const horizonMinutes = parseHorizonToMinutes(props.horizon);
          const accelerators = parseAccelerators(props.accelerators);
          const nodesRequired = acceleratorsToNodes(accelerators);
          const { type, cluster } = props;

          if (horizonMinutes < 1) {
            setError("Minimum horizon is 1 minute");
            return;
          }

          let limitPricePerGpuHourInCents;
          if (props.price) {
            const price = Number.parseFloat(props.price);
            if (Number.isNaN(price)) {
              logAndQuit(`Failed to parse price: ${props.price}`);
            }
            limitPricePerGpuHourInCents = dollarsToCents(price);
            setDisplayedPricePerGpuHourInCents(limitPricePerGpuHourInCents);
          } else if (!props.yes) {
            // skip quoting and use the default
            // Get market quote to show accurate initial total
            const quoteMinutes = Math.max(MIN_CONTRACT_MINUTES, horizonMinutes);
            setIsQuoting(true);

            const quote = await getQuote({
              instanceType: type,
              quantity: nodesRequired == 0 ? 1 : nodesRequired,
              minStartTime: "NOW",
              maxStartTime: "NOW",
              minDurationSeconds: quoteMinutes * 60,
              maxDurationSeconds: quoteMinutes * 60 + 3600,
              cluster,
            });
            setIsQuoting(false);

            // Calculate market price from quote
            limitPricePerGpuHourInCents = DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS;
            if (quote) {
              const quoteStart = (quote.start_at === "NOW"
                ? new Date()
                : new Date(quote.start_at))
                .getTime();
              const quoteEnd = new Date(quote.end_at).getTime();
              const quoteDurationHours = (quoteEnd - quoteStart) / 1000 / 60 /
                60;
              limitPricePerGpuHourInCents = Math.ceil(
                DEFAULT_LIMIT_PRICE_MULTIPLIER *
                  (quote.price / (quoteDurationHours * accelerators)),
              );
            }

            setDisplayedPricePerGpuHourInCents(limitPricePerGpuHourInCents);
          }

          if (props.yes) {
            // Direct submission with -y flag
            let limitPricePerGpuHourInCents =
              DEFAULT_PRICE_PER_GPU_HOUR_IN_CENTS;
            if (props.price) {
              const price = Number.parseFloat(props.price);
              if (Number.isNaN(price)) {
                logAndQuit(`Failed to parse price: ${props.price}`);
              }
              limitPricePerGpuHourInCents = dollarsToCents(price);
            }

            if (horizonMinutes < 1) {
              setError("Minimum horizon is 1 minute");
              return;
            }

            setIsLoading(true);
            await submitCreateProcurement({
              horizonMinutes,
              nodesRequired,
              type,
              pricePerGpuHourInCents: limitPricePerGpuHourInCents,
              cluster,
            });
          } else {
            setConfirmationMessage(
              <ConfirmationMessage
                quote={props.price === undefined}
                horizonMinutes={horizonMinutes}
                pricePerGpuHourInCents={limitPricePerGpuHourInCents}
                accelerators={accelerators}
                type={type}
              />,
            );
          }
        }
      } catch (err: unknown) {
        setIsQuoting(false);
        setIsLoading(false);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      }
    }

    init();
  }, []);

  const submitCreateProcurement = useCallback(
    async ({
      horizonMinutes,
      nodesRequired,
      type,
      pricePerGpuHourInCents,
      cluster,
    }: {
      horizonMinutes: number;
      nodesRequired: number;
      type: string;
      pricePerGpuHourInCents: number;
      cluster?: string;
    }) => {
      try {
        setIsLoading(true);
        const result = await createProcurement({
          horizonMinutes,
          nodesRequired,
          type,
          cluster,
          pricePerGpuHourInCents,
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
    [props.horizon, props.price, exit],
  );

  const submitUpdateProcurement = useCallback(
    async ({
      procurement,
      horizonMinutes,
      nodesRequired,
      pricePerGpuHourInCents,
    }) => {
      try {
        setIsLoading(true);
        const result = await updateProcurement({
          procurement,
          horizonMinutes,
          nodesRequired,
          pricePerGpuHourInCents,
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
    [props.horizon, props.price, exit],
  );

  const handleSubmit = useCallback(
    (submitValue: boolean) => {
      if (!submitValue) {
        exit();
        return;
      }

      if (props.command === "create") {
        const horizonMinutes = parseHorizonToMinutes(props.horizon);
        const accelerators = parseAccelerators(props.accelerators);
        const nodesRequired = acceleratorsToNodes(accelerators);
        const { type, cluster } = props;

        if (!displayedPricePerGpuHourInCents) {
          throw new Error("Price per GPU hour not set.");
        }

        submitCreateProcurement({
          horizonMinutes,
          nodesRequired,
          type,
          pricePerGpuHourInCents: displayedPricePerGpuHourInCents,
          cluster,
        });
      } else {
        const horizonMinutes = parseHorizonToMinutes(props.horizon);
        const accelerators = parseAccelerators(props.accelerators);
        const nodesRequired = acceleratorsToNodes(accelerators);

        submitUpdateProcurement({
          procurement: props.id,
          horizonMinutes,
          nodesRequired,
          pricePerGpuHourInCents: displayedPricePerGpuHourInCents,
        });
      }
    },
    [
      submitCreateProcurement,
      submitUpdateProcurement,
      displayedPricePerGpuHourInCents,
      exit,
    ],
  );

  return (
    <Box flexDirection="column">
      {error && <Text color="red">Error: {error}</Text>}
      {balanceLowMessage && <Box>{balanceLowMessage}</Box>}
      {isQuoting && (
        <Box gap={1}>
          <Spinner type="dots" />
          <Box gap={1}>
            <Text>Getting quote...</Text>
          </Box>
        </Box>
      )}
      {!error && confirmationMessage && props.command === "create" &&
        !props.yes && !isLoading &&
        !isQuoting && (
        <Box flexDirection="column">
          {confirmationMessage}
          <Box>
            <Text>
              {props.command === "create"
                ? "Create procurement?"
                : "Update procurement?"} (y/N)
            </Text>
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
      {procurementResult && props.command === "create" && (
        <Box>
          <Text color="green">
            Successfully created procurement for {props.accelerators} GPUs!
          </Text>
        </Box>
      )}
      {procurementResult && props.command === "update" && (
        <Box>
          <Text color="green">
            Successfully updated procurement to {props.accelerators} GPUs!
          </Text>
        </Box>
      )}
    </Box>
  );
}

function ProcurementDisplay(props: { procurement: Procurement }) {
  const horizonMinutes = props.procurement.horizon;
  const quantity = props.procurement.desired_quantity * GPUS_PER_NODE;
  const pricePerGpuHourInCents = props.procurement.buy_limit_price_per_gpu_hour;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Box width={11}>
          {quantity > 0
            ? <Badge color="cyan">Active</Badge>
            : <Badge color="gray">Disabled</Badge>}
        </Box>
        <Box paddingLeft={0.1}>
          <Text color={quantity > 0 ? "cyan" : "gray"}>
            {props.procurement.id}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column" paddingTop={0.5}>
        <Row
          headWidth={15}
          head="Type"
          value={props.procurement.instance_type}
        />
        <Row headWidth={15} head="GPUs" value={String(quantity)} />
        <Row
          headWidth={15}
          head="Limit Price"
          value={`$${(pricePerGpuHourInCents / 100).toFixed(2)}/gpu/hr`}
        />
        <Row
          headWidth={15}
          head="Horizon"
          value={formatDuration(horizonMinutes * 60 * 1000)}
        />
      </Box>
    </Box>
  );
}

function ProcurementsList(props: { type?: string; id?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [procurements, setProcurements] = useState<Procurement[]>([]);

  useEffect(() => {
    async function fetchInfo() {
      try {
        if (props.id) {
          const procurement = await getProcurement({ id: props.id });
          setProcurements(procurement ? [procurement] : []);
        } else {
          if (props.type) {
            const procurements = await listProcurements((p) =>
              p.instance_type === props.type
            );
            setProcurements(procurements);
          } else {
            const procurements = await listProcurements();
            setProcurements(procurements);
          }
        }
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

  if (procurements.length === 0) {
    return (
      <Box flexDirection="column" gap={1} paddingBottom={1}>
        <Text>No procurements found.</Text>

        <Box paddingLeft={4} flexDirection="column">
          <Text dimColor># To create a procurement</Text>
          <Text color="yellow">sf scale -n 8</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={2} paddingBottom={1}>
      {procurements.map((procurement) => (
        <ProcurementDisplay procurement={procurement} key={procurement.id} />
      ))}
    </Box>
  );
}

function ConfirmationMessage(props: {
  horizonMinutes?: number;
  pricePerGpuHourInCents?: number;
  accelerators?: number;
  type?: string;
  quote: boolean;
}) {
  const horizonInMilliseconds = props.horizonMinutes
    ? Math.max(props.horizonMinutes, MIN_CONTRACT_MINUTES) * 60 * 1000
    : undefined;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color="green">↑</Text>
        <Text color="yellow">start GPUs</Text>
      </Box>
      <Row
        headWidth={15}
        head="GPUs"
        value={props.accelerators
          ? `${props.accelerators} x ${props.type}`
          : "unchanged"}
      />
      <Row
        headWidth={15}
        head={`Max price${
          (props.quote && props.pricePerGpuHourInCents)
            ? " (1.5 x market price)"
            : ""
        }`}
        value={props.pricePerGpuHourInCents
          ? `$${(props.pricePerGpuHourInCents / 100).toFixed(2)}/gpu/hr`
          : "unchanged"}
      />
      <Row
        headWidth={15}
        head="horizon time"
        value={horizonInMilliseconds
          ? formatDuration(horizonInMilliseconds)
          : "unchanged"}
      />
    </Box>
  );
}

function parseHorizonToMinutes(horizon: string) {
  const parsedHorizon = parseDuration(horizon, "m");
  if (!parsedHorizon) {
    logAndQuit(`Failed to parse horizon: ${horizon}`);
  }
  return Math.ceil(parsedHorizon);
}

function parseAccelerators(accelerators: string) {
  const parsedAccelerators = Number.parseInt(accelerators);
  if (parsedAccelerators % GPUS_PER_NODE !== 0) {
    logAndQuit(`Only multiples of ${GPUS_PER_NODE} GPUs are allowed.`);
  }

  return parsedAccelerators;
}

function acceleratorsToNodes(accelerators: number) {
  return Math.floor(accelerators / GPUS_PER_NODE);
}

async function getProcurement({
  id,
}: {
  id: string;
}) {
  const client = await apiClient();
  const res = await client.GET("/v0/procurements/{id}", {
    params: { path: { id: id } },
  });

  if (!res.response.ok) {
    throw new Error(
      res.error?.message || "Failed to get procurement",
    );
  }

  return res.data ?? null;
}

async function listProcurements(
  filter?: (procurement: Procurement) => boolean,
) {
  const client = await apiClient();
  const procurements: Procurement[] = [];
  let hasMore = true;
  while (hasMore) {
    const res = await client.GET("/v0/procurements", {
      query: {
        limit: 100,
      },
    });

    if (!res.response.ok) {
      throw new Error(res.error?.message || "Failed to list procurements");
    }

    const data = res.data?.data ?? [];
    if (filter) {
      procurements.push(...data.filter(filter));
    } else {
      procurements.push(...data);
    }
    hasMore = res.data?.has_more ?? false;
  }

  return procurements;
}

async function updateProcurement({
  procurement,
  horizonMinutes,
  nodesRequired,
  pricePerGpuHourInCents,
}) {
  const client = await apiClient();
  const res = await client.PATCH("/v0/procurements/{id}", {
    params: { path: { id: procurement.id } },
    body: {
      instance_type: procurement.instance_type,
      desired_quantity: nodesRequired,
      buy_limit_price_per_gpu_hour: pricePerGpuHourInCents,
      horizon: horizonMinutes,
    },
  });
  if (!res.response.ok) {
    throw new Error(res.error?.message || "Failed to update procurement");
  }
  return res.data ?? null;
}

async function createProcurement({
  type,
  horizonMinutes,
  nodesRequired,
  pricePerGpuHourInCents,
  cluster,
}) {
  const client = await apiClient();
  const res = await client.POST("/v0/procurements", {
    body: {
      instance_type: type,
      desired_quantity: nodesRequired,
      buy_limit_price_per_gpu_hour: pricePerGpuHourInCents,
      sell_limit_price_per_gpu_hour: 25,
      horizon: Math.max(horizonMinutes, 1),
      status: "active",
      colocation_strategy: cluster
        ? { type: "pinned", cluster_name: cluster }
        : { type: "colocate-pinned" },
    },
  });
  if (!res.response.ok) {
    throw new Error(res.error?.message || "Failed to create procurement");
  }
  return res.data ?? null;
}
