import { Command } from "@commander-js/extra-typings";
import { red, yellow } from "jsr:@std/fmt/colors";
import boxen from "boxen";
import console from "node:console";
import { nodesClient } from "../../nodesClient.ts";
import { pluralizeNodes } from "../nodes/utils.ts";
import { registerSsh } from "./ssh.ts";
import { addImage } from "../nodes/image/index.ts";
import list from "./list.ts";
import logs from "./logs.ts";
import replace from "./replace.ts";
import script from "./script.ts";

const DEPRECATION_WARNING = red(boxen(
  `\x1b[31mWe're deprecating \x1b[37msf buy\x1b[31m and \x1b[37msf vm\x1b[31m for Virtual Machines.\x1b[31m
\x1b[31mWe recommend you create a VM Node instead: \x1b[37msf nodes create --help\x1b[31m
\x1b[37msf nodes\x1b[31m allows you to create, extend, and release specific machines directly.\x1b[31m`,
  {
    padding: 0.75,
    borderColor: "red",
  },
));

async function getVMDeprecationWarning() {
  const client = await nodesClient();
  const nodes = await client.nodes.list();
  const numNodesWithVMs =
    nodes.data?.filter((node) => node.vms?.data?.length ?? 0 > 0).length ?? 0;
  if (numNodesWithVMs > 0) {
    return yellow(
      boxen(
        `You have \x1b[1m\x1b[33m${numNodesWithVMs} ${
          // Capitalize the first letter of the word
          ((word) => word.charAt(0).toUpperCase() + word.slice(1))(
            pluralizeNodes(numNodesWithVMs),
          )}\x1b[0m\x1b[33m with active or previous VMs.
Managing VM Nodes with deprecated \x1b[37msf vm\x1b[33m commands may cause undefined behavior.
Use \x1b[37msf nodes\x1b[33m to create, extend and release specific machines directly.`,
        {
          padding: 0.75,
          borderColor: "yellow",
        },
      ),
    );
  }
  return DEPRECATION_WARNING;
}
export async function registerVM(program: Command) {
  const vm = program
    .command("vm")
    .showHelpAfterError()
    .aliases(["v", "vms"])
    .description("Manage virtual machines")
    .hook("preAction", async () => {
      const vmDeprecationWarning = await getVMDeprecationWarning();
      console.error(vmDeprecationWarning);
    })
    .addHelpText("beforeAll", DEPRECATION_WARNING + "\n");

  registerSsh(vm);

  vm
    .addCommand(list)
    .addCommand(logs)
    .addCommand(replace)
    .addCommand(script);

  // Add images command if feature flag is enabled
  await addImage(vm);
}
