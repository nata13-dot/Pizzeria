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
    [data-pizzeria-bg="canvas"] { background-color: #15181b !important; }
    [data-pizzeria-bg="surface"] { background-color: #202327 !important; }
    [data-pizzeria-bg="inset"] { background-color: #2b2f34 !important; }
    [data-pizzeria-bg="accent"] { background-color: #563127 !important; }
    [data-pizzeria-bg="warning"] { background-color: #40351e !important; }
    [data-pizzeria-bg="danger"] { background-color: #482824 !important; }
    [data-pizzeria-fg="primary"] { color: #f2f3f5 !important; }
    [data-pizzeria-fg="muted"] { color: #adb3bc !important; }
    [data-pizzeria-fg="warning"] { color: #f1cf7b !important; }
    [data-pizzeria-border="soft"] { border-color: #3b4046 !important; }
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
    const classify = () => {
      style.textContent = LIGHT_CSS;
      const root = document.getElementById("root");
      if (!root) return;
      const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
      const backgrounds: Record<string, string> = {
        "rgb(247, 242, 233)": "canvas", "rgb(248, 249, 250)": "canvas", "rgb(246, 247, 249)": "canvas",
        "rgb(255, 255, 255)": "surface", "rgb(255, 253, 250)": "surface",
        "rgb(244, 246, 248)": "inset", "rgb(248, 243, 237)": "inset", "rgb(238, 228, 218)": "inset", "rgb(236, 239, 242)": "inset", "rgb(238, 240, 243)": "inset", "rgb(240, 242, 244)": "inset",
        "rgb(255, 240, 236)": "accent", "rgb(255, 228, 222)": "accent", "rgb(243, 177, 159)": "accent",
        "rgb(255, 241, 204)": "warning", "rgb(255, 244, 220)": "warning",
        "rgb(252, 232, 229)": "danger", "rgb(251, 227, 221)": "danger",
      };
      const foregrounds: Record<string, string> = {
        "rgb(0, 0, 0)": "primary", "rgb(41, 35, 31)": "primary", "rgb(32, 36, 42)": "primary", "rgb(48, 53, 60)": "primary", "rgb(57, 49, 44)": "primary", "rgb(79, 69, 63)": "primary", "rgb(81, 73, 67)": "primary",
        "rgb(121, 107, 97)": "muted", "rgb(116, 123, 133)": "muted", "rgb(111, 118, 128)": "muted", "rgb(119, 126, 135)": "muted",
        "rgb(95, 73, 24)": "warning", "rgb(100, 75, 22)": "warning",
      };
      const softBorders = new Set(["rgb(221, 209, 197)", "rgb(217, 221, 226)", "rgb(231, 233, 236)", "rgb(238, 228, 218)", "rgb(229, 231, 234)", "rgb(228, 230, 233)"]);
      elements.forEach((element) => {
        const computed = window.getComputedStyle(element);
        const background = backgrounds[computed.backgroundColor];
        const foreground = foregrounds[computed.color];
        if (background) element.dataset.pizzeriaBg = background;
        else delete element.dataset.pizzeriaBg;
        if (foreground) element.dataset.pizzeriaFg = foreground;
        else delete element.dataset.pizzeriaFg;
        if (softBorders.has(computed.borderTopColor) || softBorders.has(computed.borderColor)) element.dataset.pizzeriaBorder = "soft";
        else delete element.dataset.pizzeriaBorder;
      });
    };
    const apply = () => {
      const mode = effectiveTheme();
      document.documentElement.dataset.pizzeriaTheme = mode;
      classify();
      style.textContent = mode === "dark" ? DARK_CSS : LIGHT_CSS;
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => { if (!savedTheme()) apply(); };
    window.addEventListener(EVENT_NAME, apply);
    media.addEventListener?.("change", onSystemChange);
    const observer = new MutationObserver(() => apply());
    observer.observe(document.getElementById("root") ?? document.body, {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    apply();
    return () => { observer.disconnect(); window.removeEventListener(EVENT_NAME, apply); media.removeEventListener?.("change", onSystemChange); style.remove(); };
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
