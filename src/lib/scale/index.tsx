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
    .description(
      "Create and manage procurements that purchase a desired number of GPUs on a rolling basis.",
    )
    .addHelpText(
      "after",
      `
A procurement is an automated purchasing strategy that will attempt to constantly maintain a desired number of GPUs by buying and selling spot reservations.

See https://docs.sfcompute.com/using-sf-scale for more information.
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
