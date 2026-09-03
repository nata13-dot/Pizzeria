import { useEffect } from "react";
import { Platform } from "react-native";

const DARK_CSS = `
  :root { color-scheme: light dark; }
  @media (prefers-color-scheme: dark) {
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
    input, textarea { color: #f2f3f5 !important; caret-color: #f06a50 !important; }
    input::placeholder, textarea::placeholder { color: #858c96 !important; opacity: 1; }
  }
`;

export function SystemTheme() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.id = "pizzeria-system-theme";
    style.textContent = DARK_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  return null;
}
