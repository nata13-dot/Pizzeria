import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://api.espinazodeldiablo.site/api";
export const API_CACHE_PREFIX = "pizzeria-api-cache:v1:";
let unauthorizedHandler: (() => void) | null = null;
const cacheGenerations = new Map<string, number>();
type AutomaticCacheEntry = { cachedAt: number; data: unknown };
const automaticMemoryCache = new Map<string, AutomaticCacheEntry>();
const automaticRequests = new Map<string, Promise<unknown>>();
const MAX_OFFLINE_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
type CacheInvalidator = (scope: string, pathPrefixes: string[]) => void;
let externalCacheInvalidator: CacheInvalidator | null = null;

function automaticCacheKey(path: string, token?: string): string {
  return `${API_CACHE_PREFIX}${apiCacheScope(token)}:${apiCacheGeneration(token)}:${path}`;
}

function automaticCacheTtl(path: string): number {
  if (/^\/(kitchen|delivery)\/orders/.test(path) || /^\/orders(?:\?|$)/.test(path)) return 8_000;
  if (/^\/(products|pos\/catalog|product-categories|combos|catalogs|settings|operational-settings|business-profile|roles|permissions)/.test(path)) return 10 * 60_000;
  return 60_000;
}

async function readAutomaticCache<T>(key: string): Promise<AutomaticCacheEntry | null> {
  const memory = automaticMemoryCache.get(key);
  if (memory) return memory;
  try {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    const entry = JSON.parse(stored) as AutomaticCacheEntry;
    if (typeof entry?.cachedAt !== "number" || !("data" in entry)) return null;
    automaticMemoryCache.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export function apiCacheScope(token?: string): string {
  let hash = 2166136261;
  for (const character of token ?? "public") {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function apiCacheGeneration(token?: string): number {
  return cacheGenerations.get(apiCacheScope(token)) ?? 0;
}

export function setExternalCacheInvalidator(invalidator: CacheInvalidator): void {
  externalCacheInvalidator = invalidator;
}

function affectedCachePaths(mutationPath: string): string[] {
  if (/^\/orders(?:\/|$)/.test(mutationPath) || /^\/(kitchen|delivery)\/orders(?:\/|$)/.test(mutationPath)) {
    return ["/orders", "/kitchen/orders", "/delivery/orders", "/reports/cash-day", "/inventory"];
  }
  if (/^\/(products?|product-categories|combos?|modifiers?|recipes?)(?:\/|$)/.test(mutationPath)) {
    return ["/products", "/pos/catalog", "/product-categories", "/combos", "/modifiers", "/recipes"];
  }
  if (/^\/(ingredients?|inventory|purchases?|production(?:-recipes|-batches)?)(?:\/|$)/.test(mutationPath)) {
    return ["/ingredients", "/inventory", "/purchases", "/production", "/catalogs"];
  }
  if (/^\/(customers?|loyalty)(?:\/|$)/.test(mutationPath)) return ["/customers", "/loyalty"];
  if (/^\/(users?|roles?|permissions?|preferences|settings|operational-settings|business-profile)(?:\/|$)/.test(mutationPath)) {
    return ["/users", "/roles", "/permissions", "/preferences", "/settings", "/operational-settings", "/business-profile"];
  }
  const resource = mutationPath.match(/^\/[^/?]+/)?.[0];
  return resource ? [resource] : [];
}

function pathFromCacheKey(key: string, scope: string): string | null {
  const scopedPrefix = `${API_CACHE_PREFIX}${scope}:`;
  if (!key.startsWith(scopedPrefix)) return null;
  const generationSeparator = key.indexOf(":", scopedPrefix.length);
  return generationSeparator < 0 ? null : key.slice(generationSeparator + 1);
}

function matchesPathPrefix(path: string | null, prefixes: string[]): boolean {
  return path !== null && prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
}

async function invalidateApiCacheForMutation(path: string, token: string): Promise<void> {
  const scope = apiCacheScope(token);
  const prefixes = affectedCachePaths(path);
  for (const key of automaticMemoryCache.keys()) {
    if (matchesPathPrefix(pathFromCacheKey(key, scope), prefixes)) automaticMemoryCache.delete(key);
  }
  externalCacheInvalidator?.(scope, prefixes);
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => matchesPathPrefix(pathFromCacheKey(key, scope), prefixes));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // A failed cache eviction must not turn a successful mutation into an error.
  }
}

export async function clearApiCache(token?: string): Promise<void> {
  const scope = apiCacheScope(token);
  cacheGenerations.set(scope, (cacheGenerations.get(scope) ?? 0) + 1);
  for (const key of automaticMemoryCache.keys()) {
    if (key.startsWith(`${API_CACHE_PREFIX}${scope}:`)) automaticMemoryCache.delete(key);
  }
  try {
    const prefix = `${API_CACHE_PREFIX}${scope}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Cache failures must never block normal app operations.
  }
}

export type ApiStockWarning = {
  ingredient_id?: number;
  name: string;
  required?: number;
  available?: number;
  shortage: number;
};

export type ApiErrorPayload = {
  message?: string;
  code?: string;
  errors?: Record<string, unknown>;
  stock_warnings?: ApiStockWarning[];
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly errors: Record<string, unknown>;
  readonly stockWarnings: ApiStockWarning[];
  readonly payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload.code;
    this.errors = payload.errors ?? {};
    this.stockWarnings = Array.isArray(payload.stock_warnings) ? payload.stock_warnings : [];
    this.payload = payload;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStockWarnings(value: unknown): ApiStockWarning[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((warning) => {
    if (!isRecord(warning) || typeof warning.name !== "string") return [];
    const shortage = Number(warning.shortage);
    if (!Number.isFinite(shortage)) return [];
    const normalized: ApiStockWarning = { name: warning.name, shortage };
    if (typeof warning.ingredient_id === "number") normalized.ingredient_id = warning.ingredient_id;
    if (warning.required !== null && warning.required !== undefined && Number.isFinite(Number(warning.required))) {
      normalized.required = Number(warning.required);
    }
    if (warning.available !== null && warning.available !== undefined && Number.isFinite(Number(warning.available))) {
      normalized.available = Number(warning.available);
    }
    return [normalized];
  });
}

function normalizeErrorPayload(value: unknown): ApiErrorPayload {
  if (!isRecord(value)) return {};
  return {
    message: typeof value.message === "string" ? value.message : undefined,
    code: typeof value.code === "string" ? value.code : undefined,
    errors: isRecord(value.errors) ? value.errors : undefined,
    stock_warnings: normalizeStockWarnings(value.stock_warnings),
  };
}

function collectValidationMessages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectValidationMessages);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(collectValidationMessages);
  }
  return [];
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function api<T>(
  path: string,
  token?: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const bypassCache = options.cache === "no-store" || options.cache === "reload";
  const key = automaticCacheKey(path, token);
  let staleEntry: AutomaticCacheEntry | null = null;
  if (method === "GET" && !bypassCache) {
    const cached = await readAutomaticCache<T>(key);
    staleEntry = cached;
    if (cached && Date.now() - cached.cachedAt <= automaticCacheTtl(path)) return cached.data as T;
    const pending = automaticRequests.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  }

  const request = requestApi<T>(path, token, options, method, key);
  if (method === "GET") automaticRequests.set(key, request);
  try {
    return await request;
  } catch (error) {
    const canUseOfflineCopy = !(error instanceof ApiError) || error.status >= 500;
    if (method === "GET" && canUseOfflineCopy && staleEntry && Date.now() - staleEntry.cachedAt <= MAX_OFFLINE_CACHE_AGE_MS) {
      return staleEntry.data as T;
    }
    throw error;
  } finally {
    if (method === "GET") automaticRequests.delete(key);
  }
}

async function requestApi<T>(path: string, token: string | undefined, options: RequestInit, method: string, key: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("La solicitud tardó demasiado. Revisa tu conexión e inténtalo de nuevo.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const rawData: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) unauthorizedHandler?.();
    const payload = normalizeErrorPayload(rawData);
    const validationErrors = collectValidationMessages(payload.errors).join("\n");
    throw new ApiError(
      response.status,
      payload,
      validationErrors || payload.message || `Error de API (${response.status})`,
    );
  }

  if (method === "GET") {
    const entry: AutomaticCacheEntry = { cachedAt: Date.now(), data: rawData };
    automaticMemoryCache.set(key, entry);
    void AsyncStorage.setItem(key, JSON.stringify(entry)).catch(() => undefined);
  } else if (token) {
    await invalidateApiCacheForMutation(path, token);
  }

  return rawData as T;
}
