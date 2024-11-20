import type { Command } from "commander";
import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { generateCSR, generateKeyPair } from "./csr.ts";

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
    .action(async (options) => {
      await listClustersAction({
        returnJson: options.json,
      });
    });

  // sf clusters users add --cluster <cluster_id> [--user <username>]
  clusters
    .command("users add")
    .description("Add a user to a cluster")
    .requiredOption("--cluster <cluster_id>", "ID of the cluster")
    .requiredOption("--user <username>", "Username to add")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      await addClusterUserAction({
        clusterId: options.cluster,
        username: options.user,
      });
    });

  // sf clusters users rm <id>
  clusters
    .command("users rm <id>")
    .description("Remove a user from a cluster")
    .option("--json", "Output in JSON format")
    .action(async (id, options) => {
      await removeClusterUserAction({
        id,
      });
    });

  // sf clusters users ls|list
  clusters
    .command("users list")
    .description("List users in a cluster")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      await listClusterUsersAction({ returnJson: options.json });
    });
}

async function listClustersAction({ returnJson }: { returnJson?: boolean }) {
  const api = await apiClient();

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
    console.log(data.data);
  }
}

async function saveKeyAndCrtToFile({
  privateKey,
  crt,
  username,
}: {
  privateKey: string;
  crt: string;
  username: string;
}) {
  // Save keys to ~/.sfcompute/keys directory
  const homeDir = Deno.env.get("HOME");
  if (!homeDir) {
    return logAndQuit("Could not determine home directory, please set HOME environment variable");
  }

  const keyDir = `${homeDir}/.sfcompute/keys`;
  const keyPrefix = username;

  try {
    // Create keys directory if it doesn't exist
    await Deno.mkdir(keyDir, { recursive: true });

    // Save private key with restricted permissions
    const keyPath = `${keyDir}/${keyPrefix}.key`;
    await Deno.writeTextFile(keyPath, privateKey);
    await Deno.chmod(keyPath, 0o600);

    // Save public key
    const certPath = `${keyDir}/${keyPrefix}.crt`;
    await Deno.writeTextFile(certPath, crt);
  } catch (err) {
    return logAndQuit(`Failed to save keys: ${err}`);
  }
}

async function addClusterUserAction({
  clusterId,
  username,
}: {
  clusterId: string;
  username: string;
}) {
  const api = await apiClient();

  if (!clusterId.startsWith("clus_")) {
    return logAndQuit(
      `Invalid cluster ID ${clusterId}, it should start with 'clus_'`,
    );
  }

  const { privateKey, publicKey } = await generateKeyPair();
  const csr = generateCSR(privateKey, username, username);

  await saveKeyAndCrtToFile({
    privateKey,
    crt: publicKey,
    username,
  });

  const { data, error, response } = await api.POST("/v0/credentials", {
    body: {
      object: "k8s_credential",
      csr,
      username,
      cluster_id: clusterId,
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

  console.log(data);
}

async function removeClusterUserAction({ id }: { id: string }) {
  const api = await apiClient();

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

async function listClusterUsersAction({ returnJson }: { returnJson?: boolean }) {
  const api = await apiClient();

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

  console.log(data);
}
