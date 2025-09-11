import { type Command } from "@commander-js/extra-typings";
import { registerSsh } from "./ssh.ts";
import image from "./image/index.ts";
import list from "./list.ts";
import logs from "./logs.ts";
import replace from "./replace.ts";
import script from "./script.ts";

export function registerVM(program: Command) {
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
    .addCommand(script)
    .addCommand(image);
}
