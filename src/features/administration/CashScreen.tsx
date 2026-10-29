import { ActionButton } from "../../components/ActionButton";
import {ThemedText} from "../../theme/ThemedText";
import {useTheme,useThemedStyles} from "../../theme/ThemeProvider";
import type {Theme} from "../../theme/tokens";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { confirmAction } from "../../components/ConfirmationDialog";
import { api } from "../../api";

type CashMovement = {
  id: number;
  type: "income" | "expense";
  amount: number;
  category: string;
  description?: string | null;
  created_at?: string | null;
  user?: { id: number; name: string } | null;
};

type CashSummary = {
  gross_sales?: number;
  cash_sales?: number;
  transfer_sales?: number;
  mixed_sales?: number;
  courtesy_total?: number;
  discounts?: number;
  cancelled_total?: number;
  cash_purchases?: number;
  other_income?: number;
  other_expense?: number;
  expected_cash?: number;
  orders?: number;
};

type CashDay = {
  id: number | null;
  date: string;
  status: "not_opened" | "open" | "closed";
  is_closed: boolean;
  opening_amount: number;
  expected_amount?: number | null;
  actual_amount?: number | null;
  difference?: number | null;
  opened_at?: string | null;
  closed_at?: string | null;
  movements_count: number;
  movements: CashMovement[];
  summary: CashSummary;
};

type CashDayRow = Omit<CashDay, "movements" | "summary">;
type CashDaysResponse = { data: CashDayRow[]; current_page: number; last_page: number };

function money(value: number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function CashScreen({ token }: { token: string }) {
  const styles=useThemedStyles(createStyles);
  const {theme}=useTheme();
  const [day, setDay] = useState<CashDay | null>(null);
  const [history, setHistory] = useState<CashDayRow[]>([]);
  const [openingAmount, setOpeningAmount] = useState("0");
  const [actualAmount, setActualAmount] = useState("");
  const [movementType, setMovementType] = useState<"income" | "expense">("expense");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementCategory, setMovementCategory] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setBusy(true);
    setMessage("");
    try {
      const [current, days] = await Promise.all([
        api<CashDay>("/cash-days/current", token),
        api<CashDaysResponse>("/cash-days?per_page=15", token),
      ]);
      setDay(current);
      setHistory(days.data);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      if (showSpinner) setBusy(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function openDay() {
    setBusy(true);
    setMessage("");
    try {
      await api("/cash-days/open", token, {
        method: "POST",
        body: JSON.stringify({ opening_amount: Number(openingAmount) || 0 }),
      });
      setMessage("Caja abierta correctamente.");
      await load(false);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addMovement() {
    if (!day?.id || Number(movementAmount) <= 0 || !movementCategory.trim() || (movementType === "expense" && !movementDescription.trim())) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/cash-days/${day.id}/movements`, token, {
        method: "POST",
        body: JSON.stringify({
          type: movementType,
          amount: Number(movementAmount),
          category: movementCategory.trim(),
          description: movementDescription.trim() || null,
        }),
      });
      setMovementAmount("");
      setMovementCategory("");
      setMovementDescription("");
      setMessage("Movimiento registrado.");
      await load(false);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function closeDay() {
    if (!day?.id || Number(actualAmount) < 0) return;
    if (!await confirmAction("La caja quedará bloqueada para nuevos movimientos. ¿Confirmas el cierre?")) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/cash-days/${day.id}/close`, token, {
        method: "POST",
        body: JSON.stringify({ actual_amount: Number(actualAmount) }),
      });
      setActualAmount("");
      setMessage("Caja cerrada correctamente.");
      await load(false);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (busy && !day) return <ActivityIndicator color={theme.colors.primary} style={styles.loader} />;
  const summary = day?.summary ?? {};

  return <View style={styles.container}>
    {!!message && <ThemedText style={styles.notice}>{message}</ThemedText>}
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View>
          <ThemedText style={styles.title}>Caja de {day?.date ?? "hoy"}</ThemedText>
          <ThemedText style={styles.muted}>Estado: {day?.status === "open" ? "abierta" : day?.status === "closed" ? "cerrada" : "sin abrir"}</ThemedText>
        </View>
        <ActionButton label="Actualizar" variant="secondary" disabled={busy} onPress={() => load()} />
      </View>
      <View style={styles.metrics}>
        <Metric label="Ventas" value={money(summary.gross_sales)} />
        <Metric label="Efectivo" value={money(summary.cash_sales)} />
        <Metric label="Transferencias" value={money(summary.transfer_sales)} />
        <Metric label="Compras desde caja" value={money(summary.cash_purchases)} />
        <Metric label="Efectivo esperado" value={money(summary.expected_cash)} />
        <Metric label="Pedidos" value={String(summary.orders ?? 0)} />
      </View>
    </View>

    {day?.status === "not_opened" && <View style={styles.card}>
      <ThemedText style={styles.title}>Abrir caja</ThemedText>
      <TextInput style={styles.input} value={openingAmount} onChangeText={setOpeningAmount} keyboardType="decimal-pad" placeholder="Fondo inicial" />
      <ActionButton label="Abrir caja del día" disabled={busy || Number(openingAmount) < 0} onPress={openDay} />
    </View>}

    {day?.status === "open" && <>
      <View style={styles.card}>
        <ThemedText style={styles.title}>{movementType === "expense" ? "Registrar egreso de caja" : "Registrar entrada de caja"}</ThemedText>
        <ThemedText style={styles.muted}>Controla el dinero que {movementType === "expense" ? "sale para gastos" : "entra fuera de una venta"}. Quedará registrado con el usuario y la hora.</ThemedText>
        <View style={styles.actions}>
          {(["income", "expense"] as const).map((type) => <Pressable accessibilityRole="button" aria-pressed={!!(movementType === type)} key={type} onPress={() => setMovementType(type)} style={[styles.choice, movementType === type && styles.choiceActive]}><ThemedText>{type === "income" ? "Entrada" : "Egreso"}</ThemedText></Pressable>)}
        </View>
        <TextInput style={styles.input} value={movementAmount} onChangeText={setMovementAmount} keyboardType="decimal-pad" placeholder="Monto" />
        <TextInput style={styles.input} value={movementCategory} onChangeText={setMovementCategory} placeholder={movementType === "expense" ? "Concepto del egreso (ej. gas, transporte)" : "Concepto de la entrada"} />
        <TextInput style={styles.input} value={movementDescription} onChangeText={setMovementDescription} placeholder={movementType === "expense" ? "Motivo del gasto" : "Descripción opcional"} />
        <ActionButton label={movementType === "expense" ? "Registrar egreso" : "Registrar entrada"} disabled={busy || Number(movementAmount) <= 0 || !movementCategory.trim() || (movementType === "expense" && !movementDescription.trim())} onPress={addMovement} />
      </View>
      <View style={styles.card}>
        <ThemedText style={styles.title}>Cerrar caja</ThemedText>
        <ThemedText style={styles.muted}>Cuenta físicamente el efectivo antes de cerrar. El sistema calculará la diferencia contra {money(summary.expected_cash)}.</ThemedText>
        <TextInput style={styles.input} value={actualAmount} onChangeText={setActualAmount} keyboardType="decimal-pad" placeholder="Efectivo real contado" />
        <ActionButton label="Cerrar caja" variant="destructive" disabled={busy || actualAmount.trim() === "" || Number(actualAmount) < 0} onPress={closeDay} />
      </View>
    </>}

    {!!day?.movements.length && <View style={styles.card}>
      <ThemedText style={styles.title}>Movimientos del día</ThemedText>
      {day.movements.map((movement) => <View key={movement.id} style={styles.row}>
        <View style={styles.flex}><ThemedText style={styles.rowTitle}>{movement.category}</ThemedText><ThemedText style={styles.muted}>{movement.description || movement.user?.name || "Sin descripción"}</ThemedText></View>
        <ThemedText style={movement.type === "income" ? styles.income : styles.expense}>{movement.type === "income" ? "+" : "−"}{money(movement.amount)}</ThemedText>
      </View>)}
    </View>}

    <View style={styles.card}>
      <ThemedText style={styles.title}>Historial de caja</ThemedText>
      {history.length ? history.map((item) => <View key={item.id} style={styles.row}>
        <View style={styles.flex}><ThemedText style={styles.rowTitle}>{item.date}</ThemedText><ThemedText style={styles.muted}>{item.status === "closed" ? "Cerrada" : "Abierta"} · {item.movements_count} movimientos</ThemedText></View>
        <ThemedText style={styles.rowTitle}>{item.status === "closed" ? money(item.actual_amount) : money(item.opening_amount)}</ThemedText>
      </View>) : <ThemedText style={styles.muted}>Aún no hay cortes registrados.</ThemedText>}
    </View>
  </View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  const styles=useThemedStyles(createStyles);
  return <View style={styles.metric}><ThemedText style={styles.metricValue}>{value}</ThemedText><ThemedText style={styles.muted}>{label}</ThemedText></View>;
}

const createStyles=(theme:Theme)=>StyleSheet.create({
  container: { gap: 14 },
  loader: { margin: 40 },
  card: { ...theme.shadows.surface, backgroundColor: theme.colors.surface, borderRadius: theme.radius.section, gap: 14, padding: 20 },
  headingRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  title: { color: theme.colors.text, fontSize: 18 * theme.fontScale, fontWeight: "900" },
  muted: { color: theme.colors.textMuted },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { backgroundColor: theme.colors.primarySurface, borderRadius: theme.radius.card, flexGrow: 1, minWidth: 145, padding: 14 },
  metricValue: { color: theme.colors.primary, fontSize: 22 * theme.fontScale, fontWeight: "900" },
  input: { color:theme.colors.text, backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, minHeight: theme.control.minTouch, paddingHorizontal: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, minHeight: theme.control.minTouch, justifyContent: "center", padding: 11 },
  choiceActive: { backgroundColor: theme.colors.primarySurface },
  primary: { ...theme.shadows.surface, alignItems: "center", backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, minHeight: theme.control.minTouch, justifyContent: "center", padding: 12 },
  primaryText: { color: theme.colors.primaryText, fontWeight: "800" },
  outlineButton: { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, borderWidth: 1, minHeight: theme.control.minTouch, padding: 10 },
  outlineText: { color: theme.colors.primary, fontWeight: "800" },
  dangerButton: { alignItems: "center", backgroundColor: theme.colors.dangerSurface, borderColor: theme.colors.dangerSurface, borderRadius: theme.radius.pill, borderWidth: 1, minHeight: theme.control.minTouch, justifyContent: "center" },
  dangerText: { color: theme.colors.danger, fontWeight: "800" },
  disabled: { opacity: theme.control.disabledOpacity },
  notice: { backgroundColor: theme.colors.warningSurface, borderRadius: 10, color: theme.colors.warningText, padding: 12 },
  row: { alignItems: "center", borderTopColor: theme.colors.border, borderTopWidth: 1, flexDirection: "row", gap: 12, justifyContent: "space-between", paddingVertical: 12 },
  rowTitle: { color: theme.colors.text, fontWeight: "800" },
  flex: { flex: 1 },
  income: { color: theme.colors.successText, fontWeight: "900" },
  expense: { color: theme.colors.danger, fontWeight: "900" },
});
