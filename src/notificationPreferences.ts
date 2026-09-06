import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CustomNotificationTone, NotificationToneKey } from "./notificationTones";

export type NotificationPreferences = {
  mode: "fixed" | "random";
  sounds: NotificationToneKey[];
  customSounds: CustomNotificationTone[];
};

const STORAGE_KEY = "pizzeria.notification-sounds.v1";
const defaults: NotificationPreferences = { mode: "fixed", sounds: ["default"], customSounds: [] };

export async function readNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Partial<NotificationPreferences>;
    return {
      mode: parsed.mode === "random" ? "random" : "fixed",
      sounds: Array.isArray(parsed.sounds) && parsed.sounds.length ? parsed.sounds : ["default"],
      customSounds: Array.isArray(parsed.customSounds) ? parsed.customSounds.slice(0, 3) : [],
    };
  } catch { return defaults; }
}

export async function saveNotificationPreferences(preferences: NotificationPreferences): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
