import process from "node:process";
import { PostHog } from "posthog-node";
import { loadConfig, saveConfig } from "../helpers/config.ts";
import {
  cacheFeatureFlag,
  getCachedFeatureFlag,
} from "../helpers/feature-flags.ts";
import { getApiUrl } from "../helpers/urls.ts";

const postHogClient = new PostHog(
  "phc_ErsIQYNj6gPFTkHfupfuUGeKjabwtk3WTPdkTDktbU4",
  {
    host: "https://us.posthog.com",
    flushAt: 1,
    flushInterval: 0,
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
      const response = await fetch(await getApiUrl("me"), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.auth_token}`,
        },
      });
      // deno-lint-ignore no-explicit-any -- Deno has narrower types for fetch responses, but we know this code works atm.
      const data = (await response.json()) as any;
      if (data.id) {
        exchangeAccountId = data.id;
        saveConfig({ ...config, account_id: data.id });
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

type FeatureFlags = "procurements" | "zones" | "vm-provider";

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

  // If not in cache or expired, fetch from PostHog
  const result = await postHogClient.isFeatureEnabled(
    feature,
    exchangeAccountId,
  );

  // Cache the result (PostHog returns undefined if there's an error, default to false)
  const finalResult = result ?? false;
  await cacheFeatureFlag(feature, exchangeAccountId, finalResult);

  return finalResult;
};

export const analytics = {
  track: trackEvent,
  shutdown: () => postHogClient.shutdown(),
};
