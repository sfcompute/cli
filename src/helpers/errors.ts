import { getCommandBase } from "./command";
import { clearAuthFromConfig } from "./config";

export function logAndQuit(message: string) {
  console.error(message);
  process.exit(1);
}

export function logLoginMessageAndQuit() {
  const base = getCommandBase();
  const loginCommand = `${base} login`;

  logAndQuit(`You need to login first.\n\n\t$ ${loginCommand}\n`);
}

export async function logSessionTokenExpiredAndQuit() {
  await clearAuthFromConfig();
  logAndQuit("\nYour session has expired. Please login again.");
}
