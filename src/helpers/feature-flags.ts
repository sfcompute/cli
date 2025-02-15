import { homedir } from "node:os";
import { join } from "node:path";

interface CachedFeatureFlag {
  value: boolean;
  expiresAt: number;
}

interface FeatureFlagCache {
  [key: string]: CachedFeatureFlag;
}

const FEATURE_FLAG_CACHE_TTL = 60 * 60 * 1000;

function getFeatureFlagCachePath(): string {
  const configDir = join(homedir(), ".sfcompute");
  return join(configDir, "feature-flags");
}

export async function saveFeatureFlags(flags: FeatureFlagCache): Promise<void> {
  const cachePath = getFeatureFlagCachePath();
  const configDir = join(homedir(), ".sfcompute");

  try {
    await Deno.mkdir(configDir, { recursive: true });
    await Deno.writeTextFile(cachePath, JSON.stringify(flags, null, 2));
  } catch {
    // Silent error
  }
}

export async function loadFeatureFlags(): Promise<FeatureFlagCache> {
  const cachePath = getFeatureFlagCachePath();

  try {
    const cacheData = await Deno.readTextFile(cachePath);
    return JSON.parse(cacheData);
  } catch {
    return {};
  }
}

export async function getCachedFeatureFlag(
  feature: string,
  accountId: string
): Promise<CachedFeatureFlag | null> {
  const cache = await loadFeatureFlags();
  const key = `${accountId}:${feature}`;
  const cachedFlag = cache[key];

  if (!cachedFlag) {
    return null;
  }

  if (Date.now() > cachedFlag.expiresAt) {
    // Cache expired, remove it
    delete cache[key];
    await saveFeatureFlags(cache);
    return null;
  }

  return cachedFlag;
}

export async function cacheFeatureFlag(
  feature: string,
  accountId: string,
  value: boolean
): Promise<void> {
  const cache = await loadFeatureFlags();
  const key = `${accountId}:${feature}`;

  cache[key] = {
    value,
    expiresAt: Date.now() + FEATURE_FLAG_CACHE_TTL,
  };

  await saveFeatureFlags(cache);
}

export async function clearFeatureFlags(): Promise<void> {
  const cachePath = getFeatureFlagCachePath();
  try {
    await Deno.remove(cachePath);
  } catch {
    // Silent error if file doesn't exist
  }
}
