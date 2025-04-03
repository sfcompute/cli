import { loadConfig } from "./config.ts";

type PathFunction<T> = (params: T) => string;
type Path<T = unknown> = string | PathFunction<T>;

type TokenParams = {
  token: string;
};

type IdParams = {
  id: string;
};

const webPaths: Record<string, Path<TokenParams | never>> = {
  cli_session_create: "/cli/session",
  cli_session_get: ({ token }: TokenParams): string =>
    `/cli/session?token=${token}`,
};

const apiPaths: Record<string, Path<IdParams | never>> = {
  index: "/",
  me: "/v0/me",
  ping: "/v0/ping",

  orders_list: "/v0/orders",
  orders_get: ({ id }: IdParams): string => `/v0/orders/${id}`,
  orders_cancel: ({ id }: IdParams): string => `/v0/orders/${id}`,

  quote_get: "/v0/quote",

  instances_list: "/v0/instances",
  instances_get: ({ id }: IdParams): string => `/v0/instances/${id}`,

  credentials_create: "/v0/credentials",
  credentials_list: "/v0/credentials",

  contracts_list: "/v0/contracts",
  contracts_get: ({ id }: IdParams): string => `/v0/contracts/${id}`,

  balance_get: "/v0/balance",

  tokens_create: "/v0/tokens",
  tokens_list: "/v0/tokens",
  tokens_delete_by_id: ({ id }: IdParams): string => `/v0/tokens/${id}`,

  vms_instances_list: "/v0/vms/instances",
  vms_logs_list: "/v0/vms/logs",
  vms_replace: "/v0/vms/replace",
  vms_script_post: "/v0/vms/script",
  vms_script_get: "/v0/vms/script",
  vms_ssh_get: "/v0/vms/ssh",
};

export async function getWebAppUrl<T extends TokenParams | never>(
  key: keyof typeof webPaths,
  params?: T,
): Promise<string> {
  const config = await loadConfig();
  const path = webPaths[key];
  if (typeof path === "function") {
    return `${config.webapp_url}${params ? path(params) : ""}`;
  }
  return `${config.webapp_url}${path}`;
}

export async function getApiUrl<T extends IdParams | never>(
  key: keyof typeof apiPaths,
  params?: T,
): Promise<string> {
  const config = await loadConfig();
  const path = apiPaths[key];
  if (typeof path === "function") {
    return `${config.api_url}${params ? path(params) : ""}`;
  }
  return `${config.api_url}${path}`;
}
