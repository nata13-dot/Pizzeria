import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { api } from "../../api";
import { getConfiguredThermalPrinter, isNativeAndroid, saveThermalPaperWidth, selectThermalPrinter, type SavedPrinter, type ThermalPaperWidth } from "../../printing";
import { LogoPicker } from "./LogoPicker";

type SocialLink = { name: string; value: string };
type BusinessProfile = { name: string; phone?: string | null; address?: string | null; tax_id?: string | null; receipt_footer?: string | null; primary_color?: string | null; secondary_color?: string | null; social_links?: SocialLink[] | null; show_business_details?: boolean; logo_path?: string | null };
type DeliveryZone = { name: string; kind?: "colony" | "auxiliary"; fee: number; active: boolean };
type PaymentMethod = { key: "cash" | "transfer"; label: string; active: boolean };
type Settings = { pending_payment_minutes: number; kitchen_lead_minutes: number; delivery_lead_minutes: number; half_and_half_extra: number; additional_wing_flavor_extra: number; max_wing_flavors: number; delivery_zones: DeliveryZone[]; payment_methods: PaymentMethod[]; show_kitchen_prices: boolean; loyalty_enabled: boolean; loyalty_point_value: number };

export function SettingsScreen({ token }: { token: string }) {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logoBase64, setLogoBase64] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [printer, setPrinter] = useState<SavedPrinter | null>(null);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerMessage, setPrinterMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const [nextProfile, nextSettings] = await Promise.all([
        api<BusinessProfile>("/business-profile", token), api<Settings>("/settings", token),
      ]);
      setProfile({ ...nextProfile, social_links: nextProfile.social_links ?? [] });
      setSettings(nextSettings);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getConfiguredThermalPrinter().then(setPrinter).catch(() => undefined); }, []);

  async function configurePrinter() {
    setPrinterBusy(true); setPrinterMessage("");
    try { const selected = await selectThermalPrinter(); setPrinter(selected); if (selected) setPrinterMessage(`Impresora ${selected.name} guardada.`); }
    catch (error) { setPrinterMessage((error as Error).message); }
    finally { setPrinterBusy(false); }
  }
  async function changePaperWidth(width: ThermalPaperWidth) {
    setPrinterBusy(true); setPrinterMessage("");
    try { const updated = await saveThermalPaperWidth(width); setPrinter(updated ?? (printer ? { ...printer, paperWidth: width } : null)); setPrinterMessage(`Ancho de papel guardado: ${width} mm.`); }
    catch (error) { setPrinterMessage((error as Error).message); }
    finally { setPrinterBusy(false); }
  }

  async function saveProfile() {
    if (!profile) return; setBusy(true); setMessage("");
    try {
      const saved = await api<BusinessProfile>("/business-profile", token, { method: "PUT", body: JSON.stringify({ ...profile, social_links: (profile.social_links ?? []).filter((item) => item.name.trim() && item.value.trim()), ...(logoBase64.trim() ? { logo_base64: logoBase64.trim() } : {}), remove_logo: removeLogo }) });
      setProfile(saved); setLogoBase64(""); setRemoveLogo(false); setMessage("Datos del negocio guardados.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function saveSettings() {
    if (!settings) return; setBusy(true); setMessage("");
    try { setSettings(await api<Settings>("/settings", token, { method: "PUT", body: JSON.stringify({ settings }) })); setMessage("Ajustes operativos guardados."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  if (busy && (!profile || !settings)) return <ActivityIndicator color="#cf4b32" style={styles.loader} />;
  if (!profile || !settings) return <Text style={styles.notice}>{message || "No fue posible cargar los ajustes."}</Text>;

  function setNumber(key: keyof Settings, value: string) { setSettings((current) => current ? { ...current, [key]: Number(value) || 0 } : current); }
  function setZone(index: number, patch: Partial<DeliveryZone>) { setSettings((current) => current ? { ...current, delivery_zones: current.delivery_zones.map((zone, position) => position === index ? { ...zone, ...patch } : zone) } : current); }
  function setPayment(index: number, patch: Partial<PaymentMethod>) { setSettings((current) => current ? { ...current, payment_methods: current.payment_methods.map((method, position) => position === index ? { ...method, ...patch } : method) } : current); }
  function setSocial(index: number, patch: Partial<SocialLink>) { setProfile((current) => current ? { ...current, social_links: (current.social_links ?? []).map((link, position) => position === index ? { ...link, ...patch } : link) } : current); }

  return <View style={styles.container}>
    {!!message && <Text style={styles.notice}>{message}</Text>}
    <View style={styles.card}>
      <Text style={styles.title}>Impresora térmica</Text>
      <Text style={styles.muted}>Configura una sola vez la impresora que utilizará la impresión directa de tickets.</Text>
      {isNativeAndroid() ? <>
        <View style={styles.printerStatus}><Text style={styles.subtitle}>{printer?.name ?? "Sin impresora configurada"}</Text><Text style={styles.muted}>{printer ? `${printer.type === "tcp" ? "Wi-Fi / TCP" : "Bluetooth"}${printer.address ? ` · ${printer.address}` : ""}` : "Vincula una impresora Bluetooth en Android o registra su dirección IP."}</Text></View>
        <Text style={styles.label}>Ancho del papel</Text>
        <View style={styles.inline}>{([58, 80] as ThermalPaperWidth[]).map((width) => <Pressable disabled={printerBusy || !printer} key={width} style={[styles.choice, (printer?.paperWidth ?? 80) === width && styles.choiceActive, !printer && styles.disabled]} onPress={() => changePaperWidth(width)}><Text>{width} mm</Text></Pressable>)}</View>
        <Pressable disabled={printerBusy} style={[styles.primary, printerBusy && styles.disabled]} onPress={configurePrinter}><Text style={styles.primaryText}>{printerBusy ? "Abriendo configuración..." : printer ? "Cambiar impresora" : "Configurar impresora"}</Text></Pressable>
      </> : <Text style={styles.notice}>La configuración directa está disponible dentro de la aplicación Android. En navegador se utiliza el diálogo de impresión del sistema.</Text>}
      {!!printerMessage && <Text style={styles.notice}>{printerMessage}</Text>}
    </View>
    <View style={styles.card}>
      <Text style={styles.title}>Datos del negocio y formato de nota</Text>
      <TextInput style={styles.input} value={profile.name} onChangeText={(name) => setProfile({ ...profile, name })} placeholder="Nombre comercial" />
      <View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={profile.phone ?? ""} onChangeText={(phone) => setProfile({ ...profile, phone })} placeholder="Teléfono" /><TextInput style={[styles.input, styles.flex]} value={profile.tax_id ?? ""} onChangeText={(tax_id) => setProfile({ ...profile, tax_id })} placeholder="RFC / identificación fiscal" /></View>
      <TextInput style={styles.input} value={profile.address ?? ""} onChangeText={(address) => setProfile({ ...profile, address })} placeholder="Dirección" />
      <TextInput style={styles.input} value={profile.receipt_footer ?? ""} onChangeText={(receipt_footer) => setProfile({ ...profile, receipt_footer })} placeholder="Mensaje de agradecimiento" />
      <View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={profile.primary_color ?? "#cf4b32"} onChangeText={(primary_color) => setProfile({ ...profile, primary_color })} placeholder="#cf4b32" /><TextInput style={[styles.input, styles.flex]} value={profile.secondary_color ?? "#29231f"} onChangeText={(secondary_color) => setProfile({ ...profile, secondary_color })} placeholder="#29231f" /></View>
      <Pressable style={[styles.choice, profile.show_business_details !== false && styles.choiceActive]} onPress={() => setProfile({ ...profile, show_business_details: profile.show_business_details === false })}><Text>{profile.show_business_details === false ? "Datos comerciales ocultos en notas" : "Datos comerciales visibles en notas"}</Text></Pressable>
      <Text style={styles.subtitle}>Redes sociales</Text>
      {(profile.social_links ?? []).map((link, index) => <View style={styles.inline} key={`social-${index}`}><TextInput style={[styles.input, styles.flex]} value={link.name} onChangeText={(name) => setSocial(index, { name })} placeholder="Red" /><TextInput style={[styles.input, styles.flex]} value={link.value} onChangeText={(value) => setSocial(index, { value })} placeholder="Usuario o enlace" /><Pressable style={styles.dangerButton} onPress={() => setProfile({ ...profile, social_links: (profile.social_links ?? []).filter((_, position) => position !== index) })}><Text style={styles.dangerText}>Quitar</Text></Pressable></View>)}
      <Pressable style={styles.outlineButton} onPress={() => setProfile({ ...profile, social_links: [...(profile.social_links ?? []), { name: "", value: "" }] })}><Text style={styles.outlineText}>Agregar red social</Text></Pressable>
      <Text style={styles.subtitle}>Logo</Text>
      <Text style={styles.muted}>{profile.logo_path ? "Hay un logo guardado. Puedes reemplazarlo seleccionando otra imagen." : "Selecciona el logo que aparecerá en notas, tickets y documentos."}</Text>
      <LogoPicker value={logoBase64} onChange={(value) => { setLogoBase64(value); setRemoveLogo(false); }} onError={setMessage} maximumBytes={1024 * 1024} />
      {!!logoBase64 && <Pressable style={styles.dangerButton} onPress={() => setLogoBase64("")}><Text style={styles.dangerText}>Descartar imagen seleccionada</Text></Pressable>}
      {profile.logo_path && <Pressable style={[styles.choice, removeLogo && styles.choiceActive]} onPress={() => setRemoveLogo(!removeLogo)}><Text>{removeLogo ? "El logo se eliminará al guardar" : "Conservar logo actual"}</Text></Pressable>}
      <Pressable disabled={busy || !profile.name.trim()} style={[styles.primary, busy && styles.disabled]} onPress={saveProfile}><Text style={styles.primaryText}>Guardar datos del negocio</Text></Pressable>
    </View>

    <View style={styles.card}>
      <Text style={styles.title}>Flujo de pedidos</Text>
      <NumberField label="Minutos máximos pendiente de pago" value={settings.pending_payment_minutes} onChange={(value) => setNumber("pending_payment_minutes", value)} />
      <NumberField label="Anticipación para cocina (minutos)" value={settings.kitchen_lead_minutes} onChange={(value) => setNumber("kitchen_lead_minutes", value)} />
      <NumberField label="Anticipación para reparto (minutos)" value={settings.delivery_lead_minutes} onChange={(value) => setNumber("delivery_lead_minutes", value)} />
      <View style={styles.inline}><NumberField label="Extra mitad y mitad" value={settings.half_and_half_extra} onChange={(value) => setNumber("half_and_half_extra", value)} /><NumberField label="Extra por sabor de alitas" value={settings.additional_wing_flavor_extra} onChange={(value) => setNumber("additional_wing_flavor_extra", value)} /><NumberField label="Máximo sabores de alitas" value={settings.max_wing_flavors} onChange={(value) => setNumber("max_wing_flavors", value)} /></View>
      <Pressable style={[styles.choice, settings.show_kitchen_prices && styles.choiceActive]} onPress={() => setSettings({ ...settings, show_kitchen_prices: !settings.show_kitchen_prices })}><Text>{settings.show_kitchen_prices ? "Cocina puede ver precios" : "Cocina no ve precios"}</Text></Pressable>
    </View>

    <View style={styles.card}>
      <Text style={styles.title}>Colonias y juntas auxiliares</Text>
      <Text style={styles.muted}>Registra las localidades disponibles para reparto. El costo adicional puede ser $0.</Text>
      {settings.delivery_zones.map((zone, index) => <View style={styles.zoneCard} key={`delivery-zone-${index}`}><TextInput style={styles.input} value={zone.name} onChangeText={(name) => setZone(index, { name })} placeholder="Nombre de la colonia o junta auxiliar" /><View style={styles.inline}><Pressable style={[styles.choice, (zone.kind ?? "colony") === "colony" && styles.choiceActive]} onPress={() => setZone(index, { kind: "colony" })}><Text>Colonia</Text></Pressable><Pressable style={[styles.choice, zone.kind === "auxiliary" && styles.choiceActive]} onPress={() => setZone(index, { kind: "auxiliary" })}><Text>Junta auxiliar</Text></Pressable><TextInput style={[styles.input, styles.flex]} value={String(zone.fee)} onChangeText={(fee) => setZone(index, { fee: Number(fee) || 0 })} keyboardType="decimal-pad" placeholder="Costo extra" /></View><View style={styles.inline}><Pressable style={[styles.choice, zone.active && styles.choiceActive]} onPress={() => setZone(index, { active: !zone.active })}><Text>{zone.active ? "Disponible para reparto" : "No disponible"}</Text></Pressable><Pressable style={styles.dangerButton} onPress={() => setSettings({ ...settings, delivery_zones: settings.delivery_zones.filter((_, position) => position !== index) })}><Text style={styles.dangerText}>Eliminar</Text></Pressable></View></View>)}
      <Pressable style={styles.outlineButton} onPress={() => setSettings({ ...settings, delivery_zones: [...settings.delivery_zones, { name: "", kind: "colony", fee: 0, active: true }] })}><Text style={styles.outlineText}>Agregar colonia o junta auxiliar</Text></Pressable>
    </View>

    <View style={styles.card}>
      <Text style={styles.title}>Métodos de pago y puntos</Text>
      {settings.payment_methods.map((method, index) => <View style={styles.inline} key={method.key}><Text style={styles.fixedLabel}>{method.key === "cash" ? "Efectivo" : "Transferencia"}</Text><TextInput style={[styles.input, styles.flex]} value={method.label} onChangeText={(label) => setPayment(index, { label })} placeholder="Etiqueta" /><Pressable style={[styles.choice, method.active && styles.choiceActive]} onPress={() => setPayment(index, { active: !method.active })}><Text>{method.active ? "Activo" : "Inactivo"}</Text></Pressable></View>)}
      <Pressable style={[styles.choice, settings.loyalty_enabled && styles.choiceActive]} onPress={() => setSettings({ ...settings, loyalty_enabled: !settings.loyalty_enabled })}><Text>{settings.loyalty_enabled ? "Programa de puntos activo" : "Programa de puntos desactivado"}</Text></Pressable>
      <NumberField label="Valor monetario de cada punto" value={settings.loyalty_point_value} onChange={(value) => setNumber("loyalty_point_value", value)} />
      <Pressable disabled={busy || settings.delivery_zones.some((zone) => !zone.name.trim()) || !settings.payment_methods.some((method) => method.active)} style={[styles.primary, (busy || settings.delivery_zones.some((zone) => !zone.name.trim()) || !settings.payment_methods.some((method) => method.active)) && styles.disabled]} onPress={saveSettings}><Text style={styles.primaryText}>Guardar ajustes operativos</Text></Pressable>
    </View>
  </View>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return <View style={styles.numberField}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={String(value)} onChangeText={onChange} keyboardType="decimal-pad" /></View>;
}

const styles = StyleSheet.create({
  container: { gap: 14 }, card: { backgroundColor: "#fffdfa", borderRadius: 16, gap: 12, padding: 18 }, loader: { margin: 40 }, title: { color: "#29231f", fontSize: 18, fontWeight: "900" }, subtitle: { color: "#29231f", fontWeight: "900", marginTop: 6 }, muted: { color: "#796b61" }, label: { color: "#29231f", fontWeight: "700" }, notice: { backgroundColor: "#fff1cc", borderRadius: 10, color: "#5f4918", padding: 12 }, input: { backgroundColor: "white", borderColor: "#ddd1c5", borderRadius: 11, borderWidth: 1, minHeight: 50, paddingHorizontal: 14 }, multiline: { minHeight: 90, paddingVertical: 12, textAlignVertical: "top" }, inline: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 }, flex: { flex: 1, minWidth: 160 }, numberField: { flex: 1, gap: 6, minWidth: 190 }, fixedLabel: { fontWeight: "800", minWidth: 110 }, choice: { backgroundColor: "#eee4da", borderRadius: 9, padding: 11 }, choiceActive: { backgroundColor: "#f3b19f" }, primary: { alignItems: "center", backgroundColor: "#cf4b32", borderRadius: 11, justifyContent: "center", minHeight: 50, padding: 12 }, primaryText: { color: "white", fontWeight: "800" }, outlineButton: { alignSelf: "flex-start", borderColor: "#cf4b32", borderRadius: 10, borderWidth: 1, padding: 11 }, outlineText: { color: "#cf4b32", fontWeight: "800" }, dangerButton: { borderColor: "#a82e20", borderRadius: 10, borderWidth: 1, padding: 10 }, dangerText: { color: "#a82e20", fontWeight: "800" }, disabled: { opacity: 0.45 }, zoneCard: { backgroundColor: "#f8f3ed", borderColor: "#eadfd4", borderRadius: 13, borderWidth: 1, gap: 10, padding: 12 }, printerStatus: { backgroundColor: "#f8f3ed", borderColor: "#eadfd4", borderRadius: 12, borderWidth: 1, gap: 3, padding: 13 },
});
