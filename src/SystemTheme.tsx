import { useEffect, useState } from "react";
import { Platform, Pressable, Text } from "react-native";

type ThemeMode = "light" | "dark";
const STORAGE_KEY = "pizzeria-color-theme";
const EVENT_NAME = "pizzeria-theme-change";
const LIGHT_CSS = `
  :root { color-scheme: light; }
  html, body, #root { color: #29231f; }
  input, textarea, select {
    color: #29231f !important;
    -webkit-text-fill-color: #29231f !important;
    caret-color: #cf4b32 !important;
    color-scheme: light;
  }
  input::placeholder, textarea::placeholder {
    color: #8b837d !important;
    -webkit-text-fill-color: #8b837d !important;
    opacity: 1 !important;
  }
  input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus {
    -webkit-text-fill-color: #29231f !important;
    box-shadow: 0 0 0 1000px #fff inset !important;
  }
`;

function systemTheme(): ThemeMode {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function savedTheme(): ThemeMode | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "dark" || value === "light" ? value : null;
}
function effectiveTheme(): ThemeMode { return savedTheme() ?? systemTheme(); }
export function toggleSystemTheme(): ThemeMode {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, next);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  return next;
}

const DARK_CSS = `
  :root { color-scheme: light dark; }
    html, body, #root { background: #111315 !important; color: #f2f3f5 !important; }
    [style*="background-color: rgb(247, 242, 233)"],
    [style*="background-color: rgb(248, 249, 250)"],
    [style*="background-color: rgb(246, 247, 249)"] { background-color: #15181b !important; }
    [style*="background-color: rgb(255, 255, 255)"],
    [style*="background-color: rgb(255, 253, 250)"] { background-color: #202327 !important; }
    [style*="background-color: rgb(244, 246, 248)"],
    [style*="background-color: rgb(247, 242, 233)"],
    [style*="background-color: rgb(248, 243, 237)"],
    [style*="background-color: rgb(238, 228, 218)"],
    [style*="background-color: rgb(236, 239, 242)"],
    [style*="background-color: rgb(238, 240, 243)"],
    [style*="background-color: rgb(240, 242, 244)"] { background-color: #2b2f34 !important; }
    [style*="background-color: rgb(255, 240, 236)"],
    [style*="background-color: rgb(255, 228, 222)"],
    [style*="background-color: rgb(243, 177, 159)"] { background-color: #563127 !important; }
    [style*="background-color: rgb(255, 241, 204)"],
    [style*="background-color: rgb(255, 244, 220)"] { background-color: #40351e !important; }
    [style*="background-color: rgb(252, 232, 229)"],
    [style*="background-color: rgb(251, 227, 221)"] { background-color: #482824 !important; }
    [style*="color: rgb(41, 35, 31)"], [style*="color: rgb(32, 36, 42)"],
    [style*="color: rgb(48, 53, 60)"], [style*="color: rgb(57, 49, 44)"],
    [style*="color: rgb(79, 69, 63)"], [style*="color: rgb(81, 73, 67)"] { color: #f2f3f5 !important; }
    [style*="color: rgb(121, 107, 97)"], [style*="color: rgb(116, 123, 133)"],
    [style*="color: rgb(111, 118, 128)"], [style*="color: rgb(119, 126, 135)"] { color: #adb3bc !important; }
    [style*="color: rgb(95, 73, 24)"], [style*="color: rgb(100, 75, 22)"] { color: #f1cf7b !important; }
    [style*="border-color: rgb(221, 209, 197)"], [style*="border-color: rgb(217, 221, 226)"],
    [style*="border-color: rgb(231, 233, 236)"], [style*="border-color: rgb(238, 228, 218)"],
    [style*="border-color: rgb(229, 231, 234)"], [style*="border-color: rgb(228, 230, 233)"] { border-color: #3b4046 !important; }
    input, textarea, select { color: #f2f3f5 !important; -webkit-text-fill-color: #f2f3f5 !important; caret-color: #f06a50 !important; color-scheme: dark; }
    input::placeholder, textarea::placeholder { color: #858c96 !important; opacity: 1; }
    input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus { -webkit-text-fill-color: #f2f3f5 !important; box-shadow: 0 0 0 1000px #202327 inset !important; }
`;

export function SystemTheme() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.id = "pizzeria-system-theme";
    document.head.appendChild(style);
    const apply = () => {
      const mode = effectiveTheme();
      document.documentElement.dataset.pizzeriaTheme = mode;
      style.textContent = mode === "dark" ? DARK_CSS : LIGHT_CSS;
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => { if (!savedTheme()) apply(); };
    window.addEventListener(EVENT_NAME, apply);
    media.addEventListener?.("change", onSystemChange);
    apply();
    return () => { window.removeEventListener(EVENT_NAME, apply); media.removeEventListener?.("change", onSystemChange); style.remove(); };
  }, []);
  return null;
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => effectiveTheme());
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const update = () => setMode(effectiveTheme());
    window.addEventListener(EVENT_NAME, update);
    return () => window.removeEventListener(EVENT_NAME, update);
  }, []);
  return <Pressable accessibilityRole="button" accessibilityLabel={mode === "dark" ? "Activar modo claro" : "Activar modo oscuro"} onPress={() => setMode(toggleSystemTheme())} style={{ alignItems: "center", backgroundColor: mode === "dark" ? "#34383e" : "#fff0ec", borderRadius: 18, height: 36, justifyContent: "center", width: 36 }}><Text style={{ color: mode === "dark" ? "#ffd36a" : "#9a3d2b", fontSize: 17 }}>{mode === "dark" ? "☀" : "☾"}</Text></Pressable>;
}
