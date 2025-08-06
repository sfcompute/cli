import React from "react";
import { Command } from "@commander-js/extra-typings";
import { gray } from "jsr:@std/fmt/colors";
import console from "node:console";
import ora from "ora";
import dayjs from "dayjs";
import { Box, render, Text } from "ink";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";

import { getAuthToken } from "../../helpers/config.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import { Row } from "../Row.tsx";
import {
  createNodesTable,
  getStatusColor,
  jsonOption,
  printNodeType,
} from "./utils.ts";

// Component for displaying a single node in verbose format
function NodeVerboseDisplay({ node }: { node: SFCNodes.Node }) {
  // Convert Unix timestamps to dates and calculate duration
  const startDate = node.start_at && dayjs.unix(node.start_at);
  const endDate = node.end_at && dayjs.unix(node.end_at);
  const duration = endDate && startDate && endDate.diff(startDate, "hours");

  // Convert max_price_per_node_hour from cents to dollars
  const pricePerHour = node.max_price_per_node_hour
    ? node.max_price_per_node_hour / 100
    : 0;
  const totalCost = duration && node.max_price_per_node_hour
    ? (duration * node.max_price_per_node_hour) / 100
    : 0;

  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      flexDirection="column"
      padding={0}
      width={80}
    >
      {/* Header */}
      <Box
        paddingX={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor="cyan"
      >
        <Text color="cyan" bold>
          Node: {node.name}
        </Text>
      </Box>

      {/* Basic Information */}
      <Box paddingX={1} flexDirection="column">
        <Row head="ID: " value={node.id} />
        <Row head="Type: " value={printNodeType(node.node_type)} />
        <Row head="Status: " value={getStatusColor(node.status)} />
        <Row head="GPU: " value={node.gpu_type} />
        <Row head="Zone: " value={node.zone ?? "Not specified"} />
        <Row head="Owner: " value={node.owner} />
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text>📅 Schedule:</Text>
      </Box>
      {node.node_type === "spot" && (
        <Box marginLeft={4}>
          <Text color="yellow">
            This node is spot and has no explicit start, end, or duration.
          </Text>
        </Box>
      )}
      {node.node_type !== "spot" && (
        <Box marginLeft={3} flexDirection="column" paddingX={1}>
          <Row
            head="Start: "
            value={startDate
              ? `${startDate.format("YYYY-MM-DD HH:mm:ss")} UTC`
              : "Not specified"}
          />
          <Row
            head="End: "
            value={endDate
              ? `${endDate.format("YYYY-MM-DD HH:mm:ss")} UTC`
              : "Not specified"}
          />
          <Row
            head="Duration: "
            value={duration ? `${duration} hours` : "Not specified"}
          />
        </Box>
      )}

      <Box marginTop={1} paddingX={1}>
        <Text>💰 Pricing:</Text>
      </Box>
      <Box marginLeft={3} flexDirection="column" paddingX={1}>
        {node.node_type === "spot" && (
          <>
            <Row
              head="Max Price: "
              value={`$${pricePerHour.toFixed(2)}/hour`}
            />
          </>
        )}
        {node.node_type !== "spot" && (
          <>
            <Row head="Price: " value={`$${pricePerHour.toFixed(2)}/hour`} />

            <Row
              head="Total Cost: "
              value={duration ? `$${totalCost.toFixed(2)}` : "Not available"}
            />
          </>
        )}
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text>🎯 Actions:</Text>
      </Box>
      <Box marginLeft={3} flexDirection="column" paddingX={1}>
        <Row head="Logs: " value={`sf vms logs ${node.name}`} />
        <Row head="SSH: " value={`sf vms ssh ${node.name}`} />
        {node.node_type !== "spot" && (
          <Row
            head="Extend: "
            value={`sf nodes extend ${node.name} --duration 60 --max-price 12.00`}
          />
        )}
        <Row head="Release: " value={`sf nodes release ${node.name}`} />
      </Box>
    </Box>
  );
}

// Component for displaying multiple nodes in verbose format
function NodesVerboseDisplay({ nodes }: { nodes: SFCNodes.Node[] }) {
  return (
    <Box flexDirection="column" gap={1}>
      {nodes.map((node, index) => (
        <NodeVerboseDisplay key={node.id || index} node={node} />
      ))}
    </Box>
  );
}

async function listNodesAction(options: ReturnType<typeof list.opts>) {
  try {
    const token = await getAuthToken();
    if (!token) {
      logAndQuit("Not logged in. Please run 'sf login' first.");
    }
    const client = await nodesClient(token);

    const spinner = ora("Fetching nodes...").start();
    const { data: nodes } = await client.nodes.list();

    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(nodes, null, 2));
      return;
    }

    if (nodes.length === 0) {
      console.log("No nodes found.");
      console.log(gray("\nCreate your first node:"));
      console.log("  sf nodes create my-first-node");
      return;
    }

    if (options.verbose) {
      render(<NodesVerboseDisplay nodes={nodes} />);
    } else {
      console.log(createNodesTable(nodes));
      console.log(
        gray(
          `\nFound ${nodes.length} node(s). Use --verbose for detailed information.`,
        ),
      );
      console.log(gray("\nExamples:"));
      console.log(`  sf nodes set ${nodes[0].name} --max-price 12.50`);
      console.log(`  sf nodes release ${nodes[0].name}`);
    }
  } catch (err) {
    handleNodesError(err);
  }
}

const list = new Command("list")
  .alias("ls")
  .description("List all compute nodes")
  .option("--verbose", "Show detailed information for each node")
  .addOption(jsonOption)
  .addHelpText(
    "after",
    `
Examples:
  \x1b[2m# List nodes in short format (default)\x1b[0m
  $ sf nodes list

  \x1b[2m# List all nodes with detailed information\x1b[0m
  $ sf nodes list --verbose

  \x1b[2m# List nodes in JSON format\x1b[0m
  $ sf nodes list --json
`,
  )
  .action(async (options) => {
    await listNodesAction(options);
  });

export default list;
