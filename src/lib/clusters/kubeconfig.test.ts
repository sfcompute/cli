// Import the necessary assertion functions from Deno's standard library
import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.112.0/testing/asserts.ts";
import { mergeKubeconfigs, type Kubeconfig } from "./kubeconfig.ts";

// Test cases

Deno.test("Merges clusters without overwriting unique entries", () => {
  const config1: Kubeconfig = {
    apiVersion: "v1",
    clusters: [
      {
        name: "cluster1",
        cluster: {
          "certificate-authority-data": "cert-data-1",
          server: "https://cluster1.example.com",
        },
      },
    ],
    contexts: [],
    users: [],
    "current-context": "",
    kind: "Config",
    preferences: {},
  };

  const config2: Kubeconfig = {
    apiVersion: "v1",
    clusters: [
      {
        name: "cluster2",
        cluster: {
          "certificate-authority-data": "cert-data-2",
          server: "https://cluster2.example.com",
        },
      },
    ],
    contexts: [],
    users: [],
    "current-context": "",
    kind: "Config",
    preferences: {},
  };

  const mergedConfig = mergeKubeconfigs(config1, config2);

  assertEquals(mergedConfig.clusters.length, 2);
  assert(
    mergedConfig.clusters.some((cluster) => cluster.name === "cluster1"),
    "cluster1 should exist in merged clusters"
  );
  assert(
    mergedConfig.clusters.some((cluster) => cluster.name === "cluster2"),
    "cluster2 should exist in merged clusters"
  );
});

Deno.test("Overwrites clusters with the same name", () => {
  const config1: Kubeconfig = {
    apiVersion: "v1",
    clusters: [
      {
        name: "cluster1",
        cluster: {
          "certificate-authority-data": "cert-data-old",
          server: "https://old.example.com",
        },
      },
    ],
    contexts: [],
    users: [],
    "current-context": "",
    kind: "Config",
    preferences: {},
  };

  const config2: Kubeconfig = {
    apiVersion: "v1",
    clusters: [
      {
        name: "cluster1",
        cluster: {
          "certificate-authority-data": "cert-data-new",
          server: "https://new.example.com",
        },
      },
    ],
    contexts: [],
    users: [],
    "current-context": "",
    kind: "Config",
    preferences: {},
  };

  const mergedConfig = mergeKubeconfigs(config1, config2);

  assertEquals(mergedConfig.clusters.length, 1);
  const cluster = mergedConfig.clusters[0];
  assertEquals(cluster.cluster["certificate-authority-data"], "cert-data-new");
  assertEquals(cluster.cluster.server, "https://new.example.com");
});

Deno.test("Merges contexts and users correctly", () => {
  const config1: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [
      {
        name: "context1",
        context: {
          cluster: "cluster1",
          user: "user1",
        },
      },
    ],
    users: [
      {
        name: "user1",
        user: {
          token: "token1",
        },
      },
    ],
    "current-context": "context1",
    kind: "Config",
    preferences: {},
  };

  const config2: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [
      {
        name: "context2",
        context: {
          cluster: "cluster2",
          user: "user2",
        },
      },
    ],
    users: [
      {
        name: "user2",
        user: {
          token: "token2",
        },
      },
    ],
    "current-context": "context2",
    kind: "Config",
    preferences: {},
  };

  const mergedConfig = mergeKubeconfigs(config1, config2);

  assertEquals(mergedConfig.contexts.length, 2);
  assertEquals(mergedConfig.users.length, 2);
  assertEquals(mergedConfig["current-context"], "context2");
});

Deno.test("Merges preferences without losing existing settings", () => {
  const config1: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [],
    users: [],
    "current-context": "",
    kind: "Config",
    preferences: {
      color: "blue",
      fontSize: 12,
    },
  };

  const config2: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [],
    users: [],
    "current-context": "",
    kind: "Config",
    preferences: {
      theme: "dark",
      fontSize: 14,
    },
  };

  const mergedConfig = mergeKubeconfigs(config1, config2);

  assertEquals(mergedConfig.preferences.color, "blue");
  assertEquals(mergedConfig.preferences.theme, "dark");
  assertEquals(mergedConfig.preferences.fontSize, 14); // Should take fontSize from config2
});

Deno.test("Keeps apiVersion and kind from config2 if present", () => {
  const config1: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [],
    users: [],
    "current-context": "",
    kind: "ConfigOld",
    preferences: {},
  };

  const config2: Kubeconfig = {
    apiVersion: "v2",
    clusters: [],
    contexts: [],
    users: [],
    "current-context": "",
    kind: "ConfigNew",
    preferences: {},
  };

  const mergedConfig = mergeKubeconfigs(config1, config2);

  assertEquals(mergedConfig.apiVersion, "v2");
  assertEquals(mergedConfig.kind, "ConfigNew");
});

Deno.test(
  "Retains existing configurations when config2 has empty arrays",
  () => {
    const config1: Kubeconfig = {
      apiVersion: "v1",
      clusters: [
        {
          name: "cluster1",
          cluster: {
            "certificate-authority-data": "data1",
            server: "https://cluster1.example.com",
          },
        },
      ],
      contexts: [
        {
          name: "context1",
          context: {
            cluster: "cluster1",
            user: "user1",
          },
        },
      ],
      users: [
        {
          name: "user1",
          user: {
            token: "token1",
          },
        },
      ],
      "current-context": "context1",
      kind: "Config",
      preferences: {},
    };

    const config2: Kubeconfig = {
      apiVersion: "",
      clusters: [],
      contexts: [],
      users: [],
      "current-context": "",
      kind: "",
      preferences: {},
    };

    const mergedConfig = mergeKubeconfigs(config1, config2);

    assertEquals(mergedConfig.clusters.length, 1);
    assertEquals(mergedConfig.contexts.length, 1);
    assertEquals(mergedConfig.users.length, 1);
    assertEquals(mergedConfig.apiVersion, "v1");
    assertEquals(mergedConfig.kind, "Config");
    assertEquals(mergedConfig["current-context"], "context1");
  }
);

Deno.test("Handles optional fields like namespace correctly", () => {
  const config1: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [
      {
        name: "context1",
        context: {
          cluster: "cluster1",
          user: "user1",
          namespace: "namespace1",
        },
      },
    ],
    users: [],
    "current-context": "context1",
    kind: "Config",
    preferences: {},
  };

  const config2: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [
      {
        name: "context1",
        context: {
          cluster: "cluster1",
          user: "user1",
          namespace: "namespace2",
        },
      },
    ],
    users: [],
    "current-context": "context1",
    kind: "Config",
    preferences: {},
  };

  const mergedConfig = mergeKubeconfigs(config1, config2);

  assertEquals(mergedConfig.contexts.length, 1);
  assertEquals(
    mergedConfig.contexts[0].context.namespace,
    "namespace2",
    "Namespace should be updated from config2"
  );
});

Deno.test("Merges when one of the configs is undefined", () => {
  const config1: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [],
    users: [],
    "current-context": "",
    kind: "Config",
    preferences: {},
  };

  const config2: Kubeconfig | undefined = undefined;

  const mergedConfig = mergeKubeconfigs(config1, config2 ?? ({} as Kubeconfig));

  assertEquals(mergedConfig.apiVersion, "v1");
  assertEquals(mergedConfig.clusters.length, 0);
});

Deno.test("Merges user credentials without losing any fields", () => {
  const config1: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [],
    users: [
      {
        name: "user1",
        user: {
          token: "old-token",
          "client-certificate-data": "old-cert-data",
        },
      },
    ],
    "current-context": "",
    kind: "Config",
    preferences: {},
  };

  const config2: Kubeconfig = {
    apiVersion: "v1",
    clusters: [],
    contexts: [],
    users: [
      {
        name: "user1",
        user: {
          token: "new-token",
          "client-key-data": "new-key-data",
        },
      },
    ],
    "current-context": "",
    kind: "Config",
    preferences: {},
  };

  const mergedConfig = mergeKubeconfigs(config1, config2);

  assertEquals(mergedConfig.users.length, 1);
  const user = mergedConfig.users[0];
  assertEquals(user.user.token, "new-token");
  assertEquals(user.user["client-certificate-data"], undefined);
  assertEquals(user.user["client-key-data"], "new-key-data");
});
