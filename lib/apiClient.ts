/**
 * API client with automatic 401 interception and transparent token refresh.
 *
 * Uses a concurrency lock with a subscriber queue to handle multiple
 * simultaneous 401 responses without duplicate refresh calls.
 */

import { parseRetryAfter, TenantTokenBucketLimiter } from "./tenantRateLimiter";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
}

interface RefreshSubscriber {
  resolve: (token: string | null) => void;
  reject: (error: Error) => void;
}

interface SessionResponse {
  user: {
    address: string;
    provider: string;
  } | null;
}

interface ChallengeResponse {
  nonce: string;
  nonce_id: string;
}

interface VerifyResponse {
  token: string;
  user: {
    address: string;
    provider: string;
  };
}

interface RefreshResponse {
  token: string;
}

// ─── Token management ────────────────────────────────────────────────

let accessToken: string | null = null;
let activeTenantKey = "anonymous";
const tenantRateLimiter = new TenantTokenBucketLimiter();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Sets the local bucket partition after the authenticated session has resolved.
 * This value is deliberately never sent as a request header: the gateway must
 * derive tenant identity from verified credentials, not browser input.
 */
export function setActiveTenantKey(tenantKey: string | null): void {
  activeTenantKey = tenantKey?.trim() || "anonymous";
}

// ─── Token refresh queue ─────────────────────────────────────────────

let isRefreshing = false;
let refreshSubscribers: RefreshSubscriber[] = [];

function onRefreshed(newToken: string | null): void {
  refreshSubscribers.forEach((subscriber) => {
    subscriber.resolve(newToken);
  });
  refreshSubscribers = [];
}

function onRefreshFailed(error: Error): void {
  refreshSubscribers.forEach((subscriber) => {
    subscriber.reject(error);
  });
  refreshSubscribers = [];
}

function subscribeToRefresh(): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    refreshSubscribers.push({ resolve, reject });
  });
}

// ─── 401 interception / refresh ──────────────────────────────────────

async function refreshToken(): Promise<string | null> {
  try {
    await tenantRateLimiter.acquire(activeTenantKey);
    const response = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
        if (retryAfterMs !== null) tenantRateLimiter.block(activeTenantKey, retryAfterMs);
        throw new ApiRateLimitError(
          "Rate limit exceeded",
          retryAfterMs,
          response.headers.get("X-RateLimit-Limit"),
          response.headers.get("X-RateLimit-Remaining")
        );
      }
      throw new Error(`Refresh failed with status ${response.status}`);
    }

    const data = (await response.json()) as RefreshResponse;
    accessToken = data.token;
    return data.token;
  } catch (error) {
    accessToken = null;
    throw error;
  }
}

// ─── Core fetch wrapper ──────────────────────────────────────────────

async function doFetch<T = unknown>(
  url: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    credentials = "include",
  } = options;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (accessToken) {
    requestHeaders["Authorization"] = `Bearer ${accessToken}`;
  }

  await tenantRateLimiter.acquire(activeTenantKey);

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    credentials,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle 401: attempt token refresh
  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;

      try {
        const newToken = await refreshToken();
        onRefreshed(newToken);

        if (newToken) {
          // Retry the original request with the new token
          const retryHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            ...headers,
            Authorization: `Bearer ${newToken}`,
          };

          const retryResponse = await fetch(url, {
            method,
            headers: retryHeaders,
            credentials,
            body: body ? JSON.stringify(body) : undefined,
          });

          if (retryResponse.status === 204) {
            return undefined as T;
          }

          if (!retryResponse.ok) {
            throw await apiErrorFromResponse(retryResponse);
          }

          return (await retryResponse.json()) as T;
        }
      } catch (error) {
        onRefreshFailed(
          error instanceof Error ? error : new Error("Token refresh failed")
        );
        isRefreshing = false;
        throw error;
      } finally {
        isRefreshing = false;
      }
    } else {
      // A refresh is already in progress — subscribe to the result
      const newToken = await subscribeToRefresh();

      if (newToken) {
        // Retry with the refreshed token
        const retryHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          ...headers,
          Authorization: `Bearer ${newToken}`,
        };

        const retryResponse = await fetch(url, {
          method,
          headers: retryHeaders,
          credentials,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (retryResponse.status === 204) {
          return undefined as T;
        }

        if (!retryResponse.ok) {
          throw await apiErrorFromResponse(retryResponse);
        }

        return (await retryResponse.json()) as T;
      }
    }

    // If we got here, refresh failed — propagate the 401 error
    throw new ApiError("Unauthorized", 401);
  }

  // Non-401 error responses
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  // No content
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ─── Public API ──────────────────────────────────────────────────────

export const apiClient = {
  get<T = unknown>(url: string, options?: Omit<ApiRequestOptions, "method" | "body">): Promise<T> {
    return doFetch<T>(url, { ...options, method: "GET" });
  },

  post<T = unknown>(url: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">): Promise<T> {
    return doFetch<T>(url, { ...options, method: "POST", body });
  },

  put<T = unknown>(url: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">): Promise<T> {
    return doFetch<T>(url, { ...options, method: "PUT", body });
  },

  patch<T = unknown>(url: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">): Promise<T> {
    return doFetch<T>(url, { ...options, method: "PATCH", body });
  },

  delete<T = unknown>(url: string, options?: Omit<ApiRequestOptions, "method" | "body">): Promise<T> {
    return doFetch<T>(url, { ...options, method: "DELETE" });
  },
};

// ─── Auth-specific API helpers ───────────────────────────────────────

export const authApi = {
  /** Check for an existing valid session cookie */
  getSession(): Promise<SessionResponse> {
    return apiClient.get<SessionResponse>("/api/v1/auth/session");
  },

  /** Request a signing challenge for the given wallet address */
  getChallenge(address: string): Promise<ChallengeResponse> {
    return apiClient.post<ChallengeResponse>("/api/v1/auth/challenge", {
      address,
    });
  },

  /** Verify a signed challenge */
  verify(nonce_id: string, signature: string, address: string): Promise<VerifyResponse> {
    return apiClient.post<VerifyResponse>("/api/v1/auth/verify", {
      nonce_id,
      signature,
      address,
    });
  },

  /** Refresh the access token using the httpOnly refresh token cookie */
  refresh(): Promise<RefreshResponse> {
    return apiClient.post<RefreshResponse>("/api/v1/auth/refresh");
  },

  /** Log out — clears cookies server-side */
  logout(): Promise<void> {
    return apiClient.post<void>("/api/v1/auth/logout");
  },

  /** Ping the session to check validity */
  ping(): Promise<void> {
    return apiClient.get<void>("/api/v1/auth/session/ping");
  },
};

// ─── Custom error class ──────────────────────────────────────────────

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** A 429 response, including standardized rate-limit metadata when supplied. */
export class ApiRateLimitError extends ApiError {
  retryAfterMs: number | null;
  limit: number | null;
  remaining: number | null;

  constructor(
    message: string,
    retryAfterMs: number | null,
    limit: string | null,
    remaining: string | null
  ) {
    super(message, 429);
    this.name = "ApiRateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.limit = parseHeaderNumber(limit);
    this.remaining = parseHeaderNumber(remaining);
  }
}

function parseHeaderNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    if (retryAfterMs !== null) tenantRateLimiter.block(activeTenantKey, retryAfterMs);
    return new ApiRateLimitError(
      "Rate limit exceeded",
      retryAfterMs,
      response.headers.get("X-RateLimit-Limit"),
      response.headers.get("X-RateLimit-Remaining")
    );
  }

  let errorMessage = `HTTP ${response.status}`;
  try {
    const errorBody = await response.json();
    errorMessage = (errorBody as { message?: string }).message ?? errorMessage;
  } catch {
    // Response body is empty or not valid JSON — use default message.
  }
  return new ApiError(errorMessage, response.status);
}

// ─── Re-exports ──────────────────────────────────────────────────────

export type {
  SessionResponse,
  ChallengeResponse,
  VerifyResponse,
  RefreshResponse,
};
