import { copyFile, mkdir } from "node:fs/promises";

const destination = new URL("../android/app/src/main/res/raw/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of ["notification_arrival.wav", "campanilla.wav", "kitchen_sent.mp3", "modal_open.mp3", "navigation_ding.mp3"]) {
  await copyFile(new URL(`../assets/${file}`, import.meta.url), new URL(file, destination));
}
console.log("Tonos de notificación copiados a los recursos Android.");
