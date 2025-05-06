import { Command } from "@commander-js/extra-typings";
import { isFeatureEnabled } from "../posthog.ts";

import create from "./create.tsx";
import update from "./update.tsx";
import list from "./list.tsx";

export async function registerScale(program: Command) {
  const isEnabled = await isFeatureEnabled("procurements");
  if (!isEnabled) return;

  const scale = program
    .command("scale")
    .alias("procurements")
    .alias("procurement")
    .configureHelp({
      optionDescription: (option) => {
        if (option.flags === "-h, --help") {
          return "Display help for scale";
        }
        return option.description;
      },
    })
    .showHelpAfterError()
    .description(
      "Create and manage procurements that purchase a desired number of GPUs on a rolling basis.",
    )
    .addHelpText(
      "after",
      `
A procurement is an automated purchasing strategy that will attempt to constantly maintain a desired number of GPUs by buying and selling spot reservations.

Examples:
\x1b[2m# Create a new procurement for 8 GPUs\x1b[0m
$ sf scale create -n 8

\x1b[2m# List your procurements\x1b[0m
$ sf scale ls [procurement-id...]

\x1b[2m# Scale procurements to 16 GPUs\x1b[0m
$ sf scale update <procurement-id...> -n 16

\x1b[2m# Turn off procurements by scaling to 0\x1b[0m
$ sf scale update <procurement-id...> -n 0

\x1b[2m# Update the limit price of procurements to $1.50/GPU/hr\x1b[0m
$ sf scale update <procurement-id...> -p 1.50

\x1b[2m# Start reserving more time 30 minutes before GPUs expire\x1b[0m
$ sf scale update <procurement-id...> --horizon '30m'

See https://docs.sfcompute.com/docs/on-demand-and-spot for more information.
    `,
    )
    .showHelpAfterError();

  // Attach sub-commands
  scale
    .addCommand(create)
    .addCommand(update)
    .addCommand(list)
    // Add action to display help if no subcommand is provided
    .action(() => {
      scale.help();
    });
}
