import type { Command } from "@commander-js/extra-typings";
import process from "node:process";
import { isFeatureEnabled } from "./posthog.ts";

export async function registerVM(program: Command) {
  const isEnabled = await isFeatureEnabled("vms");

  if (!isEnabled) {
    return;
  }

  program
    .command("vm")
    .description("Manage virtual machines")
    .action(() => {
      console.log("VMs!!!");

      process.exit(0);
    });
}
