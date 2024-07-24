import { Command } from "commander";
import { loadConfig } from "../helpers/config";
import { logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";

export function registerContracts(program: Command) {
  program
    .command("contracts")
    .description("Manage contracts")
    .addCommand(
      new Command("list").description("List all contracts").action(async () => {
        await listContracts();
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
  console.log(data);
}
