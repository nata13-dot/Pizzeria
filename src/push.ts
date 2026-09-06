import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Capacitor } from "@capacitor/core";
import { registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "./api";
import { DEFAULT_NOTIFICATION_TONE, notificationChannelId, notificationTones, type NotificationToneKey } from "./notificationTones";
import { readNotificationPreferences, type NotificationPreferences } from "./notificationPreferences";

const NotificationTone = registerPlugin<{ install(options: { key: string; label: string; dataUri: string; mimeType: string }): Promise<{ channelId: string }> }>("NotificationTone");
let notificationSettings: NotificationPreferences = { mode: "fixed", sounds: [DEFAULT_NOTIFICATION_TONE], customSounds: [] };

function validTones(keys?: NotificationToneKey[]): NotificationToneKey[] {
  const available = new Set([...notificationTones.map((tone) => tone.key), ...notificationSettings.customSounds.map((tone) => tone.key)]);
  const filtered = (keys ?? []).filter((key) => available.has(key));
  return filtered.length ? filtered : [DEFAULT_NOTIFICATION_TONE];
}

function selectTone(settings: NotificationPreferences): NotificationToneKey {
  const tones = validTones(settings.sounds);
  return settings.mode === "random" ? tones[Math.floor(Math.random() * tones.length)] : tones[0];
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function registerPush(token: string): Promise<void> {
  const settings = await refreshNotificationSounds(token);
  const activeTone = selectTone(settings);
  if (Capacitor.isNativePlatform()) {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt") permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") return;
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener("registration", ({ value }) => {
      void api("/register-device", token, {
        method: "POST",
        body: JSON.stringify({ push_token: value, name: Device.deviceName ?? "Android", platform: "android-fcm", notification_sound_mode: settings.mode, notification_channels: validTones(settings.sounds).map(notificationChannelId) }),
      });
    });
    await PushNotifications.addListener("registrationError", (error) => console.warn("No se pudo registrar FCM.", error));
    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      const data = Object.fromEntries(Object.entries(notification.data ?? {}).filter((entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number"));
      void showOrderNotification(notification.title ?? "Pedido actualizado", notification.body ?? "Revisa el estado del pedido.", data);
    });
    await PushNotifications.register();
    return;
  }
  if (Platform.OS === "web" || !Device.isDevice) return;
  if (Platform.OS === "android") {
    const tone = notificationTones.find((item) => item.key === activeTone) ?? notificationTones[0];
    await Notifications.setNotificationChannelAsync(notificationChannelId(tone.key), {
      name: `Pedidos · ${tone.label}`,
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: "#CF4B32",
      sound: tone.file,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn("No se registraron notificaciones push: falta el EAS projectId en la compilación.");
    return;
  }
  const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api("/register-device", token, {
    method: "POST",
    body: JSON.stringify({ push_token: pushToken, name: Device.deviceName ?? Platform.OS, platform: Platform.OS, notification_sound_mode: settings.mode, notification_channels: validTones(settings.sounds).map(notificationChannelId) }),
  });
}

export async function refreshNotificationSounds(_token?: string): Promise<NotificationPreferences> {
  const settings = await readNotificationPreferences();
  notificationSettings = settings;
  if (Capacitor.isNativePlatform()) {
    for (const tone of notificationTones) await PushNotifications.createChannel({
      id: notificationChannelId(tone.key), name: `Pedidos · ${tone.label}`, description: "Pedidos nuevos y pedidos listos para entregar.",
      importance: 5, sound: tone.file, vibration: true, lights: true, lightColor: "#CF4B32",
    });
    for (const tone of settings.customSounds) await NotificationTone.install({ key: tone.key, label: tone.label, dataUri: tone.data_uri, mimeType: tone.mime_type }).catch(() => undefined);
  }
  return settings;
}

export async function showOrderNotification(title: string, body: string, data: Record<string, string | number>): Promise<void> {
  const activeTone = selectTone(notificationSettings);
  const customTone = notificationSettings.customSounds.find((item) => item.key === activeTone);
  const tone = notificationTones.find((item) => item.key === activeTone) ?? notificationTones[0];
  if (Capacitor.isNativePlatform()) {
    if (!customTone) await LocalNotifications.createChannel({
      id: notificationChannelId(activeTone),
      name: `Avisos de pedidos · ${tone.label}`,
      description: "Avisos de cocina, entrega y reparto.",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: tone.file,
    });
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [{
        id: Number(data.order_id) || Date.now(),
        title,
        body,
        extra: data,
        channelId: notificationChannelId(activeTone),
        schedule: { at: new Date(Date.now() + 250) },
      }],
    });
    return;
  }
  if (Platform.OS === "web") {
    if (!("Notification" in window)) return;
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "granted") {
      const audioSource = customTone?.data_uri ?? (typeof tone.source === "string" ? tone.source : undefined);
      if (audioSource) void new Audio(audioSource).play().catch(() => undefined);
      new Notification(title, { body, data, icon: "/favicon.ico" });
    }
    return;
  }
  await Notifications.scheduleNotificationAsync({ content: { title, body, data, sound: customTone?.data_uri ?? tone.file }, trigger: null });
}
