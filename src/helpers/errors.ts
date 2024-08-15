import { getCommandBase } from "./command";
import { clearAuthFromConfig } from "./config";

export interface ApiError {
  object: "error";
  code: string;
  message: string;
  details: Record<string, any>;
}

export const ApiErrorCode = {
  Base: {
    InvalidRequest: "invalid_request",
    NotAuthenticated: "not_authenticated",
    Unauthorized: "unauthorized",
    NotFound: "not_found",
    RouteNotFound: "route_not_found",
    TooManyRequests: "too_many_requests",
    InternalServer: "internal_server",
  },
  Accounts: {
    NotFound: "account.not_found",
  },
  Orders: {
    InvalidId: "order.invalid_id",
    InvalidPrice: "order.invalid_price",
    InvalidQuantity: "order.invalid_quantity",
    InvalidStart: "order.invalid_start",
    InvalidDuration: "order.invalid_duration",
    InsufficientFunds: "order.insufficient_funds",
    AlreadyCancelled: "order.already_cancelled",
    NotFound: "order.not_found",
  },
  Tokens: {
    TokenNotFound: "token.not_found",
    InvalidTokenCreateOriginClient: "token.invalid_token_create_origin_client",
    InvalidTokenExpirationDuration: "token.invalid_token_expiration_duration",
    MaxTokenLimitReached: "token.max_token_limit_reached",
  },
};

// --

export function logAndQuit(message: string) {
  console.error(message);
  process.exit(1);
}

export function logLoginMessageAndQuit() {
  const base = getCommandBase();
  const loginCommand = `${base} login`;

  logAndQuit(`You need to login first.\n\n\t$ ${loginCommand}\n`);
}

export async function logSessionTokenExpiredAndQuit() {
  await clearAuthFromConfig();
  logAndQuit("\nYour session has expired. Please login again.");
}
