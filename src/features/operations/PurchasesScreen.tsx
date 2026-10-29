import {ThemedText} from "../../theme/ThemedText";
import {ActionButton} from "../../components/ActionButton";
import {RemoteListStatus} from "../../components/RemoteListStatus";
import {useRemoteResource} from "../../hooks/useRemoteResource";
import {useFormErrors} from "../../forms/useFormErrors";
import {useActionGate} from "../../forms/useActionGate";
import { operationError, validDate, required } from "../../forms/validation";
import { moneySum } from "../../money";
import { useWorkField, useWorkGuard } from "../../work/WorkProvider";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useResponsiveLayout } from "../../layout/responsive";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { Notice, useFeedback } from "../../components/Notice";
import { api, ApiError } from "../../api";
import type { Ingredient, PaymentSource, Purchase, Supplier } from "./types";
import { Choices, confirmAction, dateText, localDateValue, moneyText, quantityText, Section, Tabs, useOpsStyles } from "./ui";
import { IngredientSearch } from "../recipes/wizard";
import { LineEditor, type PurchaseLine } from "./purchases/LineEditor";
import { ShortagePicker } from "./purchases/ShortagePicker";
import { PurchaseHistory, paymentSourceLabel, paymentSources } from "./purchases/PurchaseHistory";

type PurchaseTab = "register" | "history";
type Adding = { ingredientId: number; index: number | null } | null;

const newOperationKey = () => `purchase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const yesterday = () => { const date = new Date(); date.setDate(date.getDate() - 1); return localDateValue(date); };

/** Purchases as a ticket: purchase details, add products, running total, review and register. */
export function PurchasesScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const ops=useOpsStyles();
  const { compact, mobile } = useResponsiveLayout();
  const [tab, setTab] = useState<PurchaseTab>("register");
  const [historyKey, setHistoryKey] = useState(0);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [message, setMessage, kind] = useFeedback();
  const gate = useActionGate();
  const form = useFormErrors();
  const suppliers = useRemoteResource<Supplier[]>("/catalogs/suppliers", token, "los proveedores");

  const [supplierId, setSupplierId] = useWorkField<number | null>("purchase", "supplierId", null);
  const [purchasedAt, setPurchasedAt] = useWorkField("purchase", "purchasedAt", localDateValue);
  const [paymentSource, setPaymentSource] = useWorkField<PaymentSource>("purchase", "paymentSource", "cash");
  const [purchaseNotes, setPurchaseNotes] = useWorkField("purchase", "purchaseNotes", "");
  const [lines, setLines] = useWorkField<PurchaseLine[]>("purchase", "lines", []);
  const [operationKey, setOperationKey] = useWorkField<string>("purchase", "operationKey", "");
  const [details, setDetails] = useState(false);
  const [adding, setAdding] = useState<Adding>(null);
  const [shortage, setShortage] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [newSupplier, setNewSupplier] = useState<{ name: string; phone: string } | null>(null);

  const dirty = !!(lines.length || purchaseNotes.trim() || supplierId || purchasedAt !== localDateValue() || paymentSource !== "cash");
  useWorkGuard("purchase", "la compra", dirty, gate.busy, true);
  const activeSuppliers = (suppliers.data ?? []).filter((supplier) => supplier.active);
  const supplier = activeSuppliers.find((candidate) => candidate.id === supplierId) ?? null;
  const total = moneySum(lines.map((line) => line.total_cost));
  const term = supplierSearch.trim().toLocaleLowerCase();
  const visibleSuppliers = activeSuppliers.filter((candidate) => !term || candidate.name.toLocaleLowerCase().includes(term)).slice(0, 12);

  function changeLines(next: PurchaseLine[]) { setLines(next); setReviewing(false); }
  function saveLine(line: PurchaseLine) {
    const index = adding?.index ?? null;
    changeLines(index === null ? [...lines, line] : lines.map((current, i) => i === index ? line : current));
    setAdding(null);
  }

  async function revalidateLines(): Promise<boolean> {
    try {
      const current = await Promise.all([...new Set(lines.map((line) => line.ingredient_id))].map((id) => api<Ingredient>(`/ingredients/${id}`, token, { cache: "reload" })));
      const found = new Map(current.flatMap((ingredient) => (ingredient.presentations ?? []).map((presentation) => [presentation.id, { ingredient, presentation }] as const)));
      let changed = false;
      const next = lines.map((line) => {
        const match = found.get(line.ingredient_presentation_id);
        const invalid = !match || !match.ingredient.active || !match.presentation.active ? "Esta presentación ya no está disponible."
          : match.presentation.purchase_revision !== line.presentationRevision ? "Esta presentación cambió. Quita el renglón y agrégalo de nuevo." : "";
        if (invalid) changed = true;
        return { ...line, invalid: invalid || undefined };
      });
      setLines(next);
      if (changed) setMessage("Una o más presentaciones cambiaron. Quita esos renglones y agrégalos de nuevo antes de registrar.", "error");
      return !changed;
    } catch (error) { setMessage(operationError(error, "comprobar las presentaciones"), "error"); return false; }
  }

  function validDetails(): boolean {
    const ok = form.validate({ purchased_at: !validDate(purchasedAt) || purchasedAt > localDateValue() ? "Usa una fecha AAAA-MM-DD que no esté en el futuro." : "" });
    if (!ok) setDetails(true);
    return ok;
  }

  const review = () => gate.run(async () => {
    setMessage("");
    if (adding) { setMessage("Termina o cancela el producto que estás agregando antes de revisar.", "warning"); return; }
    if (!validDetails()) return;
    if (supplierId && !supplier) { setDetails(true); setMessage("El proveedor elegido ya no está disponible. Elige otro o continúa sin proveedor.", "error"); return; }
    if (await revalidateLines()) setReviewing(true);
  });

  const register = () => gate.run(async () => {
    if (!lines.length || !validDetails()) return;
    if (!(await revalidateLines())) { setReviewing(false); return; }
    if (!(await confirmAction(`Se registrarán ${lines.length} producto(s) por $${moneyText(total)} y aumentará el inventario.`, { title: "Registrar compra", acceptLabel: "Registrar compra", cancelLabel: "Seguir revisando" }))) return;
    const key = operationKey || newOperationKey();
    setOperationKey(key);
    setMessage("");
    try {
      const purchase = await api<Purchase>("/purchases", token, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          supplier_id: supplierId, purchased_at: purchasedAt, payment_source: paymentSource, notes: purchaseNotes.trim() || null,
          items: lines.map((line) => ({ ingredient_presentation_id: line.ingredient_presentation_id, presentations_quantity: line.presentations_quantity, total_cost: line.total_cost, expected_presentation_revision: line.presentationRevision, expires_at: line.expires_at, lot_code: line.lot_code })),
        }),
      });
      setLines([]); setPurchaseNotes(""); setSupplierId(null); setPaymentSource("cash"); setPurchasedAt(localDateValue()); setOperationKey("");
      setReviewing(false); setDetails(false); form.clear();
      setMessage(`Compra #${purchase.id} registrada. El inventario ya incluye lo que compraste.`);
      setHighlight(purchase.id); setHistoryKey((value) => value + 1); setTab("history");
    } catch (error) {
      const status = error instanceof ApiError ? error.status : typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      if (status >= 400 && status < 500) setOperationKey("");
      if (error instanceof ApiError && error.code === "presentation_changed") {
        setLines(lines.map((line) => ({ ...line, invalid: "Esta presentación cambió. Quita el renglón y agrégalo de nuevo." })));
        setReviewing(false); setMessage("Una presentación cambió mientras registrabas. Revisa los renglones marcados.", "error"); return;
      }
      const errors = typeof error === "object" && error && "errors" in error ? (error as { errors?: Record<string, unknown> }).errors : undefined;
      if (errors?.payment_source && paymentSource === "cash") { setDetails(true); setReviewing(false); setMessage(`Para pagar con Caja, la caja del ${dateText(purchasedAt)} debe estar abierta. Ábrela en el módulo Caja o elige otro origen del pago.`, "error"); return; }
      form.fromError(error, { purchased_at: "la fecha de compra", supplier_id: "el proveedor", items: "los productos (presentación, cantidad, costo y caducidad)" });
      setMessage(status >= 400 && status < 500 ? operationError(error, "registrar la compra") : "No pudimos confirmar si la compra se registró. Pulsa Registrar compra otra vez: si ya se había guardado no se duplicará.", status >= 400 && status < 500 ? "error" : "warning");
    }
  });

  const createSupplier = () => gate.run(async () => {
    if (!newSupplier || !form.validate({ supplier_name: required(newSupplier.name, "el nombre del proveedor") })) return;
    try {
      const created = await api<Supplier>("/catalogs/suppliers", token, { method: "POST", body: JSON.stringify({ name: newSupplier.name.trim(), phone: newSupplier.phone.trim() || null }) });
      setNewSupplier(null); setSupplierId(created.id); suppliers.reload(); setMessage(`Proveedor “${created.name}” registrado y elegido.`);
    } catch (error) {
      form.fromError(error, { name: "el nombre del proveedor", phone: "el teléfono" }, { name: "supplier_name", phone: "supplier_phone" });
      setMessage(operationError(error, "guardar el proveedor", true), "error");
    }
  });

  const discard = () => gate.run(async () => {
    if (!await confirmAction("Se quitarán todos los productos y datos de esta compra.", { title: "Descartar compra", acceptLabel: "Descartar compra", cancelLabel: "Conservar compra" })) return;
    setLines([]); setPurchaseNotes(""); setSupplierId(null); setPaymentSource("cash"); setPurchasedAt(localDateValue()); setOperationKey(""); setReviewing(false); setAdding(null); form.clear(); setMessage("");
  });

  const summary = `${supplier?.name ?? "Sin proveedor"} · ${purchasedAt === localDateValue() ? "Hoy" : dateText(purchasedAt)} · Pagó: ${paymentSourceLabel(paymentSource)}`;

  return <View style={[ops.screen, mobile && ops.screenMobile]}>
    <View style={[ops.toolbar, mobile && ops.toolbarMobile]}>
      <Tabs active={tab} items={[{ key: "register", label: "Registrar compra" }, { key: "history", label: "Historial" }]} onChange={(key) => setTab(key as PurchaseTab)} />
    </View>
    <Notice kind={kind} message={message} />

    {tab === "history" && <PurchaseHistory key={historyKey} token={token} highlightId={highlight} />}

    {tab === "register" && <>
      <Section title="Datos de la compra" compact={mobile}>
        {!details ? <View style={ops.row}>
          <ThemedText style={[ops.rowGrow, ops.strong]}>{summary}</ThemedText>
          <ActionButton label="Cambiar" accessibilityLabel="Cambiar proveedor, fecha o forma de pago" variant="secondary" onPress={() => setDetails(true)} />
        </View> : <>
          <ThemedText style={ops.label}>Proveedor (opcional)</ThemedText>
          {activeSuppliers.length > 6 && <TextInput label="Buscar proveedor" value={supplierSearch} onChangeText={setSupplierSearch} />}
          <RemoteListStatus loading={suppliers.loading && !suppliers.data} error={suppliers.error} count={1} emptyText="" onRetry={suppliers.reload} />
          <Choices value={supplierId ?? 0} onChange={(id) => setSupplierId(id || null)} options={[{ key: 0, label: "Sin proveedor" }, ...visibleSuppliers.map((candidate) => ({ key: candidate.id, label: candidate.name }))]} />
          {isAdministrator && (newSupplier ? <View style={ops.insetCard}>
            <View style={[ops.inline, compact && ops.inlineCompact]}>
              <TextInput style={ops.fieldGrow} label="Nombre del proveedor" required value={newSupplier.name} onChangeText={(name) => setNewSupplier({ ...newSupplier, name })} {...form.field("supplier_name")} />
              <TextInput style={ops.fieldGrow} label="Teléfono (opcional)" keyboardType="phone-pad" value={newSupplier.phone} onChangeText={(phone) => setNewSupplier({ ...newSupplier, phone })} {...form.field("supplier_phone")} />
            </View>
            <View style={ops.actionsRow}><ActionButton label="Guardar proveedor" loading={gate.busy} onPress={createSupplier} /><ActionButton label="Cancelar" variant="secondary" onPress={() => setNewSupplier(null)} /></View>
          </View> : <Pressable accessibilityRole="button" onPress={() => setNewSupplier({ name: "", phone: "" })} style={ops.backLink}><ThemedText style={ops.backLinkText}>+ Nuevo proveedor</ThemedText></Pressable>)}
          <ThemedText style={ops.label}>Fecha de compra</ThemedText>
          <View style={ops.actionsRow}>
            <Choices value={purchasedAt === localDateValue() ? "today" : purchasedAt === yesterday() ? "yesterday" : "other"} onChange={(choice) => { if (choice === "today") setPurchasedAt(localDateValue()); if (choice === "yesterday") setPurchasedAt(yesterday()); }} options={[{ key: "today", label: "Hoy" }, { key: "yesterday", label: "Ayer" }, { key: "other", label: "Otra fecha" }]} />
          </View>
          <TextInput label="Fecha (AAAA-MM-DD)" required autoCapitalize="none" value={purchasedAt} onChangeText={setPurchasedAt} {...form.field("purchased_at")} />
          <Choices label="¿Con qué se pagó?" value={paymentSource} onChange={setPaymentSource} options={paymentSources} />
          {paymentSource === "cash" && <ThemedText style={ops.muted}>Se registra como salida de la caja de esa fecha, que debe estar abierta.</ThemedText>}
          <TextInput label="Notas (opcional)" multiline style={ops.textArea} value={purchaseNotes} onChangeText={setPurchaseNotes} />
          <ActionButton label="Listo" variant="secondary" onPress={() => { if (validDetails()) setDetails(false); }} />
        </>}
      </Section>

      <Section title="Productos" subtitle={lines.length ? undefined : "Busca un insumo o usa “Comprar lo que falta”."} compact={mobile}>
        {lines.map((line, index) => <View style={ops.insetCard} key={`${line.ingredient_presentation_id}-${line.lot_code ?? ""}-${index}`}>
          <View style={ops.row}>
            <View style={ops.rowGrow}>
              <ThemedText style={ops.strong}>{line.ingredientName}</ThemedText>
              <ThemedText style={ops.muted}>{quantityText(line.presentations_quantity)} × {line.presentationName} → {quantityText(line.baseQuantity)} {line.baseUnitSymbol}</ThemedText>
              {(line.lot_code || line.expires_at) && <ThemedText style={ops.muted}>{line.lot_code ? `Lote ${line.lot_code}` : ""}{line.lot_code && line.expires_at ? " · " : ""}{line.expires_at ? `caduca ${dateText(line.expires_at)}` : ""}</ThemedText>}
              {!!line.invalid && <ThemedText accessibilityRole="alert" style={ops.statusDanger}>{line.invalid}</ThemedText>}
            </View>
            <ThemedText style={ops.value}>${moneyText(line.total_cost)}</ThemedText>
          </View>
          {!reviewing && <View style={ops.actionsRow}>
            {!line.invalid && <ActionButton label="Cambiar" accessibilityLabel={`Cambiar ${line.ingredientName}`} variant="secondary" disabled={gate.busy || !!adding} onPress={() => setAdding({ ingredientId: line.ingredient_id, index })} />}
            <ActionButton label="Quitar" accessibilityLabel={`Quitar ${line.ingredientName}`} variant="destructive" disabled={gate.busy} onPress={() => changeLines(lines.filter((_, i) => i !== index))} />
          </View>}
        </View>)}

        {!reviewing && adding && <LineEditor key={`${adding.ingredientId}-${adding.index}`} token={token} ingredientId={adding.ingredientId} editing={adding.index === null ? null : lines[adding.index] ?? null} purchasedAt={purchasedAt} isAdministrator={isAdministrator} onSave={saveLine} onCancel={() => setAdding(null)} />}
        {!reviewing && !adding && shortage && <ShortagePicker token={token} alreadyIn={(id) => lines.some((line) => line.ingredient_id === id)} onClose={() => setShortage(false)} onConfigure={(ingredientId) => { setShortage(false); setAdding({ ingredientId, index: null }); }} onAdd={(added) => { changeLines([...lines, ...added]); setShortage(false); setMessage(`Se agregaron ${added.length} producto(s). Revisa cantidades y precios.`, "info"); }} />}
        {!reviewing && !adding && !shortage && <>
          <ActionButton label="Comprar lo que falta" variant="secondary" onPress={() => setShortage(true)} />
          <IngredientSearch token={token} label="Buscar insumo para agregar" onPick={(ingredient) => setAdding({ ingredientId: ingredient.id, index: null })} picked={(ingredient) => lines.some((line) => line.ingredient_id === ingredient.id)} pickedLabel="✓ En la compra" />
        </>}
      </Section>

      <View style={[ops.section, ops.row, { alignItems: "center", gap: 12 }]} accessibilityLiveRegion="polite">
        <View style={ops.rowGrow}>
          <ThemedText style={ops.muted}>Total de la compra · {lines.length} producto(s)</ThemedText>
          <ThemedText style={ops.bigNumber}>${moneyText(total)}</ThemedText>
        </View>
        {!reviewing
          ? <ActionButton label="Revisar compra" loadingLabel="Comprobando…" disabled={!lines.length} disabledReason="Agrega al menos un producto." onPress={review} />
          : <View style={ops.actionsRow}><ActionButton label="Volver a editar" variant="secondary" disabled={gate.busy} onPress={() => setReviewing(false)} /><ActionButton label="Registrar compra y aumentar inventario" loadingLabel="Registrando…" loading={gate.busy} onPress={register} /></View>}
      </View>
      {reviewing && <Notice kind="info" message={`${summary}. Se sumará al inventario exactamente lo que aparece en cada producto.`} />}
      {dirty && !reviewing && <Pressable accessibilityRole="button" onPress={discard} style={ops.backLink}><ThemedText style={ops.dangerText}>Descartar esta compra</ThemedText></Pressable>}
    </>}
  </View>;
}
