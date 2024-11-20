import yaml from "yaml";

interface Kubeconfig {
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
