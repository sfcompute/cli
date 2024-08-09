export function getCommandBase() {
  return process.env.IS_DEVELOPMENT_CLI_ENV ? "bun dev" : "sf";
}
