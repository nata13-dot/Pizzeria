import AsyncStorage from "@react-native-async-storage/async-storage";

import { API_CACHE_PREFIX, ApiError, api, apiCacheScope } from "./api";

type CacheEntry<T> = { cachedAt: number; data: T };
type CachedRequestOptions = { forceRefresh?: boolean; ttlMs?: number };

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_FALLBACK_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(path: string, token?: string): string {
  return `${API_CACHE_PREFIX}${apiCacheScope(token)}:${path}`;
}

async function readEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    const entry = JSON.parse(stored) as CacheEntry<T>;
    return typeof entry?.cachedAt === "number" ? entry : null;
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
    const data = await api<T>(path, token);
    await AsyncStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), data })).catch(() => undefined);
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw error;
    if (entry && age <= MAX_FALLBACK_AGE_MS) return entry.data;
    throw error;
  }
}
