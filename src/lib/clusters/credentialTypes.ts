import type { components } from "../../schema.ts";

type CredentialsResponse =
  components["schemas"]["frontend_server.ListResponse"];
type CredentialsList = NonNullable<CredentialsResponse["data"]>;
export type K8sCredential = CredentialsList[number];

/**
 * Base interface for encrypted k8s credentials
 */
export interface BaseEncryptedCredential {
  id: string;
  object: string;
  nonce: string;
  ephemeral_pubkey: string;
  username?: string;
  cluster?: {
    name?: string;
    kubernetes_api_url?: string;
    kubernetes_ca_cert?: string;
    kubernetes_namespace?: string;
  };
  cluster_type?: string;
}

/**
 * Interface for credentials using encrypted token
 */
export interface TokenCredential extends BaseEncryptedCredential {
  encrypted_token: string;
}

/**
 * Interface for credentials using encrypted kubeconfig
 */
export interface KubeconfigCredential extends BaseEncryptedCredential {
  encrypted_kubeconfig: string;
}

/**
 * Type guard to check if the credential is a valid k8s credential
 * with necessary encryption fields
 * @param cred - The credential to check
 * @returns True if the credential has required encryption fields
 */
export const isValidK8sCredential = (
  cred: unknown,
): cred is BaseEncryptedCredential => {
  // Type guard pattern matching the structure we expect
  return (
    !!cred &&
    typeof cred === "object" &&
    "object" in cred &&
    "id" in cred &&
    "nonce" in cred &&
    "ephemeral_pubkey" in cred &&
    (cred as { object: unknown }).object === "k8s_credential" &&
    typeof (cred as { id: unknown }).id === "string" &&
    typeof (cred as { nonce: unknown }).nonce === "string" &&
    typeof (cred as { ephemeral_pubkey: unknown }).ephemeral_pubkey ===
      "string" &&
    (
      ("encrypted_token" in cred &&
        typeof (cred as { encrypted_token: unknown }).encrypted_token ===
          "string") ||
      ("encrypted_kubeconfig" in cred &&
        typeof (cred as { encrypted_kubeconfig: unknown })
            .encrypted_kubeconfig === "string")
    )
  );
};

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

/**
 * Check if the credential uses token-based authentication
 * @param cred - The credential to check
 * @returns True if the credential uses token-based authentication
 */
export const isTokenCredential = (
  cred: BaseEncryptedCredential,
): cred is TokenCredential => {
  return typeof (cred as TokenCredential).encrypted_token === "string";
};

/**
 * Check if the credential uses kubeconfig-based authentication
 * @param cred - The credential to check
 * @returns True if the credential uses kubeconfig-based authentication
 */
export const isKubeconfigCredential = (
  cred: BaseEncryptedCredential,
): cred is KubeconfigCredential => {
  return typeof (cred as KubeconfigCredential).encrypted_kubeconfig ===
    "string";
};
