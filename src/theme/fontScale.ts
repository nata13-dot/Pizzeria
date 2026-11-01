import { useEffect, useState } from "react";
import { AppState, PixelRatio, Platform } from "react-native";

/** "auto" follows the device; a number is a fixed scale chosen on this device. */
export type FontPreference = "auto" | number;
export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.5;
export const FONT_SCALE_OPTIONS = [0.85, 1, 1.15, 1.3, 1.5] as const;
export const DEVICE_FONT_EVENT = "pizzeria:fontscale";

const PREFERENCE_KEY = "pizzeria-font-scale";
const LEGACY_KEY = "pizzeria-font-size";
const legacyScale: Record<string, number> = { small: 0.85, medium: 1, large: 1.15 };

export const clampFontScale = (value: number) => Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Number.isFinite(value) ? value : 1));
export const resolveFontScale = (preference: FontPreference, device: number) => clampFontScale(preference === "auto" ? device : preference);
export const percent = (scale: number) => `${Math.round(scale * 100)} %`;

function storage(): Storage | null {
  try { return Platform.OS === "web" && typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

/** Per-device choice; migrates the old small/medium/large value once. */
export function readFontPreference(): FontPreference {
  const store = storage();
  if (!store) return "auto";
  try {
    const value = store.getItem(PREFERENCE_KEY);
    if (value === "auto") return "auto";
    if (value !== null && Number.isFinite(Number(value))) return clampFontScale(Number(value));
    const legacy = store.getItem(LEGACY_KEY);
    return legacy && legacy in legacyScale ? legacyScale[legacy] : "auto";
  } catch { return "auto"; }
}

export function writeFontPreference(preference: FontPreference): void {
  try { storage()?.setItem(PREFERENCE_KEY, String(preference)); } catch { /* The choice still applies for this session. */ }
}

type DeviceBridge = { getFontScale?: () => number };

/**
 * Text size the device asks for: Android's system font size (through the
 * native bridge, since the WebView ignores it) or the browser's default font size.
 */
export function readDeviceFontScale(): number {
  if (Platform.OS !== "web") return PixelRatio.getFontScale();
  try {
    const bridge = (globalThis as typeof globalThis & { PizzeriaDevice?: DeviceBridge }).PizzeriaDevice;
    const native = bridge?.getFontScale?.();
    if (typeof native === "number" && native > 0) return native;
    if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return 1;
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return root > 0 ? root / 16 : 1;
  } catch { return 1; }
}

/** Re-reads the device size whenever it may have changed, so "Automático" follows it live. */
export function useDeviceFontScale(): number {
  const [scale, setScale] = useState(readDeviceFontScale);
  useEffect(() => {
    const update = () => setScale((current) => { const next = readDeviceFontScale(); return Math.abs(next - current) > 0.001 ? next : current; });
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") update(); });
    if (Platform.OS !== "web" || typeof window === "undefined") return () => appState.remove();
    const events = [DEVICE_FONT_EVENT, "focus", "resize", "visibilitychange", "pageshow"];
    events.forEach((name) => window.addEventListener(name, update));
    return () => { appState.remove(); events.forEach((name) => window.removeEventListener(name, update)); };
  }, []);
  return scale;
}
