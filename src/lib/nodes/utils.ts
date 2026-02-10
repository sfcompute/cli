import { CommanderError, Option } from "@commander-js/extra-typings";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";
import chalk from "chalk";
import { parseDate } from "chrono-node";
import Table from "cli-table3";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { parseDurationArgument } from "../../helpers/duration.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { formatNullableDateRange } from "../../helpers/format-time.ts";
import { parseStartDateOrNow } from "../../helpers/units.ts";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Get the timezone abbreviation for display purposes
 * @param useUTC - If true, return "UTC" instead of local timezone
 * @returns Timezone abbreviation (e.g., "PST", "EST", "UTC")
 */
export function getTimezoneAbbreviation(useUTC = false) {
  if (useUTC) {
    return "UTC";
  }

  try {
    // Get the user's local timezone
    const userTimezone = dayjs.tz.guess();

    // Use Intl.DateTimeFormat to get the timezone abbreviation
    // This is more reliable than dayjs.format("z") in Node.js
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: userTimezone,
      timeZoneName: "short",
    });
    const parts = dateFormatter.formatToParts(new Date());
    const timeZonePart = parts.find((part) => part.type === "timeZoneName");

    if (timeZonePart?.value) {
      return timeZonePart.value;
    }
  } catch {
    // Fall through to return UTC
  }

  return null;
}

export function printNodeStatus(status: SFCNodes.Node["status"]): string {
  switch (status) {
    case "awaitingcapacity":
      return "Awaiting Capacity";
    default:
      if (status.length === 0) return "Unknown";
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function getStatusColor(status: SFCNodes.Node["status"]): string {
  const statusText = printNodeStatus(status);

  switch (status) {
    case "pending":
    case "awaitingcapacity":
      return chalk.yellow(statusText);
    case "running":
      return chalk.green(statusText);
    case "released":
      return chalk.cyan(statusText);
    case "failed":
    case "terminated":
      return chalk.red(statusText);
    case "deleted":
      return chalk.gray(statusText);
    default:
      return statusText;
  }
}

export function printVMStatus(status: string): string {
  switch (status) {
    case "NodeFailure":
      return "Node Failure";
    default:
      if (status.length === 0) return "Unknown";
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function getVMStatusColor(status: string): string {
  const statusText = printVMStatus(status);

  switch (status) {
    case "Pending":
      return chalk.yellow(statusText);
    case "Running":
      return chalk.green(statusText);
    case "Destroyed":
      return chalk.blackBright(statusText);
    case "NodeFailure":
      return chalk.red(statusText);
    case "Unspecified":
      return chalk.gray(statusText);
    default:
      return statusText;
  }
}

export function printNodeType(nodeType: SFCNodes.Node["node_type"]) {
  switch (nodeType) {
    case "autoreserved":
      return "Auto Reserved";
    case "reserved":
      return "Reserved";
    default:
      return nodeType;
  }
}

export function getLastVM(node: SFCNodes.Node) {
  return (
    node.current_vm ??
    node.vms?.data
      ?.sort(
        (a, b) => (b.start_at ?? b.updated_at) - (a.start_at ?? a.updated_at),
      )
      .at(0)
  );
}

export const DEFAULT_NODE_LS_LIMIT = 12 as const;

/**
 * Creates a formatted table display of nodes
 * @param nodes Array of nodes to display
 * @param limit Optional limit on number of nodes to display (default: show all)
 * @returns Formatted table string
 */
export function createNodesTable(
  nodes: SFCNodes.Node[],
  limit: number = DEFAULT_NODE_LS_LIMIT,
): string {
  // Get timezone abbreviation for the header
  const timezoneAbbr = getTimezoneAbbreviation();

  const table = new Table({
    head: [
      chalk.cyan("NAME"),
      chalk.cyan("TYPE"),
      chalk.cyan("STATUS"),
      chalk.cyan("CURRENT VM"),
      chalk.cyan("GPU"),
      chalk.cyan("ZONE"),
      chalk.cyan("START/END") +
        (timezoneAbbr ? ` ${chalk.white(`(${timezoneAbbr})`)}` : ""),
      chalk.cyan("MAX PRICE"),
    ],
    style: {
      head: [],
      border: ["gray"],
    },
  });

  const nodesToShow = limit ? nodes.slice(0, limit) : nodes;

  for (const node of nodesToShow) {
    const startDate = node.start_at ? dayjs.unix(node.start_at) : null;
    const endDate = node.end_at ? dayjs.unix(node.end_at) : null;

    const startEnd = formatNullableDateRange(startDate, endDate);

    const maxPrice = node.max_price_per_node_hour
      ? `$${(node.max_price_per_node_hour / 100).toFixed(2)}/hr`
      : "N/A";

    const lastVm = getLastVM(node);

    table.push([
      node.name,
      printNodeType(node.node_type),
      getStatusColor(node.status),
      lastVm?.id ?? "",
      node.gpu_type,
      node.zone ||
        (node.node_type === "autoreserved"
          ? lastVm?.zone
            ? `Any matching (${chalk.blackBright(lastVm.zone)})`
            : "Any matching"
          : "N/A"),
      startEnd,
      maxPrice,
    ]);
  }

  if (limit && nodes.length > limit) {
    table.push([
      {
        colSpan: 8,
        content: chalk.blackBright(
          `${nodes.length - limit} older ${pluralizeNodes(
            nodes.length - limit,
          )} not shown. Use sf nodes list --limit ${nodes.length} or sf nodes list --json to list all nodes.`,
        ),
      },
    ]);
  }

  return table.toString();
}

export function pluralizeNodes(count: number) {
  return count === 1 ? ("node" as const) : ("nodes" as const);
}

/**
 * Validates that a price value is a positive number and meets a minimum threshold
 * @param val String value to validate
 * @param minimum Minimum allowed price (default: 0)
 * @returns Parsed price value
 * @throws CommanderError if invalid
 */
export function validatePrice(val: string, minimum = 0): number {
  const parsed = Number.parseFloat(val);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new CommanderError(
      1,
      "INVALID_PRICE",
      "Price must be a positive number",
    );
  }
  if (minimum > 0 && parsed < minimum) {
    throw new CommanderError(
      1,
      "INVALID_PRICE",
      `Price must be at least $${minimum.toFixed(2)}/hour`,
    );
  }
  return parsed;
}

/**
 * Validates that a duration value is at least the minimum required (3600 seconds)
 * @param val String value to validate
 * @param minimum Minimum duration in seconds (default: 3600)
 * @returns Parsed duration value
 * @throws CommanderError if invalid
 */
export function validateDuration(val: string, minimum = 3600): number {
  const parsed = Number.parseInt(val, 10);
  if (Number.isNaN(parsed)) {
    throw new CommanderError(
      1,
      "INVALID_DURATION",
      "Duration must be a number",
    );
  }
  if (parsed < minimum) {
    throw new CommanderError(
      1,
      "INVALID_DURATION",
      `Duration must be at least ${minimum} seconds (${Math.round(
        minimum / 3600,
      )} hour${minimum === 3600 ? "" : "s"})`,
    );
  }
  return parsed;
}

/**
 * Parse duration using the same logic as buy command with support for human-readable format
 * @param duration Duration string (e.g., "1h", "30m", "2d") or raw number of seconds (e.g., 3600)
 * @returns Duration in seconds
 */
export function parseDuration(duration: string): number {
  // Try parsing with parseDurationArgument first
  const parsed = parseDurationArgument(duration);
  if (parsed == null) {
    throw new CommanderError(
      1,
      "INVALID_DURATION",
      `Invalid duration: ${duration} (examples: 1h, 30m, 2d, 3600)`,
    );
  }
  if (parsed < 3600) {
    throw new CommanderError(
      1,
      "INVALID_DURATION",
      "Duration must be at least 1 hour",
    );
  }
  return parsed;
}

/**
 * Parse end date using chrono-node like buy command
 * @param value End date string
 * @returns Parsed and rounded end date
 */
export function parseEnd(value: string): Date {
  const parsed = parseDate(value);
  if (!parsed) logAndQuit(`Invalid end date: ${value}`);
  return parsed;
}

// ========================================
// Shared Options
// ========================================

/**
 * Common --json option for JSON output
 */
export const jsonOption = new Option("-j, --json", "Output in JSON format");

/**
 * Common --yes option to skip confirmation prompts
 */
export const yesOption = new Option("-y, --yes", "Skip confirmation prompt");

/**
 * Common --max-price option for nodes commands
 */
export const maxPriceOption = new Option(
  "-p, --max-price <price>",
  "[Required] Maximum price per node hour in dollars",
)
  .argParser(validatePrice)
  .makeOptionMandatory();

/**
 * Common --start option using same parser as buy command
 */
export const startOrNowOption = new Option(
  "-s, --start <start>",
  "Start time (ISO 8601 format:'2022-10-27T14:30:00Z' or relative time like '+1d', or 'NOW')",
)
  .argParser(parseStartDateOrNow)
  .default("NOW" as const);

/**
 * Common --end option using same parser as buy command
 */
export const endOption = new Option(
  "-e, --end <end>",
  "End time (ISO 8601 format:'2022-10-27T14:30:00Z' or relative time like '+1d', rounded up to nearest hour)",
).argParser(parseEnd);

/**
 * Common --duration option using parseDuration
 */
export const durationOption = new Option(
  "-d, --duration <duration>",
  "Duration (e.g., '1h', '30m', '2d', 3600) - rounded up to the nearest hour",
).argParser(parseDurationArgument);

/**
 * Common --duration option using parseDuration, but required
 */
export const requiredDurationOption = new Option(
  "-d, --duration <duration>",
  "[Required] Duration (e.g., '1h', '30m', '2d', 3600) - rounded up to the nearest hour",
)
  .argParser(parseDurationArgument)
  .makeOptionMandatory();
