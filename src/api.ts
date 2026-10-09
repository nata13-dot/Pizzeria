import AsyncStorage from "@react-native-async-storage/async-storage";
import { BoundedCache } from "./boundedCache";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://api.espinazodeldiablo.site/api";
export const API_CACHE_PREFIX = "pizzeria-api-cache:v2:";
let unauthorizedHandler: (() => void) | null = null;
const cacheGenerations = new Map<string, number>();
type AutomaticCacheEntry = { cachedAt: number; data: unknown };
const automaticMemoryCache = new BoundedCache<AutomaticCacheEntry>(64, 16 * 1024 * 1024);
const automaticRequests = new Map<string, Promise<unknown>>();
const MAX_OFFLINE_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PERSISTED_ENTRY_BYTES = 8 * 1024 * 1024;
const cacheRevisions = new Map<string, number>();
let storageQueue: Promise<unknown> = Promise.resolve();
function storageTask(task: () => Promise<unknown>): Promise<unknown> {
  storageQueue = storageQueue.then(task).catch(() => undefined);
  return storageQueue;
}
// Remove the previous unbounded cache once when this module starts.
void storageTask(async () => {
  const obsolete = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith("pizzeria-api-cache:v1:"));
  if (obsolete.length) await AsyncStorage.multiRemove(obsolete);
});
function persistable(path: string): boolean {
  return /^\/(pos\/catalog|product-categories|combos|operational-settings|business-profile|modifiers)$/.test(path);
}
export type ApiRequestOptions = RequestInit & { cacheTtlMs?: number };

type LegacyInventoryIngredient = {
  id: number;
  name: string;
  sku?: string | null;
  active: boolean;
  current_stock: string | number;
  minimum_stock: string | number;
  critical_stock: string | number;
  base_unit?: unknown;
  type?: unknown;
};
type LegacyInventoryPage = { data: LegacyInventoryIngredient[]; current_page: number; last_page: number; total: number };

function automaticCacheKey(path: string, token?: string): string {
  return `${API_CACHE_PREFIX}${apiCacheScope(token)}:${apiCacheGeneration(token)}:${path}`;
}

function automaticCacheTtl(path: string): number {
  if (/^\/(kitchen|delivery)\/orders/.test(path) || /^\/orders(?:\?|$)/.test(path)) return 8_000;
  if (/^\/(products|pos\/catalog|product-categories|combos|catalogs|settings|operational-settings|business-profile|roles|permissions)/.test(path)) return 5 * 60_000;
  return 60_000;
}

async function readAutomaticCache(key: string, path: string, current: () => boolean): Promise<AutomaticCacheEntry | null> {
  const memory = automaticMemoryCache.get(key);
  if (memory) return memory;
  if (!persistable(path)) return null;
  try {
    await storageQueue;
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    const entry = JSON.parse(stored) as AutomaticCacheEntry;
    if (!entry || typeof entry.cachedAt !== "number" || !("data" in entry) || Date.now() - entry.cachedAt > MAX_OFFLINE_CACHE_AGE_MS) return null;
    if (!current()) return null;
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

function affectedCachePaths(mutationPath: string): string[] {
  if (/^\/orders(?:\/|$)/.test(mutationPath) || /^\/(kitchen|delivery)\/orders(?:\/|$)/.test(mutationPath)) {
    return ["/orders", "/kitchen/orders", "/delivery/orders", "/reports", "/cash-days", "/customers", "/inventory", "/loyalty"];
  }
  if (/^\/(products?|product-categories|product-variants|product-flavors|combos?|modifiers?|recipes?)(?:\/|$)/.test(mutationPath)) {
    return ["/products", "/pos/catalog", "/product-categories", "/combos", "/modifiers", "/recipes"];
  }
  if (/^\/(ingredients?|inventory|purchases?|production(?:-recipes|-batches)?)(?:\/|$)/.test(mutationPath)) {
    return ["/ingredients", "/inventory", "/purchases", "/production", "/production-recipes", "/production-batches", "/catalogs", "/products", "/recipes", "/reports"];
  }
  if (/^\/(customers?|loyalty)(?:\/|$)/.test(mutationPath)) return ["/customers", "/loyalty"];
  if (/^\/(users?|roles?|permissions?|preferences|settings|operational-settings|business-profile)(?:\/|$)/.test(mutationPath)) {
    return ["/users", "/roles", "/permissions", "/preferences", "/settings", "/operational-settings", "/business-profile"];
  }
  if (/^\/cash-days(?:\/|$)/.test(mutationPath)) return ["/cash-days", "/reports"];
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
  cacheRevisions.set(scope, (cacheRevisions.get(scope) ?? 0) + 1);
  for (const key of automaticRequests.keys()) {
    if (key.startsWith(`${API_CACHE_PREFIX}${scope}:`)) automaticRequests.delete(key);
  }
  for (const key of automaticMemoryCache.keys()) {
    if (matchesPathPrefix(pathFromCacheKey(key, scope), prefixes)) automaticMemoryCache.delete(key);
  }

  try {
    await storageTask(async () => {
      const keys = (await AsyncStorage.getAllKeys()).filter((key) => matchesPathPrefix(pathFromCacheKey(key, scope), prefixes));
      if (keys.length) await AsyncStorage.multiRemove(keys);
    });
  } catch {
    // A failed cache eviction must not turn a successful mutation into an error.
  }
}

export async function clearApiCache(token?: string): Promise<void> {
  const scope = apiCacheScope(token);
  cacheRevisions.set(scope, (cacheRevisions.get(scope) ?? 0) + 1);
  for (const key of automaticRequests.keys()) {
    if (key.startsWith(`${API_CACHE_PREFIX}${scope}:`)) automaticRequests.delete(key);
  }
  cacheGenerations.set(scope, (cacheGenerations.get(scope) ?? 0) + 1);
  for (const key of automaticMemoryCache.keys()) {
    if (key.startsWith(`${API_CACHE_PREFIX}${scope}:`)) automaticMemoryCache.delete(key);
  }
  try {
    await storageTask(async () => {
      const prefix = `${API_CACHE_PREFIX}${scope}:`;
      const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
      if (keys.length) await AsyncStorage.multiRemove(keys);
    });
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
  pricing?: {items: {unit_price: string | number; total: string | number}[]; delivery_fee: string | number; total: string | number};
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
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const bypassCache = options.cache === "no-store" || options.cache === "reload";
  const key = automaticCacheKey(path, token);
  const scope = apiCacheScope(token);
  const revision = cacheRevisions.get(scope) ?? 0;
  const current = () => revision === (cacheRevisions.get(scope) ?? 0) && key === automaticCacheKey(path, token);
  let staleEntry: AutomaticCacheEntry | null = null;
  if (method === "GET" && !bypassCache) {
    const cached = await readAutomaticCache(key, path, current);
    staleEntry = cached;
    if (current() && cached && Date.now() - cached.cachedAt <= (options.cacheTtlMs ?? automaticCacheTtl(path))) return cached.data as T;
  }

  const pending = method === "GET" && !options.signal ? automaticRequests.get(key) as Promise<T> | undefined : undefined;
  if (pending) return pending;
  const request = requestApi<T>(path, token, options, method, key, current);
  if (method === "GET" && !options.signal) automaticRequests.set(key, request);
  try {
    return await request;
  } catch (error) {
    if (method === "GET" && error instanceof ApiError && error.status === 404 && /^\/inventory\/items(?:\?|$)/.test(path)) {
      return await legacyInventoryItems(path, token, options) as T;
    }
    const canUseOfflineCopy = !(error instanceof ApiError) || error.status >= 500;
    if (method === "GET" && current() && persistable(path) && canUseOfflineCopy && staleEntry && Date.now() - staleEntry.cachedAt <= MAX_OFFLINE_CACHE_AGE_MS) {
      return staleEntry.data as T;
    }
    throw error;
  } finally {
    if (automaticRequests.get(key) === request) automaticRequests.delete(key);
  }
}

async function legacyInventoryItems(path: string, token: string | undefined, options: ApiRequestOptions): Promise<unknown> {
  const query = new URLSearchParams(path.split("?", 2)[1] ?? "");
  const rows: LegacyInventoryIngredient[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const result = await api<LegacyInventoryPage>(`/ingredients?per_page=100&page=${page}`, token, {
      ...options,
      cache: options.cache === "reload" ? "reload" : "default",
    });
    rows.push(...result.data);
    lastPage = Math.max(1, result.last_page);
    page += 1;
  } while (page <= lastPage);

  const search = (query.get("search") ?? "").trim().toLocaleLowerCase();
  const active = query.get("active");
  const status = query.get("status");
  const normalized = rows.map((item) => {
    const stock = Number(item.current_stock);
    const minimum = Number(item.minimum_stock);
    const critical = Number(item.critical_stock);
    const stockStatus = stock <= 0 ? "out" : stock <= critical ? "critical" : stock <= minimum ? "low" : "available";
    return {
      ...item,
      current_stock: Number.isFinite(stock) ? stock : 0,
      minimum_stock: Number.isFinite(minimum) ? minimum : 0,
      critical_stock: Number.isFinite(critical) ? critical : 0,
      missing_to_minimum: Number.isFinite(stock) && Number.isFinite(minimum) ? Math.max(0, minimum - stock) : 0,
      stock_status: stockStatus,
      next_expiry: null,
    };
  }).filter((item) => {
    if (active === "1" && !item.active) return false;
    if (active === "0" && item.active) return false;
    if (status && item.stock_status !== status) return false;
    return !search || item.name.toLocaleLowerCase().includes(search) || (item.sku ?? "").toLocaleLowerCase().includes(search);
  });
  const currentPage = Math.max(1, Number(query.get("page")) || 1);
  const perPage = 25;
  const offset = (currentPage - 1) * perPage;
  const data = normalized.slice(offset, offset + perPage);
  return {
    data,
    current_page: currentPage,
    last_page: Math.max(1, Math.ceil(normalized.length / perPage)),
    total: normalized.length,
    from: data.length ? offset + 1 : null,
    to: data.length ? offset + data.length : null,
  };
}

async function requestApi<T>(path: string, token: string | undefined, options: ApiRequestOptions, method: string, key: string, current: () => boolean): Promise<T> {
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

  if (method === "GET" && current() && options.cache !== "no-store") {
    const entry: AutomaticCacheEntry = { cachedAt: Date.now(), data: rawData };
    automaticMemoryCache.set(key, entry);
    if (persistable(path)) void storageTask(async () => {
      if (!current()) return;
      const serialized = JSON.stringify(entry);
      if (serialized.length * 2 <= MAX_PERSISTED_ENTRY_BYTES) await AsyncStorage.setItem(key, serialized);
      else await AsyncStorage.removeItem(key);
    });
  } else if (method !== "GET" && token) {
    await invalidateApiCacheForMutation(path, token);
  }

  return rawData as T;
}
