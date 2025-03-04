export type ContractStatus = "active" | "expired" | "upcoming" | "pending";

export interface BaseContract {
  object: "contract";
  id: string;
  status: ContractStatus;
}

export interface PendingContract extends BaseContract {
  status: "pending";
}

export interface ActiveContract extends BaseContract {
  status: ContractStatus;
  created_at: string;
  instance_type: string;
  shape: {
    intervals: string[];
    quantities: number[];
  };
  colocate_with: string[];
  cluster_id?: string;
}

export type Contract = PendingContract | ActiveContract;
