import React, { useEffect, useState } from "react";
import { Box, render, Text } from "ink";
import Spinner from "ink-spinner";
import { Command } from "@commander-js/extra-typings";

import { apiClient } from "../../apiClient.ts";

import { getProcurement, parseIds, type Procurement } from "./utils.ts";
import ProcurementDisplay from "./ProcurementDisplay.tsx";

async function listProcurements() {
  const client = await apiClient();
  const procurements: Procurement[] = [];
  let hasMore = true;
  while (hasMore) {
    const {
      response,
      data: listObject,
      error,
    } = await client.GET("/v0/procurements", {
      query: {
        limit: 100,
        offset: procurements.length,
      },
    });

    if (!response.ok) {
      throw new Error(error?.message || "Failed to list procurements");
    }

    const { data = [], has_more = false } = listObject ?? {};
    procurements.push(...data);
    hasMore = has_more;
  }

  return procurements;
}

function ProcurementsList(props: { type?: string; ids?: string[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [procurements, setProcurements] = useState<Procurement[]>([]);
  const [failedFetches, setFailedFetches] = useState<
    { id: string; message: string }[]
  >([]);

  useEffect(() => {
    async function fetchInfo() {
      try {
        let fetchedProcurements: Procurement[] = [];

        // Fetch procurements either by specific IDs or list all
        const { ids = [], type } = props;
        if (ids.length > 0) {
          const settled = await Promise.allSettled(
            ids.map((id) => getProcurement({ id })),
          );

          const failed: { id: string; message: string }[] = [];

          settled.forEach((result, idx) => {
            if (result.status === "fulfilled" && result.value !== null) {
              fetchedProcurements.push(result.value);
            } else {
              failed.push({
                id: ids[idx],
                message: result.status === "rejected"
                  ? result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason)
                  : "Unknown error",
              });
            }
          });

          setFailedFetches(failed);
        } else {
          fetchedProcurements = await listProcurements();
        }

        // Apply type filter if provided
        const finalProcurements = type
          ? fetchedProcurements.filter((p) => p.instance_type === type)
          : fetchedProcurements;

        setProcurements(finalProcurements);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
      } finally {
        setIsLoading(false);
      }
    }
    fetchInfo();
  }, [props.type, props.ids]);

  if (isLoading) {
    return (
      <Box gap={1}>
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

  if (procurements.length === 0 && failedFetches.length === 0) {
    return (
      <Box flexDirection="column" gap={1} paddingBottom={1}>
        <Text>No procurements found.</Text>

        <Box paddingLeft={2} flexDirection="column">
          <Text dimColor># To create a procurement</Text>
          <Text color="yellow">
            sf scale -n 8{props.type ? ` -t ${props.type}` : ""}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={2} paddingBottom={1}>
      {procurements.map((procurement) => (
        <ProcurementDisplay procurement={procurement} key={procurement.id} />
      ))}
      {failedFetches.length > 0 && (
        <Box flexDirection="column">
          <Text color="red">
            Failed to fetch {failedFetches.length} procurement(s):
          </Text>
          {failedFetches.map((f) => (
            <Text key={f.id} color="red">
              - {f.message} ({f.id})
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

const show = new Command("show")
  .alias("list")
  .alias("ls")
  .configureHelp({
    optionDescription: (option) => {
      if (option.flags === "-h, --help") {
        return 'Display help for "scale list"';
      }
      return option.description;
    },
  })
  .addHelpText(
    "after",
    `
Examples:
\x1b[2m# List all procurements\x1b[0m
$ sf scale ls

\x1b[2m# Show a specific procurement by ID\x1b[0m
$ sf scale show <procurement_id>

\x1b[2m# List all procurements of a specific node type\x1b[0m
$ sf scale list -t h100i
`,
  )
  .showHelpAfterError()
  .description("Show active and disabled procurements")
  .argument("[ID...]", "Show a specific procurement by ID")
  .option("-t, --type <type>", "Show procurements of a specific node type")
  .action((ids, options) => {
    const parsedIds = parseIds(ids);
    render(<ProcurementsList {...options} ids={parsedIds} />);
  });

export default show;
