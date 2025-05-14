import * as console from "node:console";
import type { BaseEncryptedCredential } from "./credentialTypes.ts";
import {
  isKubeconfigCredential,
  isTokenCredential,
  isValidK8sCredential,
} from "./credentialTypes.ts";
import { decryptSecret } from "./keys.tsx";

/**
 * A type representing a successfully decrypted credential
 */
export type DecryptedCredential = {
  token?: string;
  kubeconfig?: string;
  username: string;
  cluster?: string;
  id: string;
};

/**
 * Attempts to decrypt a credential
 * @param credential Credential to decrypt
 * @param privateKey Private key to use for decryption
 * @returns Object containing decrypted token or kubeconfig and credential metadata, or null if decryption fails
 */
export function tryDecryptCredential(
  credential: BaseEncryptedCredential,
  privateKey: string,
): DecryptedCredential | null {
  if (!isValidK8sCredential(credential)) {
    return null;
  }

  try {
    const { username = "", id, cluster } = credential;
    const clusterName = cluster?.name || "";

    if (isTokenCredential(credential)) {
      const token = decryptSecret({
        encrypted: credential.encrypted_token,
        secretKey: privateKey,
        nonce: credential.nonce,
        ephemeralPublicKey: credential.ephemeral_pubkey,
      });

      return {
        token,
        username,
        cluster: clusterName,
        id,
      };
    } else if (isKubeconfigCredential(credential)) {
      const kubeconfig = decryptSecret({
        encrypted: credential.encrypted_kubeconfig,
        secretKey: privateKey,
        nonce: credential.nonce,
        ephemeralPublicKey: credential.ephemeral_pubkey,
      });

      return {
        kubeconfig,
        username,
        cluster: clusterName,
        id,
      };
    }

    // If we reach here, the credential doesn't have either token or kubeconfig
    console.error(`Credential ${id} has neither token nor kubeconfig`);
    return null;
  } catch (error) {
    // Provide informative error details but don't throw
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to decrypt credential ${credential.id}: ${errorMessage}`,
    );
    return null;
  }
}

/**
 * Options for filtering credentials
 */
export interface CredentialFilterOptions {
  clusterName?: string;
  username?: string;
  credentialId?: string;
  credentialType?: "token" | "kubeconfig" | "any";
}

/**
 * Filters and decrypts credentials that are relevant for an operation
 * @param credentials List of all credentials
 * @param privateKey Private key for decryption
 * @param filterOptions Optional filtering criteria
 * @returns Array of successfully decrypted credentials
 */
export function filterAndDecryptCredentials(
  credentials: BaseEncryptedCredential[],
  privateKey: string,
  filterOptions?: CredentialFilterOptions,
): Array<DecryptedCredential> {
  // First, filter credentials based on the provided criteria
  const filteredCredentials = credentials.filter((cred) => {
    // Always check for valid k8s credential
    if (!isValidK8sCredential(cred)) {
      return false;
    }

    // Apply additional filters if provided
    if (filterOptions) {
      if (
        filterOptions.clusterName &&
        cred.cluster?.name !== filterOptions.clusterName
      ) {
        return false;
      }

      if (filterOptions.username && cred.username !== filterOptions.username) {
        return false;
      }

      if (
        filterOptions.credentialId && cred.id !== filterOptions.credentialId
      ) {
        return false;
      }

      if (filterOptions.credentialType) {
        if (
          filterOptions.credentialType === "token" && !isTokenCredential(cred)
        ) {
          return false;
        }
        if (
          filterOptions.credentialType === "kubeconfig" &&
          !isKubeconfigCredential(cred)
        ) {
          return false;
        }
      }
    }

    return true;
  });

  // Then decrypt the filtered credentials
  const decryptedCredentials: Array<DecryptedCredential> = [];

  for (const credential of filteredCredentials) {
    const decrypted = tryDecryptCredential(credential, privateKey);
    if (decrypted) {
      decryptedCredentials.push(decrypted);
    }
  }

  return decryptedCredentials;
}
