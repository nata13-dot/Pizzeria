import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SESSION_KEY = "pizzeria.session";

export async function readSession<T>(): Promise<T | null> {
  try {
    const value = Platform.OS === "web"
      ? globalThis.localStorage?.getItem(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY);
    return value ? JSON.parse(value) as T : null;
  } catch {
    await clearSession();
    return null;
  }
}

export async function saveSession(value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(SESSION_KEY, serialized);
  } else {
    await SecureStore.setItemAsync(SESSION_KEY, serialized);
  }
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(SESSION_KEY);
  } else {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}
