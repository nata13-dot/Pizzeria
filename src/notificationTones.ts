export type NotificationToneKey = string;
export type CustomNotificationTone = { key: string; label: string; file_name: string; mime_type: string; data_uri: string };

export const DEFAULT_NOTIFICATION_TONE: NotificationToneKey = "default";

export const notificationTones: { key: NotificationToneKey; label: string; file: string; source: number | string }[] = [
  { key: "default", label: "Aviso original", file: "notification_arrival.wav", source: require("../assets/notification_arrival.wav") },
  { key: "bell", label: "Campanilla", file: "campanilla.wav", source: require("../assets/campanilla.wav") },
  { key: "kitchen", label: "Aviso de cocina", file: "kitchen_sent.mp3", source: require("../assets/kitchen_sent.mp3") },
  { key: "soft", label: "Aviso suave", file: "modal_open.mp3", source: require("../assets/modal_open.mp3") },
  { key: "ding", label: "Ding corto", file: "navigation_ding.mp3", source: require("../assets/navigation_ding.mp3") },
];

export function notificationChannelId(key: NotificationToneKey): string {
  return key.startsWith("custom_") ? `orders_arrival_custom_v1_${key}` : `orders_arrival_tone_v3_${key}`;
}
