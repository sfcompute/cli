import { getCommandBase } from "./command";
import { clearAuthFromConfig } from "./config";

export function logAndQuit(message: string): never {
  console.error(message);
  process.exit(1);
}

export function logLoginMessageAndQuit(): never {
  const base = getCommandBase();
  const loginCommand = `${base} login`;

  logAndQuit(`You need to login first.\n\n\t$ ${loginCommand}\n`);
}

export async function logSessionTokenExpiredAndQuit(): Promise<never> {
  await clearAuthFromConfig();
  logAndQuit("\nYour session has expired. Please login again.");
}

export function failedToConnect(): never {
  logAndQuit(
    "Failed to connect to the server. Please check your internet connection and try again.",
  );
}

export function unreachable(): never {
  throw new Error("unreachable code");
}
