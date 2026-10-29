import { ActionButton } from "../../components/ActionButton";
import {ThemedText} from "../../theme/ThemedText";
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { api } from "../../api";
import { getConfiguredThermalPrinter, printThermalHtml, type ThermalPaperWidth } from "../../printing";
import type { Order, OrderItem, OrderStatus, OrderType } from "./types";
import { useAppStyles } from "../../styles/appStyles";
export async function openPhoneDialer(phone?: string | null): Promise<void> {
  const normalized = (phone ?? "").trim().replace(/[^\d+]/g, "");
  if (!normalized) return;
  await Linking.openURL(`tel:${normalized}`);
}
export function Empty({ text = "Sin registros." }: { text?: string }) {
  const s=useAppStyles(); return <ThemedText style={s.muted}>{text}</ThemedText>; }
export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  pickup: "Recoger",
  whatsapp: "WhatsApp",
  dine_in: "Consumo en local",
  delivery: "Domicilio",
};
export const SALES_CHANNEL_LABELS: Record<string, string> = { local: "Local", whatsapp: "WhatsApp", phone: "Teléfono", other: "Otro" };
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Borrador",
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmado",
  kitchen_pending: "En cola de cocina",
  preparing: "En preparación",
  prepared: "Preparado",
  ready: "Listo",
  on_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
export const ORDER_GROUPS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "draft", label: "Borradores", statuses: ["draft"] },
  { key: "pending", label: "Pendientes de pago", statuses: ["pending_payment"] },
  { key: "confirmed", label: "Confirmados y programados", statuses: ["confirmed"] },
  { key: "process", label: "En proceso", statuses: ["kitchen_pending", "preparing", "prepared", "on_way"] },
  { key: "ready", label: "Listos", statuses: ["ready"] },
  { key: "delivered", label: "Entregados", statuses: ["delivered"] },
  { key: "cancelled", label: "Cancelados", statuses: ["cancelled"] },
];
export function quantityLabel(value: string | number): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(value);
}
export function OrderItemContents({ item }: { item: OrderItem }) {
  const s=useAppStyles();
  const selections = item.flavors ?? [];
  const flavors = selections.map((selection) => {
    const name = selection.flavor?.name ?? selection.name ?? (selection.product_flavor_id ? `Sabor #${selection.product_flavor_id}` : "Sabor sin nombre");
    const ratio = Number(selection.ratio);
    return selections.length > 1 && Number.isFinite(ratio) && ratio > 0
      ? `${Math.round(ratio * 100)}% ${name}`
      : name;
  });
  const modifiers = (item.modifiers ?? []).map((modifier) => modifier.name);
  return <View style={s.orderItemDetail}>
    <ThemedText style={s.productName}>{quantityLabel(item.quantity)} × {item.name}</ThemedText>
    {!!flavors.length && <ThemedText style={s.itemOption}>Sabores: {flavors.join(" / ")}</ThemedText>}
    {!!modifiers.length && <ThemedText style={s.itemOption}>Modificadores: {modifiers.join(", ")}</ThemedText>}
    {!!item.notes && <ThemedText style={s.itemNotes}>Nota: {item.notes}</ThemedText>}
    {(item.components ?? []).map((component, index) => {
      const componentModifiers = (component.modifiers ?? []).map((modifier) => modifier.name);
      return <View style={s.comboComponent} key={component.id ?? `${component.name}-${index}`}>
        <ThemedText style={s.componentName}>↳ {quantityLabel(component.quantity)} × {component.name}</ThemedText>
        {!!component.flavors?.length && <ThemedText style={s.itemOption}>Sabores: {component.flavors.join(" / ")}</ThemedText>}
        {!!componentModifiers.length && <ThemedText style={s.itemOption}>Modificadores: {componentModifiers.join(", ")}</ThemedText>}
        {!!component.notes && <ThemedText style={s.itemNotes}>Nota: {component.notes}</ThemedText>}
      </View>;
    })}
  </View>;
}
export function OrderContents({ order }: { order: Order }) {
  const s=useAppStyles();
  return <View style={s.orderContents}>
    <ThemedText style={s.orderNo}>Orden #{order.daily_number}</ThemedText>
    <ThemedText style={s.orderMeta}>Tipo: {ORDER_TYPE_LABELS[order.type]}</ThemedText>
    {!!order.sales_channel && <ThemedText style={s.orderMeta}>Canal: {SALES_CHANNEL_LABELS[order.sales_channel] ?? order.sales_channel}</ThemedText>}
    {order.scheduled_at
      ? <ThemedText style={s.scheduled}>Programada: {new Date(order.scheduled_at).toLocaleString()}</ThemedText>
      : <ThemedText style={s.muted}>Horario: inmediato</ThemedText>}
    {!!order.notes && <ThemedText style={s.orderNotes}>Notas del pedido: {order.notes}</ThemedText>}
    {(order.items ?? []).map((item, index) => <OrderItemContents item={item} key={item.id ?? `${item.name}-${index}`} />)}
    {!order.items?.length && <ThemedText style={s.muted}>Sin detalle de productos</ThemedText>}
  </View>;
}
export function DocumentButton({ order, token, kind, compact = false }: { order: Order; token: string; kind: "kitchen" | "delivery"; compact?: boolean }) {
  const s=useAppStyles();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(80);
  useEffect(() => { getConfiguredThermalPrinter().then((printer) => { if (printer?.paperWidth) setPaperWidth(printer.paperWidth); }).catch(() => undefined); }, []);
  async function generate(action: "print" | "share") {
    setBusy(true);
    setMessage("");
    try {
      const doc = await api<{ content?: string; whatsapp_url?: string }>(`/orders/${order.id}/generate-document`, token, {
        method: "POST",
        body: JSON.stringify({ type: kind }),
      });
      if (action === "print") {
        if (!doc.content) throw new Error("El servidor no devolvió el contenido para imprimir.");
        await printThermalHtml(doc.content, paperWidth);
        setMessage(kind === "kitchen" ? "Comanda enviada al sistema de impresión." : "Nota de reparto enviada al sistema de impresión.");
      } else {
        if (!doc.whatsapp_url) throw new Error("El servidor no devolvió el enlace para compartir.");
        await Linking.openURL(doc.whatsapp_url);
        setMessage(kind === "kitchen" ? "Comanda lista para compartir." : "Nota de reparto lista para compartir.");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (compact) return <View style={s.kitchenPrintArea}><ActionButton label={busy ? "Preparando comanda..." : `Imprimir comanda · ${paperWidth} mm`} variant="secondary" disabled={busy} onPress={() => generate("print")} />{!!message && <ThemedText style={s.kitchenPrintMessage}>{message}</ThemedText>}</View>;
  return (
    <View style={s.documentActions}>
      <View style={s.types}>{([58, 80] as ThermalPaperWidth[]).map((width) => <Pressable accessibilityRole="button" aria-pressed={!!(paperWidth === width)} key={width} onPress={() => setPaperWidth(width)} style={[s.type, paperWidth === width && s.typeActive]}><ThemedText>{width} mm</ThemedText></Pressable>)}</View>
      <View style={s.inlineFields}><ActionButton label={busy ? "Preparando..." : kind === "kitchen" ? "Imprimir comanda" : "Imprimir reparto"} variant="secondary" disabled={busy} onPress={() => generate("print")} /><ActionButton label="Compartir" variant="secondary" disabled={busy} onPress={() => generate("share")} /></View>
      {!!message && <ThemedText style={s.notice}>{message}</ThemedText>}
    </View>
  );
}
