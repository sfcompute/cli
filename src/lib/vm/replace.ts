import process from "node:process";
import { Command } from "@commander-js/extra-typings";
import { confirm } from "@inquirer/prompts";
import ora from "ora";

import { getAuthToken } from "../../helpers/config.ts";
import {
  logSessionTokenExpiredAndQuit,
  logSupportCTAAndQuit,
} from "../../helpers/errors.ts";
import { getApiUrl } from "../../helpers/urls.ts";

const replace = new Command("replace")
  .description("Replace a virtual machine")
  .requiredOption("-i, --id <id>", "ID of the VM to replace")
  .option("-y, --yes", "Automatically confirm the command.")
  .action(async (options) => {
    if (!options.yes) {
      const replaceConfirmed = await confirm({
        message: `Are you sure you want to replace VM instance ${options.id}? (You cannot undo this action)`,
        default: false,
      });
      if (!replaceConfirmed) {
        process.exit(0);
      }
    }

    const loadingSpinner = ora(`Replacing VM ${options.id}`).start();

    const url = await getApiUrl("vms_replace");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getAuthToken()}`,
      },
      body: JSON.stringify({ vm_id: options.id.toString() }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        await logSessionTokenExpiredAndQuit();
      }

      if (response.status === 404) {
        loadingSpinner.fail("VM doesn't exist - double check the ID");
        process.exit(1);
      }

      loadingSpinner.fail("Failed to replace VM");
      logSupportCTAAndQuit();
    }

    const { replaced, replaced_by } = (await response.json()) as {
      replaced: string;
      replaced_by: string;
    };
    if (!replaced || !replaced_by) {
      loadingSpinner.fail("Invalid API response format");
      logSupportCTAAndQuit();
    }
    loadingSpinner.succeed(
      `Replaced VM instance ${replaced} with VM ${replaced_by}`,
    );
    process.exit(0);
  });

export default replace;
