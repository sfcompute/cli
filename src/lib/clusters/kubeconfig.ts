import * as console from "node:console";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";

export interface Kubeconfig {
  apiVersion: string;
  clusters: {
    name: string;
    cluster: {
      "certificate-authority-data"?: string;
      server: string;
    };
  }[];
  contexts: {
    name: string;
    context: {
      cluster: string;
      user: string;
      namespace?: string;
    };
  }[];
  users: {
    name: string;
    user: {
      token?: string;
      "client-certificate-data"?: string;
      "client-key-data"?: string;
    };
  }[];
  "current-context": string;
  kind: string;
  preferences: Record<string, unknown>;
}

export function createKubeconfig(props: {
  clusters: Array<{
    name: string;
    certificateAuthorityData: string;
    kubernetesApiUrl: string;
    namespace?: string;
    cluster_type?: string;
  }>;
  users: Array<{
    name: string;
    token?: string;
    kubeconfig?: string;
  }>;
  currentContext?: {
    clusterName: string;
    userName: string;
  };
}) {
  const { clusters, users, currentContext } = props;

  // Initialize the base kubeconfig
  const kubeconfig: Kubeconfig = {
    apiVersion: "v1",
    kind: "Config",
    preferences: {},
    clusters: [],
    users: [],
    contexts: [],
    "current-context": "",
  };

  // Process users with direct kubeconfig first
  const processedUsers = new Set<string>();
  const processedClusters = new Set<string>();

  // First, process any users that have a full kubeconfig
  for (const user of users) {
    if (user.kubeconfig) {
      try {
        // Parse the user's kubeconfig
        const userKubeconfig = yaml.parse(user.kubeconfig) as Kubeconfig;

        // Merge clusters from user kubeconfig
        if (userKubeconfig.clusters) {
          for (const cluster of userKubeconfig.clusters) {
            if (!processedClusters.has(cluster.name)) {
              kubeconfig.clusters.push(cluster);
              processedClusters.add(cluster.name);
            }
          }
        }

        // Merge users from user kubeconfig
        if (userKubeconfig.users) {
          for (const userEntry of userKubeconfig.users) {
            if (!processedUsers.has(userEntry.name)) {
              kubeconfig.users.push(userEntry);
              processedUsers.add(userEntry.name);
            }
          }
        }

        // Merge contexts from user kubeconfig
        if (userKubeconfig.contexts) {
          for (const context of userKubeconfig.contexts) {
            kubeconfig.contexts.push(context);
          }
        }

        // If the user kubeconfig has a current-context, use it
        if (userKubeconfig["current-context"]) {
          kubeconfig["current-context"] = userKubeconfig["current-context"];
        }
      } catch (error) {
        console.error(
          `Failed to parse kubeconfig for user ${user.name}:`,
          error,
        );
      }
    }
  }

  // Now process the regular clusters and users
  for (const cluster of clusters) {
    // Skip clusters that were already processed from user kubeconfigs
    if (processedClusters.has(cluster.name)) {
      continue;
    }

    kubeconfig.clusters.push({
      name: cluster.name,
      cluster: {
        server: cluster.kubernetesApiUrl,
        "certificate-authority-data": cluster.certificateAuthorityData,
      },
    });
  }

  for (const user of users) {
    // Skip users that were already processed from kubeconfigs
    if (processedUsers.has(user.name) || user.kubeconfig) {
      continue;
    }

    kubeconfig.users.push({
      name: user.name,
      user: {
        token: user.token,
      },
    });
  }

  // Generate contexts for any remaining clusters and users
  for (const cluster of clusters) {
    // Skip if we already have contexts for this cluster from user kubeconfigs
    if (
      kubeconfig.contexts.some((ctx) => ctx.context.cluster === cluster.name)
    ) {
      continue;
    }

    // Try to find a user with the same name as the cluster
    let user = users.find((u) => u.name === cluster.name);

    // If no matching user, default to the first user
    if (!user) {
      user = users[0];
    }

    // Skip if the user doesn't exist in the kubeconfig
    if (!kubeconfig.users.some((u) => u.name === user?.name)) {
      continue;
    }

    const contextName = `${cluster.name}@${user.name}`;

    kubeconfig.contexts.push({
      name: contextName,
      context: {
        cluster: cluster.name,
        user: user.name,
        namespace: cluster.namespace,
      },
    });
  }

  // Set current context based on provided cluster and user names
  if (currentContext) {
    const contextName =
      `${currentContext.clusterName}@${currentContext.userName}`;
    kubeconfig["current-context"] = contextName;
  } else if (kubeconfig.contexts.length > 0 && !kubeconfig["current-context"]) {
    kubeconfig["current-context"] = kubeconfig.contexts[0].name;
  }

  return kubeconfig;
}

export function mergeNamedItems<T extends { name: string }>(
  items1: T[],
  items2: T[],
): T[] {
  const map = new Map<string, T>();
  for (const item of items1) {
    map.set(item.name, item);
  }
  for (const item of items2) {
    map.set(item.name, item); // This will overwrite items with the same name
  }
  return Array.from(map.values());
}

export function mergeKubeconfigs(
  oldConfig: Kubeconfig,
  newConfig?: Kubeconfig,
): Kubeconfig {
  if (!newConfig) {
    return oldConfig;
  }

  return {
    apiVersion: newConfig.apiVersion || oldConfig.apiVersion,
    clusters: mergeNamedItems(
      oldConfig.clusters || [],
      newConfig.clusters || [],
    ),
    contexts: mergeNamedItems(
      oldConfig.contexts || [],
      newConfig.contexts || [],
    ),
    users: mergeNamedItems(oldConfig.users || [], newConfig.users || []),
    "current-context": newConfig["current-context"] ||
      oldConfig["current-context"],
    kind: newConfig.kind || oldConfig.kind,
    preferences: { ...oldConfig.preferences, ...newConfig.preferences },
  };
}

export const KUBECONFIG_PATH = path.join(os.homedir(), ".kube", "config");

export async function loadKubeconfig(): Promise<Kubeconfig | null> {
  try {
    const kubeconfig = await Deno.readTextFile(KUBECONFIG_PATH);
    return yaml.parse(kubeconfig);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // Create .kube directory and empty kubeconfig if they don't exist
      const kubeDir = path.join(os.homedir(), ".kube");
      try {
        await Deno.mkdir(kubeDir, { recursive: true });
      } catch (mkdirError) {
        if (!(mkdirError instanceof Deno.errors.AlreadyExists)) {
          throw mkdirError;
        }
      }

      const emptyConfig: Kubeconfig = {
        apiVersion: "v1",
        kind: "Config",
        clusters: [],
        contexts: [],
        users: [],
        preferences: {},
        "current-context": "",
      };
      await Deno.writeTextFile(KUBECONFIG_PATH, yaml.stringify(emptyConfig));
      return emptyConfig;
    }
    throw error;
  }
}

export async function syncKubeconfig(kubeconfig: Kubeconfig) {
  const currentConfig = await loadKubeconfig();
  if (!currentConfig) {
    await Deno.writeTextFile(KUBECONFIG_PATH, yaml.stringify(kubeconfig));
  } else {
    const merged = mergeKubeconfigs(currentConfig, kubeconfig);
    await Deno.writeTextFile(KUBECONFIG_PATH, yaml.stringify(merged));
  }
}
