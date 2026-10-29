import {ThemedText} from "../../theme/ThemedText";
import {useThemedStyles} from "../../theme/ThemeProvider";
import type {Theme} from "../../theme/tokens";
import {ActionButton} from "../../components/ActionButton";
import {Notice, useFeedback, type SetFeedback} from "../../components/Notice";
import {useFormErrors} from "../../forms/useFormErrors";
import {useActionGate} from "../../forms/useActionGate";
import {required, emailError, validDate, operationError, decimalInput} from "../../forms/validation";
import { useWorkGuard, useWork } from "../../work/WorkProvider";
import { usePaginatedResource, useRemoteResource } from "../../hooks/useRemoteResource";
import { Pagination, RemoteListStatus } from "../../components/RemoteListStatus";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { confirmAction } from "../../components/ConfirmationDialog";
import { api } from "../../api";
import { useNavigationField } from "../../navigation/NavigationContext";

type Address = { id: number; label: string; address: string; references?: string | null; map_url?: string | null; delivery_zone?: string | null; notes?: string | null; is_default: boolean };
type Customer = { id: number; name: string; phone: string; email?: string | null; birth_date?: string | null; notes?: string | null; active: boolean; points_balance?: number; addresses: Address[]; updated_at?: string };
type OrderRow = { id: number; daily_number: number; order_date: string; status: string; total: string | number; type: string };
type LoyaltyTransaction = { id: number; type: string; points: string | number; comment?: string | null; expires_at?: string | null; created_at: string };
type CustomerDetail = Customer & { orders?: OrderRow[]; loyalty_transactions?: LoyaltyTransaction[]; points_balance: number };
type LoyaltyRule = { id: number; name: string; type: string; threshold: string | number; points: string | number; expires_days?: number | null; courtesy_eligible: boolean; active: boolean };

const customerFieldLabels = {name:"el nombre",phone:"el teléfono",email:"el correo",birth_date:"la fecha de cumpleaños",label:"el nombre de la dirección",address:"la dirección",map_url:"el enlace del mapa",points:"los puntos",comment:"el motivo"};

async function callPhone(phone: string): Promise<void> {
  const normalized = phone.trim().replace(/[^\d+]/g, "");
  if (normalized) await Linking.openURL(`tel:${normalized}`);
}

export function CustomersScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const styles=useThemedStyles(createStyles);
  const work=useWork();
  const [navigationContext,setNavigationContext]=useNavigationField("customers",{search:"",page:1,selectedId:null as number|null});
  const directory = usePaginatedResource<Customer>("/customers", token, "los clientes", 300,true,{search:navigationContext.search,page:navigationContext.page});
  const [selectedId, setSelectedId] = useState<number | null>(navigationContext.selectedId);
  const detail = useRemoteResource<CustomerDetail>(selectedId ? `/customers/${selectedId}` : null, token, "el detalle del cliente");
  const rulesResource = useRemoteResource<LoyaltyRule[]>(isAdministrator ? "/loyalty-rules" : null, token, "las reglas de puntos");
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [message, setMessage, messageKind] = useFeedback();
  useEffect(() => { if (rulesResource.data) setRules(rulesResource.data); }, [rulesResource.data]);
  useEffect(()=>setNavigationContext({search:directory.search,page:directory.page,selectedId}),[directory.search,directory.page,selectedId]);

  async function refreshSelected() {
    directory.reload();
    if (selectedId) detail.reload();
  }

  return <View style={styles.container}>
    <Notice kind={messageKind} message={message}/>
    <View style={styles.card}>
      <ThemedText style={styles.title}>Buscar clientes</ThemedText>
      <View style={styles.inline}>
        <TextInput style={[styles.input, styles.flex]} value={directory.search} maxLength={100} onChangeText={directory.setSearch} onSubmitEditing={directory.reload} placeholder="Nombre o teléfono" />
        <ActionButton label="Buscar" variant="secondary" onPress={directory.reload} />
        <ActionButton label="Limpiar" variant="secondary" onPress={() => directory.setSearch("")} />
      </View>
    </View>
    <CustomerForm token={token} onSaved={refreshSelected} setMessage={setMessage} />
    <View style={styles.card}>
      <ThemedText style={styles.title}>Directorio</ThemedText>
      <RemoteListStatus {...directory} count={directory.items.length} emptyText="No hay clientes registrados." onRetry={directory.reload} />
      {directory.items.map((customer) => <Pressable accessibilityRole="button" key={customer.id} style={[styles.row, selectedId === customer.id && styles.selectedRow]} onPress={async () => {if(await work.leave())setSelectedId(customer.id);}}>
        <View style={styles.flex}><ThemedText style={styles.rowTitle}>{customer.name}</ThemedText><ThemedText style={styles.muted}>{customer.phone} · {customer.active ? "Activo" : "Inactivo"}</ThemedText></View>
        <ThemedText style={styles.points}>{Number(customer.points_balance ?? 0)} pts</ThemedText>
      </Pressable>)}
      <Pagination {...directory} onPage={directory.setPage} />
    </View>
    {selectedId !== null && <RemoteListStatus {...detail} count={detail.data ? 1 : 0} emptyText="Selecciona un cliente." onRetry={detail.reload} />}
    {detail.data && !detail.loading && !detail.error && <CustomerEditor key={detail.data.id} customer={detail.data} token={token} isAdministrator={isAdministrator} onSaved={refreshSelected} setMessage={setMessage} />}
    {isAdministrator && <>
      <RemoteListStatus {...rulesResource} count={rules.length} emptyText="No hay reglas de puntos registradas." onRetry={rulesResource.reload} />
      {!rulesResource.loading && !rulesResource.error && <LoyaltyRules token={token} rules={rules} setRules={setRules} setMessage={setMessage} />}
    </>}
  </View>;
}

function CustomerForm({ token, onSaved, setMessage }: { token: string; onSaved: () => Promise<void>; setMessage: SetFeedback }) {
  const styles=useThemedStyles(createStyles);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const action = useActionGate();
  const form = useFormErrors();
  useWorkGuard("customer-new", "el cliente nuevo", !!(name.trim()||phone.trim()||email.trim()||birthDate||notes.trim()),busy || action.busy);
  const save = () => action.run(saveImpl);
  async function saveImpl() {
    if(!form.validate({name:required(name,"el nombre"),phone:required(phone,"un teléfono"),email:emailError(email),birth_date:birthDate.trim()&&!validDate(birthDate.trim())?"Usa una fecha válida con formato AAAA-MM-DD.":""}))return;

    setBusy(true); setMessage("");
    try {
      await api("/customers", token, { method: "POST", body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() || null, birth_date: birthDate.trim() || null, notes: notes.trim() || null }) });
      setName(""); setPhone(""); setEmail(""); setBirthDate(""); setNotes("");
      setMessage("Cliente registrado."); try {await onSaved();} catch {setMessage("Los cambios se guardaron. No pudimos actualizar la lista; vuelve a cargarla.","warning");}
    } catch (error) { form.fromError(error,customerFieldLabels); setMessage(operationError(error,"guardar el cliente",true),"error"); } finally { setBusy(false); }
  }
  return <View style={styles.card}>
    <ThemedText style={styles.title}>Registrar cliente</ThemedText>
    <TextInput editable={!busy && !action.busy} style={styles.input} {...form.field("name")} required value={name} onChangeText={setName} placeholder="Nombre completo" />
    <View style={styles.inline}><TextInput editable={!busy && !action.busy} style={[styles.input, styles.flex]} {...form.field("phone")} required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Teléfono" /><TextInput editable={!busy && !action.busy} style={[styles.input, styles.flex]} {...form.field("email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Correo opcional" /></View>
    <TextInput editable={!busy && !action.busy} style={styles.input} {...form.field("birth_date")} value={birthDate} onChangeText={setBirthDate} placeholder="Cumpleaños AAAA-MM-DD (opcional)" />
    <TextInput editable={!busy && !action.busy} style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notas internas" />
    <ActionButton label="Registrar cliente" onPress={save} loading={busy || action.busy}/>
  </View>;
}

function CustomerEditor({ customer, token, isAdministrator, onSaved, setMessage }: { customer: CustomerDetail; token: string; isAdministrator: boolean; onSaved: () => Promise<void>; setMessage: SetFeedback }) {
  const styles=useThemedStyles(createStyles);
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
  const action = useActionGate();
  const form = useFormErrors();

  useEffect(() => { setName(customer.name); setPhone(customer.phone); setEmail(customer.email ?? ""); setBirthDate(customer.birth_date?.slice(0, 10) ?? ""); setNotes(customer.notes ?? ""); }, [customer.id, customer.updated_at]);

  useWorkGuard("customer-edit", "el cliente en edición", name!==customer.name || phone!==customer.phone || email!==(customer.email??"") || birthDate!==(customer.birth_date?.slice(0,10)??"") || notes!==(customer.notes??"") || !!(address.trim()||references.trim()||mapUrl.trim()||zone.trim()||addressNotes.trim()),busy || action.busy);
  const saveCustomer = () => action.run(saveCustomerImpl);
  async function saveCustomerImpl() {
    if(!form.validate({name:required(name,"el nombre"),phone:required(phone,"un teléfono"),email:emailError(email),birth_date:birthDate.trim()&&!validDate(birthDate.trim())?"Usa una fecha válida con formato AAAA-MM-DD.":""}))return;

    setBusy(true); setMessage("");
    try {
      await api(`/customers/${customer.id}`, token, { method: "PUT", body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() || null, birth_date: birthDate.trim() || null, notes: notes.trim() || null, active: customer.active }) });
      setMessage("Cliente actualizado."); try {await onSaved();} catch {setMessage("Los cambios se guardaron. No pudimos actualizar la lista; vuelve a cargarla.","warning");}
    } catch (error) { form.fromError(error,customerFieldLabels); setMessage(operationError(error,"guardar el cliente",true),"error"); } finally { setBusy(false); }
  }
  const toggleCustomer = () => action.run(toggleCustomerImpl);
  async function toggleCustomerImpl() {
    if (!await confirmAction(`${customer.name} ${customer.active ? "dejará de estar disponible para nuevas ventas" : "volverá a estar disponible para ventas"}.`,{title:customer.active?"Desactivar cliente":"Reactivar cliente",acceptLabel:customer.active?"Desactivar cliente":"Reactivar cliente",cancelLabel:"Conservar estado"})) return;
    setBusy(true); setMessage("");
    try { await api(`/customers/${customer.id}`, token, { method: "PUT", body: JSON.stringify({ active: !customer.active }) }); setMessage("Estado del cliente actualizado."); try {await onSaved();} catch {setMessage("Los cambios se guardaron. No pudimos actualizar la lista; vuelve a cargarla.","warning");} } catch (error) { form.fromError(error,customerFieldLabels); setMessage(operationError(error,"cambiar el estado del cliente",true),"error"); } finally { setBusy(false); }
  }
  const addAddress = () => action.run(addAddressImpl);
  async function addAddressImpl() {
    if(!form.validate({label:required(addressLabel,"un nombre para la dirección"),address:required(address,"la dirección")}))return;
    setBusy(true); setMessage("");
    try {
      await api(`/customers/${customer.id}/addresses`, token, { method: "POST", body: JSON.stringify({ label: addressLabel.trim(), address: address.trim(), references: references.trim() || null, map_url: mapUrl.trim() || null, delivery_zone: zone.trim() || null, notes: addressNotes.trim() || null, is_default: !customer.addresses.length }) });
      setAddress(""); setReferences(""); setMapUrl(""); setZone(""); setAddressNotes(""); setMessage("Dirección agregada."); try {await onSaved();} catch {setMessage("Los cambios se guardaron. No pudimos actualizar la lista; vuelve a cargarla.","warning");}
    } catch (error) { form.fromError(error,customerFieldLabels); setMessage(operationError(error,"guardar la dirección",true),"error"); } finally { setBusy(false); }
  }
  const makeDefault = (item:Address) => action.run(()=>makeDefaultImpl(item));
  async function makeDefaultImpl(item: Address) {
    setBusy(true); setMessage("");
    try { await api(`/customers/${customer.id}/addresses/${item.id}`, token, { method: "PUT", body: JSON.stringify({ is_default: true }) }); setMessage("Dirección predeterminada actualizada."); try {await onSaved();} catch {setMessage("Los cambios se guardaron. No pudimos actualizar la lista; vuelve a cargarla.","warning");} } catch (error) { form.fromError(error,customerFieldLabels); setMessage(operationError(error,"cambiar la dirección predeterminada",true),"error"); } finally { setBusy(false); }
  }
  const removeAddress = (item:Address) => action.run(()=>removeAddressImpl(item));
  async function removeAddressImpl(item: Address) {
    if (!await confirmAction(`Se quitará ${item.label} de las direcciones del cliente.`,{title:"Eliminar dirección",acceptLabel:"Eliminar dirección",cancelLabel:"Conservar dirección"})) return;
    setBusy(true); setMessage("");
    try { await api(`/customers/${customer.id}/addresses/${item.id}`, token, { method: "DELETE" }); setMessage("Dirección eliminada."); try {await onSaved();} catch {setMessage("Los cambios se guardaron. No pudimos actualizar la lista; vuelve a cargarla.","warning");} } catch (error) { form.fromError(error,customerFieldLabels); setMessage(operationError(error,"eliminar la dirección",true),"error"); } finally { setBusy(false); }
  }
  const adjustPoints = () => action.run(adjustPointsImpl);
  async function adjustPointsImpl() {
    if (!isAdministrator || !form.validate({points:!Number.isFinite(decimalInput(adjustment))||decimalInput(adjustment)===0?"Ingresa una cantidad distinta de cero.":"",comment:required(adjustmentComment,"el motivo")})) return;
    setBusy(true); setMessage("");
    try { await api(`/customers/${customer.id}/adjust-points`, token, { method: "POST", body: JSON.stringify({ points: decimalInput(adjustment), comment: adjustmentComment.trim() }) }); setAdjustment(""); setAdjustmentComment(""); setMessage("Puntos ajustados."); try {await onSaved();} catch {setMessage("Los cambios se guardaron. No pudimos actualizar la lista; vuelve a cargarla.","warning");} } catch (error) { form.fromError(error,customerFieldLabels); setMessage(operationError(error,"ajustar los puntos",true),"error"); } finally { setBusy(false); }
  }

  return <>
    <View style={styles.card}>
      <View style={styles.headingRow}><View><ThemedText style={styles.title}>{customer.name}</ThemedText><ThemedText style={styles.points}>{Number(customer.points_balance ?? 0)} puntos disponibles</ThemedText></View><View style={styles.actions}><ActionButton label="☎ Llamar" variant="secondary" onPress={() => callPhone(customer.phone)} /><ActionButton variant="destructive" label={customer.active?"Desactivar cliente":"Reactivar cliente"} onPress={toggleCustomer} loading={action.busy} loadingLabel="Procesando…"/></View></View>
      <TextInput editable={!busy && !action.busy} style={styles.input} {...form.field("name")} required value={name} onChangeText={setName} placeholder="Nombre" />
      <View style={styles.inline}><TextInput editable={!busy && !action.busy} style={[styles.input, styles.flex]} {...form.field("phone")} required value={phone} onChangeText={setPhone} placeholder="Teléfono" /><TextInput editable={!busy && !action.busy} style={[styles.input, styles.flex]} {...form.field("email")} value={email} onChangeText={setEmail} placeholder="Correo" autoCapitalize="none" /></View>
      <TextInput editable={!busy && !action.busy} style={styles.input} {...form.field("birth_date")} value={birthDate} onChangeText={setBirthDate} placeholder="Cumpleaños AAAA-MM-DD" />
      <TextInput editable={!busy && !action.busy} style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notas internas" />
      <ActionButton label="Guardar cambios" onPress={saveCustomer} loading={busy || action.busy}/>
    </View>
    <View style={styles.card}>
      <ThemedText style={styles.title}>Direcciones</ThemedText>
      {customer.addresses.map((item) => <View key={item.id} style={styles.row}><View style={styles.flex}><ThemedText style={styles.rowTitle}>{item.label}{item.is_default ? " · Predeterminada" : ""}</ThemedText><ThemedText>{item.address}</ThemedText>{item.delivery_zone && <ThemedText style={styles.muted}>Zona: {item.delivery_zone}</ThemedText>}{item.references && <ThemedText style={styles.muted}>Referencias: {item.references}</ThemedText>}</View><View style={styles.actions}>{!item.is_default && <ActionButton variant="secondary" label="Usar como predeterminada" onPress={()=>makeDefault(item)} loading={action.busy}/>}<ActionButton variant="destructive" label="Eliminar dirección" onPress={()=>removeAddress(item)} loading={action.busy} loadingLabel="Procesando…"/></View></View>)}
      <ThemedText style={styles.subtitle}>Agregar dirección</ThemedText>
      <View style={styles.inline}><TextInput editable={!busy && !action.busy} style={[styles.input, styles.flex]} {...form.field("label")} required value={addressLabel} onChangeText={setAddressLabel} placeholder="Alias" /><TextInput editable={!busy && !action.busy} style={[styles.input, styles.flex]} value={zone} onChangeText={setZone} placeholder="Zona de entrega" /></View>
      <TextInput editable={!busy && !action.busy} style={styles.input} {...form.field("address")} required value={address} onChangeText={setAddress} placeholder="Dirección completa" />
      <TextInput editable={!busy && !action.busy} style={styles.input} value={references} onChangeText={setReferences} placeholder="Referencias" />
      <TextInput editable={!busy && !action.busy} style={styles.input} {...form.field("map_url")} value={mapUrl} onChangeText={setMapUrl} autoCapitalize="none" placeholder="Enlace de mapa" />
      <TextInput editable={!busy && !action.busy} style={styles.input} value={addressNotes} onChangeText={setAddressNotes} placeholder="Notas de la dirección" />
      <ActionButton label="Agregar dirección" onPress={addAddress} loading={busy || action.busy}/>
    </View>
    {isAdministrator && <View style={styles.card}><ThemedText style={styles.title}>Ajuste administrativo de puntos</ThemedText><ThemedText style={styles.muted}>Usa una cantidad negativa para descontar puntos. El comentario es obligatorio.</ThemedText><View style={styles.inline}><TextInput editable={!busy && !action.busy} style={[styles.input, styles.flex]} {...form.field("points")} value={adjustment} onChangeText={setAdjustment} keyboardType="numbers-and-punctuation" placeholder="Puntos, por ejemplo -5" /><TextInput editable={!busy && !action.busy} style={[styles.input, styles.flex]} {...form.field("comment")} value={adjustmentComment} onChangeText={setAdjustmentComment} placeholder="Motivo" /></View><ActionButton label="Aplicar ajuste" onPress={adjustPoints} loading={busy || action.busy}/></View>}
    <View style={styles.card}><ThemedText style={styles.title}>Historial de pedidos</ThemedText>{customer.orders?.length ? customer.orders.slice(0, 15).map((order) => <View key={order.id} style={styles.row}><View><ThemedText style={styles.rowTitle}>Orden #{order.daily_number}</ThemedText><ThemedText style={styles.muted}>{order.order_date} · {order.type} · {order.status}</ThemedText></View><ThemedText style={styles.rowTitle}>${Number(order.total).toFixed(2)}</ThemedText></View>) : <ThemedText style={styles.muted}>Sin pedidos registrados.</ThemedText>}</View>
    <View style={styles.card}><ThemedText style={styles.title}>Movimientos de puntos</ThemedText>{customer.loyalty_transactions?.length ? customer.loyalty_transactions.slice(0, 20).map((transaction) => <View key={transaction.id} style={styles.row}><View style={styles.flex}><ThemedText style={styles.rowTitle}>{transaction.type}</ThemedText><ThemedText style={styles.muted}>{transaction.comment || new Date(transaction.created_at).toLocaleDateString()}</ThemedText></View><ThemedText style={Number(transaction.points) >= 0 ? styles.income : styles.expense}>{Number(transaction.points) > 0 ? "+" : ""}{transaction.points}</ThemedText></View>) : <ThemedText style={styles.muted}>Sin movimientos de puntos.</ThemedText>}</View>
  </>;
}

function LoyaltyRules({ token, rules, setRules, setMessage }: { token: string; rules: LoyaltyRule[]; setRules: (rules: LoyaltyRule[]) => void; setMessage: SetFeedback }) {
  const styles=useThemedStyles(createStyles);
  const [name, setName] = useState(""); const [type, setType] = useState("per_amount"); const [threshold, setThreshold] = useState("100"); const [points, setPoints] = useState("1"); const [expiresDays, setExpiresDays] = useState(""); const [courtesy, setCourtesy] = useState(false); const [busy, setBusy] = useState(false);
  const action = useActionGate();
  const save = () => action.run(saveImpl);
  async function saveImpl() {
    setBusy(true); setMessage("");
    try { const rule = await api<LoyaltyRule>("/loyalty-rules", token, { method: "POST", body: JSON.stringify({ name: name.trim(), type, threshold: type === "per_amount" ? Number(threshold) : 1, points: Number(points), expires_days: expiresDays ? Number(expiresDays) : null, courtesy_eligible: courtesy }) }); setRules([...rules, rule]); setName(""); setMessage("Regla guardada."); } catch (error) { setMessage(operationError(error,"guardar los cambios",true),"error"); } finally { setBusy(false); }
  }
  const disable = (rule:LoyaltyRule) => action.run(()=>disableImpl(rule));
  async function disableImpl(rule: LoyaltyRule) {
    if (!await confirmAction(`${rule.name} dejará de generar puntos en nuevos pedidos.`,{title:"Desactivar regla de puntos",acceptLabel:"Desactivar regla",cancelLabel:"Conservar regla"})) return;
    setBusy(true); try { await api(`/loyalty-rules/${rule.id}`, token, { method: "DELETE" }); setRules(rules.map((item) => item.id === rule.id ? { ...item, active: false } : item)); setMessage("Regla desactivada."); } catch (error) { setMessage(operationError(error,"guardar los cambios",true),"error"); } finally { setBusy(false); }
  }
  return <View style={styles.card}><ThemedText style={styles.title}>Reglas de puntos</ThemedText><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre de la regla" /><View style={styles.actions}>{[["per_amount", "Por monto"], ["per_order", "Por pedido"], ["promotion", "Promoción"], ["birthday", "Cumpleaños"]].map(([key, label]) => <Pressable accessibilityRole="button" aria-pressed={!!(type === key)} key={key} style={[styles.choice, type === key && styles.choiceActive]} onPress={() => setType(key)}><ThemedText>{label}</ThemedText></Pressable>)}</View><View style={styles.inline}>{type === "per_amount" && <TextInput style={[styles.input, styles.flex]} value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder="Cada $" />}<TextInput style={[styles.input, styles.flex]} value={points} onChangeText={setPoints} keyboardType="decimal-pad" placeholder="Puntos" /><TextInput style={[styles.input, styles.flex]} value={expiresDays} onChangeText={setExpiresDays} keyboardType="number-pad" placeholder="Caduca en días" /></View><Pressable accessibilityRole="button" aria-pressed={!!(courtesy)} style={[styles.choice, courtesy && styles.choiceActive]} onPress={() => setCourtesy(!courtesy)}><ThemedText>{courtesy ? "Las cortesías sí generan puntos" : "Las cortesías no generan puntos"}</ThemedText></Pressable><ActionButton label="Guardar regla" disabled={busy || !name.trim() || Number(points) <= 0} onPress={save} />{rules.map((rule) => <View key={rule.id} style={styles.row}><View style={styles.flex}><ThemedText style={styles.rowTitle}>{rule.name}</ThemedText><ThemedText style={styles.muted}>{rule.type} · {rule.points} puntos · {rule.active ? "Activa" : "Inactiva"}</ThemedText></View>{rule.active && <ActionButton label="Desactivar" variant="destructive" onPress={() => disable(rule)} />}</View>)}</View>;
}

const createStyles=(theme:Theme)=>StyleSheet.create({
  container: { gap: 14, minWidth: 0 }, card: { ...theme.shadows.surface, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.section, borderWidth: 1, gap: 14, padding: 20 }, loader: { margin: 40 }, title: { color: theme.colors.text, fontSize: 18 * theme.fontScale, fontWeight: "900" }, subtitle: { color: theme.colors.text, fontWeight: "900", marginTop: 8 }, muted: { color: theme.colors.textMuted, flexShrink: 1 }, notice: { backgroundColor: theme.colors.warningSurface, borderRadius: 10, color: theme.colors.warningText, padding: 12 }, input: { color:theme.colors.text, backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, minHeight: theme.control.minTouch, paddingHorizontal: 14 }, inline: { alignItems: "stretch", flexDirection: "row", flexWrap: "wrap", gap: 10 }, flex: { flexBasis: 240, flexGrow: 1, minWidth: 0 }, headingRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, row: { alignItems: "center", borderTopColor: theme.colors.border, borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between", paddingVertical: 12 }, selectedRow: { backgroundColor: theme.colors.warningSurface, borderRadius: 10, paddingHorizontal: 10 }, rowTitle: { color: theme.colors.text, fontWeight: "800", flexShrink: 1 }, points: { color: theme.colors.primary, fontWeight: "900" }, primary: { ...theme.shadows.surface, alignItems: "center", backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, justifyContent: "center", minHeight: theme.control.minTouch, padding: 12 }, primaryText: { color: theme.colors.primaryText, fontWeight: "800" }, outlineButton: { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, borderWidth: 1, minHeight: theme.control.minTouch, padding: 11 }, outlineText: { color: theme.colors.primary, fontWeight: "800" }, dangerButton: { backgroundColor: theme.colors.dangerSurface, borderColor: theme.colors.dangerSurface, borderRadius: theme.radius.pill, borderWidth: 1, minHeight: theme.control.minTouch, padding: 10 }, dangerText: { color: theme.colors.danger, fontWeight: "800" }, choice: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, justifyContent: "center", minHeight: theme.control.minTouch, padding: 11 }, choiceActive: { backgroundColor: theme.colors.primarySurface }, disabled: { opacity: theme.control.disabledOpacity }, income: { color: theme.colors.successText, fontWeight: "900" }, expense: { color: theme.colors.danger, fontWeight: "900" },
});
