import { MOCK_CONTRACTS } from "../contracts/mock.ts";
import type { UserFacingCluster } from "./types.ts";

export const MOCK_CLUSTERS: UserFacingCluster[] = [
  // 1. Cluster with upcoming single order contract
  {
    object: "kubernetes_cluster",
    kubernetes_api_url: "https://k8s-api-1.example.com",
    name: "upcoming-single-cluster",
    kubernetes_namespace: "default",
    kubernetes_ca_cert: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t",
    contract: MOCK_CONTRACTS[0] as UserFacingCluster["contract"], // upcoming-single contract
  },

  // 2. Cluster with active multi-order contract
  {
    object: "kubernetes_cluster",
    kubernetes_api_url: "https://k8s-api-2.example.com",
    name: "active-multi-cluster",
    kubernetes_namespace: "prod",
    kubernetes_ca_cert: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t",
    contract: MOCK_CONTRACTS[1] as UserFacingCluster["contract"], // active-multi contract
  },

  // 3. Cluster with upcoming multi-order contract
  {
    object: "kubernetes_cluster",
    kubernetes_api_url: "https://k8s-api-3.example.com",
    name: "upcoming-multi-cluster",
    kubernetes_namespace: "staging",
    kubernetes_ca_cert: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t",
    contract: MOCK_CONTRACTS[2] as UserFacingCluster["contract"], // upcoming-multi contract
  },

  // 4. Cluster with expired contract
  {
    object: "kubernetes_cluster",
    kubernetes_api_url: "https://k8s-api-4.example.com",
    name: "expired-cluster",
    kubernetes_namespace: "default",
    kubernetes_ca_cert: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t",
    contract: MOCK_CONTRACTS[3] as UserFacingCluster["contract"], // expired contract
  },

  // 5. Cluster with mixed state contract
  {
    object: "kubernetes_cluster",
    kubernetes_api_url: "https://k8s-api-5.example.com",
    name: "mixed-states-cluster",
    kubernetes_namespace: "mixed",
    kubernetes_ca_cert: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t",
    contract: MOCK_CONTRACTS[4] as UserFacingCluster["contract"], // mixed-states contract
  },

  // 6. Cluster with colocated contract
  {
    object: "kubernetes_cluster",
    kubernetes_api_url: "https://k8s-api-6.example.com",
    name: "colocated-cluster",
    kubernetes_namespace: "colocated",
    kubernetes_ca_cert: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t",
    contract: MOCK_CONTRACTS[5] as UserFacingCluster["contract"], // colocated contract
  },

  // 7. Cluster without contract (for testing non-contract clusters)
  {
    object: "kubernetes_cluster",
    kubernetes_api_url: "https://k8s-api-7.example.com",
    name: "no-contract-cluster",
    kubernetes_namespace: "default",
    kubernetes_ca_cert: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t",
  },
];
