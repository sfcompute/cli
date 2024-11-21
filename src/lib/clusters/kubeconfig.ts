import yaml from "yaml";

export interface Kubeconfig {
  apiVersion: string;
  clusters: {
    name: string;
    cluster: {
      "certificate-authority-data": string;
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

export function createKubeConfigString(props: {
  cluster: {
    certificateAuthorityData: string;
    kubernetesApiUrl: string;
    name: string;
    namespace?: string;
  };
  user: {
    token: string;
    name: string;
  };
}) {
  const kubeconfig: Kubeconfig = {
    apiVersion: "v1",
    clusters: [
      {
        name: props.cluster.name,
        cluster: {
          "certificate-authority-data": props.cluster.certificateAuthorityData,
          server: props.cluster.kubernetesApiUrl,
        },
      },
    ],
    contexts: [
      {
        name: props.cluster.name,
        context: {
          cluster: props.cluster.name,
          user: props.user.name,
          namespace: props.cluster.namespace,
        },
      },
    ],
    users: [
      {
        name: props.user.name,
        user: {
          token: props.user.token,
        },
      },
    ],
    "current-context": props.cluster.name,
    kind: "Config",
    preferences: {},
  };

  return yaml.stringify(kubeconfig);
}

export function mergeNamedItems<T extends { name: string }>(
  items1: T[],
  items2: T[]
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
  newConfig: Kubeconfig
): Kubeconfig {
  return {
    apiVersion: newConfig.apiVersion || oldConfig.apiVersion,
    clusters: mergeNamedItems(oldConfig.clusters, newConfig.clusters),
    contexts: mergeNamedItems(oldConfig.contexts, newConfig.contexts),
    users: mergeNamedItems(oldConfig.users, newConfig.users),
    "current-context":
      newConfig["current-context"] || oldConfig["current-context"],
    kind: newConfig.kind || oldConfig.kind,
    preferences: { ...oldConfig.preferences, ...newConfig.preferences },
  };
}
