import * as console from "node:console";
import type { Command } from "@commander-js/extra-typings";
import dayjs from "dayjs";
import { differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
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

type CapacityMetrics = {
  availableNow: number;
  availableWithin1Day: { count: number; startTimestamp: number | null };
  availableWithin1Week: { count: number; startTimestamp: number | null };
};

function getZoneCapacityMetrics(zone: ZoneInfo): CapacityMetrics {
  if (zone.available_capacity.length === 0) {
    return {
      availableNow: 0,
      availableWithin1Day: { count: 0, startTimestamp: null },
      availableWithin1Week: { count: 0, startTimestamp: null },
    };
  }

  const now = dayjs();
  const nowTimestamp = now.unix();
  const oneDayTimestamp = now.add(1, "day").unix();
  const oneWeekTimestamp = now.add(1, "week").unix();

  // Sort capacity windows by start_timestamp
  const sortedCapacity = [...zone.available_capacity].sort(
    (a, b) => a.start_timestamp - b.start_timestamp,
  );

  let availableNow = 0;
  let maxWithin1Day = 0;
  let maxWithin1DayStart: number | null = null;
  let maxWithin1Week = 0;
  let maxWithin1WeekStart: number | null = null;

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
      if (quantity > maxWithin1Day) {
        maxWithin1Day = quantity;
        maxWithin1DayStart = Math.max(win.start_timestamp, nowTimestamp);
      }
    }

    // Check if window overlaps with "within 1 week" period
    if (
      win.start_timestamp < oneWeekTimestamp &&
      win.end_timestamp > nowTimestamp
    ) {
      if (quantity > maxWithin1Week) {
        maxWithin1Week = quantity;
        maxWithin1WeekStart = Math.max(win.start_timestamp, nowTimestamp);
      }
    }
  }

  return {
    availableNow,
    availableWithin1Day: { count: maxWithin1Day, startTimestamp: maxWithin1DayStart },
    availableWithin1Week: { count: maxWithin1Week, startTimestamp: maxWithin1WeekStart },
  };
}

// Region conversion to short slugs
const RegionMetadata: Record<string, { slug: string }> = {
  NorthAmerica: { slug: "north america" },
  AsiaPacific: { slug: "asia" },
  EuropeMiddleEastAfrica: { slug: "emea" },
} as const;

function formatRegion(region: string): string {
  return RegionMetadata[region]?.slug || region;
}

// Bright colors not used elsewhere in this component
const REGION_COLORS = [
  "green",
  "yellow",
  "blueBright",
  "magentaBright",
  "cyanBright",
] as const;

// Simple deterministic hash for consistent color assignment
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function getRegionColor(region: string): (typeof REGION_COLORS)[number] {
  const hash = hashString(region);
  return REGION_COLORS[hash % REGION_COLORS.length];
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
  \x1b[2m# List zones with availability\x1b[0m
  $ sf zones ls

  \x1b[2m# List all zones, including those with no availability\x1b[0m
  $ sf zones ls --all

  \x1b[2m# List zones with JSON output\x1b[0m
  $ sf zones ls --json
`,
    );
  zones
    .command("list")
    .alias("ls")
    .description("List all zones")
    .option("--all", "Show all zones, including those with no availability")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      await listZonesAction(options);
    });
}

async function listZonesAction(options: { all?: boolean; json?: boolean }) {
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

  await displayZonesTable(filteredZones, { showAll: options.all });
}

function hasAvailability(zone: ZoneInfo): boolean {
  const metrics = getZoneCapacityMetrics(zone);
  return (
    metrics.availableNow > 0 ||
    metrics.availableWithin1Day.count > 0 ||
    metrics.availableWithin1Week.count > 0
  );
}


function formatShortDistance(date: Date): string {
  const now = new Date();
  const minutes = differenceInMinutes(date, now);
  const hours = differenceInHours(date, now);
  const days = differenceInDays(date, now);

  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
  }
  if (days >= 1) {
    return `${days}d`;
  }
  if (hours >= 1) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function AvailabilityDisplay({
  count,
  startTimestamp,
  isNow = false,
  padWidth = 1,
}: {
  count: number;
  startTimestamp: number | null;
  isNow?: boolean;
  padWidth?: number;
}) {
  const countStr = String(count).padStart(padWidth);

  if (isNow && count === 0) {
    return <Text color="red" dimColor>sold out</Text>;
  }

  if (isNow) {
    return (
      <>
        <Text color="greenBright">{countStr}</Text>
        <Text color="green">{" now   "}</Text>
      </>
    );
  }

  if (count === 0 || startTimestamp === null) {
    return (
      <>
        <Text color={count === 0 ? "red" : "greenBright"} dimColor={count === 0}>{countStr}</Text>
        <Text color="green">{" now   "}</Text>
      </>
    );
  }

  const startDate = new Date(startTimestamp * 1000);
  const now = new Date();
  const minutesUntil = differenceInMinutes(startDate, now);

  // If available now or within 1 minute, show "now"
  if (minutesUntil <= 1) {
    return (
      <>
        <Text color="greenBright">{countStr}</Text>
        <Text color="green">{" now   "}</Text>
      </>
    );
  }

  const distance = formatShortDistance(startDate).padEnd(3);
  return (
    <>
      <Text color="greenBright">{countStr}</Text>
      <Text color="green">{` in ${distance}`}</Text>
    </>
  );
}

// Column widths
const COL = {
  gpu: 6,
  region: 15,
  now: 11,
  soonest: 11,
  max: 11,
};

function ZonesTableDisplay({
  zones,
  hiddenCount,
  firstAvailableZone,
  firstAvailableZoneStartTime,
}: {
  zones: ZoneInfo[];
  hiddenCount: number;
  firstAvailableZone: string | null;
  firstAvailableZoneStartTime: string | null;
}) {
  // Calculate dynamic zone column width based on longest zone name
  const zoneWidth = Math.max(
    6, // minimum width for "zone" header + padding
    ...zones.map((z) => z.name.length + 2), // +2 for padding
  );

  // Pre-calculate metrics for all zones to determine padding widths
  const allMetrics = zones.map((z) => getZoneCapacityMetrics(z));
  
  // Calculate max values for each column to determine padding
  const maxNow = Math.max(1, ...allMetrics.map((m) => m.availableNow));
  const maxToday = Math.max(1, ...allMetrics.map((m) => m.availableWithin1Day.count));
  const maxWeek = Math.max(1, ...allMetrics.map((m) => m.availableWithin1Week.count));
  
  // Calculate pad widths (number of digits needed)
  const nowPadWidth = String(maxNow).length;
  const todayPadWidth = String(maxToday).length;
  const weekPadWidth = String(maxWeek).length;

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        alignSelf="flex-start"
      >
        {/* Header row */}
        <Box
          borderStyle="single"
          borderTop={false}
          borderLeft={false}
          borderRight={false}
          borderBottom
          borderColor="gray"
        >
          <Box width={zoneWidth} paddingLeft={1} gap={1}>
            <Text color="cyan">zone</Text>
            <Text color="gray">(slug)</Text>
          </Box>
          <Box width={COL.gpu} paddingLeft={1}>
            <Text color="cyan">gpu</Text>
          </Box>
          <Box width={COL.region} paddingLeft={1}>
            <Text color="cyan">region</Text>
          </Box>
          <Box width={COL.now} paddingLeft={1}>
            <Text color="cyan">nodes </Text>
            <Text color="magenta">now</Text>
          </Box>
          <Text color="gray">┊</Text>
          <Box width={COL.soonest} paddingLeft={1} paddingRight={1} justifyContent="flex-end">
            <Text color="magenta">soonest</Text>
          </Box>
          <Text color="gray">┊</Text>
          <Box width={COL.max} paddingLeft={1} paddingRight={1} justifyContent="flex-end">
            <Text color="magenta">max</Text>
          </Box>
        </Box>

        {/* Body rows */}
        {zones.map((zone, idx) => {
          const metrics = allMetrics[idx];
          const allSoldOut =
            metrics.availableNow === 0 &&
            metrics.availableWithin1Day.count === 0 &&
            metrics.availableWithin1Week.count === 0;

          // Total width of node columns: now(11) + separator(1) + soonest(11) + separator(1) + max(11) = 35
          const nodeColsWidth = COL.now + 1 + COL.soonest + 1 + COL.max;
          const soldOutText = "sold out";
          const dashCount = Math.floor((nodeColsWidth - soldOutText.length - 2) / 2);
          const soldOutDisplay = `${"-".repeat(dashCount)} ${soldOutText} ${"-".repeat(dashCount)}`;

          return (
            <Box key={zone.name}>
              <Box width={zoneWidth} paddingLeft={1}>
                <Text color="cyanBright">{zone.name}</Text>
              </Box>
              <Box width={COL.gpu} paddingLeft={1}>
                <Text>{zone.hardware_type}</Text>
              </Box>
              <Box width={COL.region} paddingLeft={1}>
                <Text color={getRegionColor(zone.region)}>{formatRegion(zone.region)}</Text>
              </Box>
              {allSoldOut ? (
                <Box width={nodeColsWidth} paddingLeft={1}>
                  <Text color="gray">{soldOutDisplay}</Text>
                </Box>
              ) : (
                <>
                  <Box width={COL.now} paddingLeft={1}>
                    <AvailabilityDisplay
                      count={metrics.availableNow}
                      startTimestamp={null}
                      isNow
                      padWidth={nowPadWidth}
                    />
                  </Box>
                  <Text color="gray">┊</Text>
                  <Box width={COL.soonest} paddingLeft={1}>
                    <AvailabilityDisplay
                      count={metrics.availableWithin1Day.count}
                      startTimestamp={metrics.availableWithin1Day.startTimestamp}
                      padWidth={todayPadWidth}
                    />
                  </Box>
                  <Text color="gray">┊</Text>
                  <Box width={COL.max} paddingLeft={1}>
                    <AvailabilityDisplay
                      count={metrics.availableWithin1Week.count}
                      startTimestamp={metrics.availableWithin1Week.startTimestamp}
                      padWidth={weekPadWidth}
                    />
                  </Box>
                </>
              )}
            </Box>
          );
        })}

        {/* Footer */}
        {hiddenCount > 0 && (
          <Box
            borderStyle="single"
            borderTop
            borderLeft={false}
            borderRight={false}
            borderBottom={false}
            borderColor="gray"
            paddingLeft={1}
          >
            <Text color="gray">
              {hiddenCount} sold-out zones hidden. Use{" "}
            </Text>
            <Text color="white">sf zones ls</Text>
            <Text color="green"> --all</Text>
            <Text color="gray"> to show.</Text>
          </Box>
        )}
      </Box>

      {/* Examples */}
      {firstAvailableZone && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">
            Use zone names when launching nodes.
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">Examples:</Text>
            <Text>
              {"  "}sf nodes create --zone <Text color="green">{firstAvailableZone}</Text>
              {firstAvailableZoneStartTime && (
                <>
                  {" "}-s <Text color="green">{firstAvailableZoneStartTime}</Text>
                </>
              )}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

async function displayZonesTable(
  zones: ZoneInfo[],
  options: { showAll?: boolean } = {},
) {
  if (zones.length === 0) {
    const { waitUntilExit } = render(<EmptyZonesDisplay />);
    await waitUntilExit();
    return;
  }

  // Separate zones with and without availability
  const zonesWithAvailability = zones.filter(hasAvailability);
  const zonesWithoutAvailability = zones.filter((z) => !hasAvailability(z));

  if (zonesWithAvailability.length === 0) {
    const { waitUntilExit } = render(<EmptyZonesDisplay />);
    await waitUntilExit();
    return;
  }

  // Determine which zones to display
  const zonesToDisplay = options.showAll ? zones : zonesWithAvailability;

  // Sort zones by availability: now > today > 1 week, then alphabetically by name
  const sortedZones = [...zonesToDisplay].sort((a, b) => {
    const aMetrics = getZoneCapacityMetrics(a);
    const bMetrics = getZoneCapacityMetrics(b);

    // Sort by availableNow (higher first)
    if (aMetrics.availableNow !== bMetrics.availableNow) {
      return bMetrics.availableNow - aMetrics.availableNow;
    }

    // Break ties with availableWithin1Day (higher first)
    if (
      aMetrics.availableWithin1Day.count !== bMetrics.availableWithin1Day.count
    ) {
      return (
        bMetrics.availableWithin1Day.count - aMetrics.availableWithin1Day.count
      );
    }

    // Break ties with availableWithin1Week (higher first)
    if (
      aMetrics.availableWithin1Week.count !== bMetrics.availableWithin1Week.count
    ) {
      return (
        bMetrics.availableWithin1Week.count - aMetrics.availableWithin1Week.count
      );
    }

    // Finally sort by name alphabetically
    return a.name.localeCompare(b.name);
  });

  const hiddenCount = options.showAll ? 0 : zonesWithoutAvailability.length;
  const firstAvailableZone =
    zonesWithAvailability.length > 0 ? zonesWithAvailability[0].name : null;

  // Calculate earliest start time for first available zone
  let firstAvailableZoneStartTime: string | null = null;
  if (zonesWithAvailability.length > 0) {
    const metrics = getZoneCapacityMetrics(zonesWithAvailability[0]);
    if (metrics.availableNow > 0) {
      firstAvailableZoneStartTime = "now";
    } else if (metrics.availableWithin1Day.startTimestamp) {
      firstAvailableZoneStartTime = dayjs
        .unix(metrics.availableWithin1Day.startTimestamp)
        .toISOString();
    } else if (metrics.availableWithin1Week.startTimestamp) {
      firstAvailableZoneStartTime = dayjs
        .unix(metrics.availableWithin1Week.startTimestamp)
        .toISOString();
    }
  }

  const { waitUntilExit } = render(
    <ZonesTableDisplay
      zones={sortedZones}
      hiddenCount={hiddenCount}
      firstAvailableZone={firstAvailableZone}
      firstAvailableZoneStartTime={firstAvailableZoneStartTime}
    />,
  );
  await waitUntilExit();
}

function EmptyZonesDisplay() {
  return (
    <Box flexDirection="column" gap={1} paddingBottom={1}>
      <Text>No zones with availability found.</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Text dimColor># Check back later for available zones</Text>
        <Text color="yellow">sf zones ls</Text>
        <Text dimColor># To show all zones, including those with no availability</Text>
        <Text color="yellow">sf zones ls --all</Text>
      </Box>
    </Box>
  );
}
