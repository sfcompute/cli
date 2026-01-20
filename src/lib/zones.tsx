import * as console from "node:console";
import type { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import Table from "cli-table3";
import dayjs from "dayjs";
import { Box, render, Text } from "ink";
import { apiClient } from "../apiClient.ts";
import { isLoggedIn } from "../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import type { components } from "../schema.ts";
import { isFeatureEnabled } from "./posthog.ts";

type ZoneInfo = components["schemas"]["node-api_ZoneInfo"];

// Delivery type conversion similar to InstanceTypeMetadata pattern
const DeliveryTypeMetadata: Record<string, { displayName: string }> = {
  K8s: { displayName: "Kubernetes" },
  K8sNamespace: { displayName: "Kubernetes" },
  VM: { displayName: "Virtual Machine" },
} as const;

function formatDeliveryType(deliveryType: string): string {
  return DeliveryTypeMetadata[deliveryType]?.displayName || deliveryType;
}

function getZoneCapacityMetrics(zone: ZoneInfo): {
  availableNow: number;
  availableWithin1Day: number;
  availableWithin1Week: number;
} {
  if (zone.available_capacity.length === 0) {
    return {
      availableNow: 0,
      availableWithin1Day: 0,
      availableWithin1Week: 0,
    };
  }

  const now = dayjs().startOf("hour");
  const nowTimestamp = now.unix();
  const oneDayTimestamp = now.add(1, "day").unix();
  const oneWeekTimestamp = now.add(1, "week").unix();

  // Sort capacity windows by start_timestamp
  const sortedCapacity = [...zone.available_capacity].sort(
    (a, b) => a.start_timestamp - b.start_timestamp,
  );

  let availableNow = 0;
  let maxWithin1Day = 0;
  let maxWithin1Week = 0;

  // Iterate through each capacity window
  for (const win of sortedCapacity) {
    // Skip windows that have already ended
    if (win.end_timestamp <= nowTimestamp) {
      continue;
    }

    // Early exit: windows are sorted, so if this one starts after 1 week, all subsequent ones will too
    if (win.start_timestamp > oneWeekTimestamp) {
      break;
    }

    const quantity = win.quantity;

    // Check if window contains "now"
    if (
      nowTimestamp >= win.start_timestamp &&
      nowTimestamp < win.end_timestamp
    ) {
      availableNow = quantity;
    }

    // Check if window overlaps with "within 1 day" period
    if (
      win.start_timestamp < oneDayTimestamp &&
      win.end_timestamp > nowTimestamp
    ) {
      maxWithin1Day = Math.max(maxWithin1Day, quantity);
    }

    // Check if window overlaps with "within 1 week" period
    if (
      win.start_timestamp < oneWeekTimestamp &&
      win.end_timestamp > nowTimestamp
    ) {
      maxWithin1Week = Math.max(maxWithin1Week, quantity);
    }
  }

  return {
    availableNow,
    availableWithin1Day: maxWithin1Day,
    availableWithin1Week: maxWithin1Week,
  };
}

// Region conversion to short slugs
const RegionMetadata: Record<string, { slug: string }> = {
  NorthAmerica: { slug: "North America" },
  AsiaPacific: { slug: "Asia" },
  EuropeMiddleEastAfrica: { slug: "EMEA" },
} as const;

function formatRegion(region: string): string {
  return RegionMetadata[region]?.slug || region;
}

export async function registerZones(program: Command) {
  const isEnabled = await isFeatureEnabled("zones");
  if (!isEnabled) return;

  const zones = program
    .command("zones")
    .description("View zones")
    .addHelpText(
      "after",
      `
Examples:
  \x1b[2m# List all zones\x1b[0m
  $ sf zones ls

  \x1b[2m# List zones with JSON output\x1b[0m
  $ sf zones ls --json
`,
    );
  zones
    .command("list")
    .alias("ls")
    .description("List all zones")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      await listZonesAction(options);
    });
}

async function listZonesAction(options: { json?: boolean }) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  const client = await apiClient();
  const { data, response } = await client.GET("/v0/zones", {});

  // Following clig.dev: Handle errors gracefully with actionable messages
  if (!response.ok) {
    switch (response.status) {
      case 401:
        return await logSessionTokenExpiredAndQuit();
      case 403:
        return logAndQuit(
          "Access denied. This feature may require special permissions. Reach out to hello@sfcompute.com if you need access.",
        );
      case 404:
        return logAndQuit(
          "Zones not found. Please wait a few seconds and try again.",
        );
      default:
        return logAndQuit(
          `Failed to fetch zones: ${response.status} ${response.statusText}`,
        );
    }
  }

  if (!data?.data) {
    return logAndQuit(
      "Failed to fetch zones: Unexpected response format from server",
    );
  }
  const filteredZones = data.data;

  if (options.json) {
    console.log(JSON.stringify(filteredZones, null, 2));
    return;
  }

  displayZonesTable(filteredZones);
}

function displayZonesTable(zones: ZoneInfo[]) {
  if (zones.length === 0) {
    render(<EmptyZonesDisplay />);
    return;
  }

  // Sort zones by availability: now > today > 1 week, then alphabetically by name
  const sortedZones = [...zones].sort((a, b) => {
    const aMetrics = getZoneCapacityMetrics(a);
    const bMetrics = getZoneCapacityMetrics(b);

    // Sort by availableNow (higher first)
    if (aMetrics.availableNow !== bMetrics.availableNow) {
      return bMetrics.availableNow - aMetrics.availableNow;
    }

    // Break ties with availableWithin1Day (higher first)
    if (aMetrics.availableWithin1Day !== bMetrics.availableWithin1Day) {
      return bMetrics.availableWithin1Day - aMetrics.availableWithin1Day;
    }

    // Break ties with availableWithin1Week (higher first)
    if (aMetrics.availableWithin1Week !== bMetrics.availableWithin1Week) {
      return bMetrics.availableWithin1Week - aMetrics.availableWithin1Week;
    }

    // Finally sort by name alphabetically
    return a.name.localeCompare(b.name);
  });

  const table = new Table({
    style: {
      head: [],
      border: ["gray"],
    },
  });

  // Multi-row header: first row with "Available Nodes" spanning 3 columns
  table.push([
    { content: chalk.cyan("Zone"), rowSpan: 2 },
    { content: chalk.cyan("Delivery Type"), rowSpan: 2 },
    { content: chalk.cyan("Available Nodes Starting"), colSpan: 3 },
    { content: chalk.cyan("GPU Type"), rowSpan: 2 },
    { content: chalk.cyan("Interconnect"), rowSpan: 2 },
    { content: chalk.cyan("Region"), rowSpan: 2 },
  ]);

  // Second header row with time periods
  table.push([
    chalk.cyan("Now   "),
    chalk.cyan("Today "),
    chalk.cyan("1 Week"),
  ]);

  sortedZones.forEach((zone) => {
    const metrics = getZoneCapacityMetrics(zone);
    const formatAvailability = (value: number) =>
      value > 0 ? chalk.green(value.toString()) : chalk.red(value.toString());

    table.push([
      zone.name,
      formatDeliveryType(zone.delivery_type),
      formatAvailability(metrics.availableNow),
      formatAvailability(metrics.availableWithin1Day),
      formatAvailability(metrics.availableWithin1Week),
      zone.hardware_type,
      zone.interconnect_type || "None",
      formatRegion(zone.region),
    ]);
  });

  const availableZones = sortedZones.filter((zone) => {
    const metrics = getZoneCapacityMetrics(zone);
    return (
      metrics.availableNow > 0 ||
      metrics.availableWithin1Day > 0 ||
      metrics.availableWithin1Week > 0
    );
  });
  if (availableZones.length > 0) {
    console.log(table.toString());
    console.log(
      `\n${
        chalk.gray("Use zone names when placing orders or configuring nodes.")
      }\n`,
    );
    console.log(chalk.gray("Examples:"));
    console.log(`  sf buy --zone ${chalk.green(availableZones[0].name)}`);
    console.log(
      `  sf scale create -n 16 --zone ${chalk.green(availableZones[0].name)}`,
    );
  }
}

function EmptyZonesDisplay() {
  return (
    <Box flexDirection="column" gap={1} paddingBottom={1}>
      <Text>No zones found.</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Text dimColor># Check back later for available zones</Text>
        <Text color="yellow">sf zones ls</Text>
      </Box>
    </Box>
  );
}
