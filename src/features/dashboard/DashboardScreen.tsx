import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { api } from "../../api";
import { ActionButton } from "../../components/ActionButton";
import { Notice } from "../../components/Notice";
import { useResponsiveLayout } from "../../layout/responsive";
import { loadErrorMessage } from "../../loadState";
import type { Screen } from "../../navigation/modules";
import { ordersChannel } from "../../realtime";
import { ThemedText } from "../../theme/ThemedText";
import { useTheme } from "../../theme/ThemeProvider";
import { BarList, Card, HourlyChart, Kpi, money, StatusPill, useDashboardStyles } from "./widgets";

type Dashboard = {
  date: string; generated_at: string;
  sales?: { total: number; orders: number; average_ticket: number; cancelled: number; last_week_same_time: { sales: number; orders: number }; by_hour: { hour: number; orders: number; sales: number }[] };
  payments?: { cash: number; transfer: number; mixed: number; on_delivery: number; courtesy: number };
  order_types?: Record<"pickup" | "delivery", { orders: number; sales: number }>;
  top_products?: { name: string; quantity: number; sales: number }[];
  cash_day?: { open: boolean; closed_at: string | null; opening_amount: number; expected_cash: number };
  pipeline?: Record<string, number>;
  recent_orders?: { id: number; daily_number: number; status: string; type: string; contact_name: string | null; total: number; created_at: string }[];
  inventory?: { out: number; critical: number; low: number; expiring_count: number; shortages: { id: number; name: string; status: "out" | "critical" | "low"; current_stock: number; minimum_stock: number; unit: string | null }[]; expiring: { ingredient: string; quantity: number; unit: string | null; expires_at: string }[] };
};

const stages: { key: string; label: string }[] = [
  { key: "pending_payment", label: "Por cobrar" }, { key: "kitchen_pending", label: "En cocina" }, { key: "preparing", label: "Preparando" },
  { key: "ready", label: "Listos" }, { key: "on_way", label: "En camino" },
];
const statusLabels: Record<string, string> = { draft: "Borrador", pending_payment: "Por cobrar", confirmed: "Confirmado", kitchen_pending: "En cocina", preparing: "Preparando", ready: "Listo", on_way: "En camino", delivered: "Entregado", cancelled: "Cancelado" };
const shortageLabel = { out: "Agotado", critical: "Urgente", low: "Bajo" } as const;
const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const quantity = (value: number) => value.toLocaleString("es-MX", { maximumFractionDigits: 2 });

/** Today at a glance; refreshes on every order event and every minute, keeping the last good data. */
export function DashboardScreen({ token, branchId, onNavigate }: { token: string; branchId?: number; onNavigate: (screen: Screen) => void }) {
  const styles = useDashboardStyles();
  const { theme } = useTheme();
  const { mobile } = useResponsiveLayout();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const live = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api<Dashboard>("/dashboard", token, { cache: "reload" });
      if (live.current) { setData(next); setError(""); }
    } catch (loadError) {
      if (live.current) setError(loadErrorMessage("el resumen del día", loadError));
    } finally { if (live.current) setLoading(false); }
  }, [token]);

  useEffect(() => {
    live.current = true;
    void load();
    const timer = setInterval(() => void load(), 60_000);
    const unsubscribe = branchId ? ordersChannel(token, branchId, () => void load()) : () => {};
    return () => { live.current = false; clearInterval(timer); unsubscribe(); };
  }, [load, token, branchId]);

  if (!data) return error
    ? <View style={styles.card}><Notice kind="error" message={error} /><ActionButton label="Reintentar" variant="secondary" onPress={load} /></View>
    : <ActivityIndicator color={theme.colors.primary} style={{ margin: 40 }} />;

  const { sales, payments, order_types: types, top_products: top, cash_day: cash, pipeline, recent_orders: recent, inventory } = data;
  const last = sales?.last_week_same_time;
  const change = sales && last && last.sales > 0 ? Math.round(((sales.total - last.sales) / last.sales) * 100) : null;
  const dayName = weekday(data.date);
  const nowHour = new Date().getHours();
  const firstHour = Math.min(...(sales?.by_hour ?? []).map((row) => row.hour), Math.max(0, nowHour - 6));
  const column = { flexBasis: mobile ? "100%" as const : 420, flexGrow: 1, minWidth: 0 };

  return <View style={{ gap: 16 }}>
    <View style={styles.cardHeader}>
      <ThemedText style={[styles.grow, styles.muted]} accessibilityLiveRegion="polite">Actualizado a las {time(data.generated_at)} · se actualiza solo con cada pedido</ThemedText>
      <ActionButton label="Actualizar" variant="secondary" loading={loading} loadingLabel="Actualizando…" onPress={load} />
    </View>
    {!!error && <Notice kind="warning" message={`${error} Mostramos los datos de las ${time(data.generated_at)}.`} />}

    {sales && <View style={styles.row}>
      <Kpi label="Ventas de hoy" value={money(sales.total)} onPress={() => onNavigate("cash")}
        trend={change !== null ? { text: `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)} % vs. el ${dayName} pasado a esta hora`, tone: change > 0 ? "good" : change < 0 ? "bad" : "neutral" } : { text: last && last.sales === 0 && sales.total > 0 ? `Sin ventas el ${dayName} pasado a esta hora` : `Sin comparación con el ${dayName} pasado`, tone: "neutral" }} />
      <Kpi label="Pedidos vendidos" value={String(sales.orders)} detail={`${last?.orders ?? 0} el ${dayName} pasado a esta hora${sales.cancelled ? ` · ${sales.cancelled} cancelado(s)` : ""}`} onPress={() => onNavigate("orders")} />
      <Kpi label="Ticket promedio" value={money(sales.average_ticket)} detail="Venta promedio por pedido" />
      {cash && <Kpi label="Caja" value={cash.open ? "Abierta" : cash.closed_at ? "Cerrada" : "Sin abrir"} detail={cash.open ? `Efectivo esperado ${money(cash.expected_cash)}` : cash.closed_at ? `Cerrada a las ${time(cash.closed_at)}` : "Ábrela para cobrar en efectivo"} onPress={() => onNavigate("cash")} />}
    </View>}

    <View style={styles.row}>
      {sales && <Card title="Ventas por hora" subtitle="Cada barra es una hora del día de hoy." style={column}>
        <HourlyChart data={sales.by_hour} fromHour={firstHour} toHour={Math.max(nowHour, ...sales.by_hour.map((row) => row.hour))} />
      </Card>}
      {pipeline && <Card title="Pedidos en curso" subtitle="Toca una etapa para ver sus pedidos." style={column}>
        <View style={styles.stages}>{stages.map((stage) => <Pressable key={stage.key} accessibilityRole="button" accessibilityLabel={`${stage.label}: ${pipeline[stage.key] ?? 0}. Ver pedidos`} onPress={() => onNavigate("orders")} style={({ pressed }) => [styles.kpi, styles.stage, pressed && styles.pressed]}>
          <ThemedText style={styles.kpiValue}>{pipeline[stage.key] ?? 0}</ThemedText><ThemedText numberOfLines={1} adjustsFontSizeToFit style={styles.kpiLabel}>{stage.label}</ThemedText>
        </Pressable>)}</View>
        {!!recent?.length && <View>
          <ThemedText style={styles.rowTitle}>Últimos pedidos</ThemedText>
          {recent.map((order) => <Pressable key={order.id} accessibilityRole="button" accessibilityLabel={`Pedido ${order.daily_number}, ${statusLabels[order.status] ?? order.status}, ${money(order.total)}`} onPress={() => onNavigate("orders")} style={styles.tableRow}>
            <ThemedText style={styles.tableValue}>#{order.daily_number}</ThemedText>
            <ThemedText numberOfLines={1} style={[styles.grow, styles.muted]}>{order.contact_name || (order.type === "delivery" ? "A domicilio" : "Para recoger")} · {time(order.created_at)}</ThemedText>
            <StatusPill tone={order.status === "cancelled" ? "neutral" : order.status === "delivered" ? "success" : "info"} text={statusLabels[order.status] ?? order.status} />
            <ThemedText style={styles.tableValue}>{money(order.total)}</ThemedText>
          </Pressable>)}
        </View>}
      </Card>}
    </View>

    {(top || payments) && <View style={styles.row}>
      {top && <Card title="Lo más vendido hoy" style={column}>
        <BarList empty="Todavía no hay productos vendidos hoy." rows={top.map((row) => ({ key: row.name, label: row.name, value: row.quantity, display: `${quantity(row.quantity)} ${row.quantity === 1 ? "vendido" : "vendidos"}`, detail: money(row.sales) }))} />
      </Card>}
      {payments && <Card title="Cómo pagaron" subtitle={types ? `${types.pickup.orders} para recoger (${money(types.pickup.sales)}) · ${types.delivery.orders} a domicilio (${money(types.delivery.sales)})` : undefined} style={column}>
        <BarList empty="Todavía no hay cobros hoy." rows={([["cash", "Efectivo"], ["transfer", "Transferencia"], ["mixed", "Mixto"], ["on_delivery", "Por cobrar al entregar"], ["courtesy", "Cortesías"]] as const)
          .filter(([key]) => payments[key] > 0).map(([key, label]) => ({ key, label, value: payments[key], display: money(payments[key]) }))} />
      </Card>}
    </View>}

    {inventory && <Card title="Inventario" subtitle="Lo que falta o está por caducar." action={<ActionButton label="Comprar lo que falta" variant="secondary" onPress={() => onNavigate("purchases")} />}>
      <View style={styles.cardHeader}>
        <StatusPill tone={inventory.out ? "danger" : "neutral"} text={`${inventory.out} agotado(s)`} />
        <StatusPill tone={inventory.critical ? "danger" : "neutral"} text={`${inventory.critical} urgente(s)`} />
        <StatusPill tone={inventory.low ? "warning" : "neutral"} text={`${inventory.low} bajo(s)`} />
        <StatusPill tone={inventory.expiring_count ? "warning" : "neutral"} text={`${inventory.expiring_count} por caducar`} />
      </View>
      {!inventory.shortages.length && !inventory.expiring.length && <ThemedText style={styles.muted}>Todo en orden: no falta nada ni hay caducidades próximas.</ThemedText>}
      {inventory.shortages.map((row) => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`${row.name}, ${shortageLabel[row.status]}, tienes ${quantity(row.current_stock)} de ${quantity(row.minimum_stock)} ${row.unit ?? ""}`} onPress={() => onNavigate("inventory")} style={styles.tableRow}>
        <ThemedText numberOfLines={1} style={[styles.grow, styles.rowTitle]}>{row.name}</ThemedText>
        <ThemedText style={styles.muted}>{quantity(row.current_stock)} / {quantity(row.minimum_stock)} {row.unit ?? ""}</ThemedText>
        <StatusPill tone={row.status === "low" ? "warning" : "danger"} text={shortageLabel[row.status]} />
      </Pressable>)}
      {inventory.expiring.map((row, index) => <Pressable key={`${row.ingredient}-${index}`} accessibilityRole="button" onPress={() => onNavigate("inventory")} style={styles.tableRow}>
        <ThemedText numberOfLines={1} style={[styles.grow, styles.rowTitle]}>{row.ingredient}</ThemedText>
        <ThemedText style={styles.muted}>{quantity(row.quantity)} {row.unit ?? ""}</ThemedText>
        <StatusPill tone="warning" text={`Caduca ${new Date(`${row.expires_at}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`} />
      </Pressable>)}
    </Card>}
  </View>;
}
