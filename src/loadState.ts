export type Page<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
  from: number | null;
  to: number | null;
};

export function pagePath(endpoint: string, page: number, search = ""): string {
  const separator = endpoint.includes("?") ? "&" : "?";
  const term = search.trim();
  return `${endpoint}${separator}page=${Math.max(1, page)}${term ? `&search=${encodeURIComponent(term)}` : ""}`;
}

// Cancellation guards state even when a transport ignores AbortSignal.
export function startLoad<T>(
  request: (signal: AbortSignal) => Promise<T>,
  success: (data: T) => void,
  failure: (error: unknown) => void,
  delayMs = 0,
): () => void {
  const controller = new AbortController();
  let active = true;
  const run = async () => {
    try {
      const data = await request(controller.signal);
      if (active) success(data);
    } catch (error) {
      if (active) failure(error);
    }
  };
  const timer = setTimeout(() => { void run(); }, delayMs);
  return () => { active = false; clearTimeout(timer); controller.abort(); };
}

export function loadErrorMessage(section: string, error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  // Keep diagnostic context in the console without logging tokens, responses or SQL.
  console.warn("Error al cargar sección", { section, status });
  if (status === 401) return "Tu sesión venció. Inicia sesión nuevamente.";
  if (status === 403) return `No tienes permiso para consultar ${section}. Solicita acceso al administrador.`;
  return `No pudimos cargar ${section}. Revisa tu conexión e intenta nuevamente.`;
}
