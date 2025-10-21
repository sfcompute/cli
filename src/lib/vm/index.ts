import { type Command } from "@commander-js/extra-typings";
import { registerSsh } from "./ssh.ts";
import { addImage } from "../nodes/image/index.ts";
import list from "./list.ts";
import logs from "./logs.ts";
import replace from "./replace.ts";
import script from "./script.ts";

export async function registerVM(program: Command) {
  const vm = program
    .command("vm")
    .showHelpAfterError()
    .aliases(["v", "vms"])
    .description("Manage virtual machines");

  registerSsh(vm);

  vm
    .addCommand(list)
    .addCommand(logs)
    .addCommand(replace)
    .addCommand(script);

  // Add images command if feature flag is enabled
  await addImage(vm);
}
