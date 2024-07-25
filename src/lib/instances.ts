import chalk, { type ChalkInstance } from "chalk";
import Table from "cli-table3";
import type { Command } from "commander";
import { loadConfig } from "../helpers/config";
import { logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";

export function registerInstances(program: Command) {
  const instances = program
    .command("instances")
    .description("Manage instances you own");

  // sf instances ls|list <cluster_id>
  instances
    .command("list")
    .alias("ls")
    .description("List instances")
    .option("-cls, --cluster <cluster_id>", "Specify the cluster id")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      await listInstancesAction({
        clusterId: options.cluster,
        returnJson: options.json,
      });
    });
}

// --

interface ListResponseBody<T> {
  data: T[];
  object: "list";
}
type InstanceType = "h100i" | "h100" | "a100";
interface InstanceObject {
  object: "instance";
  id: string;
  type: InstanceType;
  ip: string;
}

async function listInstancesAction({
  clusterId,
  returnJson,
}: { clusterId?: string; returnJson?: boolean }) {
  const instances = await getInstances({ clusterId });
  if (instances.length !== 0) {
    instances.sort(sortInstancesByTypeAndIp());
  }

  if (returnJson) {
    console.log(JSON.stringify(instances, null, 2));
  } else {
    const tableHeaders = [
      chalk.gray("Instance Id"),
      chalk.gray("Type"),
      chalk.gray("IP Address"),
    ];

    if (instances.length === 0) {
      // empty table
      const table = new Table({
        head: tableHeaders,
        colWidths: [20, 20, 20],
      });
      table.push([
        { colSpan: 3, content: "No instances found", hAlign: "center" },
      ]);
      console.log(table.toString() + "\n");
    } else {
      const table = new Table({
        head: tableHeaders,
        colWidths: [32, 10, 20],
      });

      table.push(
        ...instances.map((instance) => [
          instance.id,
          colorInstanceType(instance.type),
          instance.ip,
        ]),
      );
      console.log(table.toString() + "\n\n");
    }
  }

  process.exit(0);
}

const InstanceTypeSortPriority: { [key in InstanceType]: number } = {
  h100i: 1,
  h100: 2,
  a100: 3,
};
const sortInstancesByTypeAndIp = () => {
  return (a: InstanceObject, b: InstanceObject) => {
    const priorityA =
      InstanceTypeSortPriority[a.type] || Number.MAX_SAFE_INTEGER;
    const priorityB =
      InstanceTypeSortPriority[b.type] || Number.MAX_SAFE_INTEGER;
    if (priorityA === priorityB) {
      return compareIPs(a.ip, b.ip); // secondary sort on ips
    }
    return priorityA - priorityB;
  };
};
const compareIPs = (ip1: string, ip2: string) => {
  const isIPv4 = (ip: string) => ip.split(".").length === 4;

  const ip1IsIPv4 = isIPv4(ip1);
  const ip2IsIPv4 = isIPv4(ip2);

  if (ip1IsIPv4 && ip2IsIPv4) {
    // Both are IPv4, proceed with numerical comparison
    const segmentsA = ip1.split(".").map(Number);
    const segmentsB = ip2.split(".").map(Number);
    for (let i = 0; i < Math.min(segmentsA.length, segmentsB.length); i++) {
      if (segmentsA[i] !== segmentsB[i]) {
        return segmentsA[i] - segmentsB[i];
      }
    }

    return segmentsA.length - segmentsB.length;
  } else if (!ip1IsIPv4 && !ip2IsIPv4) {
    // Both non-ipv4 are equal
    return 0;
  } else if (ip1IsIPv4 && !ip2IsIPv4) {
    // ipv4 comes first (first item is sorted before second)
    return -1;
  } else if (!ip1IsIPv4 && ip2IsIPv4) {
    // ipv4 comes first (second item is sorted before first)
    return 1;
  }

  return 0; // should never happen
};

const instanceTypeColoring: { [key in InstanceType]: ChalkInstance } = {
  h100i: chalk.green,
  h100: chalk.cyan,
  a100: chalk.magenta,
};
const colorInstanceType = (instanceType: InstanceType) =>
  (instanceTypeColoring[instanceType] || chalk.white)(instanceType);

// --

async function getInstances({
  clusterId,
}: { clusterId?: string }): Promise<Array<InstanceObject>> {
  const config = await loadConfig();
  if (!config.auth_token) {
    logLoginMessageAndQuit();
  }

  let url = await getApiUrl("instances_list");
  if (clusterId) {
    url += `?cluster_id=${clusterId}`;
  }
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.auth_token}`,
    },
  });

  const responseData: ListResponseBody<InstanceObject> = await response.json();
  return responseData.data;
}
