import { apiClient } from "../../apiClient.ts";
import { loadConfig, saveConfig } from "../../helpers/config.ts";

export async function getDefaultWorkspace(): Promise<string> {
  const config = await loadConfig();
  let accountId = config.account_id;
  if (!accountId) {
    const client = await apiClient();
    const { data } = await client.GET("/v0/me");
    if (data?.id) {
      await saveConfig({ ...config, account_id: data.id });
      accountId = data.id;
    } else {
      throw new Error("Could not determine account ID. Run 'sf login' first.");
    }
  }
  return `sfc:workspace:${accountId}:default`;
}
