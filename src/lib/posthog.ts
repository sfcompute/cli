import { PostHog } from "posthog-node";

export const postHogClient = new PostHog(
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
