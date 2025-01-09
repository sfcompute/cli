import { PostHog } from "posthog-node";
import { loadConfig, saveConfig } from "../helpers/config.ts";
import { getApiUrl } from "../helpers/urls.ts";

const postHogClient = new PostHog(
  "phc_ErsIQYNj6gPFTkHfupfuUGeKjabwtk3WTPdkTDktbU4",
  {
    host: "https://us.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  }
);
// Uncomment this out to see Posthog debugging logs.
// postHogClient.debug();

/**
 * Whether the user has opted out of telemetry collection.
 */
export const IS_TRACKING_DISABLED =
  process.env.SF_CLI_TELEMETRY_OPTOUT === "1" ||
  process.env.SF_CLI_TELEMETRY_OPTOUT === "true";

/**
 * Type copied from posthog-node because it's not exported
 */
interface IdentifyMessage {
  distinctId: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  properties?: Record<string | number, any>;
  disableGeoip?: boolean;
}

/**
 * Type copied from posthog-node because it's not exported
 */
interface EventMessage extends IdentifyMessage {
  event: string;
  groups?: Record<string, string | number>;
  sendFeatureFlags?: boolean;
  timestamp?: Date;
  uuid?: string;
}

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

      const data = await response.json();
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

  runner();
};

export const analytics = {
  track: trackEvent,
  shutdown: () => postHogClient.shutdown(),
};
