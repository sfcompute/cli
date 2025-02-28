export interface UserFacingCluster {
  object: "kubernetes_cluster";
  kubernetes_api_url?: string;
  name: string;
  kubernetes_namespace: string;
  kubernetes_ca_cert?: string;
  state: "Active" | "Upcoming" | "Expired";
  contract?: {
    object: "contract";
    status: "active";
    id: string;
    created_at: string;
    instance_type: string;
    shape: {
      intervals: string[];
      quantities: number[];
    };
    colocate_with?: string[];
    cluster_id?: string;
  };
}
