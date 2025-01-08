import { Command } from "commander";
import os from "node:os";
import { PostHog } from "posthog-node";

export const postHogClient = new PostHog(
  "phc_ErsIQYNj6gPFTkHfupfuUGeKjabwtk3WTPdkTDktbU4",
  {
    host: "https://us.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  }
);
// Uncomment this out to see Posthog debugging logs.
// postHogClient.debug();

/**
 * Whether the user has opted out of telemetry collection.
 */
export const IS_TRACKING_DISABLED =
  process.env.SF_CLI_TELEMETRY_OPTOUT === "1" ||
  process.env.SF_CLI_TELEMETRY_OPTOUT === "true";

export function setupCliTracking(program: Command) {
  const startTime = Date.now();
  // Track at program level to ensure we catch every CLI invocation
  process.on("exit", async code => {
    const endTime = Date.now();
    const executionDuration = endTime - startTime;

    // Get the executed command and subcommand
    const args = process.argv.slice(2);
    const commandName = args[0] || "help";
    const subCommandName = args[1];

    // Parse the arguments into a key-value object
    const parsedArgs: Record<string, any> = {};
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith("--")) {
        const key = arg.slice(2);
        // If next arg doesn't start with -, treat it as the value
        if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
          parsedArgs[key] = args[i + 1];
          i++; // Skip the value in next iteration
        } else {
          parsedArgs[key] = true; // Flag without value
        }
      }
    }

    const eventData = {
      commandName,
      subCommandName,
      arguments: parsedArgs,
      rawArgs: process.argv.slice(2),
      exitStatus: code,
      executionDuration,
      cliVersion: program.version(),
      os: os.platform(),
      shell: process.env.SHELL,
    };

    postHogClient.capture({
      distinctId: "cli-user",
      event: "cli_executed",
      properties: eventData,
    });

    await postHogClient.shutdown();
  });
}
