import {ThemedText} from "../../theme/ThemedText";
import {ActionButton} from "../../components/ActionButton";
import {Pagination, RemoteListStatus} from "../../components/RemoteListStatus";
import {usePaginatedResource, useRemoteResource} from "../../hooks/useRemoteResource";
import {useFormErrors} from "../../forms/useFormErrors";
import {useActionGate} from "../../forms/useActionGate";
import { operationError, decimalInput, moneyInput, validDate, required } from "../../forms/validation";
import { money, moneyDivide, moneySum } from "../../money";
import { useWorkField, useWorkGuard } from "../../work/WorkProvider";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useResponsiveLayout } from "../../layout/responsive";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { api, ApiError } from "../../api";
import type {
  Ingredient,
  IngredientPresentation,
  PaymentSource,
  Purchase,
  Supplier,
} from "./types";
import {
  appendUniqueById,
  confirmAction,
  dateText,
  EmptyState,
  Feedback,
  fetchPage,
  inputNumber,
  LoadingState,
  localDateValue,
  moneyText,
  numberValue,
  useOpsStyles,
  quantityText,
  Section,
  Tabs,
  WorkflowSteps,
} from "./ui";

type PurchaseTab = "register" | "history";
type PresentationChoice = IngredientPresentation & { ingredient: Ingredient };
type PurchaseLine = {
  ingredient_id: number;
  ingredient_presentation_id: number;
  ingredientName: string;
  presentationName: string;
  presentations_quantity: number;
  baseQuantity: number;
  baseUnitSymbol: string;
  total_cost: number;
  presentationRevision: string;
  presentationQuantity: number;
  presentationUnitSymbol: string;
  invalid?: string;
  expires_at?: string;
  lot_code?: string;
};

const paymentSources: { key: PaymentSource; label: string }[] = [
  { key: "cash", label: "Caja" },
  { key: "owner", label: "Dueño" },
  { key: "bank", label: "Banco" },
  { key: "credit", label: "Crédito" },
  { key: "other", label: "Otro" },
];

function paymentSourceLabel(source: PaymentSource): string {
  return paymentSources.find((item) => item.key === source)?.label ?? source;
}

export function PurchasesScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const ops=useOpsStyles();
  const { compact, mobile } = useResponsiveLayout();
  const [tab, setTab] = useState<PurchaseTab>("register");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseLastPage, setPurchaseLastPage] = useState(1);
  const [loadingMorePurchases, setLoadingMorePurchases] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const requestId = useRef(0);
  const saveLock = useRef(false);
  const action = useActionGate();
  const form = useFormErrors();

  const [supplierId, setSupplierId] = useWorkField<number | null>("purchase", "supplierId", null);
  const [purchasedAt, setPurchasedAt] = useWorkField("purchase", "purchasedAt", localDateValue);
  const [paymentSource, setPaymentSource] = useWorkField<PaymentSource>("purchase", "paymentSource", "cash");
  const [purchaseNotes, setPurchaseNotes] = useWorkField("purchase", "purchaseNotes", "");
  const [presentationId, setPresentationId] = useWorkField<number | null>("purchase", "presentationId", null);
  const [ingredientId, setIngredientId] = useWorkField<number | null>("purchase", "ingredientId", null);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const ingredientResults = usePaginatedResource<Ingredient>("/ingredients?active=1&per_page=25", token, "los insumos", 300, tab === "register");
  const ingredientDetail = useRemoteResource<Ingredient>(ingredientId ? `/ingredients/${ingredientId}` : null, token, "las presentaciones del insumo");
  const [presentationQuantity, setPresentationQuantity] = useWorkField("purchase", "presentationQuantity", "1");
  const [lineCost, setLineCost] = useWorkField("purchase", "lineCost", "");
  const [lineExpiry, setLineExpiry] = useWorkField("purchase", "lineExpiry", "");
  const [lineLot, setLineLot] = useWorkField("purchase", "lineLot", "");
  const [lines, setLines] = useWorkField<PurchaseLine[]>("purchase", "lines", []);
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);

  useWorkGuard("purchase", "la compra", !!(lines.length||purchaseNotes.trim()||lineCost||lineLot||lineExpiry||supplierId||purchasedAt!==localDateValue()||paymentSource!=="cash"||presentationQuantity!=="1"), saving || action.busy, true);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");

  const presentations = useMemo<PresentationChoice[]>(() => ingredientDetail.data?.active
    ? (ingredientDetail.data.presentations ?? []).filter((presentation) => presentation.active).map((presentation) => ({...presentation, ingredient: ingredientDetail.data!}))
    : [], [ingredientDetail.data]);
  const selectedPresentation = presentations.find((presentation) => presentation.id === presentationId) ?? null;
  const activeSuppliers = suppliers.filter((supplier) => supplier.active);
  const total = moneySum(lines.map(line => line.total_cost));
  const ingredientById = useMemo(() => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);
  const presentationById = useMemo(() => new Map(ingredients.flatMap((ingredient) =>
    (ingredient.presentations ?? []).map((presentation) => [presentation.id, presentation] as const),
  )), [ingredients]);

  async function load(initial = false): Promise<void> {
    const currentRequest = ++requestId.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const [purchaseResult, supplierResult] = await Promise.allSettled([
        fetchPage<Purchase>("/purchases", token),
        api<Supplier[]>("/catalogs/suppliers", token),
      ]);
      if (currentRequest !== requestId.current) return;
      if (purchaseResult.status === "fulfilled") {
        setPurchases(purchaseResult.value.data); setPurchasePage(purchaseResult.value.current_page); setPurchaseLastPage(purchaseResult.value.last_page);
        setSelectedPurchase((current) => current ? purchaseResult.value.data.find((purchase) => purchase.id === current.id) ?? current : null);
      }
      if (supplierResult.status === "fulfilled") setSuppliers(supplierResult.value);
      if (purchaseResult.status === "rejected" && supplierResult.status === "rejected") throw purchaseResult.reason;
      if (purchaseResult.status === "rejected") setError("No pudimos actualizar el historial. Puedes continuar registrando la compra.");
      if (supplierResult.status === "rejected") setError("No pudimos actualizar los proveedores. Se conserva la selección actual.");
      // Preserve unavailable supplier selection so save can explain the problem instead of silently replacing it.
    } catch (loadError) {
      if (currentRequest === requestId.current) setError(operationError(loadError, "cargar la información"));
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  async function loadMorePurchases(): Promise<void> {
    if (loadingMorePurchases || purchasePage >= purchaseLastPage) return;
    const currentRequest = requestId.current;
    setLoadingMorePurchases(true);
    setError("");
    try {
      const next = await fetchPage<Purchase>("/purchases", token, purchasePage + 1);
      if (currentRequest !== requestId.current) return;
      setPurchases((current) => appendUniqueById(current, next.data));
      setPurchasePage(next.current_page);
      setPurchaseLastPage(next.last_page);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError(operationError(loadError, "cargar la información"));
    } finally {
      if (currentRequest === requestId.current) setLoadingMorePurchases(false);
    }
  }

  useEffect(() => {
    load(true);
    return () => { requestId.current += 1; };
  }, [token]);
  useEffect(() => { ingredientResults.setSearch(ingredientSearch); }, [ingredientSearch]);

  function addLine(): void {
    const quantity = decimalInput(presentationQuantity);
    const cost = moneyInput(lineCost);
    if(!form.validate({
      presentation:!selectedPresentation?"Selecciona una presentación.":"",
      quantity:!Number.isFinite(quantity)||quantity<=0?"Ingresa una cantidad mayor que cero; usa punto o coma decimal.":"",
      cost:!Number.isFinite(cost)||cost<0?"Ingresa un costo válido, igual o mayor que cero.":"",
      purchased_at:!validDate(purchasedAt)||purchasedAt>localDateValue()?"Usa una fecha válida AAAA-MM-DD que no esté en el futuro.":"",
      expiry:lineExpiry&&(!validDate(lineExpiry)||lineExpiry<purchasedAt)?"Usa una fecha válida, igual o posterior a la compra.":"",
    }) || !selectedPresentation)return;
    let normalizedCost: number;
    try { normalizedCost = money(cost); moneySum([...lines.map(line => line.total_cost), normalizedCost]); }
    catch { setError("El costo o total supera el límite permitido. Reduce el importe antes de agregarlo."); return; }
    const baseQuantity = numberValue(selectedPresentation.base_quantity) * quantity;
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0 || !selectedPresentation.purchase_revision) {
      setError("La presentación seleccionada no tiene una conversión verificable. Actualiza la búsqueda o corrígela en Inventario.");
      return;
    }
    const nextLine: PurchaseLine = {
      ingredient_id: selectedPresentation.ingredient.id,
      ingredient_presentation_id: selectedPresentation.id,
      ingredientName: selectedPresentation.ingredient.name,
      presentationName: selectedPresentation.name,
      presentations_quantity: quantity,
      baseQuantity,
      baseUnitSymbol: selectedPresentation.ingredient.base_unit?.symbol ?? "u",
      total_cost: normalizedCost,
      presentationRevision: selectedPresentation.purchase_revision!,
      presentationQuantity: numberValue(selectedPresentation.quantity),
      presentationUnitSymbol: selectedPresentation.equivalent_unit?.symbol ?? "u",
      expires_at: lineExpiry || undefined,
      lot_code: lineLot.trim() || undefined,
    };
    setLines((current) => editingLine === null ? [...current, nextLine] : current.map((line, index) => index === editingLine ? nextLine : line));
    setEditingLine(null);
    setPresentationQuantity("1");
    setLineCost("");
    setLineExpiry("");
    setLineLot("");
    setError("");
  }

  function editLine(index: number): void {
    const line = lines[index];
    setEditingLine(index); setIngredientId(line.ingredient_id); setPresentationId(line.ingredient_presentation_id);
    setPresentationQuantity(String(line.presentations_quantity)); setLineCost(String(line.total_cost));
    setLineExpiry(line.expires_at ?? ""); setLineLot(line.lot_code ?? ""); setError("");
  }

  async function revalidateLines(): Promise<boolean> {
    let changed = false;
    try {
      const currentIngredients = await Promise.all([...new Set(lines.map((line) => line.ingredient_id))].map((id) => api<Ingredient>(`/ingredients/${id}`, token, {cache:"reload"})));
      const currentPresentations = new Map(currentIngredients.flatMap((ingredient) => (ingredient.presentations ?? []).map((presentation) => [presentation.id, {ingredient, presentation}] as const)));
      setLines((current) => current.map((line) => {
        const found = currentPresentations.get(line.ingredient_presentation_id);
        const invalid = !found || !found.ingredient.active || !found.presentation.active ? "Esta presentación ya no está disponible."
          : found.presentation.purchase_revision !== line.presentationRevision ? "Esta presentación cambió. Revísala antes de registrar la compra." : "";
        if (invalid) changed = true;
        return {...line, invalid: invalid || undefined};
      }));
    } catch (revalidationError) {
      setError(operationError(revalidationError, "comprobar las presentaciones")); return false;
    }
    if (changed) setError("Una o más presentaciones cambiaron. Quita esos renglones y agrégalos de nuevo antes de guardar.");
    return !changed;
  }

  const savePurchase = () => action.run(savePurchaseImpl);
  async function savePurchaseImpl(): Promise<void> {
    if (saveLock.current || !lines.length) return;
    if (supplierId && !activeSuppliers.some(s=>s.id===supplierId)) {setError("El proveedor ya no está disponible. Selecciona otro o continúa sin proveedor.");return;}
    if (!(await revalidateLines())) return;
    if (!form.validate({purchased_at:!validDate(purchasedAt)||purchasedAt>localDateValue()?"Usa una fecha válida AAAA-MM-DD que no esté en el futuro.":""})) {
      setError("La fecha de compra es obligatoria y no puede estar en el futuro.");
      return;
    }
    if (!(await confirmAction(`¿Registrar ${lines.length} renglón(es) por un total de $${moneyText(total)}? Esta acción aumentará el inventario por lote.`, {title:"Registrar compra",acceptLabel:"Registrar compra",cancelLabel:"Seguir revisando"}))) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const purchase = await api<Purchase>("/purchases", token, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: supplierId,
          purchased_at: purchasedAt,
          payment_source: paymentSource,
          notes: purchaseNotes.trim() || null,
          items: lines.map((line) => ({
            ingredient_presentation_id: line.ingredient_presentation_id,
            presentations_quantity: line.presentations_quantity,
            total_cost: line.total_cost,
            expected_presentation_revision: line.presentationRevision,
            expires_at: line.expires_at,
            lot_code: line.lot_code,
          })),
        }),
      });
      setLines([]);
      setReviewing(false);
      setPurchaseNotes(""); setSupplierId(null); setPresentationQuantity("1"); setLineCost(""); setLineExpiry(""); setLineLot(""); setPaymentSource("cash"); setPurchasedAt(localDateValue());
      setMessage(`Compra #${purchase.id} registrada. Se crearon sus lotes y movimientos de entrada.`);
      await load();
      setSelectedPurchase(purchase);
      setTab("history");
    } catch (saveError) {
      form.fromError(saveError,{purchased_at:"la fecha de compra",items:"los renglones (presentación, cantidad, costo y caducidad)"});
      if (saveError instanceof ApiError && saveError.code === "presentation_changed") {
        setLines((current) => current.map((line) => ({...line, invalid:"Esta presentación cambió. Revísala antes de registrar la compra."})));
        setReviewing(false);
        setError("Esta presentación cambió. Revisa los renglones antes de registrar la compra.");
      } else setError(operationError(saveError,"registrar la compra",true));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const createSupplier = () => action.run(createSupplierImpl);
  async function createSupplierImpl(): Promise<void> {
    if(!form.validate({supplier_name:required(supplierName,"el nombre del proveedor")}))return;
    if (!isAdministrator || !supplierName.trim()) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const supplier = await api<Supplier>("/catalogs/suppliers", token, {
        method: "POST",
        body: JSON.stringify({ name: supplierName.trim(), phone: supplierPhone.trim() || null }),
      });
      setSupplierName("");
      setSupplierPhone("");
      setSupplierId(supplier.id);
      setMessage(`Proveedor “${supplier.name}” registrado.`);
      await load();
      setSupplierId(supplier.id);
    } catch (supplierError) {
      form.fromError(supplierError,{name:"el nombre del proveedor",phone:"el teléfono"},{name:"supplier_name",phone:"supplier_phone"});
      setError(operationError(supplierError, "guardar los cambios", true));
    } finally {
      setSaving(false);
    }
  }

  async function showDetail(purchase: Purchase): Promise<void> {
    if (selectedPurchase?.id === purchase.id) {
      setSelectedPurchase(null);
      return;
    }
    setDetailLoadingId(purchase.id);
    setError("");
    try {
      setSelectedPurchase(await api<Purchase>(`/purchases/${purchase.id}`, token));
    } catch (detailError) {
      setError(operationError(detailError, "cargar la información"));
    } finally {
      setDetailLoadingId(null);
    }
  }

  if (loading) return <LoadingState text="Cargando compras y proveedores..." />;

  const purchaseStep = reviewing ? "review" : selectedPresentation ? "details" : ingredientId ? "presentation" : "ingredient";

  return <View style={[ops.screen, mobile && ops.screenMobile]}>
    <View style={[ops.toolbar, mobile && ops.toolbarMobile]}>
      <Tabs
        active={tab}
        items={[{ key: "register", label: "Registrar compra" }, { key: "history", label: `Historial (${purchases.length})` }]}
        onChange={(key) => setTab(key as PurchaseTab)}
      />
      <Pressable disabled={refreshing} onPress={() => load()} style={[ops.outlineButton, refreshing && ops.disabled]}><ThemedText style={ops.outlineText}>{refreshing ? "Actualizando..." : "Actualizar"}</ThemedText></Pressable>
    </View>
    <Feedback error={error} message={message} />

    {tab === "register" && <>
      <WorkflowSteps current={purchaseStep} items={[
        { key: "ingredient", label: "Elige el insumo", detail: "Busca por nombre o SKU." },
        { key: "presentation", label: "Elige cómo lo compras", detail: "Selecciona la presentación exacta." },
        { key: "details", label: "Captura cantidad y costo", detail: "Agrega lote y caducidad si los conoces." },
        { key: "review", label: "Revisa y registra", detail: "Confirma lo que entrará al inventario." },
      ]}/>
      {isAdministrator && <Section title="Alta rápida de proveedor">
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput editable={!saving && !action.busy} style={[ops.input, ops.fieldGrow]} {...form.field("supplier_name")} required value={supplierName} onChangeText={setSupplierName} placeholder="Nombre del proveedor" />
          <TextInput editable={!saving && !action.busy} style={[ops.input, ops.fieldGrow]} {...form.field("supplier_phone")} value={supplierPhone} onChangeText={setSupplierPhone} placeholder="Teléfono opcional" keyboardType="phone-pad" />
          <ActionButton variant="secondary" label="Guardar proveedor" loading={saving || action.busy} onPress={createSupplier}/>
        </View>
      </Section>}

      <Section title="Datos de la compra">
        <ThemedText style={ops.label}>Proveedor</ThemedText>
        <View style={ops.chips}>
          <Pressable onPress={() => setSupplierId(null)} style={[ops.chip, supplierId === null && ops.chipActive]}><ThemedText>Sin proveedor</ThemedText></Pressable>
          {activeSuppliers.map((supplier) => <Pressable key={supplier.id} onPress={() => setSupplierId(supplier.id)} style={[ops.chip, supplierId === supplier.id && ops.chipActive]}><ThemedText>{supplier.name}</ThemedText></Pressable>)}
        </View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput editable={!saving && !action.busy} style={[ops.input, ops.fieldGrow]} {...form.field("purchased_at")} required value={purchasedAt} onChangeText={setPurchasedAt} placeholder="Fecha AAAA-MM-DD" autoCapitalize="none" />
          <TextInput editable={!saving && !action.busy} style={[ops.input, ops.fieldGrow, ops.textArea]} value={purchaseNotes} onChangeText={setPurchaseNotes} placeholder="Notas generales opcionales" multiline />
        </View>
        <ThemedText style={ops.label}>Origen del pago</ThemedText>
        <View style={ops.chips}>{paymentSources.map((source) => <Pressable key={source.key} onPress={() => setPaymentSource(source.key)} style={[ops.chip, paymentSource === source.key && ops.chipActive]}><ThemedText>{source.label}</ThemedText></Pressable>)}</View>
      </Section>

      <Section title="Agregar renglones">
        <ThemedText style={ops.label}>Buscar insumo</ThemedText>
        <TextInput value={ingredientSearch} onChangeText={setIngredientSearch} placeholder="Nombre o SKU del insumo" />
        <RemoteListStatus loading={ingredientResults.loading} error={ingredientResults.error} count={ingredientResults.items.length} search={ingredientResults.search} emptyText="No hay insumos activos." onRetry={ingredientResults.reload}/>
        <View style={ops.chips}>{ingredientResults.items.map((ingredient) => <Pressable key={ingredient.id} accessibilityState={{selected: ingredientId === ingredient.id}} onPress={() => {setIngredientId(ingredient.id); if (ingredientId !== ingredient.id) setPresentationId(null);}} style={[ops.chip, ingredientId === ingredient.id && ops.chipActive]}><ThemedText>{ingredient.name}{ingredient.sku ? ` · SKU ${ingredient.sku}` : ""}</ThemedText></Pressable>)}</View>
        <Pagination data={ingredientResults.data} loading={ingredientResults.loading} onPage={ingredientResults.setPage}/>
        <ThemedText style={ops.label}>Presentación comprada (obligatoria)</ThemedText>{form.errors.presentation&&<ThemedText accessibilityRole="alert" style={ops.error}>{form.errors.presentation}</ThemedText>}
        {ingredientId && <RemoteListStatus loading={ingredientDetail.loading} error={ingredientDetail.error} count={ingredientDetail.data ? 1 : 0} emptyText="No encontramos el insumo seleccionado." onRetry={ingredientDetail.reload}/>}
        {ingredientDetail.data && !presentations.length ? <EmptyState text={isAdministrator ? "Este insumo no tiene presentaciones activas. Registra una desde Inventario." : "Este insumo no tiene presentaciones activas; solicita ayuda a un administrador."} /> : <View style={ops.chips}>{presentations.map((presentation) => <Pressable key={presentation.id} accessibilityState={{selected:presentationId===presentation.id}} onPress={() => setPresentationId(presentation.id)} style={[ops.chip, presentationId === presentation.id && ops.chipActive]}><ThemedText>{presentation.name} · {quantityText(presentation.quantity)} {presentation.equivalent_unit?.symbol ?? "u"}</ThemedText></Pressable>)}</View>}
        {selectedPresentation && <View style={ops.noticeBox}>
          <ThemedText style={ops.notice}>Conversión: 1 {selectedPresentation.name} = {quantityText(selectedPresentation.base_quantity)} {selectedPresentation.ingredient.base_unit?.symbol ?? "u"} de {selectedPresentation.ingredient.name}.</ThemedText>
        </View>}
        {selectedPresentation ? <View style={ops.insetCard}>
          <ThemedText style={ops.subtitle}>Cantidad, costo y seguimiento</ThemedText>
          <View style={[ops.inline, compact && ops.inlineCompact]}>
            <TextInput editable={!saving && !action.busy} style={[ops.input, ops.fieldGrow]} {...form.field("quantity")} required value={presentationQuantity} onChangeText={setPresentationQuantity} placeholder="Cantidad de presentaciones" keyboardType="decimal-pad" />
            <TextInput editable={!saving && !action.busy} style={[ops.input, ops.fieldGrow]} {...form.field("cost")} required helperText="Es el costo total de todas las presentaciones del renglón. Usa punto o coma decimal, sin separadores de miles." value={lineCost} onChangeText={setLineCost} placeholder="Costo total del renglón" keyboardType="decimal-pad" />
          </View>
          <View style={[ops.inline, compact && ops.inlineCompact]}>
            <TextInput editable={!saving && !action.busy} style={[ops.input, ops.fieldGrow]} value={lineLot} onChangeText={setLineLot} placeholder="Código de lote opcional" autoCapitalize="characters" />
            <TextInput editable={!saving && !action.busy} style={[ops.input, ops.fieldGrow]} {...form.field("expiry")} value={lineExpiry} onChangeText={setLineExpiry} placeholder="Caducidad AAAA-MM-DD" autoCapitalize="none" />
          </View>
          {Number.isFinite(decimalInput(presentationQuantity)) && decimalInput(presentationQuantity) > 0 && <ThemedText style={ops.notice}>{quantityText(decimalInput(presentationQuantity))} × {quantityText(selectedPresentation.quantity)} {selectedPresentation.equivalent_unit?.symbol ?? "u"} = {quantityText(numberValue(selectedPresentation.base_quantity) * decimalInput(presentationQuantity))} {selectedPresentation.ingredient.base_unit?.symbol ?? "u"} al inventario.</ThemedText>}
          <ActionButton variant="secondary" label={editingLine === null ? "Agregar a la compra" : "Actualizar renglón"} disabled={saving || action.busy} onPress={addLine}/>
        </View> : <ThemedText style={ops.muted}>Selecciona un insumo y su presentación para capturar cantidad, costo, lote y caducidad.</ThemedText>}
        {!!lines.length && <View style={ops.insetCard}>
          {lines.map((line, index) => <View style={ops.card} key={`${line.ingredient_presentation_id}-${line.lot_code ?? "sin-lote"}-${index}`}>
            <View style={ops.row}>
              <View style={ops.rowGrow}>
                <ThemedText style={ops.strong}>{line.ingredientName} · {line.presentationName}</ThemedText>
                <ThemedText style={ops.muted}>{quantityText(line.presentations_quantity)} presentación(es) → {quantityText(line.baseQuantity)} {line.baseUnitSymbol}</ThemedText>
                <ThemedText style={ops.muted}>Costo total ${moneyText(line.total_cost)} · ${moneyText(moneyDivide(line.total_cost, line.presentations_quantity))} por presentación</ThemedText>
                <ThemedText style={ops.muted}>Lote {line.lot_code || "automático/sin código"} · caduca {line.expires_at ? dateText(line.expires_at) : "sin fecha"}</ThemedText>
                {!!line.invalid && <ThemedText accessibilityRole="alert" style={ops.error}>{line.invalid}</ThemedText>}
              </View>
              <ThemedText style={ops.value}>${moneyText(line.total_cost)}</ThemedText>
            </View>
            <View style={ops.chips}><Pressable onPress={() => editLine(index)} style={ops.outlineButton}><ThemedText style={ops.outlineText}>Editar renglón</ThemedText></Pressable><Pressable onPress={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} style={ops.dangerButton}><ThemedText style={ops.dangerText}>Quitar renglón</ThemedText></Pressable></View>
          </View>)}
        </View>}
        {form.errors.items&&<ThemedText accessibilityRole="alert" style={ops.error}>{form.errors.items}</ThemedText>}<View style={ops.row}><ThemedText style={ops.sectionTitle}>Total</ThemedText><ThemedText style={ops.value}>${moneyText(total)}</ThemedText></View>
        {!reviewing ? <ActionButton label="Revisar compra" loadingLabel="Comprobando presentaciones…" disabled={!lines.length} disabledReason="Agrega al menos un renglón para revisar la compra." onPress={() => action.run(async () => {
          if (editingLine !== null || lineCost || lineLot || lineExpiry || presentationQuantity !== "1") {setError("Agrega o limpia el renglón que estás capturando antes de revisar la compra."); return;}
          setError(""); if (await revalidateLines()) setReviewing(true);
        })}/> : <View style={ops.insetCard}>
          <ThemedText style={ops.sectionTitle}>Revisión antes de registrar</ThemedText>
          <ThemedText>Proveedor: {activeSuppliers.find((supplier) => supplier.id === supplierId)?.name ?? "Sin proveedor"}</ThemedText>
          <ThemedText>Fecha: {dateText(purchasedAt)} · Pago: {paymentSourceLabel(paymentSource)}</ThemedText>
          <ThemedText style={ops.muted}>Se agregarán al inventario exactamente las cantidades base mostradas arriba.</ThemedText>
          <View style={ops.chips}><ActionButton variant="secondary" label="Volver a editar" disabled={saving || action.busy} onPress={() => setReviewing(false)}/><ActionButton label="Registrar compra y aumentar inventario" loading={saving || action.busy} onPress={savePurchase}/></View>
        </View>}
      </Section>
    </>}

    {tab === "history" && <Section title="Compras registradas">
      {!purchases.length ? <EmptyState text="No hay compras registradas." /> : purchases.map((purchase) => <View style={ops.card} key={purchase.id}>
        <View style={ops.row}>
          <View style={ops.rowGrow}>
            <ThemedText style={ops.strong}>Compra #{purchase.id} · {purchase.supplier?.name ?? "Sin proveedor"}</ThemedText>
            <ThemedText style={ops.muted}>{dateText(purchase.purchased_at)} · {paymentSourceLabel(purchase.payment_source)} · {purchase.items?.length ?? 0} renglón(es)</ThemedText>
          </View>
          <ThemedText style={ops.value}>${moneyText(purchase.total)}</ThemedText>
        </View>
        {!!purchase.notes && <ThemedText>{purchase.notes}</ThemedText>}
        <Pressable disabled={detailLoadingId === purchase.id} onPress={() => showDetail(purchase)} style={ops.outlineButton}>
          <ThemedText style={ops.outlineText}>{detailLoadingId === purchase.id ? "Cargando detalle..." : selectedPurchase?.id === purchase.id ? "Ocultar detalle" : "Ver detalle"}</ThemedText>
        </Pressable>
        {selectedPurchase?.id === purchase.id && <View style={ops.insetCard}>
          {!selectedPurchase.items?.length ? <EmptyState text="La compra no tiene renglones." /> : selectedPurchase.items.map((item) => <View style={ops.card} key={item.id}>
            <View style={ops.row}>
              <View style={ops.rowGrow}>
                <ThemedText style={ops.strong}>{ingredientById.get(item.ingredient_id)?.name ?? item.ingredient?.name ?? `Insumo #${item.ingredient_id}`}</ThemedText>
                <ThemedText style={ops.muted}>{quantityText(item.presentations_quantity)} × {presentationById.get(item.ingredient_presentation_id)?.name ?? "presentación"} → {quantityText(item.base_quantity)} {ingredientById.get(item.ingredient_id)?.base_unit?.symbol ?? "u"}</ThemedText>
                <ThemedText style={ops.muted}>Lote {item.lot_code || "sin código"} · caduca {item.expires_at ? dateText(item.expires_at) : "sin fecha"}</ThemedText>
              </View>
              <View><ThemedText style={ops.strong}>${moneyText(item.total_cost)}</ThemedText><ThemedText style={ops.muted}>${moneyText(item.base_unit_cost)} / {ingredientById.get(item.ingredient_id)?.base_unit?.symbol ?? "u"}</ThemedText></View>
            </View>
          </View>)}
        </View>}
      </View>)}
      {purchasePage < purchaseLastPage && <Pressable disabled={loadingMorePurchases} onPress={loadMorePurchases} style={[ops.outlineButton, loadingMorePurchases && ops.disabled]}>
        <ThemedText style={ops.outlineText}>{loadingMorePurchases ? "Cargando compras..." : `Cargar más compras (página ${purchasePage + 1} de ${purchaseLastPage})`}</ThemedText>
      </Pressable>}
    </Section>}
  </View>;
}
