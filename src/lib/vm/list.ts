import { Command } from "@commander-js/extra-typings";
import Table from "cli-table3";
import { cyan, gray, green, red, yellow } from "jsr:@std/fmt/colors";
import console from "node:console";
import boxen from "boxen";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

import { getAuthToken } from "../../helpers/config.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { apiClient } from "../../apiClient.ts";

dayjs.extend(utc);

const list = new Command("list")
  .alias("ls")
  .description("List all virtual machines")
  .option("--json", "Output in JSON format")
  .action(async (options) => {
    const client = await apiClient(await getAuthToken());

    const [vmsListResponse, contractsListResponse] = await Promise.all([
      client.GET("/v0/vms/instances"),
      client.GET("/v0/contracts", {
        params: {
          query: {
            instance_type: "h100v",
          },
        },
      }),
    ]);

    if (!vmsListResponse.response.ok) {
      switch (vmsListResponse.response.status) {
        case 401:
          return await logSessionTokenExpiredAndQuit();
        case 403:
          return logAndQuit(
            "Access denied. Please check your permissions or contact support.",
          );
        case 404:
          return logAndQuit(
            "VMs not found. Please wait a few seconds and try again.",
          );
        default:
          return logAndQuit(
            `Failed to list VMs: ${vmsListResponse.response.status} ${vmsListResponse.response.statusText}`,
          );
      }
    }

    const vmsData = vmsListResponse.data?.data ?? [];

    const contractsData = (contractsListResponse.data?.data ?? []).filter(
      (e) => e.status === "active",
    );

    const unscheduledVMs = Math.max(
      0,
      (contractsData?.length ?? 0) - vmsData.length,
    );

    const hasRecentlyCreatedVMs = contractsData.some((contract) =>
      dayjs(contract.shape.intervals[0]).isAfter(
        dayjs().subtract(10, "minutes"),
      )
    );

    if ((!(vmsData.length > 0) && !hasRecentlyCreatedVMs)) {
      if (options.json) {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      logAndQuit(
        "You have no VMs. Buy a VM with: \n  $ sf buy -t h100v -d 1h -n 8",
      );
    }

    const formattedData = vmsData.map((instance) => ({
      id: instance.id,
      status: instance.current_status,
      last_updated_at: instance.last_updated_at,
    }));

    if (options.json) {
      console.log(JSON.stringify(vmsData, null, 2));
      return;
    }

    if (unscheduledVMs > 0 || hasRecentlyCreatedVMs) {
      const message = `VMs take 5-10 minutes to spin up and may show as ${
        green("Running")
      } before they are ready for ssh.

You can use ${
        cyan("sf vm logs -f")
      } to follow your VM's startup script output.`;

      console.error(
        boxen(message, {
          padding: 0.75,
          borderColor: "cyan",
        }),
      );
    }

    const table = new Table({
      head: [cyan("ID"), cyan("Status"), cyan("Last Updated")],
      style: {
        head: [],
        border: ["gray"],
      },
    });

    if (unscheduledVMs > 0) {
      table.push([
        {
          colSpan: 3,
          content: yellow(
            `${unscheduledVMs} additional VMs awaiting scheduling`,
          ),
        },
      ]);
    }

    formattedData.forEach((instance) => {
      const status = instance.status.toLowerCase();
      const statusText = status === "running"
        ? green("Running")
        : status === "dead"
        ? red("Dead")
        : status === "off"
        ? gray("Off")
        : instance.status;

      table.push([instance.id, statusText, instance.last_updated_at]);
    });

    const exampleId = formattedData[0].id;

    console.log(table.toString());
    console.log(`\n${gray("Use VM IDs to access and replace VMs.")}\n`);
    console.log(gray("Examples:"));
    console.log(`  sf vm ssh ${cyan(`USERNAME@${exampleId}`)}`);
    console.log(`  sf vm logs -i ${cyan(exampleId)} -f`);
    console.log(`  sf vm replace -i ${cyan(exampleId)}`);
  });

export default list;
