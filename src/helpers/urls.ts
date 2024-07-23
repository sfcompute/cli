import { loadConfig } from "./config";

const webPaths = {
	cli_session_create: "/cli/session",
	cli_session_get: ({ token }: { token: string }) =>
		`/cli/session?token=${token}`,
};

const apiPaths = {
	orders_create: "/v0/orders",
	orders_list: "/v0/orders",
	orders_get: ({ id }: { id: string }) => `/v0/orders/${id}`,

	instances_list: "/v0/instances",
	instances_get: ({ id }: { id: string }) => `/v0/instances/${id}`,

	credentials_create: "/v0/credentials",
	credentials_list: "/v0/credentials",

	contracts_list: "/v0/contracts",
	contracts_get: ({ id }: { id: string }) => `/v0/contracts/${id}`,

	balance_get: "/v0/balance",
};

export async function getWebAppUrl<
	K extends keyof typeof webPaths,
	V extends Extract<(typeof webPaths)[K], (...args: any) => any>,
>(key: K, params: Parameters<V>[0]): Promise<string>;
export async function getWebAppUrl(key: keyof typeof webPaths): Promise<string>;
export async function getWebAppUrl(
	key: keyof typeof webPaths,
	params?: any,
): Promise<string> {
	const config = await loadConfig();
	const path = webPaths[key];
	if (typeof path === "function") {
		return config.webapp_url + path(params);
	}
	return config.webapp_url + path;
}

export async function getApiUrl<
	K extends keyof typeof apiPaths,
	V extends Extract<(typeof apiPaths)[K], (...args: any) => any>,
>(key: K, params: Parameters<V>[0]): Promise<string>;
export async function getApiUrl(key: keyof typeof apiPaths): Promise<string>;
export async function getApiUrl(
	key: keyof typeof apiPaths,
	params?: any,
): Promise<string> {
	const config = await loadConfig();
	const path = apiPaths[key];
	if (typeof path === "function") {
		return config.api_url + path(params);
	}
	return config.api_url + path;
}
