import SFCNodes from "@sfcompute/nodes-sdk-alpha";
import { getAuthToken } from "./helpers/config.ts";
import { logAndQuit } from "./helpers/errors.ts";

export async function nodesClient($token?: string) {
  if ($token) return new SFCNodes({ bearerToken: $token });
  const token = await getAuthToken();
  if (!token) {
    logAndQuit("Not logged in. Please run 'sf login' first.");
  }
  return new SFCNodes({ bearerToken: token });
}

export function handleNodesError(err: unknown) {
  if (err instanceof SFCNodes.APIError) {
    logAndQuit(err.message);
  }
  logAndQuit(
    err instanceof Error ? err.message : "An unexpected error occurred.",
  );
}
