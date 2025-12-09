import React from "react";
import { Command, Option } from "@commander-js/extra-typings";
import { brightBlack, cyan, gray } from "jsr:@std/fmt/colors";
import console from "node:console";
import ora from "ora";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import advanced from "dayjs/plugin/advancedFormat";
import timezone from "dayjs/plugin/timezone";
import { Box, render, Text } from "ink";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";
import { formatDuration, intervalToDuration } from "date-fns";

import { getAuthToken } from "../../helpers/config.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import {
  formatDate,
  formatNullableDateRange,
} from "../../helpers/format-date.ts";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import { Row } from "../Row.tsx";
import {
  createNodesTable,
  DEFAULT_NODE_LS_LIMIT,
  getLastVM,
  getStatusColor,
  getVMStatusColor,
  jsonOption,
  pluralizeNodes,
  printNodeType,
} from "./utils.ts";

dayjs.extend(utc);
dayjs.extend(advanced);
dayjs.extend(timezone);

// Valid node status values for filtering
const VALID_STATES = [
  "pending",
  "awaitingcapacity",
  "running",
  "released",
  "failed",
  "terminated",
] as const;

// Helper component to display VMs in a table format using Ink
function VMTable({ vms }: { vms: NonNullable<SFCNodes.Node["vms"]>["data"] }) {
  const sortedVms = vms.sort((a, b) => b.updated_at - a.updated_at);
  const vmsToShow = sortedVms.slice(0, 5);
  const remainingVms = sortedVms.length - 5;

  return (
    <Box flexDirection="column" padding={0}>
      {/* Build table as columns */}
      <Box flexDirection="row" padding={0}>
        {/* Column 1: VM IDs */}
        <Box flexDirection="column" width={27} padding={0}>
          <Box
            padding={0}
            borderStyle="single"
            borderBottom
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderColor="gray"
          >
            <Text bold color="cyan">VM History</Text>
          </Box>
          {vmsToShow.map((vm) => (
            <Box key={vm.id} padding={0} paddingLeft={2}>
              <Text>{vm.id}</Text>
            </Box>
          ))}
        </Box>

        {/* Column 2: Status */}
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={0}
          paddingRight={1}
          padding={0}
        >
          <Box
            padding={0}
            borderStyle="single"
            borderBottom
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderColor="gray"
            marginRight={-1}
          >
            <Text bold color="cyan">Status</Text>
          </Box>
          {vmsToShow.map((vm) => (
            <Box key={vm.id} padding={0}>
              <Text>{getVMStatusColor(vm.status)}</Text>
            </Box>
          ))}
        </Box>

        {/* Column 3: Zone */}
        <Box
          flexDirection="column"
          flexShrink={0}
          flexGrow={1}
          paddingRight={1}
          padding={0}
        >
          <Box
            padding={0}
            borderStyle="single"
            borderBottom
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderColor="gray"
            marginRight={-1}
          >
            <Text bold color="cyan">Zone</Text>
          </Box>
          {vmsToShow.map((vm) => (
            <Box key={vm.id} padding={0}>
              <Text>{cyan(vm.zone)}</Text>
            </Box>
          ))}
        </Box>

        {/* Column 4: Start/End */}
        <Box flexDirection="column" flexGrow={2} padding={0}>
          <Box
            padding={0}
            borderStyle="single"
            borderBottom
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderColor="gray"
          >
            <Text bold color="cyan">Start/End</Text>
          </Box>
          {vmsToShow.map((vm) => {
            const startDate = vm.start_at ? dayjs.unix(vm.start_at) : null;
            const endDate = vm.end_at ? dayjs.unix(vm.end_at) : null;
            const startEnd = formatNullableDateRange(startDate, endDate);
            return (
              <Box key={vm.id} padding={0}>
                <Text>{startEnd}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Show message if there are more VMs */}
      {remainingVms > 0 && (
        <Box gap={1} marginTop={1} marginLeft={2}>
          <Text color="gray">
            {remainingVms} past {remainingVms === 1 ? "VM" : "VMs"} not shown.
          </Text>
          <Text color="cyan">
            (To see all VMs, use `sf nodes ls --json`)
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Helper function to get available actions for a node based on its status
function getActionsForNode(node: SFCNodes.Node) {
  const nodeActions: { label: string; command: string }[] = [];

  // Get the last VM for logs/ssh commands
  const lastVm = getLastVM(node);

  if (lastVm?.image_id) {
    nodeActions.push({
      label: "Image",
      command: `sf nodes image show ${brightBlack(lastVm.image_id)}`,
    });
  }

  switch (node.status) {
    case "released":
      // Released nodes: can view logs/ssh until the node ends
      if (lastVm?.id) {
        nodeActions.push({
          label: "SSH",
          command: `sf nodes ssh root@${brightBlack(node.name)}`,
        });
        nodeActions.push(
          {
            label: "Logs",
            command: `sf nodes logs ${brightBlack(node.name)}`,
          },
        );
      }
      nodeActions.push({
        label: "Delete",
        command: `sf nodes delete ${brightBlack(node.name)}`,
      });
      break;

    case "failed":
    case "terminated":
    case "deleted":
      // No actions for ended nodes
      break;

    case "running":
      // Running nodes
      if (lastVm?.id) {
        nodeActions.push(
          {
            label: "SSH",
            command: `sf nodes ssh root@${brightBlack(node.name)}`,
          },
          {
            label: "Logs",
            command: `sf nodes logs ${brightBlack(node.name)}`,
          },
        );
      }

      // Redeploy is available for all running nodes
      nodeActions.push({
        label: "Redeploy",
        command: `sf nodes redeploy ${brightBlack(node.name)}`,
      });

      if (node.node_type === "reserved") {
        // Reserved nodes: can extend or delete
        nodeActions.push(
          {
            label: "Extend",
            command: `sf nodes extend ${
              brightBlack(node.name)
            } --duration 60 --max-price 12.00`,
          },
          {
            label: "Delete",
            command: `sf nodes delete ${brightBlack(node.name)}`,
          },
        );
      } else if (node.node_type === "autoreserved") {
        // Auto reserved nodes: can update, release, delete
        nodeActions.push(
          {
            label: "Update",
            command: `sf nodes set ${brightBlack(node.name)} --max-price 12.50`,
          },
          {
            label: "Release",
            command: `sf nodes release ${brightBlack(node.name)}`,
          },
          {
            label: "Delete",
            command: `sf nodes delete ${brightBlack(node.name)}`,
          },
        );
      }
      break;

    case "pending":
    case "awaitingcapacity":
      // Pending/awaiting nodes
      if (lastVm?.id) {
        nodeActions.push(
          {
            label: "Logs",
            command: `sf nodes logs ${brightBlack(node.name)}`,
          },
        );
      }

      if (node.node_type === "autoreserved") {
        // Auto reserved nodes: can update, release, delete
        nodeActions.push(
          {
            label: "Update",
            command: `sf nodes set ${brightBlack(node.name)} --max-price 12.50`,
          },
          {
            label: "Release",
            command: `sf nodes release ${brightBlack(node.name)}`,
          },
          {
            label: "Delete",
            command: `sf nodes delete ${brightBlack(node.name)}`,
          },
        );
      } else if (node.node_type === "reserved") {
        // Reserved nodes: can delete
        nodeActions.push({
          label: "Delete",
          command: `sf nodes delete ${brightBlack(node.name)}`,
        });
      }
      break;

    default:
      // For unknown statuses, show basic actions if VM is available
      if (lastVm?.id) {
        nodeActions.push(
          {
            label: "SSH",
            command: `sf nodes ssh root@${brightBlack(node.name)}`,
          },
          {
            label: "Logs",
            command: `sf nodes logs ${brightBlack(node.name)}`,
          },
        );
      }
      nodeActions.push({
        label: "Release",
        command: `sf nodes release ${brightBlack(node.name)}`,
      });
      break;
  }

  return nodeActions;
}

// Component for displaying a single node in verbose format
function NodeVerboseDisplay({ node }: { node: SFCNodes.Node }) {
  // Convert Unix timestamps to dates and calculate duration
  const startDate = node.start_at ? dayjs.unix(node.start_at) : null;
  const endDate = node.end_at ? dayjs.unix(node.end_at) : null;
  let duration = endDate && startDate && endDate.diff(startDate, "hours");
  if (typeof duration === "number" && duration < 1) {
    duration = 1;
  }
  const durationLabel = duration
    ? formatDuration(
      intervalToDuration({
        start: 0,
        end: duration * 60 * 60 * 1000,
      }),
      {
        delimiter: ", ",
        format: ["years", "months", "weeks", "days", "hours"],
      },
    )
    : null;
  // Convert max_price_per_node_hour from cents to dollars
  const pricePerHour = node.max_price_per_node_hour
    ? (node.max_price_per_node_hour / 100)
    : 0;
  const totalCost = duration && node.max_price_per_node_hour
    ? (duration * node.max_price_per_node_hour / 100)
    : 0;

  // Get available actions for this node
  const nodeActions = getActionsForNode(node);

  const lastVM = getLastVM(node);

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
        <Text color="cyan" bold>Node: {node.name}</Text>
      </Box>

      {/* Basic Information */}
      <Box flexDirection="row">
        <Box paddingX={1} flexDirection="column" flexGrow={1}>
          <Row head="ID: " value={node.id} />
          <Row head="Type: " value={printNodeType(node.node_type)} />
          <Row head="Status: " value={getStatusColor(node.status)} />
        </Box>
        <Box paddingX={1} flexDirection="column" flexGrow={1}>
          <Row head="GPU: " value={node.gpu_type} />
          <Row
            head="Zone: "
            value={node.zone ?? (node.node_type === "autoreserved"
              ? (lastVM?.zone
                ? `Any matching ${cyan(`(${lastVM?.zone})`)}`
                : "Any matching")
              : "Not specified")}
          />
          <Row head="Owner: " value={node.owner} />
        </Box>
      </Box>

      {lastVM && (
        <>
          <Box marginTop={1} paddingX={1}>
            <Text bold color="cyan">Active VM:</Text>
          </Box>
          <Box marginLeft={2} flexDirection="column" paddingX={1}>
            <Row head="ID: " value={lastVM.id} />
            <Row head="Status: " value={getVMStatusColor(lastVM.status)} />
            <Row head="Zone: " value={cyan(lastVM.zone)} />
            <Row
              head="Image: "
              value={lastVM.image_id ?? "Default SFC Image"}
            />
            <Row
              head="Start: "
              value={lastVM.start_at
                ? `${formatDate(dayjs.unix(lastVM.start_at).toDate())} ${
                  dayjs.unix(lastVM.start_at).format("z")
                } ${
                  brightBlack(
                    dayjs.unix(lastVM.start_at).format("YYYY-MM-DDTHH:mm:ssZ"),
                  )
                }`
                : "Not specified"}
            />
            <Row
              head="End: "
              value={lastVM.end_at
                ? `${formatDate(dayjs.unix(lastVM.end_at).toDate())} ${
                  dayjs.unix(lastVM.end_at).format("z")
                } ${
                  brightBlack(
                    dayjs.unix(lastVM.end_at).format("YYYY-MM-DDTHH:mm:ssZ"),
                  )
                }`
                : "Not specified"}
            />
          </Box>
        </>
      )}

      {node.vms?.data && node.vms.data.length > 1 && (
        <Box flexDirection="column" gap={0} marginLeft={1} marginRight={2}>
          <Box marginTop={1} paddingX={1}>
          </Box>
          <VMTable
            vms={node.vms.data}
          />
        </Box>
      )}

      <Box marginTop={1} paddingX={1}>
        <Text bold color="cyan">Schedule:</Text>
      </Box>

      <Box marginLeft={2} flexDirection="column" paddingX={1}>
        <Row
          head="Start: "
          value={startDate
            ? `${formatDate(startDate.toDate())} ${startDate.format("z")} ${
              brightBlack(
                startDate.format("YYYY-MM-DDTHH:mm:ssZ"),
              )
            }`
            : "Not specified"}
        />
        <Row
          head={node.node_type === "autoreserved" &&
              (node.status === "running" ||
                node.status === "pending" ||
                node.status === "awaitingcapacity") &&
              endDate
            ? "End (Rolling): "
            : "End: "}
          value={endDate
            ? `${formatDate(endDate.toDate())} ${endDate.format("z")} ${
              brightBlack(
                endDate.format("YYYY-MM-DDTHH:mm:ssZ"),
              )
            }`
            : "Not specified"}
        />
        {duration && (
          <Row
            head="Duration: "
            value={durationLabel}
          />
        )}
      </Box>

      {node.max_price_per_node_hour && (
        <>
          <Box marginTop={1} paddingX={1}>
            <Text bold color="cyan">Pricing:</Text>
          </Box>
          <Box marginLeft={2} flexDirection="column" paddingX={1}>
            {node.node_type === "autoreserved" && (
              <>
                <Row
                  head="Max Price: "
                  value={`$${pricePerHour.toFixed(2)}/hour`}
                />
              </>
            )}
            {node.node_type !== "autoreserved" && (
              <>
                <Row
                  head="Price: "
                  value={`$${pricePerHour.toFixed(2)}/hour`}
                />

                <Row
                  head="Total Cost: "
                  value={duration
                    ? `$${totalCost.toFixed(2)}`
                    : "Not available"}
                />
              </>
            )}
          </Box>
        </>
      )}

      {/* Actions Section - Show based on available actions */}
      {nodeActions.length > 0 && (
        <>
          <Box marginTop={1} paddingX={1}>
            <Text bold color="cyan">Actions:</Text>
          </Box>
          <Box marginLeft={2} flexDirection="column" paddingX={1}>
            {nodeActions.map((action, index) => (
              <Row
                key={index}
                head={`${action.label}: `}
                value={action.command}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

// Component for displaying multiple nodes in verbose format
export function NodesVerboseDisplay({ nodes }: { nodes: SFCNodes.Node[] }) {
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

    const filteredNodes = (options.status?.length)
      ? nodes.filter((n) =>
        options.status?.length &&
        options.status.includes(n.status)
      )
      : nodes;

    if (options.json) {
      console.log(JSON.stringify(filteredNodes, null, 2));
      return;
    }

    if (filteredNodes.length === 0) {
      console.log("No nodes found.");
      console.log(gray("\nCreate your first node:"));
      console.log("  sf nodes create my-first-node");
      return;
    }

    if (options.verbose) {
      render(
        <NodesVerboseDisplay nodes={filteredNodes.slice(0, options.limit)} />,
      );
    } else {
      console.log(createNodesTable(filteredNodes, options.limit));
      console.log(
        gray(
          `\nFound ${filteredNodes.length} ${
            pluralizeNodes(filteredNodes.length)
          } total. Use --verbose for detailed information, such as previous virtual machines.`,
        ),
      );

      // Get actions from all nodes, deduplicated with newest nodes taking precedence
      const allCommands: string[] = [];
      const seenLabels = new Set<string>();

      // Sort nodes by created_at (newest first), fallback to index for consistent ordering
      const sortedNodes = [...filteredNodes].sort((a, b) => {
        const aTime = a.created_at || 0;
        const bTime = b.created_at || 0;
        return bTime - aTime; // Newest first
      });

      // Collect actions from each node, with newer nodes taking precedence
      // Limit to 5 commands total, deduplicated by label
      for (const node of sortedNodes) {
        const nodeActions = getActionsForNode(node);
        for (const action of nodeActions) {
          // Add command if we haven't seen this label and haven't reached the limit
          if (allCommands.length < 5 && !seenLabels.has(action.label)) {
            allCommands.push(action.command);
            seenLabels.add(action.label);
          }
        }
      }

      // Print Next Steps section
      if (allCommands.length > 0) {
        console.log(gray("\nNext steps:"));
        for (const command of allCommands) {
          console.log(`  ${command}`);
        }
      }
    }
  } catch (err) {
    handleNodesError(err);
  }
}

const list = new Command("list")
  .alias("ls")
  .description("List all compute nodes")
  .showHelpAfterError()
  .option("--verbose", "Show detailed information for each node")
  .option(
    "--limit <number>",
    "Limit the number of nodes to display",
    Number.parseInt,
    DEFAULT_NODE_LS_LIMIT,
  )
  .addOption(
    new Option("--status <status...>", "Filter by node status")
      .choices(VALID_STATES as (readonly SFCNodes.Status[])),
  )
  .addOption(jsonOption)
  .addHelpText(
    "after",
    `
Next Steps:\n
  \x1b[2m# List nodes in short format (default)\x1b[0m
  $ sf nodes list

  \x1b[2m# List all nodes with detailed information\x1b[0m
  $ sf nodes list --verbose

  \x1b[2m# List up to 100 nodes\x1b[0m
  $ sf nodes list --limit 100

  \x1b[2m# List pending or running nodes\x1b[0m
  $ sf nodes list --status pending running

  \x1b[2m# List nodes in JSON format\x1b[0m
  $ sf nodes list --json
`,
  )
  .action(async (options) => {
    await listNodesAction(options);
  });

export default list;
