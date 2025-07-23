import { type Command } from "@commander-js/extra-typings";

import create from "./create.ts";
import list from "./list.tsx";
import release from "./release.ts";
import set from "./set.ts";
import extend from "./extend.ts";
import { isFeatureEnabled } from "../posthog.ts";

export async function registerNodes(program: Command) {
  const isEnabled = await isFeatureEnabled("vm-provider");
  if (!isEnabled) return;

  const nodes = program
    .command("nodes")
    .alias("node")
    .showHelpAfterError()
    .description("Manage compute nodes")
    .addHelpText(
      "after",
      `
A node is a compute instance that provides GPUs for your workloads. Nodes can be created 
as reservations (with specific start/end times) or as procurements (on-demand pricing).

Examples:
\x1b[2m# Create a single node\x1b[0m
$ sf nodes create my-node

\x1b[2m# List all nodes\x1b[0m
$ sf nodes list

\x1b[2m# List all nodes with detailed information\x1b[0m
$ sf nodes list --verbose

\x1b[2m# Release a node\x1b[0m
$ sf nodes release my-node

\x1b[2m# Update node pricing\x1b[0m
$ sf nodes set my-node --max-price 12.50

\x1b[2m# Extend a node with new pricing\x1b[0m
$ sf nodes extend my-node --duration 3600 --max-price 12.50

\x1b[2m# Create multiple nodes with auto-generated names\x1b[0m
$ sf nodes create -n 3

\x1b[2m# Create nodes in a specific zone\x1b[0m
$ sf nodes create my-node --zone alamo
    `,
    );

  // Attach sub-commands
  nodes
    .addCommand(create)
    .addCommand(list)
    .addCommand(extend)
    .addCommand(release)
    .addCommand(set)
    // Add action to display help if no subcommand is provided
    .action(() => {
      nodes.help();
    });
}
