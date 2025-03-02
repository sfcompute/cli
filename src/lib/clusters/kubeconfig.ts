import path from "node:path";
import os from "node:os";
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
  }>;
  users: Array<{
    name: string;
    token: string;
  }>;
  currentContext?: {
    clusterName: string;
    userName: string;
  };
}) {
  const { clusters, users, currentContext } = props;

  const kubeconfig: Kubeconfig = {
    apiVersion: "v1",
    kind: "Config",
    preferences: {},
    clusters: clusters.map((cluster) => ({
      name: cluster.name,
      cluster: {
        server: cluster.kubernetesApiUrl,
        "certificate-authority-data": cluster.certificateAuthorityData,
      },
    })),
    users: users.map((user) => ({
      name: user.name,
      user: {
        token: user.token,
      },
    })),
    contexts: [],
    "current-context": "",
  };

  // Generate contexts automatically by matching clusters and users by name
  kubeconfig.contexts = clusters.map((cluster) => {
    // Try to find a user with the same name as the cluster
    let user = users.find((u) => u.name === cluster.name);

    // If no matching user, default to the first user
    if (!user && users.length > 0) {
      user = users[0];
    }

    if (!user) {
      return null;
    }

    const contextName = `${cluster.name}@${user.name}`;

    return {
      name: contextName,
      context: {
        cluster: cluster.name,
        user: user.name,
        namespace: cluster.namespace,
      },
    };
  }).filter(Boolean) as Kubeconfig["contexts"];

  // Set current context based on provided cluster and user names
  if (currentContext) {
    const contextName =
      `${currentContext.clusterName}@${currentContext.userName}`;
    kubeconfig["current-context"] = contextName;
  } else if (kubeconfig.contexts.length > 0) {
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
