export type OrderType = "buy" | "sell";
export enum OrderStatus {
  Pending = "pending",
  Rejected = "rejected",
  Open = "open",
  Cancelled = "cancelled",
  Filled = "filled",
  Expired = "expired",
}
export interface OrderFlags {
  market: boolean;
  post_only: boolean;
  ioc: boolean;
  prorate: boolean;
}

export interface HydratedOrder {
  object: "order";
  id: string;
  side: OrderType;
  instance_type: string;
  price: number;
  start_at: string;
  end_at: string;
  quantity: number;
  flags: OrderFlags;
  created_at: string;
  executed: boolean;
  execution_price?: number;
  cancelled: boolean;
  status: OrderStatus;
  cluster?: string;
}

export type PlaceSellOrderParameters = {
  side: "sell";
  quantity: number;
  price: number;
  start_at: string;
  end_at: string;
  contract_id: string;
};

export type PlaceOrderParameters = {
  side: "buy";
  quantity: number;
  price: number;
  instance_type: string;
  duration: number;
  start_at: string;
};

export interface ListResponseBody<T> {
  data: T[];
  object: "list";
}
