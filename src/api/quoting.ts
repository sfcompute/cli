import { objToQueryString, type ApiError } from ".";
import { getAuthToken } from "../helpers/config";
import type { Centicents } from "../helpers/units";
import { getApiUrl } from "../helpers/urls";
import type { Nullable } from "../helpers/empty";

export interface BuyOrderQuote {
  object: "quote";
  side: "buy";
  price: Centicents;
  instance_type: string;
  quantity: number;
  duration: number;
  start_at: string;
}
export interface SellOrderQuote {
  object: "quote";
  side: "sell";
  price: Centicents;
  contract_id: string;
  quantity: number;
  duration: number;
  start_at: string;
}
export type OrderQuote = BuyOrderQuote | SellOrderQuote;

// -- quote buy order

export type QuoteBuyOrderRequestOptions = {
  instance_type: string;
  quantity: number;
  duration: number;
  min_start_date: string;
  max_start_date: string;
};

interface QuoteBuyOrderReturn {
  data: Nullable<BuyOrderQuote>;
  err: Nullable<ApiError>;
}
export async function quoteBuyOrderRequest(
  query: QuoteBuyOrderRequestOptions,
): Promise<QuoteBuyOrderReturn> {
  const urlBase = await getApiUrl("quote_get");
  const queryParams = {
    side: "buy",
    instance_type: query.instance_type,
    quantity: query.quantity,
    duration: query.duration,
    min_start_date: query.min_start_date,
    max_start_date: query.max_start_date,
  };
  const queryString = objToQueryString(queryParams);
  const url = `${urlBase}?${queryString}`;

  const response = await fetch(url, {
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
