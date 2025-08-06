import type { components } from "../../schema.ts";

type CredentialsResponse =
  components["schemas"]["frontend_server.ListResponse"];
type CredentialsList = NonNullable<CredentialsResponse["data"]>;
export type K8sCredential = CredentialsList[number];

/**
 * Check if the credential is a vcluster credential
 * @param cred - The credential to check
 * @returns True if the credential is a vcluster credential, false otherwise
 */
export const isVClusterCredential = (
  cred: CredentialsList[number],
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
