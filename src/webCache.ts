import { Platform } from "react-native";

export function supportsWebCache(platform: string, protocol: string, serviceWorkerAvailable: boolean): boolean {
  return platform === "web" && serviceWorkerAvailable && (protocol === "https:" || protocol === "http:");
}

export function registerWebCache(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!supportsWebCache(Platform.OS, window.location.protocol, "serviceWorker" in navigator)) return;
  const register = () => {
    void navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => undefined);
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
