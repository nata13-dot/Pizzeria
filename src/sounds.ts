import { useAudioPlayer } from "expo-audio";
import { useCallback } from "react";

function useSound(source: number): () => void {
  const player = useAudioPlayer(source);
  return useCallback(() => {
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  }, [player]);
}

export function useNavigationSound(): () => void {
  return useSound(require("../assets/navigation_ding.mp3"));
}

export function useKitchenSentSound(): () => void {
  return useSound(require("../assets/kitchen_sent.mp3"));
}
