import type { Command } from "commander";
import env from "../environment";

export function registerDev(program: Command) {
  if (env.isDevelopment) {
    // development only commands
    program.command("ping").action(async () => {
      console.log("pong");
    });
  
    program.command("env").action(async () => {
      console.log(env);
    });
  }
}