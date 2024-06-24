import env from "../environment";

export const getWebappUrl = (
	{
		path,
		queryParams,
	}: {
		path: string;
		queryParams?: Record<string, any>;
	} = {
		path: "/",
		queryParams: {},
	},
) => {
	return getUrlToResource({
		baseUrl: getBaseWebappUrl(),
		resourcePath: path,
		queryParams,
	});
};

export const getApiUrl = (
	{
		path,
		queryParams,
	}: {
		path: string;
		queryParams?: Record<string, any>;
	} = {
		path: "/",
		queryParams: {},
	},
) => {
	return getUrlToResource({
		baseUrl: getBaseApiUrl(),
		resourcePath: path,
		queryParams,
	});
};

const getUrlToResource = ({
	baseUrl,
	resourcePath,
	queryParams,
}: {
	baseUrl: string;
	resourcePath: string;
	queryParams?: Record<string, string>;
}) => {
	// Adjust for trailing slash
	if (!!resourcePath && resourcePath.charAt(resourcePath.length - 1) === "/") {
		resourcePath = resourcePath.substring(0, resourcePath.length - 1);
	}

	// Adjust for leading slash
	if (!!resourcePath && resourcePath.charAt(0) !== "/") {
		resourcePath = "/" + resourcePath;
	}

	const queryParamString = queryParams ? getQueryParamString(queryParams) : "";

	return baseUrl + resourcePath + queryParamString;
};

const getQueryParamString = (queryParams: Record<string, string>): string => {
	if (!queryParams) {
		return "";
	}

	const paramItems = Object.keys(queryParams).map((paramLabel: string) => {
		const value = queryParams[paramLabel];
		if (!value) {
			return undefined;
		}

		return `${encodeURIComponent(paramLabel)}=${encodeURIComponent(value)}`;
	});

	return `?${paramItems.filter(Boolean).join("&")}`;
};

const getBaseWebappUrl = () => {
	return getBaseUrl({ host: env.webapp.host, port: env.webapp.port });
};
const getBaseApiUrl = (): string => {
	return getBaseUrl({ host: env.api.host, port: env.api.port });
};

interface BaseUrlOptions {
	host: string;
	port: number | string;
	suffix?: string;
}
const getBaseUrl = ({ host, port: _port, suffix }: BaseUrlOptions) => {
	const protocol = env.isDevelopment ? "http" : "https";
	const port = _port ? `:${_port}` : "";

	return `${protocol}://${host}${port}${suffix ? suffix : ""}`;
};

// ---

export const WebPaths = {
	cli: {
		session: {
			create: getWebappUrl({ path: "/cli/session" }),
			get: ({ token }: { token: string }) =>
				getWebappUrl({ path: "/cli/session", queryParams: { token } }),
		},
	},
};
