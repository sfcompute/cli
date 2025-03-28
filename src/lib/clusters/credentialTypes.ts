import type { operations } from "../../schema.ts";

// Extract the k8s_credential type from the generated schema
type CredentialsResponse =
  operations["getV0Credentials"]["responses"][200]["content"]["application/json"];
type CredentialsList = CredentialsResponse["data"];
type BaseK8sCredential = Extract<
  CredentialsList[number],
  { object: "k8s_credential" }
>;

// Extended type with the new fields
export interface K8sCredential extends BaseK8sCredential {
  cluster_type?: string;
  encrypted_kubeconfig?: string;
}
