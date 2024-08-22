import type { ApiError } from ".";
import { getAuthToken } from "../helpers/config";
import type { Centicents } from "../helpers/units";
import { getApiUrl } from "../helpers/urls";
import type { Nullable } from "../types/empty";

export interface BalanceObject {
  object: "balance";
  available: {
    amount: Centicents;
    currency: "usd";
  };
  reserved: {
    amount: Centicents;
    currency: "usd";
  };
}

// --

interface GetBalanceReturn {
  data: Nullable<BalanceObject>;
  err: Nullable<ApiError>;
}
export async function getBalance(): Promise<GetBalanceReturn> {
  const response = await fetch(await getApiUrl("balance_get"), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });
  if (!response.ok) {
    return {
      data: null,
      err: await response.json(),
    };
  }

  return {
    data: await response.json(),
    err: null,
  };
}
