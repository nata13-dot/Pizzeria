import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../api";

type Address = { id: number; label: string; address: string; references?: string | null; map_url?: string | null; delivery_zone?: string | null; notes?: string | null; is_default: boolean };
type Customer = { id: number; name: string; phone: string; email?: string | null; birth_date?: string | null; notes?: string | null; active: boolean; points_balance?: number; addresses: Address[]; updated_at?: string };
type CustomerPage = { data: Customer[]; current_page: number; last_page: number };
type OrderRow = { id: number; daily_number: number; order_date: string; status: string; total: string | number; type: string };
type LoyaltyTransaction = { id: number; type: string; points: string | number; comment?: string | null; expires_at?: string | null; created_at: string };
type CustomerDetail = Customer & { orders?: OrderRow[]; loyalty_transactions?: LoyaltyTransaction[]; points_balance: number };
type LoyaltyRule = { id: number; name: string; type: string; threshold: string | number; points: string | number; expires_days?: number | null; courtesy_eligible: boolean; active: boolean };

function confirmAction(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm(message));
  return new Promise((resolve) => Alert.alert("Confirmar", message, [
    { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
    { text: "Aceptar", onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

export function CustomersScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  const loadCustomers = useCallback(async (term = search) => {
    setBusy(true);
    setMessage("");
    try {
      const query = term.trim() ? `?search=${encodeURIComponent(term.trim())}` : "";
      const response = await api<CustomerPage>(`/customers${query}`, token);
      setCustomers(response.data);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [search, token]);

  const loadDetail = useCallback(async (id: number) => {
    setSelectedId(id);
    setBusy(true);
    setMessage("");
    try {
      setDetail(await api<CustomerDetail>(`/customers/${id}`, token));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { loadCustomers(""); }, [token]);
  useEffect(() => {
    if (!isAdministrator) return;
    api<LoyaltyRule[]>("/loyalty-rules", token).then(setRules).catch((error) => setMessage((error as Error).message));
  }, [isAdministrator, token]);

  async function refreshSelected() {
    await loadCustomers(search);
    if (selectedId) await loadDetail(selectedId);
  }

  return <View style={styles.container}>
    {!!message && <Text style={styles.notice}>{message}</Text>}
    <View style={styles.card}>
      <Text style={styles.title}>Buscar clientes</Text>
      <View style={styles.inline}>
        <TextInput style={[styles.input, styles.flex]} value={search} onChangeText={setSearch} onSubmitEditing={() => loadCustomers()} placeholder="Nombre o teléfono" />
        <Pressable style={styles.outlineButton} onPress={() => loadCustomers()}><Text style={styles.outlineText}>Buscar</Text></Pressable>
        <Pressable style={styles.outlineButton} onPress={() => { setSearch(""); loadCustomers(""); }}><Text style={styles.outlineText}>Limpiar</Text></Pressable>
      </View>
    </View>
    <CustomerForm token={token} onSaved={refreshSelected} setMessage={setMessage} />
    {busy && !customers.length ? <ActivityIndicator color="#cf4b32" style={styles.loader} /> : <View style={styles.card}>
      <Text style={styles.title}>Directorio</Text>
      {customers.length ? customers.map((customer) => <Pressable key={customer.id} style={[styles.row, selectedId === customer.id && styles.selectedRow]} onPress={() => loadDetail(customer.id)}>
        <View style={styles.flex}><Text style={styles.rowTitle}>{customer.name}</Text><Text style={styles.muted}>{customer.phone} · {customer.active ? "Activo" : "Inactivo"}</Text></View>
        <Text style={styles.points}>{Number(customer.points_balance ?? 0)} pts</Text>
      </Pressable>) : <Text style={styles.muted}>No se encontraron clientes.</Text>}
    </View>}
    {detail && <CustomerEditor customer={detail} token={token} isAdministrator={isAdministrator} onSaved={refreshSelected} setMessage={setMessage} />}
    {isAdministrator && <LoyaltyRules token={token} rules={rules} setRules={setRules} setMessage={setMessage} />}
  </View>;
}

function CustomerForm({ token, onSaved, setMessage }: { token: string; onSaved: () => Promise<void>; setMessage: (message: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMessage("");
    try {
      await api("/customers", token, { method: "POST", body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() || null, birth_date: birthDate.trim() || null, notes: notes.trim() || null }) });
      setName(""); setPhone(""); setEmail(""); setBirthDate(""); setNotes("");
      setMessage("Cliente registrado."); await onSaved();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <View style={styles.card}>
    <Text style={styles.title}>Registrar cliente</Text>
    <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre completo" />
    <View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Teléfono" /><TextInput style={[styles.input, styles.flex]} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Correo opcional" /></View>
    <TextInput style={styles.input} value={birthDate} onChangeText={setBirthDate} placeholder="Cumpleaños AAAA-MM-DD (opcional)" />
    <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notas internas" />
    <Pressable disabled={busy || !name.trim() || !phone.trim()} style={[styles.primary, (busy || !name.trim() || !phone.trim()) && styles.disabled]} onPress={save}><Text style={styles.primaryText}>{busy ? "Guardando..." : "Registrar cliente"}</Text></Pressable>
  </View>;
}

function CustomerEditor({ customer, token, isAdministrator, onSaved, setMessage }: { customer: CustomerDetail; token: string; isAdministrator: boolean; onSaved: () => Promise<void>; setMessage: (message: string) => void }) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [email, setEmail] = useState(customer.email ?? "");
  const [birthDate, setBirthDate] = useState(customer.birth_date?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [addressLabel, setAddressLabel] = useState("Casa");
  const [address, setAddress] = useState("");
  const [references, setReferences] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [zone, setZone] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentComment, setAdjustmentComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(customer.name); setPhone(customer.phone); setEmail(customer.email ?? ""); setBirthDate(customer.birth_date?.slice(0, 10) ?? ""); setNotes(customer.notes ?? ""); }, [customer.id, customer.updated_at]);

  async function saveCustomer() {
    setBusy(true); setMessage("");
    try {
      await api(`/customers/${customer.id}`, token, { method: "PUT", body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() || null, birth_date: birthDate.trim() || null, notes: notes.trim() || null, active: customer.active }) });
      setMessage("Cliente actualizado."); await onSaved();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function toggleCustomer() {
    if (!await confirmAction(`${customer.active ? "Desactivar" : "Reactivar"} a ${customer.name}?`)) return;
    setBusy(true); setMessage("");
    try { await api(`/customers/${customer.id}`, token, { method: "PUT", body: JSON.stringify({ active: !customer.active }) }); setMessage("Estado del cliente actualizado."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function addAddress() {
    setBusy(true); setMessage("");
    try {
      await api(`/customers/${customer.id}/addresses`, token, { method: "POST", body: JSON.stringify({ label: addressLabel.trim(), address: address.trim(), references: references.trim() || null, map_url: mapUrl.trim() || null, delivery_zone: zone.trim() || null, notes: addressNotes.trim() || null, is_default: !customer.addresses.length }) });
      setAddress(""); setReferences(""); setMapUrl(""); setZone(""); setAddressNotes(""); setMessage("Dirección agregada."); await onSaved();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function makeDefault(item: Address) {
    setBusy(true); setMessage("");
    try { await api(`/customers/${customer.id}/addresses/${item.id}`, token, { method: "PUT", body: JSON.stringify({ is_default: true }) }); setMessage("Dirección predeterminada actualizada."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function removeAddress(item: Address) {
    if (!await confirmAction(`Eliminar la dirección ${item.label}?`)) return;
    setBusy(true); setMessage("");
    try { await api(`/customers/${customer.id}/addresses/${item.id}`, token, { method: "DELETE" }); setMessage("Dirección eliminada."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function adjustPoints() {
    if (!isAdministrator || !Number(adjustment) || !adjustmentComment.trim()) return;
    setBusy(true); setMessage("");
    try { await api(`/customers/${customer.id}/adjust-points`, token, { method: "POST", body: JSON.stringify({ points: Number(adjustment), comment: adjustmentComment.trim() }) }); setAdjustment(""); setAdjustmentComment(""); setMessage("Puntos ajustados."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  return <>
    <View style={styles.card}>
      <View style={styles.headingRow}><View><Text style={styles.title}>{customer.name}</Text><Text style={styles.points}>{Number(customer.points_balance ?? 0)} puntos disponibles</Text></View><Pressable style={styles.dangerButton} onPress={toggleCustomer}><Text style={styles.dangerText}>{customer.active ? "Desactivar" : "Reactivar"}</Text></Pressable></View>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre" />
      <View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={phone} onChangeText={setPhone} placeholder="Teléfono" /><TextInput style={[styles.input, styles.flex]} value={email} onChangeText={setEmail} placeholder="Correo" autoCapitalize="none" /></View>
      <TextInput style={styles.input} value={birthDate} onChangeText={setBirthDate} placeholder="Cumpleaños AAAA-MM-DD" />
      <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notas internas" />
      <Pressable disabled={busy || !name.trim() || !phone.trim()} style={[styles.primary, busy && styles.disabled]} onPress={saveCustomer}><Text style={styles.primaryText}>Guardar cambios</Text></Pressable>
    </View>
    <View style={styles.card}>
      <Text style={styles.title}>Direcciones</Text>
      {customer.addresses.map((item) => <View key={item.id} style={styles.row}><View style={styles.flex}><Text style={styles.rowTitle}>{item.label}{item.is_default ? " · Predeterminada" : ""}</Text><Text>{item.address}</Text>{item.delivery_zone && <Text style={styles.muted}>Zona: {item.delivery_zone}</Text>}{item.references && <Text style={styles.muted}>Referencias: {item.references}</Text>}</View><View style={styles.actions}>{!item.is_default && <Pressable style={styles.outlineButton} onPress={() => makeDefault(item)}><Text style={styles.outlineText}>Predeterminar</Text></Pressable>}<Pressable style={styles.dangerButton} onPress={() => removeAddress(item)}><Text style={styles.dangerText}>Eliminar</Text></Pressable></View></View>)}
      <Text style={styles.subtitle}>Agregar dirección</Text>
      <View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={addressLabel} onChangeText={setAddressLabel} placeholder="Alias" /><TextInput style={[styles.input, styles.flex]} value={zone} onChangeText={setZone} placeholder="Zona de entrega" /></View>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Dirección completa" />
      <TextInput style={styles.input} value={references} onChangeText={setReferences} placeholder="Referencias" />
      <TextInput style={styles.input} value={mapUrl} onChangeText={setMapUrl} autoCapitalize="none" placeholder="Enlace de mapa" />
      <TextInput style={styles.input} value={addressNotes} onChangeText={setAddressNotes} placeholder="Notas de la dirección" />
      <Pressable disabled={busy || !addressLabel.trim() || !address.trim()} style={[styles.primary, (busy || !addressLabel.trim() || !address.trim()) && styles.disabled]} onPress={addAddress}><Text style={styles.primaryText}>Agregar dirección</Text></Pressable>
    </View>
    {isAdministrator && <View style={styles.card}><Text style={styles.title}>Ajuste administrativo de puntos</Text><Text style={styles.muted}>Usa una cantidad negativa para descontar puntos. El comentario es obligatorio.</Text><View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={adjustment} onChangeText={setAdjustment} keyboardType="numbers-and-punctuation" placeholder="Puntos, por ejemplo -5" /><TextInput style={[styles.input, styles.flex]} value={adjustmentComment} onChangeText={setAdjustmentComment} placeholder="Motivo" /></View><Pressable disabled={busy || !Number(adjustment) || !adjustmentComment.trim()} style={[styles.primary, (busy || !Number(adjustment) || !adjustmentComment.trim()) && styles.disabled]} onPress={adjustPoints}><Text style={styles.primaryText}>Aplicar ajuste</Text></Pressable></View>}
    <View style={styles.card}><Text style={styles.title}>Historial de pedidos</Text>{customer.orders?.length ? customer.orders.slice(0, 15).map((order) => <View key={order.id} style={styles.row}><View><Text style={styles.rowTitle}>Orden #{order.daily_number}</Text><Text style={styles.muted}>{order.order_date} · {order.type} · {order.status}</Text></View><Text style={styles.rowTitle}>${Number(order.total).toFixed(2)}</Text></View>) : <Text style={styles.muted}>Sin pedidos registrados.</Text>}</View>
    <View style={styles.card}><Text style={styles.title}>Movimientos de puntos</Text>{customer.loyalty_transactions?.length ? customer.loyalty_transactions.slice(0, 20).map((transaction) => <View key={transaction.id} style={styles.row}><View style={styles.flex}><Text style={styles.rowTitle}>{transaction.type}</Text><Text style={styles.muted}>{transaction.comment || new Date(transaction.created_at).toLocaleDateString()}</Text></View><Text style={Number(transaction.points) >= 0 ? styles.income : styles.expense}>{Number(transaction.points) > 0 ? "+" : ""}{transaction.points}</Text></View>) : <Text style={styles.muted}>Sin movimientos de puntos.</Text>}</View>
  </>;
}

function LoyaltyRules({ token, rules, setRules, setMessage }: { token: string; rules: LoyaltyRule[]; setRules: (rules: LoyaltyRule[]) => void; setMessage: (message: string) => void }) {
  const [name, setName] = useState(""); const [type, setType] = useState("per_amount"); const [threshold, setThreshold] = useState("100"); const [points, setPoints] = useState("1"); const [expiresDays, setExpiresDays] = useState(""); const [courtesy, setCourtesy] = useState(false); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMessage("");
    try { const rule = await api<LoyaltyRule>("/loyalty-rules", token, { method: "POST", body: JSON.stringify({ name: name.trim(), type, threshold: type === "per_amount" ? Number(threshold) : 1, points: Number(points), expires_days: expiresDays ? Number(expiresDays) : null, courtesy_eligible: courtesy }) }); setRules([...rules, rule]); setName(""); setMessage("Regla guardada."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function disable(rule: LoyaltyRule) {
    if (!await confirmAction(`Desactivar la regla ${rule.name}?`)) return;
    setBusy(true); try { await api(`/loyalty-rules/${rule.id}`, token, { method: "DELETE" }); setRules(rules.map((item) => item.id === rule.id ? { ...item, active: false } : item)); setMessage("Regla desactivada."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <View style={styles.card}><Text style={styles.title}>Reglas de puntos</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre de la regla" /><View style={styles.actions}>{[["per_amount", "Por monto"], ["per_order", "Por pedido"], ["promotion", "Promoción"], ["birthday", "Cumpleaños"]].map(([key, label]) => <Pressable key={key} style={[styles.choice, type === key && styles.choiceActive]} onPress={() => setType(key)}><Text>{label}</Text></Pressable>)}</View><View style={styles.inline}>{type === "per_amount" && <TextInput style={[styles.input, styles.flex]} value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder="Cada $" />}<TextInput style={[styles.input, styles.flex]} value={points} onChangeText={setPoints} keyboardType="decimal-pad" placeholder="Puntos" /><TextInput style={[styles.input, styles.flex]} value={expiresDays} onChangeText={setExpiresDays} keyboardType="number-pad" placeholder="Caduca en días" /></View><Pressable style={[styles.choice, courtesy && styles.choiceActive]} onPress={() => setCourtesy(!courtesy)}><Text>{courtesy ? "Las cortesías sí generan puntos" : "Las cortesías no generan puntos"}</Text></Pressable><Pressable disabled={busy || !name.trim() || Number(points) <= 0} style={[styles.primary, (busy || !name.trim() || Number(points) <= 0) && styles.disabled]} onPress={save}><Text style={styles.primaryText}>Guardar regla</Text></Pressable>{rules.map((rule) => <View key={rule.id} style={styles.row}><View style={styles.flex}><Text style={styles.rowTitle}>{rule.name}</Text><Text style={styles.muted}>{rule.type} · {rule.points} puntos · {rule.active ? "Activa" : "Inactiva"}</Text></View>{rule.active && <Pressable style={styles.dangerButton} onPress={() => disable(rule)}><Text style={styles.dangerText}>Desactivar</Text></Pressable>}</View>)}</View>;
}

const styles = StyleSheet.create({
  container: { gap: 14 }, card: { backgroundColor: "#fffdfa", borderRadius: 16, gap: 12, padding: 18 }, loader: { margin: 40 }, title: { color: "#29231f", fontSize: 18, fontWeight: "900" }, subtitle: { color: "#29231f", fontWeight: "900", marginTop: 8 }, muted: { color: "#796b61" }, notice: { backgroundColor: "#fff1cc", borderRadius: 10, color: "#5f4918", padding: 12 }, input: { backgroundColor: "white", borderColor: "#ddd1c5", borderRadius: 11, borderWidth: 1, minHeight: 50, paddingHorizontal: 14 }, inline: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 }, flex: { flex: 1, minWidth: 160 }, headingRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, row: { alignItems: "center", borderTopColor: "#eee4da", borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between", paddingVertical: 12 }, selectedRow: { backgroundColor: "#fff1cc", borderRadius: 10, paddingHorizontal: 10 }, rowTitle: { color: "#29231f", fontWeight: "800" }, points: { color: "#cf4b32", fontWeight: "900" }, primary: { alignItems: "center", backgroundColor: "#cf4b32", borderRadius: 11, justifyContent: "center", minHeight: 50, padding: 12 }, primaryText: { color: "white", fontWeight: "800" }, outlineButton: { borderColor: "#cf4b32", borderRadius: 10, borderWidth: 1, padding: 11 }, outlineText: { color: "#cf4b32", fontWeight: "800" }, dangerButton: { borderColor: "#a82e20", borderRadius: 10, borderWidth: 1, padding: 10 }, dangerText: { color: "#a82e20", fontWeight: "800" }, choice: { backgroundColor: "#eee4da", borderRadius: 9, padding: 11 }, choiceActive: { backgroundColor: "#f3b19f" }, disabled: { opacity: 0.45 }, income: { color: "#287347", fontWeight: "900" }, expense: { color: "#a82e20", fontWeight: "900" },
});
