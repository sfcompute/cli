const bin = process.env.IS_DEVELOPMENT_CLI_ENV ? "bun dev" : "sf";

export const CLICommand = {
  Login: `${bin} login`,
  Buy: `${bin} buy`,
  Tokens: {
    Create: `${bin} tokens create`,
    List: `${bin} tokens list`,
    Delete: `${bin} tokens delete <token-id>`,
  },
};
