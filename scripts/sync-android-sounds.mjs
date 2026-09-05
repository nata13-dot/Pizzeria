import { copyFile, mkdir } from "node:fs/promises";

const destination = new URL("../android/app/src/main/res/raw/", import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(new URL("../assets/notification_arrival.wav", import.meta.url), new URL("notification_arrival.wav", destination));
console.log("Tono de notificación copiado a los recursos Android.");
