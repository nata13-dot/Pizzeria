export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://pizzeria-api-production-2bf0.up.railway.app/api";
let unauthorizedHandler: (() => void) | null = null;

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

  return rawData as T;
}
