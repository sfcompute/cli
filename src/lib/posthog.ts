import process from "node:process";
import { PostHog } from "posthog-node";
import { apiClient } from "../apiClient.ts";
import { loadConfig, saveConfig } from "../helpers/config.ts";
import {
  cacheFeatureFlag,
  getCachedFeatureFlag,
} from "../helpers/feature-flags.ts";

const postHogClient = new PostHog(
  "phc_ErsIQYNj6gPFTkHfupfuUGeKjabwtk3WTPdkTDktbU4",
  {
    host: "https://us.posthog.com",
    flushAt: 1,
    flushInterval: 0,
    // Don't keep the process alive
    requestTimeout: 2000,
  },
);
// Uncomment this out to see Posthog debugging logs.
// postHogClient.debug();

/**
 * Whether the user has opted out of telemetry collection.
 */
export const IS_TRACKING_DISABLED =
  process.env.SF_CLI_TELEMETRY_OPTOUT === "1" ||
  process.env.SF_CLI_TELEMETRY_OPTOUT === "true";

type EventMessage = Parameters<typeof postHogClient.capture>[0];

const trackEvent = ({
  properties,
  event,
  ...payload
}: Omit<EventMessage, "distinctId">) => {
  const runner = async () => {
    const config = await loadConfig();
    let exchangeAccountId = config.account_id;

    if (!exchangeAccountId) {
      const client = await apiClient(config.auth_token);
      const { data } = await client.GET("/v0/me");
      if (data?.id) {
        exchangeAccountId = data.id;
        await saveConfig({ ...config, account_id: data.id });
      }
    }

    if (exchangeAccountId) {
      postHogClient.capture({
        ...payload,
        distinctId: exchangeAccountId,
        event: `cli_sf_${event}`,
        properties: { ...properties, source: "cli" },
      });
    }
  };

  if (!IS_TRACKING_DISABLED) {
    runner();
  }
};

type FeatureFlags = "procurements" | "zones";

/**
 * Checks if a feature is enabled for the current user.
 */
export const isFeatureEnabled = async (feature: FeatureFlags) => {
  const config = await loadConfig();
  const exchangeAccountId = config.account_id;

  if (!exchangeAccountId) {
    return false;
  }

  // Check cache first
  const cachedFlag = await getCachedFeatureFlag(feature, exchangeAccountId);
  if (cachedFlag) {
    return cachedFlag.value;
  }

  // Fetch from the v2/feature_flags API
  let finalResult = false;
  try {
    const client = await apiClient(config.auth_token);
    const { data, response } = await client.GET(
      "/v2/feature_flags/{feature_flag_id}",
      { params: { path: { feature_flag_id: feature } } },
    );
    // 404 means the flag doesn't exist → treat as disabled (false)
    finalResult = response.ok ? (data?.enabled ?? false) : false;
  } catch {
    // Network or parse error → default to false
  }

  await cacheFeatureFlag(feature, exchangeAccountId, finalResult);

  return finalResult;
};

export const analytics = {
  track: trackEvent,
  shutdown: () => postHogClient.shutdown(),
};
