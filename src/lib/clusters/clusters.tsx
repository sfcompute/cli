import type { Command } from "commander";
import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { decryptSecret, getKeys, regenerateKeys } from "./keys.tsx";
import { createKubeconfig, KUBECONFIG_PATH, syncKubeconfig } from "./kubeconfig.ts";
import yaml from "yaml";
import { Box, render, Text } from "ink";
import React from "react";
import { Row } from "../Row.tsx";

export function registerClusters(program: Command) {
  const clusters = program
    .command("clusters")
    .alias("cls")
    .alias("cluster")
    .description("Manage clusters");

  // sf clusters ls|list
  clusters
    .command("list")
    .alias("ls")
    .description("List clusters")
    .option("--json", "Output in JSON format")
    .option("--token <token>", "API token")
    .action(async (options) => {
      await listClustersAction({
        returnJson: options.json,
        token: options.token,
      });
    });

  const users = clusters
    .command("users")
    .description("Manage cluster users");

  users
    .command("add")
    .description("Add a user to a cluster")
    .requiredOption("--cluster <cluster>", "name of the cluster")
    .requiredOption("--user <username>", "Username to add")
    .option("--json", "Output in JSON format")
    .option("--token <token>", "API token")
    .option("--regenerate-keys", "Regenerate encryption keys for the user")
    .action(async (options) => {
      await addClusterUserAction({
        clusterName: options.cluster,
        username: options.user,
        token: options.token,
        shouldRegenerateKeys: options.regenerateKeys,
      });
    });

  users
    .command("rm <id>")
    .description("Remove a user from a cluster")
    .option("--json", "Output in JSON format")
    .option("--token <token>", "API token")
    .action(async (id, options) => {
      await removeClusterUserAction({
        id,
        token: options.token,
      });
    });

  users
    .command("list")
    .description("List users in a cluster")
    .option("--token <token>", "API token")
    .action(async (options) => {
      await listClusterUsers({ token: options.token });
    });

  clusters
    .command("kubeconfig")
    .description("Generate kubeconfig")
    .option("--token <token>", "API token")
    .option("--print", "Print the kubeconfig instead of writing it to disk")
    .action(async (options) => {
      await kubeconfigAction({
        token: options.token,
        print: options.print,
      });
    });
}

function ClusterDisplay({ clusters }: { clusters: Array<{ name: string, kubernetes_api_url: string, kubernetes_namespace: string }> }) {
  return (
    <Box flexDirection="column">
      {clusters.map(cluster => (
        <Box key={cluster.name} flexDirection="column">
          <Box gap={1}>
            <Text color="green">{cluster.name}</Text>
          </Box>
          <Row headWidth={11} head="k8s api" value={cluster.kubernetes_api_url} />
          <Row headWidth={11} head="namespace" value={cluster.kubernetes_namespace} />
        </Box>
      ))}
    </Box>
  );
}

async function listClustersAction({ returnJson, token }: { returnJson?: boolean, token?: string }) {
  const api = await apiClient(token);

  const { data, error, response } = await api.GET("/v0/clusters");

  if (!response.ok) {
    return logAndQuit(`Failed to get clusters: ${response.statusText}`);
  }

  if (!data) {
    console.error(error);
    return logAndQuit(
      `Failed to get clusters: Unexpected response from server: ${response}`
    );
  }

  if (returnJson) {
    console.log(JSON.stringify(data.data, null, 2));
  } else {
    render(<ClusterDisplay clusters={data.data.map(cluster => ({
      name: cluster.name,
      kubernetes_api_url: cluster.kubernetes_api_url || "",
      kubernetes_namespace: cluster.kubernetes_namespace || "",
    }))} />);
  }
}

function ClusterUserDisplay({ users }: { users: Array<{ name: string, is_usable: boolean, cluster: string }> }) {
  return (
    <Box flexDirection="column">
      {users.map(user => (
        <Box key={user.name} flexDirection="column">
          <Box gap={1}>
            <Text color="green">{user.name}</Text>
          </Box>
          <Row headWidth={11} head="status" value={user.is_usable ? "ready" : "not ready"} />
          <Row headWidth={11} head="cluster" value={user.cluster} />
        </Box>
      ))}
    </Box>
  );
}

async function listClusterUsers({ token }: { token?: string }) {
  const api = await apiClient(token);

  const { data, error, response } = await api.GET("/v0/credentials");

  if (!response.ok) {
    return logAndQuit(`Failed to get users in cluster: ${response.statusText}`);
  }

  if (!data) {
    console.error(error);
    return logAndQuit(
      `Failed to get users in cluster: Unexpected response from server: ${response}`
    );
  }

  const k8s = data.data.filter(credential => credential.object === "k8s_credential");

  const users: Array<{ name: string, is_usable: boolean, cluster: string }> = [];
  for (const k of k8s) {
    const is_usable: boolean = Boolean(k.encrypted_token && k.nonce && k.ephemeral_pubkey);
    users.push({
      name: k.username || "",
      is_usable,
      cluster: k.cluster?.name || "",
    });
  }

  render(<ClusterUserDisplay users={users} />);
}

async function addClusterUserAction({
  clusterName,
  username,
  token,
  shouldRegenerateKeys,
}: {
  clusterName: string;
  username: string;
  token?: string;
  shouldRegenerateKeys?: boolean;
}) {
  const api = await apiClient(token);
  if (shouldRegenerateKeys) {
    await regenerateKeys();
  }

  const { publicKey } = await getKeys();

  const { data, error, response } = await api.POST("/v0/credentials", {
    body: {
      username,
      label: "foo",
      cluster: clusterName,
      object: "k8s_credential",
      pubkey: publicKey,
    }
  });

  if (!response.ok) {
    return logAndQuit(`Failed to add user to cluster: ${response.statusText}`);
  }

  if (!data) {
    console.error(error);
    return logAndQuit(
      `Failed to add user to cluster: Unexpected response from server: ${response}`
    );
  }

  render(
    <Box flexDirection="column" gap={1} paddingBottom={1}>
      <Text>User added to cluster</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Text dimColor># In a moment you can sync your kubeconfig by running</Text>
        <Text color="yellow">sf clusters kubeconfig</Text>
      </Box>
    </Box>
  );
}

async function removeClusterUserAction({ id, token }: { id: string, token?: string }) {
  const api = await apiClient(token);

  const { data, error, response } = await api.DELETE("/v0/credentials/{id}", {
    params: {
      path: {
        id,
      },
    },
  });

  if (!response.ok) {
    return logAndQuit(`Failed to remove user from cluster: ${response.statusText}`);
  }

  if (!data) {
    console.error(error);
    return logAndQuit(
      `Failed to remove user from cluster: Unexpected response from server: ${response}`
    );
  }

  console.log(data);
}

async function kubeconfigAction({ token, print }: { token?: string, print?: boolean }) {
  const api = await apiClient(token);

  const { data, error, response } = await api.GET("/v0/credentials");

  if (!response.ok) {
    return logAndQuit(`Failed to list users in cluster: ${response.statusText}`);
  }

  if (!data) {
    console.error(error);
    return logAndQuit(
      `Failed to list users in cluster: Unexpected response from server: ${response}`
    );
  }

  if (data.data.length === 0) {
    console.log("No users found");
    return;
  }

  const { privateKey } = await getKeys();
  const clusters: Array<{ name: string, certificateAuthorityData: string, kubernetesApiUrl: string, namespace?: string }> = [];
  const users: Array<{ name: string, token: string }> = [];
  for (const item of data.data) {
    if (item.object !== "k8s_credential") {
      continue;
    }
    if (!item.encrypted_token || !item.nonce || !item.ephemeral_pubkey) {
      continue;
    }
    const res = decryptSecret({
      encrypted: item.encrypted_token,
      secretKey: privateKey,
      nonce: item.nonce,
      ephemeralPublicKey: item.ephemeral_pubkey,
    });

    if (!item.cluster) {
      console.error("Cluster is undefined");
      continue;
    }

    clusters.push({
      name: item.cluster.name,
      kubernetesApiUrl: item.cluster.kubernetes_api_url || "",
      certificateAuthorityData: item.cluster.kubernetes_ca_cert || "",
      namespace: item.cluster.kubernetes_namespace || "",
    });

    users.push({
      name: item.username || "",
      token: res,
    });
  }

  const kubeconfig = createKubeconfig({ clusters, users });

  if (print) {
    console.log(yaml.stringify(kubeconfig));
  } else {
    await syncKubeconfig(kubeconfig);
    console.log(`Config written to ${KUBECONFIG_PATH}`);
  }
}
