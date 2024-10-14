import Table from "cli-table3";
import { Command } from "commander";
import { apiClient } from "../api/client";
import { isLoggedIn } from "../config";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../helpers/errors";

interface Contract {
  object: string;
  status: string;
  id: string;
  created_at: string;
  instance_type: string;
  shape: {
    // These are date strings
    intervals: string[];
    quantities: number[];
  };
  colocate_with: string[];
  cluster_id?: string;
}

function printTable(data: Contract[]) {
  if (data.length === 0) {
    const table = new Table();
    table.push([
      { colSpan: 6, content: "No contracts found", hAlign: "center" },
    ]);

    console.log(table.toString());
  }

  for (const contract of data) {
    // print the contract shape in a table
    // if the contract is empty, will print empty shape table
    const intervals: (string | number)[][] = [];
    for (let i = 0; i < contract.shape.intervals.length - 1; i++) {
      intervals.push([
        "-",
        "-",
        "-",
        new Date(contract.shape.intervals[i]).toLocaleString(),
        new Date(contract.shape.intervals[i + 1]).toLocaleString(),
        contract.shape.quantities[i],
      ]);
    }

    const table = new Table({
      head: ["ID", "Status", "Instance Type", "From", "To", "Quantity"],
    });

    if (intervals.length > 0) {
      intervals[0][0] = contract.id;
      intervals[0][1] = contract.status;
      intervals[0][2] = contract.instance_type;
    }

    for (const interval of intervals) {
      table.push(interval);
    }

    console.log(table.toString());
  }
}

export function registerContracts(program: Command) {
  program
    .command("contracts")
    .description("Manage contracts")
    .addCommand(
      new Command("list")
        .alias("ls")
        .option("--json", "Output in JSON format")
        .description("List all contracts")
        .action(async (options) => {
          if (options.json) {
            console.log(await listContracts());
          } else {
            const data = await listContracts();
            printTable(data);
          }
          process.exit(0);
        }),
    );
}

async function listContracts(): Promise<Contract[]> {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    return logLoginMessageAndQuit();
  }

  const api = await apiClient();

  const { data, error, response } = await api.GET("/v0/contracts");

  if (!response.ok) {
    switch (response.status) {
      case 400:
        return logAndQuit(`Bad Request: ${error?.message}`);
      case 401:
        return await logSessionTokenExpiredAndQuit();
      default:
        return logAndQuit(`Failed to get contracts: ${response.statusText}`);
    }
  }

  if (!data) {
    return logAndQuit(
      `Failed to get contracts: Unexpected response from server: ${response}`,
    );
  }

  // filter out pending contracts
  // we use loop instead of filter bc type
  const contracts: Contract[] = [];
  for (const contract of data.data) {
    if (contract.status === "active") {
      contracts.push({
        ...contract,
        colocate_with: contract.colocate_with ?? [],
      });
    }
  }

  return contracts;
}
