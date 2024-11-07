export type Quote =
  | {
      price: number;
      quantity: number;
      start_at: string;
      end_at: string;
      instance_type: string;
    }
  | {
      price: number;
      quantity: number;
      start_at: string;
      end_at: string;
      contract_id: string;
    }
  | null;
