import type { Centicents } from "../helpers/units";

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

// -- quote order

type QuoteOrderRequestQuery = {
  side: "buy" | "sell";
  min_start_date: string;
  max_start_date: string;
  instance_type: string;
  quantity: number;
  duration: number;
  price: Centicents;
  start_at: string;
  contract_id?: string; // only on sell orders
};
