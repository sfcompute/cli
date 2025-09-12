import { Command } from "@commander-js/extra-typings";
import { readFileSync } from "node:fs";
import console from "node:console";
import { getAuthToken } from "../../helpers/config.ts";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors.ts";
import { getApiUrl } from "../../helpers/urls.ts";

const script = new Command("script")
  .description("Push a startup script to VMs")
  .requiredOption("-f, --file <file>", "Path to startup script file")
  .action(async (options) => {
    let script: string;
    try {
      script = readFileSync(options.file, "utf-8");
    } catch {
      logAndQuit("Failed to read script file");
    }

    const url = await getApiUrl("vms_script_post");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getAuthToken()}`,
      },
      body: JSON.stringify({ script }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        await logSessionTokenExpiredAndQuit();
      }
      logAndQuit(`Failed to upload script: ${response.statusText}`);
    }

    console.log("Successfully uploaded startup script");
  });

export default script;
