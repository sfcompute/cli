import type { Command } from "@commander-js/extra-typings";
import { Box, render, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import * as console from "node:console";
import { clearInterval, setInterval, setTimeout } from "node:timers";
import React, { useEffect, useRef, useState } from "react";
import yaml from "yaml";
import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { Row } from "../Row.tsx";
import { isVClusterCredential, type K8sCredential } from "./credentialTypes.ts";
import { decryptSecret, getKeys, regenerateKeys } from "./keys.tsx";
import {
  createKubeconfig,
  KUBECONFIG_PATH,
  syncKubeconfig,
} from "./kubeconfig.ts";
import type { UserFacingCluster } from "./types.ts";
import {
  isValidRFC1123Subdomain,
  sanitizeToRFC1123Subdomain,
} from "./utils.ts";

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
    .alias("user")
    .description("Manage cluster users");

  users
    .command("add")
    .description("Add a user to a cluster (always regenerates keys)")
    .requiredOption("--cluster <cluster>", "name of the cluster")
    .requiredOption(
      "--user <username>",
      "Username to add. Must follow RFC 1123 subdomain rules (lowercase alphanumeric with hyphens). Non-compliant names will be automatically sanitized.",
    )
    .option("--json", "Output in JSON format")
    .option("--token <token>", "API token")
    .option("--print", "Print the kubeconfig instead of syncing to file")
    .action(async (options) => {
      await addClusterUserAction({
        clusterName: options.cluster,
        username: options.user,
        token: options.token,
        print: options.print,
      });
    });

  users
    .command("rm <id>")
    .alias("remove")
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
    .alias("ls")
    .description("List users in a cluster")
    .option("--token <token>", "API token")
    .action(async (options) => {
      await listClusterUsers({ token: options.token });
    });

  clusters
    .command("config")
    .description("Generate or sync kubeconfig")
    .option("--token <token>", "API token")
    .option("--print", "Print the config instead of syncing to file")
    .action(async (options) => {
      await kubeconfigAction({
        token: options.token,
        print: options.print,
      });
    });
}

function ClusterDisplay({ clusters }: { clusters: Array<UserFacingCluster> }) {
  return (
    <Box flexDirection="column" gap={2}>
      {clusters.map((cluster, index) => (
        <ClusterRow cluster={cluster} key={`${cluster.name}-${index}`} />
      ))}
    </Box>
  );
}

const ClusterRow = ({ cluster }: { cluster: UserFacingCluster }) => {
  if (cluster.contract) {
    return <ClusterRowWithContracts cluster={cluster} />;
  }

  return (
    <Box flexDirection="column">
      <Row headWidth={11} head="name" value={cluster.name} />
      <Row
        headWidth={11}
        head="k8s api"
        value={cluster.kubernetes_api_url || ""}
      />
      <Row
        headWidth={11}
        head="namespace"
        value={cluster.kubernetes_namespace}
      />
    </Box>
  );
};

const COLUMN_WIDTH = 11;

const ClusterRowWithContracts = ({
  cluster,
}: {
  cluster: UserFacingCluster;
}) => {
  if (!cluster.contract) {
    return null;
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Box>
        <Text color="black" backgroundColor="cyan">
          {" "}
          {cluster.contract.id}
          {" "}
        </Text>
      </Box>

      <Box flexDirection="column">
        <Row headWidth={COLUMN_WIDTH} head="Name" value={cluster.name} />
        <Row
          headWidth={COLUMN_WIDTH}
          head="K8s API"
          value={cluster.kubernetes_api_url || ""}
        />
        <Row
          headWidth={COLUMN_WIDTH}
          head="Namespace"
          value={cluster.kubernetes_namespace}
        />

        <Row
          headWidth={COLUMN_WIDTH}
          head="Add User"
          value={`sf clusters users add --cluster ${cluster.name} --user myuser`}
        />
        <Row
          headWidth={COLUMN_WIDTH}
          head="Extend"
          value={`sf extend --contract ${cluster.contract.id} --duration 1h`}
        />
      </Box>
    </Box>
  );
};

async function listClustersAction({
  returnJson,
  token,
}: {
  returnJson?: boolean;
  token?: string;
}) {
  const api = await apiClient(token);

  const { data, error, response } = await api.GET("/v0/clusters");

  if (!response.ok) {
    // FIXME: This is a hack to get the error code and message, fix OpenAPI schema to include this
    const rawError = error as {
      code?: string;
      message?: string;
      details?: unknown;
    } | undefined;
    return logAndQuit(
      `Failed to get clusters: HTTP ${response.status} - ${
        rawError?.code || ""
      }: ${rawError?.message || response.statusText} ${
        rawError?.details || ""
      } (${response.url})`,
    );
  }

  if (!data) {
    console.error(error);
    return logAndQuit(
      `Failed to get clusters: Unexpected response from server: ${response}`,
    );
  }

  if (data.data.length === 0) {
    console.log("You don't have any clusters. You can buy one by running");
    console.log("\tsf buy");
    return;
  }

  if (returnJson) {
    console.log(JSON.stringify(data.data, null, 2));
  } else {
    render(
      <ClusterDisplay
        clusters={data.data
          .filter(
            (cluster) =>
              cluster.contract?.status === "active" || !cluster.contract,
          )
          .map(
            (cluster) =>
              ({
                ...cluster,
                // @ts-expect-error - ignore
                state: cluster.contract?.state || "Active",
              }) as UserFacingCluster,
          )}
      />,
    );
  }
}

function ClusterUserDisplay({
  users,
}: {
  users: Array<{
    id: string;
    name: string;
    is_usable: boolean;
    cluster: string;
  }>;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      {users.map((user) => (
        <Box key={user.id} flexDirection="column">
          <Row headWidth={11} head="name" value={user.name} />
          <Row headWidth={11} head="id" value={user.id} />
          <Row
            headWidth={11}
            head="status"
            value={user.is_usable ? "ready" : "not ready"}
          />
          <Row headWidth={11} head="cluster" value={user.cluster} />
        </Box>
      ))}
    </Box>
  );
}

async function isCredentialReady(id: string) {
  const api = await apiClient();
  const { data } = await api.GET("/v0/credentials");

  const cred = data?.data?.find?.(
    (credential) =>
      credential.id === id && credential.object === "k8s_credential",
  );

  if (!cred) {
    return false;
  }

  if (cred.object !== "k8s_credential") {
    return false;
  }

  return Boolean(
    (cred.encrypted_token && cred.nonce && cred.ephemeral_pubkey) ||
      (cred as K8sCredential).encrypted_kubeconfig,
  );
}

async function listClusterUsers({ token }: { token?: string }) {
  const api = await apiClient(token);

  const { data, error, response } = await api.GET("/v0/credentials");

  if (!response.ok) {
    return logAndQuit(`Failed to get users in cluster: ${response.statusText}`);
  }

  if (!data?.data) {
    console.error(error);
    return logAndQuit(
      `Failed to get users in cluster: Unexpected response from server: ${response}`,
    );
  }

  const k8s = data.data.filter(
    (credential) => credential.object === "k8s_credential",
  );

  const users: Array<{
    id: string;
    name: string;
    is_usable: boolean;
    cluster: string;
  }> = [];
  for (const k of k8s) {
    const is_usable: boolean = Boolean(
      (k.encrypted_token && k.nonce && k.ephemeral_pubkey) ||
        (k.encrypted_kubeconfig && k.nonce && k.ephemeral_pubkey &&
          k.cluster_type === "vcluster"),
    );
    if (k.id) {
      users.push({
        id: k.id,
        name: k.username || "",
        is_usable,
        cluster: k.cluster?.name || "",
      });
    }
  }

  render(<ClusterUserDisplay users={users} />);
}

function UserAddedDisplay(props: {
  id: string;
  username: string;
  print?: boolean;
}) {
  const [isReady, setIsReady] = useState(false);
  const { exit } = useApp();
  const actionExecutedRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const interval = setInterval(async () => {
      const ready = await isCredentialReady(props.id);
      if (ready && !actionExecutedRef.current) {
        clearInterval(interval);
        setIsReady(true);
        actionExecutedRef.current = true;

        // Once ready, sync or print config before exiting
        await kubeconfigAction({ print: props.print });
        setTimeout(() => {
          exit();
        }, 0);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [props.id, props.print]);

  if (!isReady) {
    return (
      <Box paddingBottom={1} flexDirection="column">
        <Box gap={1}>
          <Text>✓</Text>
          <Text>
            User <Text color="green">{props.username}</Text> is provisioning...
          </Text>
        </Box>

        <Box gap={1} paddingBottom={1}>
          <Spinner type="arc" />
          <Text>
            Waiting for user to be ready, this should take about 5 minutes...
          </Text>
        </Box>

        <Box paddingLeft={2} flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text dimColor>
              # Once ready, your kubeconfig will be updated automatically.
            </Text>
            <Text dimColor>
              # If you prefer to manage kubeconfig manually, you could have run:
            </Text>
            <Text color="yellow">sf clusters config --print</Text>
          </Box>

          <Box flexDirection="column">
            <Text dimColor>
              # You can also check the status of the user by running
            </Text>
            <Text color="yellow">sf clusters users list</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1} paddingBottom={1}>
      <Box gap={1}>
        <Text>✓</Text>
        <Text>User added to cluster and config updated</Text>
      </Box>
    </Box>
  );
}

async function addClusterUserAction({
  clusterName,
  username: rawUsername,
  token,
  print,
}: {
  clusterName: string;
  username: string;
  token?: string;
  print?: boolean;
}) {
  const api = await apiClient(token);

  // Always regenerate keys before creating a new user
  await regenerateKeys();

  const { publicKey } = await getKeys();

  const username = isValidRFC1123Subdomain(rawUsername)
    ? rawUsername
    : sanitizeToRFC1123Subdomain(rawUsername);

  const { data, error, response } = await api.POST("/v0/credentials", {
    body: {
      username,
      label: "foo",
      cluster: clusterName,
      object: "k8s_credential",
      pubkey: publicKey,
    },
  });

  if (!response.ok) {
    return logAndQuit(
      `Failed to add user to cluster: HTTP ${response.status} - ${response.statusText}`,
    );
  }

  if (!data?.id) {
    console.error(error);
    return logAndQuit(
      `Failed to add user to cluster: Unexpected response from server: ${response}`,
    );
  }

  // Render UI that waits for the user to become ready, then sync/print config
  render(<UserAddedDisplay id={data.id} username={username} print={print} />);
}

async function removeClusterUserAction({
  id,
  token,
}: {
  id: string;
  token?: string;
}) {
  const api = await apiClient(token);

  const { data, error, response } = await api.DELETE(
    "/v0/credentials/{id}",
    {
      params: {
        path: {
          id,
        },
      },
    },
  );

  if (!response.ok) {
    return logAndQuit(
      `Failed to remove user from cluster: ${response.statusText}`,
    );
  }

  if (!data) {
    console.error(error);
    return logAndQuit(
      `Failed to remove user from cluster: Unexpected response from server: ${response}`,
    );
  }

  console.log(data);
}

async function kubeconfigAction({
  token,
  print,
}: {
  token?: string;
  print?: boolean;
}) {
  const api = await apiClient(token);

  const { data, error, response } = await api.GET("/v0/credentials");

  if (!response.ok) {
    return logAndQuit(
      `Failed to list users in cluster: ${response.statusText}`,
    );
  }

  if (!data) {
    console.error(error);
    return logAndQuit(
      `Failed to list users in cluster: Unexpected response from server: ${response}`,
    );
  }

  if (!data?.data?.length) {
    console.log("No users found");
    return;
  }

  const { privateKey } = await getKeys();
  const clusters: Array<{
    name: string;
    certificateAuthorityData: string;
    kubernetesApiUrl: string;
    namespace?: string;
    cluster_type?: string;
  }> = [];
  const users: Array<{
    name: string;
    token?: string;
    kubeconfig?: string;
  }> = [];

  for (const item of data.data) {
    if (item.object !== "k8s_credential") {
      continue;
    }

    if (!item.nonce || !item.ephemeral_pubkey) {
      continue;
    }

    // TODO(K8S-33): This credential handling logic needs to be rewritten to support
    // proper account-to-user associations.
    // The current implementation doesn't properly disambiguate credentials
    // when multiple users exist in a team context.
    // See: https://linear.app/sfcompute/issue/K8S-33

    // Handle vcluster with encrypted_kubeconfig
    const credential = item as K8sCredential;
    if (isVClusterCredential(credential)) {
      try {
        const decryptedKubeConfig = decryptSecret({
          encrypted: credential.encrypted_kubeconfig,
          secretKey: privateKey,
          nonce: credential.nonce,
          ephemeralPublicKey: credential.ephemeral_pubkey,
        });

        users.push({
          name: item.username || "",
          kubeconfig: decryptedKubeConfig || "",
        });
      } catch (_err) {
        // Silently continue on decryption errors
        continue;
      }
    } else if (item.encrypted_token) {
      try {
        const decryptedToken = decryptSecret({
          encrypted: item.encrypted_token,
          secretKey: privateKey,
          nonce: item.nonce,
          ephemeralPublicKey: item.ephemeral_pubkey,
        });

        users.push({
          name: item.username || "",
          token: decryptedToken || "",
        });
      } catch (_err) {
        // Silently continue on decryption errors
        continue;
      }
    }

    if (!item.cluster) {
      continue;
    }

    clusters.push({
      name: item.cluster.name!,
      kubernetesApiUrl: item.cluster.kubernetes_api_url || "",
      certificateAuthorityData: item.cluster.kubernetes_ca_cert || "",
      namespace: item.cluster.kubernetes_namespace || "",
      cluster_type: credential.cluster_type || "",
    });
  }

  // Add check for successful decryption of at least one credential
  if (users.length === 0) {
    return logAndQuit(
      "Could not decrypt k8s credentials. Please report this unexpected issue: https://sfcompute.com/contact",
    );
  }

  const kubeconfigData = createKubeconfig({ clusters, users });

  if (print) {
    console.log(yaml.stringify(kubeconfigData));
  } else {
    await syncKubeconfig(kubeconfigData);
    console.log(`Config written to ${KUBECONFIG_PATH}`);
  }
}
