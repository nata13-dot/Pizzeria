import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export function cartAddedFeedback(): void {
  if (Capacitor.isNativePlatform()) {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(35);
}
