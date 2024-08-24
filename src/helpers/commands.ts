const bin = process.env.IS_DEVELOPMENT_CLI_ENV ? "bun dev" : "sf";

export const CLICommand = {
  Login: `${bin} login`,
  Buy: `${bin} buy`,
  Orders: {
    List: `${bin} orders ls`,
    Status: {
      Bare: `${bin} orders status`,
      BareWithParams: `${bin} orders status <order-id>`,
      WithOrderId: (orderId: string) => `${bin} orders status ${orderId}`,
    },
    Cancel: {
      Bare: `${bin} orders cancel`,
      BareWithParams: `${bin} orders cancel <order-id>`,
      WithOrderId: (orderId: string) => `${bin} orders cancel ${orderId}`,
    },
  },
  Tokens: {
    Create: `${bin} tokens create`,
    List: `${bin} tokens list`,
    Delete: {
      BareWithParams: `${bin} tokens delete <token-id>`,
      WithTokenId: (tokenId: string) => `${bin} tokens delete ${tokenId}`,
    },
  },
};
