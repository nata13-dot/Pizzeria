import { ActionButton } from "../../components/ActionButton";
import {ThemedText} from "../../theme/ThemedText";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useResponsiveLayout } from "../../layout/responsive";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { api } from "../../api";
import { useAppStyles } from "../../styles/appStyles";
import { Empty } from "../orders/shared";
import {useTheme} from "../../theme/ThemeProvider";
export function ReportsScreen({ token }: { token: string }) {
  const s=useAppStyles();
  const {theme}=useTheme();
  const { mobile } = useResponsiveLayout();
  const options = [
    ["cash-day", "Caja", "Apertura, cierre, entradas, salidas y efectivo esperado."],
    ["sales", "Ventas", "Pedidos, ventas, descuentos, cortesías y cancelaciones."],
    ["products", "Productos", "Unidades e importe vendido por producto."],
    ["inventory", "Inventario", "Existencias, consumo, mermas y próximos vencimientos."],
    ["purchases", "Compras", "Compras, proveedores y costos del periodo."],
    ["customers", "Clientes", "Frecuencia, consumo y actividad de clientes."],
    ["profit", "Utilidad", "Ingresos, costos y utilidad estimada."],
    ["times", "Tiempos", "Duración de preparación, cocina y entrega."],
  ];
  const [report, setReport] = useState(options[0][0]);
  const [data, setData] = useState<any>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load(next = report) {
    setBusy(true);
    setMessage("");
    try {
      const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
      setData(await api(`/reports/${next}${query ? `?${query}` : ""}`, token));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load(report);
  }, [report]);
  async function daily() {
    setBusy(true);
    try {
      const response = await api<any>("/reports/daily", token, { method: "POST" });
      setMessage("Reporte diario generado.");
      if (response.whatsapp_url) Linking.openURL(response.whatsapp_url);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[s.reportLayout, mobile && s.reportLayoutMobile]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.types}>
        {options.map(([key, label]) => (
          <Pressable accessibilityRole="button" aria-pressed={!!(report === key)} key={key} onPress={() => setReport(key)} style={[s.type, report === key && s.typeActive]}>
            <ThemedText>{label}</ThemedText>
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.reportHeading}>
        <ThemedText style={s.sectionTitle}>Reporte de {options.find(([key]) => key === report)?.[1]}</ThemedText>
        <ThemedText style={s.muted}>{options.find(([key]) => key === report)?.[2]}</ThemedText>
      </View>
      <View style={[s.reportActions, mobile && s.reportActionsMobile]}>
        <ActionButton label={`Generar reporte de ${options.find(([key]) => key === report)?.[1]}`} style={mobile && s.fullWidthAction ? s.fullWidthAction : undefined} onPress={() => load()} />
        {report === "cash-day" && <ActionButton label="Enviar resumen diario por WhatsApp" style={mobile && s.fullWidthAction ? s.fullWidthAction : undefined} onPress={daily} />}
      </View>
      <View style={s.inlineFields}><TextInput style={[s.input, s.flexField]} placeholder="Desde AAAA-MM-DD" value={from} onChangeText={setFrom} /><TextInput style={[s.input, s.flexField]} placeholder="Hasta AAAA-MM-DD" value={to} onChangeText={setTo} /></View>
      {busy ? <ActivityIndicator color={theme.colors.primary} style={{ margin: 30 }} /> : <ReportData key={report} data={data} />}
      {!!message && <ThemedText style={s.notice}>{message}</ThemedText>}
    </View>
  );
}
const reportLabels: Record<string, string> = {
  date: "Fecha", cash_day_id: "Folio de caja", closed_at: "Hora de cierre", opening_amount: "Fondo inicial",
  expected_amount: "Efectivo esperado al cierre", actual_amount: "Efectivo contado", difference: "Diferencia declarada",
  calculated_difference: "Diferencia calculada", orders: "Pedidos", gross_sales: "Ventas brutas", sales: "Ventas",
  cash: "Efectivo", transfer: "Transferencia", cash_only_orders: "Pedidos en efectivo", cash_only_sales: "Ventas en efectivo",
  transfer_only_orders: "Pedidos por transferencia", transfer_only_sales: "Ventas por transferencia", mixed_orders: "Pedidos con pago mixto",
  mixed_sales: "Ventas con pago mixto", uncollected_orders: "Pedidos pendientes de cobro", uncollected_sales: "Ventas pendientes de cobro",
  courtesy_orders: "Pedidos de cortesía", courtesy: "Cortesías", courtesy_total: "Importe de cortesías", discounts: "Descuentos",
  paid_discounts: "Descuentos cobrados", courtesy_discounts: "Descuentos en cortesías", cancelled: "Pedidos cancelados",
  cancelled_orders: "Pedidos cancelados", cancelled_total: "Importe cancelado", cancelled_discounts: "Descuentos cancelados",
  scheduled: "Pedidos programados", scheduled_orders: "Pedidos programados", scheduled_total: "Importe programado",
  cash_purchases: "Compras pagadas desde caja", other_income: "Otros ingresos", other_expenses: "Otros egresos",
  total_cash_outflows: "Total de salidas de efectivo", expected_cash: "Efectivo esperado", summary: "Resumen",
  by_day: "Desglose por día", order_date: "Fecha del pedido", daily_number: "Número de pedido", total: "Total",
  product: "Producto", product_name: "Producto", variant: "Presentación", variant_name: "Presentación", category: "Categoría",
  quantity: "Cantidad", units: "Unidades", revenue: "Ingresos", average_ticket: "Venta promedio", cost: "Costo",
  estimated_cost: "Costo estimado", profit: "Utilidad", gross_profit: "Utilidad bruta", margin: "Margen",
  ingredients: "Existencias por ingrediente", consumption: "Consumo", waste: "Mermas", waste_by_reason: "Mermas por motivo",
  waste_by_ingredient: "Mermas por ingrediente", expiring_batches: "Lotes próximos a vencer", current_stock: "Existencia actual",
  usable_stock: "Existencia disponible", expired_stock: "Existencia vencida", expiring_stock: "Existencia próxima a vencer",
  stock_status: "Estado de existencia", consumed_quantity: "Cantidad consumida", waste_quantity: "Cantidad de merma",
  sale_quantity: "Consumo por ventas", production_quantity: "Consumo en producción", returned_quantity: "Cantidad devuelta",
  total_quantity: "Cantidad total", unit: "Unidad", reason: "Motivo", purchases: "Compras", supplier: "Proveedor",
  customers: "Clientes", customer: "Cliente", customer_name: "Cliente", phone: "Teléfono", last_order_at: "Último pedido",
  first_order_at: "Primer pedido", total_spent: "Consumo total", completed_orders: "Pedidos completados",
  preparation_minutes: "Minutos de preparación", kitchen_minutes: "Minutos en cocina", delivery_minutes: "Minutos de entrega",
  average_minutes: "Promedio en minutos", minimum_minutes: "Mínimo en minutos", maximum_minutes: "Máximo en minutos",
  scheduled_at: "Fecha programada", status: "Estado", type: "Tipo", payment_method: "Forma de pago", name: "Nombre",
};
function reportLabel(key: string): string {
  return reportLabels[key] ?? key.replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase());
}
function reportValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  const translations: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", mixed: "Mixto", courtesy: "Cortesía", pickup: "Para recoger", delivery: "Entrega a domicilio", whatsapp: "WhatsApp", dine_in: "Consumo en local", critical: "Crítico", low: "Bajo", ok: "Correcto", cancelled: "Cancelado", confirmed: "Confirmado", completed: "Completado", pending_payment: "Pendiente de pago", scheduled: "Programado" };
  const text = String(value ?? "-");
  return translations[text] ?? text;
}
function ReportData({ data }: { data: any }) {
  const s=useAppStyles();
  if (!data) return <Empty />;
  if (Array.isArray(data)) {
    return (
      <FlatList
        data={data}
        keyExtractor={(item, index) => String(item.id ?? item.name ?? index)}
        renderItem={({ item }) => <ReportRow item={item} />}
        ListEmptyComponent={<Empty />}
      />
    );
  }
  return (
    <View style={s.metrics}>
      {Object.entries(data).map(([key, value]) => {
        if (Array.isArray(value)) return <View style={s.reportList} key={key}><ThemedText style={s.sectionTitle}>{reportLabel(key)}</ThemedText>{value.length ? value.map((item, index) => <ReportRow key={`${key}-${index}`} item={item} />) : <ThemedText style={s.muted}>Sin registros para este periodo.</ThemedText>}</View>;
        if (value && typeof value === "object") return <View style={s.reportList} key={key}><ThemedText style={s.sectionTitle}>{reportLabel(key)}</ThemedText><ReportData data={value} /></View>;
        return <Metric key={key} label={reportLabel(key)} value={reportValue(key, value)} />;
      })}
    </View>
  );
}
function ReportRow({ item }: { item: any }) {
  const s=useAppStyles();
  const entries = Object.entries(item).filter(([, value]) => typeof value !== "object").slice(0, 5);
  return (
    <View style={s.row}>
      <View>
        <ThemedText style={s.productName}>{String(item.name ?? item.product ?? item.date ?? item.order_date ?? item.id ?? "Registro")}</ThemedText>
        <ThemedText style={s.muted}>{entries.map(([key, value]) => `${reportLabel(key)}: ${reportValue(key, value)}`).join(" · ")}</ThemedText>
      </View>
    </View>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  const s=useAppStyles();
  return (
    <View style={s.metric}>
      <ThemedText style={s.number}>{value}</ThemedText>
      <ThemedText style={s.muted}>{label}</ThemedText>
    </View>
  );
}
