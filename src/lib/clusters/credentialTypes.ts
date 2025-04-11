import type { operations } from "../../schema.ts";

type CredentialsResponse =
  operations["getV0Credentials"]["responses"][200]["content"]["application/json"];
type CredentialsList = CredentialsResponse["data"];
type BaseK8sCredential = Extract<
  CredentialsList[number],
  { object: "k8s_credential" }
>;

export interface K8sCredential extends BaseK8sCredential {
  cluster_type?: string;
  encrypted_kubeconfig?: string;
}

/**
 * Check if the credential is a vcluster credential
 * @param cred - The credential to check
 * @returns True if the credential is a vcluster credential, false otherwise
 */
export const isVClusterCredential = (
  cred: CredentialsList[number]
): cred is K8sCredential & {
  encrypted_kubeconfig: string;
  nonce: string;
  ephemeral_pubkey: string;
} => {
  return (
    cred.object === "k8s_credential" &&
    (cred as K8sCredential).cluster_type === "vcluster" &&
    typeof (cred as K8sCredential).encrypted_kubeconfig === "string" &&
    typeof cred.nonce === "string" &&
    typeof cred.ephemeral_pubkey === "string"
  );
};
