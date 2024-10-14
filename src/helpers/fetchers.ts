import { apiClient } from "../api/client";
import { logAndQuit } from "./errors";

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

export async function getOrder(orderId: string) {
  const api = await apiClient();
  const { data, response, error } = await api.GET("/v0/orders/{id}", {
    params: {
      path: { id: orderId },
    },
  });
  if (!response.ok) {
    // @ts-ignore
    if (error?.code === "order.not_found") {
      return null;
    }
    return logAndQuit(`Failed to get order: ${response.statusText}`);
  }
  return data;
}
