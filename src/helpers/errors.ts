import process from "node:process";
import * as console from "node:console";
import { clearAuthFromConfig } from "./config.ts";

export function logAndQuit(message: string): never {
  console.error(message);
  process.exit(1);
}

const supportCTA =
  "Need help? Send an email to support@sfcompute.com to talk to an engineer.";

export function logAndQuitWithSupportCTA(message: string): never {
  logAndQuit(`${message}\n\n${supportCTA}`);
}

export function logSupportCTAAndQuit(): never {
  logAndQuit(supportCTA);
}

export function logLoginMessageAndQuit(): never {
  logAndQuit(`You need to login first.\n\n\t$ sf login\n`);
}

export async function logSessionTokenExpiredAndQuit(): Promise<never> {
  await clearAuthFromConfig();
  logAndQuit(
    `\nYour session has expired. Please login again.\n\n\t$ sf login\n`,
  );
}

export function failedToConnect(): never {
  logAndQuit(
    "Failed to connect to the server. Please check your internet connection and try again.",
  );
}

export function unreachable(): never {
  throw new Error("unreachable code");
}
