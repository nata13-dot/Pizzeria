import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "./api";

const ORDERS_CHANNEL = "orders_kitchen_bell";
const KITCHEN_BELL_SOUND = "campanilla.wav";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function registerPush(token: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await PushNotifications.createChannel({
      id: ORDERS_CHANNEL,
      name: "Pedidos con campanilla",
      description: "Pedidos nuevos y pedidos listos para entregar.",
      importance: 5,
      sound: KITCHEN_BELL_SOUND,
      vibration: true,
      lights: true,
      lightColor: "#CF4B32",
    });
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt") permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") return;
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener("registration", ({ value }) => {
      void api("/register-device", token, {
        method: "POST",
        body: JSON.stringify({ push_token: value, name: Device.deviceName ?? "Android", platform: "android-fcm" }),
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
    await Notifications.setNotificationChannelAsync(ORDERS_CHANNEL, {
      name: "Pedidos",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: "#CF4B32",
      sound: KITCHEN_BELL_SOUND,
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
      id: ORDERS_CHANNEL,
      name: "Pedidos con campanilla",
      description: "Avisos de cocina, entrega y reparto.",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: KITCHEN_BELL_SOUND,
    });
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [{
        id: Number(data.order_id) || Date.now(),
        title,
        body,
        extra: data,
        channelId: ORDERS_CHANNEL,
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
  await Notifications.scheduleNotificationAsync({ content: { title, body, data, sound: KITCHEN_BELL_SOUND }, trigger: null });
}
