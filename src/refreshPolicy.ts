export const REALTIME_BACKUP_POLL_MS = 50_000;
export const FALLBACK_POLL_MS = 12_000;
export const BACKGROUND_POLL_MS = 60_000;

export function operationalPollInterval(connected: boolean, active: boolean): number {
  if (!active) return BACKGROUND_POLL_MS;
  return connected ? REALTIME_BACKUP_POLL_MS : FALLBACK_POLL_MS;
}

export function coalescedReloadDelay(lastLoadAt: number, now = Date.now()): number {
  return Math.max(400, 800 - Math.max(0, now - lastLoadAt));
}
