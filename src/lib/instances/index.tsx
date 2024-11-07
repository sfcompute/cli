import type { Command } from "commander";
import { apiClient } from "../../apiClient.ts";
import { isLoggedIn } from "../../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import type { InstanceObject, InstanceType } from "./types.ts";
import { render } from "ink";
import { InstanceDisplay, InstanceList } from "./InstanceDisplay.tsx";

export function registerInstances(program: Command) {
  const instances = program
    .command("instances")
    .alias("i")
    .alias("instance")
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
    render(<InstanceList instances={instances} />);
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
    const priorityA = InstanceTypeSortPriority[a.type] ||
      Number.MAX_SAFE_INTEGER;
    const priorityB = InstanceTypeSortPriority[b.type] ||
      Number.MAX_SAFE_INTEGER;
    if (priorityA === priorityB) {
      return compareIPs(a.public_ip, b.public_ip); // secondary sort on public ips
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

// --

export async function getInstances({
  clusterId,
}: { clusterId?: string }): Promise<InstanceObject[]> {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    logLoginMessageAndQuit();
  }

  const api = await apiClient();

  const { data, error, response } = await api.GET("/v0/instances");

  if (!response.ok) {
    switch (response.status) {
      case 400:
        return logAndQuit(`Bad Request: ${error?.message}`);
      case 401:
        return await logSessionTokenExpiredAndQuit();
      default:
        return logAndQuit(`Failed to get instances: ${response.statusText}`);
    }
  }

  if (!data) {
    return logAndQuit(
      `Failed to get instances: Unexpected response from server: ${response}`,
    );
  }

  return data.data.map((instance) => ({
    object: instance.object,
    id: instance.id,
    type: instance.type as InstanceType,
    public_ip: instance.public_ip,
    private_ip: instance.private_ip,
    status: instance.status,
    ssh_port: instance.ssh_port,
    can_connect: instance.can_connect,
  }));
}
