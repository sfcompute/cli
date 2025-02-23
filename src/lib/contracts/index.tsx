import { Command } from "@commander-js/extra-typings";
import { render } from "ink";
import * as console from "node:console";
import React from "react";
import { apiClient } from "../../apiClient.ts";
import { isLoggedIn } from "../../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { ContractList } from "./ContractDisplay.tsx";
import type { ActiveContract, Contract } from "./types.ts";
import { getContractState } from "./utils.ts";

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
        .option(
          "--all",
          "Show all contracts including expired ones (Active, Upcoming, Expired)",
        )
        .description("List all contracts")
        .action(async (options) => {
          if (options.json) {
            console.log(await listContracts(options.all));
          } else {
            const data = await listContracts(options.all);
            render(<ContractList contracts={data} />);
          }
        }),
    );
}

async function listContracts(showAll = false): Promise<Contract[]> {
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

  const contracts: Contract[] = [];
  for (const contract of data.data) {
    if (contract.status === "pending") {
      contracts.push(contract as Contract);
      continue;
    }

    const activeContract = contract as ActiveContract;
    const state = getContractState(activeContract);
    if (showAll || state === "Active" || state === "Upcoming") {
      contracts.push({
        ...activeContract,
        colocate_with: activeContract.colocate_with ?? [],
      });
    }
  }

  return contracts;
}
