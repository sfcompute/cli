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
          "Show all contracts including expired ones (Active, Upcoming, Expired)"
        )
        .option(
          "--state <state>",
          "Filter contracts by state: active, upcoming, or expired",
          value => {
            const validStates = ["active", "upcoming", "expired"];
            if (!validStates.includes(value.toLowerCase())) {
              throw new Error(
                `Invalid state: ${value}. Valid states are: ${validStates.join(
                  ", "
                )}`
              );
            }
            // Convert lowercase input to title case for internal use
            return value.toLowerCase().replace(/^\w/, c => c.toUpperCase());
          }
        )
        .description("List all contracts")
        .action(async options => {
          if (options.json) {
            console.log(await listContracts(options.all, options.state));
          } else {
            const data = await listContracts(options.all, options.state);
            render(<ContractList contracts={data} />);
          }
        })
    );
}

async function listContracts(
  showAll = false,
  stateFilter?: string
): Promise<Contract[]> {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    return logLoginMessageAndQuit();
  }

  const api = await apiClient();

  const state = showAll
    ? "all"
    : (stateFilter?.toLowerCase() as "expired" | "active" | "upcoming") ||
      undefined;

  const { data, error, response } = await api.GET("/v0/contracts", {
    params: {
      query: {
        state,
      },
    },
  });

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
      `Failed to get contracts: Unexpected response from server: ${response}`
    );
  }

  const contracts: Contract[] = [];
  for (const contract of data.data) {
    const activeContract = contract as ActiveContract;
    contracts.push({
      ...activeContract,
      colocate_with: activeContract.colocate_with ?? [],
    });
  }

  return contracts;
}
