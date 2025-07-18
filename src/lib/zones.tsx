import type { Command } from "@commander-js/extra-typings";
import { Box, render, Text } from "ink";
import Table from "cli-table3";
import { cyan, gray, green, red } from "jsr:@std/fmt/colors";
import * as console from "node:console";
import React from "react";
import { getAuthToken, isLoggedIn } from "../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors.ts";
import { getApiUrl } from "../helpers/urls.ts";
import { isFeatureEnabled } from "./posthog.ts";

type ZoneInfo = {
  object: string;
  name: string;
  available: boolean;
  available_capacity: number;
  region: string;
  hardware_type: string;
  interconnect_type: string;
  delivery_type: string;
};

type ZonesListResponse = {
  object: "list";
  data: ZoneInfo[];
};

// Delivery type conversion similar to InstanceTypeMetadata pattern
const DeliveryTypeMetadata: Record<string, { displayName: string }> = {
  "K8s": { displayName: "Kubernetes" },
  "K8sNamespace": { displayName: "Kubernetes" },
  "VM": { displayName: "Virtual Machine" },
} as const;

function formatDeliveryType(deliveryType: string): string {
  return DeliveryTypeMetadata[deliveryType]?.displayName || deliveryType;
}

// Region conversion to short slugs
const RegionMetadata: Record<string, { slug: string }> = {
  "NorthAmerica": { slug: "North America" },
  "AsiaPacific": { slug: "Asia" },
  "EuropeMiddleEastAfrica": { slug: "EMEA" },
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

Note: This is an early access feature (v0) that may change at any time.
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
  console.error(
    `\x1b[33mNote: This is an early access feature (v0) and may change at any time.\x1b[0m\n`,
  );

  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  const url = await getApiUrl("zones_list");
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });

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

  const data = (await response.json()) as ZonesListResponse;

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

  // Sort zones so available ones come first, then alphabetically by name
  const sortedZones = [...zones].sort((a, b) => {
    // Available zones first (true comes before false)
    if (a.available !== b.available) {
      return b.available ? 1 : -1;
    }
    // Then sort by name alphabetically
    return a.name.localeCompare(b.name);
  });

  const table = new Table({
    head: [
      cyan("Zone"),
      cyan("Delivery Type"),
      cyan("Available Nodes"),
      cyan("GPU Type"),
      cyan("Interconnect"),
      cyan("Region"),
    ],
    style: {
      head: [],
      border: ["gray"],
    },
  });

  sortedZones.forEach((zone) => {
    const availableNodesText = zone.available_capacity > 0
      ? green(zone.available_capacity.toString())
      : red(zone.available_capacity.toString());

    table.push([
      zone.name,
      formatDeliveryType(zone.delivery_type),
      availableNodesText,
      zone.hardware_type,
      zone.interconnect_type || "None",
      formatRegion(zone.region),
    ]);
  });

  const availableZones = sortedZones.filter((zone) => zone.available);
  const availableZoneName = availableZones?.[0]?.name ?? "alamo";
  console.log(table.toString());
  console.log(
    `\n${gray("Use zone names when placing orders or configuring nodes.")}\n`,
  );
  console.log(gray("Examples:"));
  console.log(`  sf buy --zone ${green(availableZoneName)}`);
  console.log(`  sf scale create -n 16 --zone ${green(availableZoneName)}`);
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
