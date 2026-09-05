import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { useAudioPlayer } from "expo-audio";
import { useCallback } from "react";

export function useCartAddedFeedback(): () => void {
  const player = useAudioPlayer(require("../assets/campanilla.wav"));

  return useCallback(() => {
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
    if (Capacitor.isNativePlatform()) {
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
      return;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(35);
  }, [player]);
}
