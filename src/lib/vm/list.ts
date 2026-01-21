import console from "node:console";
import { Command } from "@commander-js/extra-typings";
import boxen from "boxen";
import chalk from "chalk";
import Table from "cli-table3";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

import { apiClient } from "../../apiClient.ts";
import { getAuthToken } from "../../helpers/config.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";

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
      ),
    );

    if (!(vmsData.length > 0) && !hasRecentlyCreatedVMs) {
      if (options.json) {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      logAndQuit(
        "You have no legacy VMs. Buy a VM with: \n  $ sf nodes create --help",
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
      const message = `VMs take 5-10 minutes to spin up and may show as ${chalk.green(
        "Running",
      )} before they are ready for ssh.

You can use ${chalk.cyan(
        "sf vm logs -f",
      )} to follow your VM's startup script output.`;

      console.error(
        boxen(message, {
          padding: 0.75,
          borderColor: "cyan",
        }),
      );
    }

    const table = new Table({
      head: [
        chalk.cyan("ID"),
        chalk.cyan("Status"),
        chalk.cyan("Last Updated"),
      ],
      style: {
        head: [],
        border: ["gray"],
      },
    });

    if (unscheduledVMs > 0) {
      table.push([
        {
          colSpan: 3,
          content: chalk.yellow(
            `${unscheduledVMs} additional VMs awaiting scheduling`,
          ),
        },
      ]);
    }

    formattedData.forEach((instance) => {
      const status = instance.status.toLowerCase();
      const statusText =
        status === "running"
          ? chalk.green("Running")
          : status === "dead"
            ? chalk.red("Dead")
            : status === "off"
              ? chalk.gray("Off")
              : instance.status;

      table.push([instance.id, statusText, instance.last_updated_at]);
    });

    const exampleId = formattedData[0].id;

    console.log(table.toString());
    console.log(`\n${chalk.gray("Use VM IDs to access and replace VMs.")}\n`);
    console.log(chalk.gray("Examples:"));
    console.log(`  sf vm ssh ${chalk.cyan(`USERNAME@${exampleId}`)}`);
    console.log(`  sf vm logs -i ${chalk.cyan(exampleId)} -f`);
    console.log(`  sf vm replace -i ${chalk.cyan(exampleId)}`);
  });

export default list;
