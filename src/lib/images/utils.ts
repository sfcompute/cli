import { apiClient } from "../../apiClient.ts";
import { loadConfig, saveConfig } from "../../helpers/config.ts";

async function getAccountId(): Promise<string> {
  const config = await loadConfig();
  if (config.account_id) {
    return config.account_id;
  }
  const client = await apiClient();
  const { data } = await client.GET("/v0/me");
  if (data?.id) {
    await saveConfig({ ...config, account_id: data.id });
    return data.id;
  }
  throw new Error("Could not determine account ID. Run 'sf login' first.");
}

export async function getDefaultWorkspace(): Promise<string> {
  const accountId = await getAccountId();
  return `sfc:workspace:${accountId}:default`;
}
