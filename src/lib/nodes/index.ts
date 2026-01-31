import console from "node:console";
import type { Command } from "@commander-js/extra-typings";

import create from "./create.ts";
import deleteCommand from "./delete.ts";
import extend from "./extend.ts";
import get from "./get.tsx";
import image from "./image/index.ts";
import list from "./list.tsx";
import logs from "./logs.ts";
import redeploy from "./redeploy.ts";
import release from "./release.ts";
import set from "./set.ts";
import ssh from "./ssh.ts";

export function registerNodes(program: Command) {
  const nodes = program
    .command("nodes")
    .alias("node")
    .showHelpAfterError()
    .description("Manage compute nodes")
    .addCommand(list)
    .addCommand(get)
    .addCommand(create)
    .addCommand(extend)
    .addCommand(release)
    .addCommand(deleteCommand)
    .addCommand(redeploy)
    .addCommand(set)
    .addCommand(ssh)
    .addCommand(logs)
    .addCommand(image);

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
$ sf nodes ssh root@my-node-name

\x1b[2m# View logs from a node's current VM\x1b[0m
$ sf nodes logs my-node-name

\x1b[2m# SSH into a specific VM\x1b[0m
$ sf nodes ssh root@vm_xxxxxxxxxxxxxxxxxxxxx

\x1b[2m# View logs from a specific VM\x1b[0m
$ sf nodes logs -i vm_xxxxxxxxxxxxxxxxxxxxx

\x1b[2m# Manage custom VM images\x1b[0m
$ sf nodes images --help
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
}
