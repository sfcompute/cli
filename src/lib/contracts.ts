import Table from "cli-table3";
import { Command } from "commander";
import { loadConfig } from "../helpers/config";
import { logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";

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
  cluster_id: string;
}

function printTable(data: Contract[]) {
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
      head: [
        "ID",
        "Status",
        "Instance Type",
        "From",
        "To",
        "Quantity",
      ]
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
            printTable(data.data);
          }
          process.exit(0);
        }),
    );
}

async function listContracts() {
  const config = await loadConfig();
  if (!config.auth_token) {
    return logLoginMessageAndQuit();
  }

  const response = await fetch(await getApiUrl("contracts_list"), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.auth_token}`,
    },
  });

  const data = await response.json();
  return data;
}
