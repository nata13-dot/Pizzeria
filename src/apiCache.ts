import { api } from "./api";

type CachedRequestOptions = { forceRefresh?: boolean; ttlMs?: number };

// Share storage, in-flight requests and invalidation with every other API caller.
export function cachedApi<T>(path: string, token?: string, options: CachedRequestOptions = {}): Promise<T> {
  return api<T>(path, token, {
    cache: options.forceRefresh ? "reload" : "default",
    cacheTtlMs: options.ttlMs,
  });
}
