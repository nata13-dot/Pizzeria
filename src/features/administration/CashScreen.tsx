import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
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

function confirmAction(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm(message));
  return new Promise((resolve) => Alert.alert("Confirmar", message, [
    { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
    { text: "Aceptar", onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

function money(value: number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function CashScreen({ token }: { token: string }) {
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
    if (!day?.id || Number(movementAmount) <= 0 || !movementCategory.trim()) return;
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

  if (busy && !day) return <ActivityIndicator color="#cf4b32" style={styles.loader} />;
  const summary = day?.summary ?? {};

  return <View style={styles.container}>
    {!!message && <Text style={styles.notice}>{message}</Text>}
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.title}>Caja de {day?.date ?? "hoy"}</Text>
          <Text style={styles.muted}>Estado: {day?.status === "open" ? "abierta" : day?.status === "closed" ? "cerrada" : "sin abrir"}</Text>
        </View>
        <Pressable disabled={busy} style={styles.outlineButton} onPress={() => load()}><Text style={styles.outlineText}>Actualizar</Text></Pressable>
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
      <Text style={styles.title}>Abrir caja</Text>
      <TextInput style={styles.input} value={openingAmount} onChangeText={setOpeningAmount} keyboardType="decimal-pad" placeholder="Fondo inicial" />
      <Pressable disabled={busy || Number(openingAmount) < 0} style={[styles.primary, busy && styles.disabled]} onPress={openDay}><Text style={styles.primaryText}>Abrir caja del día</Text></Pressable>
    </View>}

    {day?.status === "open" && <>
      <View style={styles.card}>
        <Text style={styles.title}>Entrada o egreso manual</Text>
        <View style={styles.actions}>
          {(["income", "expense"] as const).map((type) => <Pressable key={type} onPress={() => setMovementType(type)} style={[styles.choice, movementType === type && styles.choiceActive]}><Text>{type === "income" ? "Entrada" : "Egreso"}</Text></Pressable>)}
        </View>
        <TextInput style={styles.input} value={movementAmount} onChangeText={setMovementAmount} keyboardType="decimal-pad" placeholder="Monto" />
        <TextInput style={styles.input} value={movementCategory} onChangeText={setMovementCategory} placeholder="Categoría o motivo" />
        <TextInput style={styles.input} value={movementDescription} onChangeText={setMovementDescription} placeholder="Descripción opcional" />
        <Pressable disabled={busy || Number(movementAmount) <= 0 || !movementCategory.trim()} style={[styles.primary, (busy || Number(movementAmount) <= 0 || !movementCategory.trim()) && styles.disabled]} onPress={addMovement}><Text style={styles.primaryText}>Registrar movimiento</Text></Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Cerrar caja</Text>
        <Text style={styles.muted}>Cuenta físicamente el efectivo antes de cerrar. El sistema calculará la diferencia contra {money(summary.expected_cash)}.</Text>
        <TextInput style={styles.input} value={actualAmount} onChangeText={setActualAmount} keyboardType="decimal-pad" placeholder="Efectivo real contado" />
        <Pressable disabled={busy || actualAmount.trim() === "" || Number(actualAmount) < 0} style={[styles.dangerButton, (busy || actualAmount.trim() === "") && styles.disabled]} onPress={closeDay}><Text style={styles.dangerText}>Cerrar caja</Text></Pressable>
      </View>
    </>}

    {!!day?.movements.length && <View style={styles.card}>
      <Text style={styles.title}>Movimientos del día</Text>
      {day.movements.map((movement) => <View key={movement.id} style={styles.row}>
        <View style={styles.flex}><Text style={styles.rowTitle}>{movement.category}</Text><Text style={styles.muted}>{movement.description || movement.user?.name || "Sin descripción"}</Text></View>
        <Text style={movement.type === "income" ? styles.income : styles.expense}>{movement.type === "income" ? "+" : "−"}{money(movement.amount)}</Text>
      </View>)}
    </View>}

    <View style={styles.card}>
      <Text style={styles.title}>Historial de caja</Text>
      {history.length ? history.map((item) => <View key={item.id} style={styles.row}>
        <View style={styles.flex}><Text style={styles.rowTitle}>{item.date}</Text><Text style={styles.muted}>{item.status === "closed" ? "Cerrada" : "Abierta"} · {item.movements_count} movimientos</Text></View>
        <Text style={styles.rowTitle}>{item.status === "closed" ? money(item.actual_amount) : money(item.opening_amount)}</Text>
      </View>) : <Text style={styles.muted}>Aún no hay cortes registrados.</Text>}
    </View>
  </View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  loader: { margin: 40 },
  card: { backgroundColor: "#fffdfa", borderRadius: 16, gap: 12, padding: 18 },
  headingRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  title: { color: "#29231f", fontSize: 18, fontWeight: "900" },
  muted: { color: "#796b61" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { backgroundColor: "#f7f2e9", borderRadius: 12, flexGrow: 1, minWidth: 145, padding: 14 },
  metricValue: { color: "#cf4b32", fontSize: 22, fontWeight: "900" },
  input: { backgroundColor: "white", borderColor: "#ddd1c5", borderRadius: 11, borderWidth: 1, minHeight: 50, paddingHorizontal: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { backgroundColor: "#eee4da", borderRadius: 9, padding: 11 },
  choiceActive: { backgroundColor: "#f3b19f" },
  primary: { alignItems: "center", backgroundColor: "#cf4b32", borderRadius: 11, minHeight: 50, justifyContent: "center", padding: 12 },
  primaryText: { color: "white", fontWeight: "800" },
  outlineButton: { borderColor: "#cf4b32", borderRadius: 10, borderWidth: 1, padding: 10 },
  outlineText: { color: "#cf4b32", fontWeight: "800" },
  dangerButton: { alignItems: "center", borderColor: "#a82e20", borderRadius: 11, borderWidth: 1, minHeight: 50, justifyContent: "center" },
  dangerText: { color: "#a82e20", fontWeight: "800" },
  disabled: { opacity: 0.45 },
  notice: { backgroundColor: "#fff1cc", borderRadius: 10, color: "#5f4918", padding: 12 },
  row: { alignItems: "center", borderTopColor: "#eee4da", borderTopWidth: 1, flexDirection: "row", gap: 12, justifyContent: "space-between", paddingVertical: 12 },
  rowTitle: { color: "#29231f", fontWeight: "800" },
  flex: { flex: 1 },
  income: { color: "#287347", fontWeight: "900" },
  expense: { color: "#a82e20", fontWeight: "900" },
});
