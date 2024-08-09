import Table from "cli-table3";
import { Command } from "commander";
import { getAuthToken, isLoggedIn } from "../helpers/config";
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
  const table = new Table({
    head: [
      "ID",
      "Status",
      "Instance Type",
      // Found by looking at the first interval
      "Starts At",
      // Found by looking at the last interval
      "Ends At",
    ],
  });

  for (const contract of data) {
    const startsAt = contract.shape.intervals[0];
    const endsAt =
      contract.shape.intervals[contract.shape.intervals.length - 1];
    table.push([
      contract.id,
      contract.status,
      contract.instance_type,
      new Date(startsAt).toLocaleString(),
      new Date(endsAt).toLocaleString(),
    ]);
  }

  console.log(table.toString());
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
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    return logLoginMessageAndQuit();
  }

  const response = await fetch(await getApiUrl("contracts_list"), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });

  const data = await response.json();
  return data;
}
