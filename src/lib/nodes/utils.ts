import { green, red, yellow } from "jsr:@std/fmt/colors";
import type { SFCNodes } from "@sfcompute/nodes-sdk-alpha";
import Table from "cli-table3";
import { cyan } from "jsr:@std/fmt/colors";
import dayjs from "dayjs";
import { CommanderError, Option } from "@commander-js/extra-typings";
import { parseDate } from "chrono-node";
import { parseDurationArgument } from "../../helpers/duration.ts";
import { parseStartDate, roundEndDate } from "../../helpers/units.ts";
import { logAndQuit } from "../../helpers/errors.ts";

export function getStatusColor(status: SFCNodes.Node["status"]): string {
  switch (status) {
    case "Running":
      return green("Running");
    case "Terminated":
    case "Failed":
      return red(status);
    case "Pending":
      return yellow("Pending");
    case "Unknown":
    default:
      return status;
  }
}

export function printProcurementStatus(
  status: SFCNodes.Node["procurement_status"],
) {
  switch (status) {
    case "AwaitingCapacity":
      return "Awaiting capacity";
    default:
      return status;
  }
}

export function printNodeType(nodeType: SFCNodes.Node["node_type"]) {
  switch (nodeType) {
    case "on_demand":
      return "On-Demand";
    case "reserved":
      return "Reserved";
    default:
      return nodeType;
  }
}

/**
 * Creates a formatted table display of nodes
 * @param nodes Array of nodes to display
 * @returns Formatted table string
 */
export function createNodesTable(nodes: SFCNodes.Node[]): string {
  const table = new Table({
    head: [
      cyan("NAME"),
      cyan("TYPE"),
      cyan("STATUS"),
      cyan("GPU"),
      cyan("ZONE"),
      cyan("START/END"),
      cyan("MAX PRICE"),
    ],
    style: {
      head: [],
      border: ["gray"],
    },
  });

  for (const node of nodes) {
    const startDate = node.start_at ? dayjs.unix(node.start_at) : null;
    const endDate = node.end_at ? dayjs.unix(node.end_at) : null;

    let startEnd: string;
    if (startDate && endDate) {
      startEnd = `${startDate.format("YYYY-MM-DD HH:mm")} → ${
        endDate.format("HH:mm")
      }`;
    } else if (startDate) {
      startEnd = `${startDate.format("YYYY-MM-DD HH:mm")} → ?`;
    } else {
      startEnd = "Not available";
    }

    const maxPrice = node.max_price_per_hour
      ? (node.max_price_per_hour / 100).toFixed(2)
      : "N/A";

    table.push([
      node.name,
      printNodeType(node.node_type),
      getStatusColor(node.status),
      node.gpu_type,
      node.zone || "N/A",
      startEnd,
      `$${maxPrice}/hr`,
    ]);
  }

  return table.toString();
}

/**
 * Validates that a price value is a positive number and meets a minimum threshold
 * @param val String value to validate
 * @param minimum Minimum allowed price (default: 0)
 * @returns Parsed price value
 * @throws CommanderError if invalid
 */
export function validatePrice(val: string, minimum = 0): number {
  const parsed = parseFloat(val);
  if (isNaN(parsed) || parsed <= 0) {
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
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
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
      `Duration must be at least ${minimum} seconds (${
        Math.round(minimum / 3600)
      } hour${minimum === 3600 ? "" : "s"})`,
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
      `Duration must be at least 1 hour`,
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
  return roundEndDate(parsed);
}

// ========================================
// Shared Options
// ========================================

/**
 * Common --json option for JSON output
 */
export const jsonOption = new Option("-j, --json", "Output in JSON format");

/**
 * Common --force option to skip confirmation prompts
 */
export const forceOption = new Option(
  "-f, --force",
  "Skip confirmation prompt",
);

/**
 * Common --zone option for zone selection
 */
export const zoneOption = new Option(
  "-z, --zone <zone>",
  "Zone to create the nodes in",
).makeOptionMandatory();

/**
 * Common --max-price option for nodes commands
 */
export const maxPriceOption = new Option(
  "-p, --max-price <price>",
  "Maximum price per GPU per hour in dollars",
).argParser(validatePrice).makeOptionMandatory();

/**
 * Common --start option using same parser as buy command
 */
export const startOption = new Option(
  "-s, --start <start>",
  "Start time (ISO 8601 format or relative time like '+1d', or 'now')",
).argParser(parseStartDate).default("now");

/**
 * Common --end option using same parser as buy command
 */
export const endOption = new Option(
  "-e, --end <end>",
  "End time (ISO 8601 format or relative time like '+1d', rounded up to nearest hour)",
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
  "Duration (e.g., '1h', '30m', '2d', 3600) - rounded up to the nearest hour",
).argParser(parseDurationArgument).makeOptionMandatory();
