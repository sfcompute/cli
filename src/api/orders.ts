import type { ApiError } from ".";
import { getAuthToken } from "../helpers/config";
import type { Centicents } from "../helpers/units";
import { getApiUrl } from "../helpers/urls";
import type { Nullable } from "../helpers/empty";

export enum OrderSide {
  Buy = "buy",
  Sell = "sell",
}
export enum OrderStatus {
  Pending = "pending",
  Rejected = "rejected",
  Open = "open",
  Cancelled = "cancelled",
  Filled = "filled",
  Expired = "expired",
}
export interface OrderFlags {
  market?: boolean;
  post_only?: boolean;
  ioc?: boolean;
  prorate?: boolean;
}

export interface HydratedOrder {
  object: "order";
  id: string;
  side: OrderSide;
  instance_type: string;
  price: number;
  start_at: string;
  duration: number;
  quantity: number;
  flags: OrderFlags;
  created_at: string;
  executed: boolean;
  execution_price?: number;
  cancelled: boolean;
  status: OrderStatus;
}
export interface PlacedOrder {
  object: "order";
  id: string;
  status: OrderStatus.Pending;
}

export type Order = PlacedOrder | HydratedOrder;

// -- get order by id

interface GetOrderByIdReturn {
  data: Nullable<HydratedOrder>;
  err: Nullable<ApiError>;
}
export async function getOrderById(id: string): Promise<GetOrderByIdReturn> {
  const url = await getApiUrl("orders_get", { id });
  const response = await fetch(url, {
    method: "GET",
    headers: {
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

// -- place buy order

interface PlaceBuyOrderRequestOptions {
  instance_type: string;
  quantity: number;
  duration: number;
  start_at: string;
  price: Centicents;
  flags: OrderFlags;
}

interface PlaceBuyOrderReturn {
  data: Nullable<PlacedOrder>;
  err: Nullable<ApiError>;
}
export async function placeBuyOrderRequest(
  body: PlaceBuyOrderRequestOptions,
): Promise<PlaceBuyOrderReturn> {
  const response = await fetch(await getApiUrl("orders_create"), {
    method: "POST",
    body: JSON.stringify({
      side: "buy",
      ...body,
    }),
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
