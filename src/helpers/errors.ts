import { CLICommand } from "./commands";
import { clearAuthFromConfig } from "./config";

export function logAndQuit(message: string) {
  console.error(message);
  process.exit(1);
}

export function logLoginMessageAndQuit() {
  logAndQuit(`You need to login first.\n\n\t$ ${CLICommand.Login}\n`);
}

export async function logSessionTokenExpiredAndQuit() {
  await clearAuthFromConfig();
  logAndQuit("\nYour session has expired. Please login again.");
}
