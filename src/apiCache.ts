import AsyncStorage from "@react-native-async-storage/async-storage";

import { API_CACHE_PREFIX, ApiError, api, apiCacheGeneration, apiCacheScope, setExternalCacheInvalidator } from "./api";

type CacheEntry<T> = { cachedAt: number; data: T };
type CachedRequestOptions = { forceRefresh?: boolean; ttlMs?: number };

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_FALLBACK_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const memoryCache = new Map<string, CacheEntry<unknown>>();
const requestsInProgress = new Map<string, Promise<unknown>>();

function pathFromCacheKey(key: string, scope: string): string | null {
  const scopedPrefix = `${API_CACHE_PREFIX}${scope}:`;
  if (!key.startsWith(scopedPrefix)) return null;
  const generationSeparator = key.indexOf(":", scopedPrefix.length);
  return generationSeparator < 0 ? null : key.slice(generationSeparator + 1);
}

setExternalCacheInvalidator((scope, prefixes) => {
  for (const key of memoryCache.keys()) {
    const path = pathFromCacheKey(key, scope);
    if (path && prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))) {
      memoryCache.delete(key);
      requestsInProgress.delete(key);
    }
  }
});

function cacheKey(path: string, token?: string): string {
  return `${API_CACHE_PREFIX}${apiCacheScope(token)}:${apiCacheGeneration(token)}:${path}`;
}

async function readEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memoryEntry) return memoryEntry;
  try {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    const entry = JSON.parse(stored) as CacheEntry<T>;
    if (typeof entry?.cachedAt !== "number") return null;
    memoryCache.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export async function cachedApi<T>(path: string, token?: string, options: CachedRequestOptions = {}): Promise<T> {
  const key = cacheKey(path, token);
  const entry = await readEntry<T>(key);
  const age = entry ? Date.now() - entry.cachedAt : Number.POSITIVE_INFINITY;
  if (!options.forceRefresh && entry && age <= (options.ttlMs ?? DEFAULT_TTL_MS)) return entry.data;

  try {
    let request = requestsInProgress.get(key) as Promise<T> | undefined;
    if (!request) {
      request = api<T>(path, token, { cache: "no-store" });
      requestsInProgress.set(key, request);
    }
    const data = await request;
    const nextEntry: CacheEntry<T> = { cachedAt: Date.now(), data };
    memoryCache.set(key, nextEntry);
    void AsyncStorage.setItem(key, JSON.stringify(nextEntry)).catch(() => undefined);
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw error;
    if (entry && age <= MAX_FALLBACK_AGE_MS) return entry.data;
    throw error;
  } finally {
    requestsInProgress.delete(key);
  }
}
