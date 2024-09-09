import createClient, { type Client } from "openapi-fetch";
import { getAuthToken, loadConfig } from "./helpers/config";
import type { paths } from "./schema"; // generated by openapi-typescript

let __client: Client<paths, `${string}/${string}`> | undefined;

export const apiClient = async () => {
  if (__client) {
    return __client;
  }

  const config = await loadConfig();
  __client = createClient<paths>({
    baseUrl: config.api_url,
    headers: {
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });

  return __client;
};
