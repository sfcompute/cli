import React from "react";
import { Command } from "@commander-js/extra-typings";
import { brightBlack, gray } from "jsr:@std/fmt/colors";
import console from "node:console";
import ora from "ora";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import advanced from "dayjs/plugin/advancedFormat";
import timezone from "dayjs/plugin/timezone";
import { Box, render, Text } from "ink";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";

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
  getStatusColor,
  getVMStatusColor,
  jsonOption,
  pluralizeNodes,
  printNodeType,
} from "./utils.ts";

dayjs.extend(utc);
dayjs.extend(advanced);
dayjs.extend(timezone);

// Helper component to display VMs in a table format using Ink
function VMTable({ vms }: { vms: NonNullable<SFCNodes.Node["vms"]>["data"] }) {
  const sortedVms = vms.sort((a, b) => b.updated_at - a.updated_at);
  const vmsToShow = sortedVms.slice(0, 5);
  const remainingVms = sortedVms.length - 5;

  return (
    <Box flexDirection="column" padding={0}>
      {/* Header */}
      <Box
        padding={0}
        marginY={0}
        borderStyle="single"
        borderBottom
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
      >
        <Box width={25} padding={0}>
          <Text bold color="cyan">Virtual Machines</Text>
        </Box>
        <Box width={15} padding={0}>
          <Text bold color="cyan">Status</Text>
        </Box>
        <Box width={30} padding={0}>
          <Text bold color="cyan">Start/End</Text>
        </Box>
      </Box>

      {/* VM rows */}
      {vmsToShow.map((vm) => {
        const startDate = vm.start_at ? dayjs.unix(vm.start_at) : null;
        const endDate = vm.end_at ? dayjs.unix(vm.end_at) : null;
        const startEnd = formatNullableDateRange(startDate, endDate);

        return (
          <Box key={vm.id}>
            <Box width={25} padding={0}>
              <Text>{vm.id}</Text>
            </Box>
            <Box width={15} padding={0}>
              <Text>{getVMStatusColor(vm.status)}</Text>
            </Box>
            <Box width={30} padding={0}>
              <Text>{startEnd}</Text>
            </Box>
          </Box>
        );
      })}

      {/* Show message if there are more VMs */}
      {remainingVms > 0 && (
        <Box gap={1}>
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
  const lastVm = node.vms?.data?.sort((a, b) =>
    (b.start_at ?? b.updated_at) - (a.start_at ?? a.updated_at)
  ).at(0);

  if (lastVm?.image_id) {
    nodeActions.push({
      label: "Image",
      command: `sf vms image show ${brightBlack(lastVm.image_id)}`,
    });
  }

  switch (node.status) {
    case "released":
      // Released nodes: can view logs/ssh until the node ends
      if (lastVm?.id) {
        nodeActions.push({
          label: "SSH",
          command: `sf vms ssh root@${brightBlack(String(lastVm.id))}`,
        });
        nodeActions.push(
          {
            label: "Logs",
            command: `sf vms logs -i ${brightBlack(String(lastVm.id))}`,
          },
        );
      }
      nodeActions.push({
        label: "Delete",
        command: `sf nodes delete ${brightBlack(node.name)} (coming soon)`,
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
            command: `sf vms ssh root@${brightBlack(lastVm.id)}`,
          },
          {
            label: "Logs",
            command: `sf vms logs -i ${brightBlack(lastVm.id)}`,
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
            command: `sf nodes delete ${
              brightBlack(node.name)
            } --yes (coming soon)`,
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
            command: `sf nodes delete ${
              brightBlack(node.name)
            } --yes (coming soon)`,
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
            command: `sf vms logs -i ${brightBlack(lastVm.id)}`,
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
            command: `sf nodes delete ${
              brightBlack(node.name)
            } --yes (coming soon)`,
          },
        );
      } else if (node.node_type === "reserved") {
        // Reserved nodes: can delete
        nodeActions.push({
          label: "Delete",
          command: `sf nodes delete ${
            brightBlack(node.name)
          } --yes (coming soon)`,
        });
      }
      break;

    default:
      // For unknown statuses, show basic actions if VM is available
      if (lastVm?.id) {
        nodeActions.push(
          {
            label: "SSH",
            command: `sf vms ssh root@${brightBlack(lastVm.id)}`,
          },
          {
            label: "Logs",
            command: `sf vms logs -i ${brightBlack(lastVm.id)}`,
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
  const startDate = node.start_at && dayjs.unix(node.start_at);
  const endDate = node.end_at && dayjs.unix(node.end_at);
  let duration = endDate && startDate && endDate.diff(startDate, "hours");
  if (typeof duration === "number" && duration < 1) {
    duration = 1;
  }
  // Convert max_price_per_node_hour from cents to dollars
  const pricePerHour = node.max_price_per_node_hour
    ? (node.max_price_per_node_hour / 100)
    : 0;
  const totalCost = duration && node.max_price_per_node_hour
    ? (duration * node.max_price_per_node_hour / 100)
    : 0;

  // Get available actions for this node
  const nodeActions = getActionsForNode(node);

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

      <Box marginLeft={3} flexDirection="column" paddingX={1}>
        <Row
          head="Start: "
          value={startDate
            ? `${startDate.format("YYYY-MM-DDTHH:mm:ssZ")} ${
              brightBlack(
                `(${formatDate(startDate.toDate())} ${startDate.format("z")})`,
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
            ? `${endDate.format("YYYY-MM-DDTHH:mm:ssZ")} ${
              brightBlack(
                `(${formatDate(endDate.toDate())} ${endDate.format("z")})`,
              )
            }`
            : "Not specified"}
        />
        {duration && (
          <Row
            head="Duration: "
            value={`${duration} hours`}
          />
        )}
      </Box>

      {node.max_price_per_node_hour && (
        <>
          <Box marginTop={1} paddingX={1}>
            <Text>💰 Pricing:</Text>
          </Box>
          <Box marginLeft={3} flexDirection="column" paddingX={1}>
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

      {/* VMs Section - Show if node has VMs */}
      {node.vms?.data && node.vms.data.length > 0 && (
        <Box flexDirection="row" gap={0}>
          <Box marginTop={1} paddingX={1}>
            <Text color="cyan" bold>💿</Text>
          </Box>
          <Box marginTop={1}>
            <VMTable vms={node.vms.data} />
          </Box>
        </Box>
      )}

      {node.vms?.data?.[0]?.image_id && (
        <>
          <Box marginTop={1} paddingX={1}>
            <Text>💾 Current VM Image:</Text>
          </Box>
          <Box marginLeft={3} flexDirection="column" paddingX={1}>
            <Row
              head="ID: "
              value={node.vms?.data?.[0]?.image_id}
            />
          </Box>
        </>
      )}

      {/* Actions Section - Show based on available actions */}
      {nodeActions.length > 0 && (
        <>
          <Box marginTop={1} paddingX={1}>
            <Text>🎯 Actions:</Text>
          </Box>
          <Box marginLeft={3} flexDirection="column" paddingX={1}>
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
          `\nFound ${nodes.length} ${
            pluralizeNodes(nodes.length)
          }. Use --verbose for detailed information, such as previous virtual machines.`,
        ),
      );

      // Get actions from all nodes, deduplicated with newest nodes taking precedence
      const nodesCommands: string[] = [];
      const vmsCommands: string[] = [];
      const seenNodesLabels = new Set<string>();

      // Sort nodes by created_at (newest first), fallback to index for consistent ordering
      const sortedNodes = [...nodes].sort((a, b) => {
        const aTime = a.created_at || 0;
        const bTime = b.created_at || 0;
        return bTime - aTime; // Newest first
      });

      // Collect actions from each node, with newer nodes taking precedence
      // Limit to 3 nodes commands and 1 vms command
      for (const node of sortedNodes) {
        const nodeActions = getActionsForNode(node);
        for (const action of nodeActions) {
          const isVmsCommand = action.command.includes("sf vms");

          if (isVmsCommand) {
            // Only add the first vms command we encounter (from newest node)
            if (vmsCommands.length === 0) {
              vmsCommands.push(action.command);
            }
          } else {
            // For nodes commands, limit to 3 and deduplicate by label
            if (
              nodesCommands.length < 3 && !seenNodesLabels.has(action.label)
            ) {
              nodesCommands.push(action.command);
              seenNodesLabels.add(action.label);
            }
          }
        }
      }

      // Print Next Steps section
      if (nodesCommands.length > 0 || vmsCommands.length > 0) {
        console.log(gray("\nNext steps:"));
        // Print nodes commands first
        for (const command of nodesCommands) {
          console.log(`  ${command}`);
        }
        // Then print vms commands
        for (const command of vmsCommands) {
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
  .addOption(jsonOption)
  .addHelpText(
    "after",
    `
Next Steps:\n
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
