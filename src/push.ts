import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function registerPush(token: string): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Pedidos",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: "#CF4B32",
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
    body: JSON.stringify({ push_token: pushToken, name: Device.deviceName ?? Platform.OS, platform: Platform.OS }),
  });
}

export async function showOrderNotification(title: string, body: string, data: Record<string, string | number>): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.createChannel({
      id: "orders",
      name: "Pedidos",
      description: "Avisos de cocina, entrega y reparto.",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [{
        id: Number(data.order_id) || Date.now(),
        title,
        body,
        extra: data,
        channelId: "orders",
        schedule: { at: new Date(Date.now() + 250) },
      }],
    });
    return;
  }
  if (Platform.OS === "web") {
    if (!("Notification" in window)) return;
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "granted") new Notification(title, { body, data, icon: "/favicon.ico" });
    return;
  }
  await Notifications.scheduleNotificationAsync({ content: { title, body, data, sound: "default" }, trigger: null });
}
