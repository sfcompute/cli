import type { Command } from "commander";
import { loadConfig } from "../helpers/config";
import { logLoginMessageAndQuit } from "../helpers/errors";
import { getApiUrl } from "../helpers/urls";

interface InstanceObject {
  object: "instance";
  id: string;
  type: "h100i" | "h100" | "a100";
  ip: string;
}

export function registerInstances(program: Command) {
  program
    .command("instances")
    .description("View data on instances you own")
    .action(async (options) => {
      await getInstances();
    });
}

async function getInstances() {
  const config = await loadConfig();
  if (!config.auth_token) {
    logLoginMessageAndQuit();
  }

  const url = await getApiUrl("instances_list");
  console.log(url);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.auth_token}`,
    },
  });

  const data = await response.json();
  console.log(data);

  return null;
}
