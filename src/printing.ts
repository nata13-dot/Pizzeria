import * as Print from "expo-print";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Linking, Platform } from "react-native";

export type ThermalPaperWidth = 58 | 80;
export type SavedPrinter = { configured?: boolean; name: string; url?: string; type?: "bluetooth" | "tcp" | "ios"; address?: string; port?: number; paperWidth?: ThermalPaperWidth };
type DevicePrintPlugin = {
  configurePrinter(): Promise<SavedPrinter>;
  getConfiguredPrinter(): Promise<SavedPrinter>;
  setPaperWidth(options: { paperWidth: ThermalPaperWidth }): Promise<SavedPrinter>;
  printEscPos(options: { html: string; paperWidth: ThermalPaperWidth }): Promise<{ printed: boolean; printer: string }>;
  printHtml(options: { html: string; jobName: string }): Promise<{ opened: boolean }>;
};
const DevicePrint = registerPlugin<DevicePrintPlugin>("DevicePrint");
export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

function thermalHtml(html: string, paperWidth: ThermalPaperWidth): string {
  const printStyles = `<style id="thermal-ticket-styles">
    @page { size: ${paperWidth}mm auto; margin: 0; }
    html, body { width: ${paperWidth}mm !important; max-width: ${paperWidth}mm !important; margin: 0 !important; }
    body { color: #000 !important; font-family: Arial, sans-serif !important; font-size: ${paperWidth === 58 ? 10 : 12}px !important; padding: 1.5mm !important; }
    h1 { font-size: ${paperWidth === 58 ? 17 : 20}px !important; }
    h2 { font-size: ${paperWidth === 58 ? 14 : 16}px !important; }
    h3 { font-size: ${paperWidth === 58 ? 12 : 14}px !important; }
    table { table-layout: fixed; width: 100% !important; }
    th, td { overflow-wrap: anywhere; padding: 3px 1px !important; }
    th:last-child, td:last-child { width: 25%; }
    .summary { width: 100% !important; }
    .business img { max-height: 22mm !important; max-width: 80% !important; }
    .print-button { display: none !important; }
  </style>`;
  return html.includes("</head>") ? html.replace("</head>", `${printStyles}</head>`) : `${printStyles}${html}`;
}

export async function selectThermalPrinter(): Promise<SavedPrinter | null> {
  if (isNativeAndroid()) return DevicePrint.configurePrinter();
  if (Platform.OS === "ios") return { ...(await Print.selectPrinterAsync()), configured: true, type: "ios" };
  return null;
}

export async function getConfiguredThermalPrinter(): Promise<SavedPrinter | null> {
  if (isNativeAndroid()) {
    const printer = await DevicePrint.getConfiguredPrinter();
    return printer.configured ? printer : null;
  }
  return null;
}

export async function saveThermalPaperWidth(paperWidth: ThermalPaperWidth): Promise<SavedPrinter | null> {
  if (isNativeAndroid()) {
    const printer = await DevicePrint.setPaperWidth({ paperWidth });
    return printer.configured ? printer : null;
  }
  return null;
}

export async function printThermalHtml(
  html: string,
  paperWidth: ThermalPaperWidth,
  printerUrl?: string,
): Promise<void> {
  if (isNativeAndroid()) {
    await DevicePrint.printEscPos({ html, paperWidth });
    return;
  }
  if (Platform.OS === "web") {
    const popup = window.open("", "_blank", "width=420,height=720");
    if (!popup) throw new Error("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo nuevamente.");
    popup.document.open();
    popup.document.write(thermalHtml(html, paperWidth));
    popup.document.close();
    popup.focus();
    popup.setTimeout(() => popup.print(), 250);
    return;
  }
  await Print.printAsync({
    html: thermalHtml(html, paperWidth),
    ...(Platform.OS === "ios" && printerUrl ? { printerUrl } : {}),
  });
}

export async function printThermalHtmlWithAndroid(html: string, paperWidth: ThermalPaperWidth): Promise<void> {
  if (isNativeAndroid()) {
    await DevicePrint.printHtml({ html: thermalHtml(html, paperWidth), jobName: `Ticket ${paperWidth} mm` });
    return;
  }
  await printThermalHtml(html, paperWidth);
}

export async function printThermalTicket(
  downloadUrl: string,
  paperWidth: ThermalPaperWidth,
  printerUrl?: string,
): Promise<void> {
  if (Platform.OS === "web" && !Capacitor.isNativePlatform()) {
    await Linking.openURL(downloadUrl);
    return;
  }
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error("No fue posible descargar el ticket para imprimir.");
  await printThermalHtml(await response.text(), paperWidth, printerUrl);
}
