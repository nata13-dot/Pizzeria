import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { loadErrorMessage, pagePath, startLoad, type Page } from "../loadState";

type ResourceState<T> = { key: string; data: T | null; loading: boolean; error: string; unavailable: boolean };

export function useRemoteResource<T>(path: string | null, token: string, label: string, delayMs = 0, missingIsUnavailable = false) {
  const key = `${token}\0${path}`;
  const [state, setState] = useState<ResourceState<T>>({ key: "", data: null, loading: true, error: "", unavailable: false });
  const [revision, setRevision] = useState(0);
  const force = useRef(false);
  const reload = useCallback(() => { force.current = true; setRevision((value) => value + 1); }, []);
  useEffect(() => {
    if (path === null) return;
    const refresh = force.current;
    force.current = false;
    setState((current) => ({ key, data: current.key === key ? current.data : null, loading: true, error: "", unavailable: false }));
    return startLoad(
      (signal) => api<T>(path, token, { signal, ...(refresh ? { cache: "reload" as const } : {}) }),
      (data) => setState({ key, data, loading: false, error: "", unavailable: false }),
      (error) => {
        const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
        setState((current) => ({
          key,
          data: current.key === key ? current.data : null,
          loading: false,
          error: missingIsUnavailable && status === 404 ? "" : loadErrorMessage(label, error),
          unavailable: missingIsUnavailable && status === 404,
        }));
      },
      refresh ? 0 : delayMs,
    );
  }, [key, path, token, label, delayMs, missingIsUnavailable, revision]);
  // Never display the previous query/session's results while its effect cleans up.
  const current = path === null ? { data: null, loading: false, error: "", unavailable: false }
    : state.key === key ? state : { data: null, loading: true, error: "", unavailable: false };
  return { data: current.data, loading: current.loading, error: current.error, unavailable: current.unavailable, reload };
}

export function usePaginatedResource<T>(endpoint: string, token: string, label: string, delayMs = 0, enabled = true, initialQuery: {search:string;page:number} = {search:"",page:1}) {
  const [query, setQuery] = useState(initialQuery);
  const resource = useRemoteResource<Page<T>>(enabled ? pagePath(endpoint, query.page, query.search) : null, token, label, delayMs);
  const setSearch = useCallback((search: string) => setQuery(current => current.search === search ? current : { search, page: 1 }), []);
  const setPage = useCallback((page: number) => setQuery((current) => ({ ...current, page: Math.max(1, page) })), []);
  // A deletion/filter change can remove the last page. Recover instead of showing
  // an empty directory even though the response reports existing records.
  useEffect(() => {
    if (resource.data && query.page > resource.data.last_page) setPage(Math.max(1, resource.data.last_page));
  }, [resource.data, query.page, setPage]);
  return { ...resource, ...query, setSearch, setPage, items: resource.data?.data ?? [] };
}
