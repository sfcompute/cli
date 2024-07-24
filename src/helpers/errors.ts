export function logAndQuit(message: string) {
  console.error(message);
  process.exit(1);
}

export function logLoginMessageAndQuit() {
  const loginCommand = process.env.IS_DEVELOPMENT_CLI_ENV
    ? "bun dev login"
    : "sf login";

  logAndQuit(`You need to login first.\n\n\t$ ${loginCommand}\n`);
}
