import type { Command } from "commander";
import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { getKeys } from "./keys.tsx";
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

  const users = clusters
    .command("users")
    .description("Manage cluster users");

  users
    .command("add")
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

  users
    .command("rm <id>")
    .description("Remove a user from a cluster")
    .option("--json", "Output in JSON format")
    .action(async (id, options) => {
      await removeClusterUserAction({
        id,
      });
    });

  users
    .command("list")
    .alias("ls")
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

  const { publicKey } = await getKeys();

  const { data, error, response } = await api.POST("/v0/credentials", {
    body: {
      object: "k8s_credential",
      pubkey: publicKey,
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

  for (const item of data.data) {
    console.log(item);
  }
}
