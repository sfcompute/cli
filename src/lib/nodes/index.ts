import { type Command } from "@commander-js/extra-typings";
import console from "node:console";

import { addCreate } from "./create.ts";
import list from "./list.tsx";
import release from "./release.ts";
import deleteCommand from "./delete.ts";
import set from "./set.ts";
import extend from "./extend.ts";
import get from "./get.tsx";
import { addRedeploy } from "./redeploy.ts";
import ssh from "./ssh.ts";
import logs from "./logs.ts";
import { isFeatureEnabled } from "../posthog.ts";

export async function registerNodes(program: Command) {
  const isEnabled = await isFeatureEnabled("vm-provider");
  if (!isEnabled) return;

  const nodes = program
    .command("nodes")
    .alias("node")
    .showHelpAfterError()
    .description("Manage compute nodes")
    .addCommand(list)
    .addCommand(get)
    .addCommand(extend)
    .addCommand(release)
    .addCommand(deleteCommand)
    .addCommand(set)
    .addCommand(ssh)
    .addCommand(logs);

  const baseHelpText = nodes.helpInformation();

  // Format short and verbose help text
  nodes
    .addHelpText(
      "after",
      `
A node is a compute instance that provides GPUs for your workloads. Nodes can be created 
as reservations (with specific start/end times) or as procurements (auto reserved pricing).

Examples:\n
\x1b[2m# Create an auto reserved node\x1b[0m
$ sf nodes create my-node-name --zone hayesvalley --max-price 12.50

\x1b[2m# Create multiple reserved nodes with auto-generated names\x1b[0m
$ sf nodes create -n 2 -z hayesvalley --start +1h --duration 2d -p 15.00

\x1b[2m# List all nodes\x1b[0m
$ sf nodes list

\x1b[2m# Get detailed information about specific nodes\x1b[0m
$ sf nodes get my-node-name

\x1b[2m# Release a node\x1b[0m
$ sf nodes release my-node-name

\x1b[2m# Delete a node permanently\x1b[0m
$ sf nodes delete my-node-name

\x1b[2m# Redeploy a node with a new VM\x1b[0m
$ sf nodes redeploy my-node-name

\x1b[2m# Update the max price of an auto reserved node\x1b[0m
$ sf nodes set my-node-name --max-price 12.50

\x1b[2m# Extend a reserved node\x1b[0m
$ sf nodes extend my-node-name --duration 3600 --max-price 12.50

\x1b[2m# SSH into a node's current VM\x1b[0m
$ sf nodes ssh my-node-name

\x1b[2m# View logs from a node's current VM\x1b[0m
$ sf nodes logs my-node-name

\x1b[2m# SSH into a specific VM\x1b[0m
$ sf nodes ssh user@vm_xxxxxxxxxxxxxxxxxxxxx

\x1b[2m# View logs from a specific VM\x1b[0m
$ sf nodes logs -i vm_xxxxxxxxxxxxxxxxxxxxx
  `,
    )
    // Add action to display help if no subcommand is provided
    .action(() => {
      console.log(`${baseHelpText}
A node is a compute instance that provides GPUs for your workloads. Nodes can be created 
as reservations (with specific start/end times) or as procurements (auto reserved pricing).

Examples:\n
\x1b[2m# Create a reserved node\x1b[0m
$ sf nodes create my-node-name -z hayesvalley --start +1h --duration 2d -p 15.00

\x1b[2m# List all nodes\x1b[0m
$ sf nodes list

\x1b[2m# Extend a reserved node\x1b[0m
$ sf nodes extend my-node-name --duration 3600 --max-price 12.50

To see a full list of examples, run:
$ sf nodes --help
`);
    });

  await addCreate(nodes);
  await addRedeploy(nodes);
}
