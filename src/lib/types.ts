export interface ListResponseBody<T> {
  data: T[];
  object: "list";
}

export type OrderType = "buy" | "sell";

export interface OrderFlags {
  market: boolean;
  post_only: boolean;
  ioc: boolean;
}

export interface PlacedOrder {
  object: "order";
  id: string;
  side: OrderType;
  instance_type: string;
  price: number;
  starts_at: string;
  duration: number;
  quantity: number;
  flags: OrderFlags;
  created_at: string;
  executed: boolean;
  cancelled: boolean;
  status: "placed";
}

export interface PendingOrder {
  object: "order";
  id: string;
  status: "pending";
}

export type Order = PlacedOrder | PendingOrder;
