import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Box, render, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import { Command } from "@commander-js/extra-typings";

import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import ConfirmInput from "../ConfirmInput.tsx";
import ProcurementDisplay, {
  ProcurementHeader,
} from "./ProcurementDisplay.tsx";
import ConfirmationMessage from "./ConfirmationMessage.tsx";
import {
  acceleratorsToNodes,
  getProcurement,
  parseAccelerators,
  parseHorizonArg,
  parseIds,
  parsePriceArg,
  type Procurement,
} from "./utils.ts";

async function updateProcurement({
  procurementId,
  horizonMinutes,
  nodesRequired,
  pricePerGpuHourInCents,
}: {
  procurementId: string;
  horizonMinutes?: number;
  nodesRequired?: number;
  pricePerGpuHourInCents?: number;
}) {
  const client = await apiClient();
  const { data, response, error } = await client.PATCH(
    "/v0/procurements/{id}",
    {
      params: { path: { id: procurementId } },
      body: {
        desired_quantity: nodesRequired,
        buy_limit_price_per_gpu_hour: pricePerGpuHourInCents,
        horizon: horizonMinutes,
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      error?.message
        ? `${error.message} (${response.status})`
        : "Failed to update procurement",
    );
  }
  return data;
}

function useUpdateProcurements() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [results, setResults] = useState<
    PromiseSettledResult<Procurement | undefined>[]
  >();

  const updateProcurements = useCallback(async (ids: string[], params: {
    horizonMinutes?: number;
    nodesRequired?: number;
    pricePerGpuHourInCents?: number;
  }) => {
    try {
      setIsLoading(true);
      setError(undefined);

      const updatePromises = ids.map((id) =>
        updateProcurement({
          procurementId: id,
          ...params,
        })
      );

      const results = await Promise.allSettled(
        updatePromises,
      );
      setResults(results);

      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        setError(`Failed to update ${failures.length} procurement(s)`);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    results,
    updateProcurements,
  };
}

type UpdateProcurementCommandProps = {
  ids: string[];
  accelerators: number;
  horizon?: number;
  price?: number;
  yes?: boolean;
};

function UpdateProcurementCommand(props: UpdateProcurementCommandProps) {
  const { exit } = useApp();
  const [procurements, setProcurements] = useState<
    PromiseSettledResult<Procurement | null>[]
  >();
  const { successfulProcurements } = useMemo(() => {
    const successfulProcurements = procurements
      ?.filter?.((p): p is PromiseFulfilledResult<Procurement> =>
        p.status === "fulfilled" && p.value != null
      )
      ?.map?.((p) => p.value);
    return { successfulProcurements };
  }, [procurements]);
  const [confirmationMessage, setConfirmationMessage] = useState<ReactNode>();
  const nodesRequired = useMemo(() => acceleratorsToNodes(props.accelerators), [
    props.accelerators,
  ]);

  const [displayedPricePerGpuHourInCents, setDisplayedPricePerGpuHourInCents] =
    useState<number>();
  useEffect(() => {
    (async function init() {
      try {
        const settledResults = await Promise.allSettled(
          props.ids.map((id) => getProcurement({ id })),
        );

        const successfullyFetched = settledResults
          .filter((r): r is PromiseFulfilledResult<Procurement> =>
            r.status === "fulfilled" && r.value != null
          )
          .map((r) => r.value);

        const failedToFetch = settledResults
          .map((r, i) => [r, props.ids[i]] as const)
          .filter((r): r is [PromiseRejectedResult, string] =>
            r[0].status === "rejected"
          ).map((r) =>
            [
              r[0].reason instanceof Error
                ? r[0].reason.message
                : "Unknown error",
              r[1],
            ] as const
          );

        if (successfullyFetched.length === 0) {
          logAndQuit("No procurements could be fetched");
        }

        setProcurements(settledResults);
        setDisplayedPricePerGpuHourInCents(props.price);

        if (props.yes) {
          await updateProcurements(
            successfullyFetched.map((p) => p.id),
            {
              horizonMinutes: props.horizon,
              nodesRequired,
              pricePerGpuHourInCents: props.price,
            },
          );
        } else {
          setConfirmationMessage(
            <Box flexDirection="column">
              {successfullyFetched?.length > 0 &&
                successfullyFetched.map((p) => (
                  <Box key={p.id} flexDirection="column">
                    <ProcurementHeader
                      id={p.id}
                      quantity={p.desired_quantity}
                    />
                    <ConfirmationMessage
                      key={p.id}
                      quote={false}
                      type={p.instance_type}
                      horizonMinutes={props.horizon === p.horizon
                        ? undefined
                        : props.horizon}
                      pricePerGpuHourInCents={props.price ===
                          p.buy_limit_price_per_gpu_hour
                        ? undefined
                        : props.price}
                      accelerators={acceleratorsToNodes(props.accelerators) ===
                          p.desired_quantity
                        ? undefined
                        : props.accelerators}
                      update
                    />
                  </Box>
                ))}
              {failedToFetch?.length > 0 && (
                <>
                  <Text color="red">
                    Failed to fetch {failedToFetch.length} procurement(s):
                  </Text>
                  {failedToFetch.map(([message, id]) => (
                    <Box key={id} flexDirection="column">
                      <Text color="red">
                        - {message}
                      </Text>
                    </Box>
                  ))}
                </>
              )}
            </Box>,
          );
        }
      } catch (err: unknown) {
        exit(
          err instanceof Error ? err : new Error("An unknown error occurred"),
        );
      }
    })();
  }, []);

  const { isLoading, error, results, updateProcurements } =
    useUpdateProcurements();

  const handleSubmit = useCallback((submitValue: boolean) => {
    if (!submitValue || !successfulProcurements) {
      exit();
      return;
    }

    updateProcurements(
      successfulProcurements.map((p) => p.id),
      {
        horizonMinutes: props.horizon,
        nodesRequired,
        pricePerGpuHourInCents: displayedPricePerGpuHourInCents,
      },
    );
  }, [
    successfulProcurements,
    props.horizon,
    nodesRequired,
    displayedPricePerGpuHourInCents,
  ]);

  if (error && !results) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (isLoading) {
    return (
      <Box>
        <Spinner type="arc" />
        <Text>Updating procurement(s)...</Text>
      </Box>
    );
  }

  if (results) {
    const successfulProcurements = results.filter((
      r,
    ): r is PromiseFulfilledResult<Procurement> =>
      r.status === "fulfilled" && r.value != null
    ).map((r) => r.value);
    const failedProcurements = results.filter((r): r is PromiseRejectedResult =>
      r.status === "rejected"
    ).map((r) =>
      r.reason instanceof Error ? r.reason.message : "Unknown error"
    );
    return (
      <Box flexDirection="column" gap={1}>
        {successfulProcurements && successfulProcurements.length > 0 && (
          <Text color="green">
            Successfully updated {successfulProcurements.length}{" "}
            procurement(s) to {props.accelerators} GPUs.
          </Text>
        )}
        {failedProcurements && failedProcurements.length > 0 && (
          <Box flexDirection="column">
            <Text color="red">
              Failed to update {failedProcurements.length} procurement(s):
            </Text>
            {failedProcurements.map((f, i) => (
              <Text key={i} color="red">
                - {f}
              </Text>
            ))}
          </Box>
        )}
        {successfulProcurements &&
          successfulProcurements.map((s, i) => (
            <ProcurementDisplay key={i} procurement={s} />
          ))}
      </Box>
    );
  }

  if (confirmationMessage && !props.yes && procurements) {
    return (
      <Box flexDirection="column" gap={1}>
        {confirmationMessage}
        <Box>
          <Text>
            Update {successfulProcurements?.length ?? procurements.length}{" "}
            procurement(s)? (y/N)
          </Text>
          <ConfirmInput isChecked={false} onSubmit={handleSubmit} />
        </Box>
      </Box>
    );
  }

  return null;
}

const update = new Command("update")
  .description("update a procurement.")
  .argument("<procurement_id...>", "ID of the procurement to update")
  .requiredOption(
    "-n, --accelerators <accelerators>",
    "desired number of GPUs (0 to turn off)",
    parseAccelerators,
  )
  .option(
    "-d, --horizon <horizon>",
    "the minimum amount of time to reserve the GPUs for. that is, start buying more compute if the remaining time is less than this threshold.",
    parseHorizonArg,
  )
  .option(
    "-p, --price <price>",
    "limit price per GPU per hour, in dollars. buy compute only if it's at most this price. defaults to the current market price times 1.5, or $2.65 if if we can't get a price estimate.",
    parsePriceArg,
  )
  .option("-y, --yes", "automatically confirm the command.")
  .action((id, options) => {
    render(
      <UpdateProcurementCommand
        {...options}
        ids={parseIds(id)}
      />,
    );
  });

export default update;
