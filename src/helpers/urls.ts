import { loadConfig } from "./config.ts";

const webPaths = {
  cli_session_create: "/cli/session",
  cli_session_get: ({ token }: { token: string }) =>
    `/cli/session?token=${token}`,
};

const apiPaths = {
  index: "/",
  me: "/v0/me",
  ping: "/v0/ping",

  orders_create: "/v0/orders",
  orders_list: "/v0/orders",
  orders_get: ({ id }: { id: string }) => `/v0/orders/${id}`,
  orders_cancel: ({ id }: { id: string }) => `/v0/orders/${id}`,

  quote_get: "/v0/quote",

  instances_list: "/v0/instances",
  instances_get: ({ id }: { id: string }) => `/v0/instances/${id}`,

  credentials_create: "/v0/credentials",
  credentials_list: "/v0/credentials",

  contracts_list: "/v0/contracts",
  contracts_get: ({ id }: { id: string }) => `/v0/contracts/${id}`,

  balance_get: "/v0/balance",

  tokens_create: "/v0/tokens",
  tokens_list: "/v0/tokens",
  tokens_delete_by_id: ({ id }: { id: string }) => `/v0/tokens/${id}`,
};

// --

export async function getWebAppUrl(
  key: keyof typeof webPaths,
  params?: any
): Promise<string> {
  const config = await loadConfig();
  const path = webPaths[key];
  if (typeof path === "function") {
    return config.webapp_url + path(params);
  }

  return config.webapp_url + path;
}

export async function getApiUrl(
  key: keyof typeof apiPaths,
  params?: any
): Promise<string> {
  const config = await loadConfig();
  const path = apiPaths[key];
  if (typeof path === "function") {
    return config.api_url + path(params);
  }

  return config.api_url + path;
}
