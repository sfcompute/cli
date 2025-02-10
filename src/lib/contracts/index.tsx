import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { apiClient } from "../../apiClient.ts";
import { isLoggedIn } from "../../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { ContractList } from "./ContractDisplay.tsx";
import type { Contract } from "./types.ts";

export function registerContracts(program: Command) {
  program
    .command("contracts")
    .alias("c")
    .alias("contract")
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

            render(<ContractList contracts={data} />);
          }
          // process.exit(0);
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
