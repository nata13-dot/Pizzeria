import { copyFile, mkdir } from "node:fs/promises";

const destination = new URL("../android/app/src/main/res/raw/", import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(new URL("../assets/campanilla.wav", import.meta.url), new URL("campanilla.wav", destination));
console.log("Campanilla de notificación copiada a los recursos Android.");
