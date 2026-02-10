import { apiClient } from "../apiClient.ts";
import { logAndQuit } from "./errors.ts";

export async function getContract(contractId: string) {
  const api = await apiClient();
  const { data, response } = await api.GET("/v0/contracts/{id}", {
    params: {
      path: { id: contractId },
    },
  });
  if (!response.ok) {
    return logAndQuit(`Failed to get contract: ${response.statusText}`);
  }
  return data;
}
