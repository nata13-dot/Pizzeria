import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from "react-native";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { api } from "../../api";
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
  fetchAllPages,
  fetchPage,
  inputNumber,
  LoadingState,
  localDateValue,
  moneyText,
  numberValue,
  ops,
  quantityText,
  Section,
  Tabs,
} from "./ui";

type PurchaseTab = "register" | "history";
type PresentationChoice = IngredientPresentation & { ingredient: Ingredient };
type PurchaseLine = {
  ingredient_presentation_id: number;
  ingredientName: string;
  presentationName: string;
  presentations_quantity: number;
  baseQuantity: number;
  baseUnitSymbol: string;
  total_cost: number;
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
  const { width } = useWindowDimensions();
  const compact = width < 980;
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

  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [purchasedAt, setPurchasedAt] = useState(localDateValue);
  const [paymentSource, setPaymentSource] = useState<PaymentSource>("cash");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [presentationId, setPresentationId] = useState<number | null>(null);
  const [presentationQuantity, setPresentationQuantity] = useState("1");
  const [lineCost, setLineCost] = useState("");
  const [lineExpiry, setLineExpiry] = useState("");
  const [lineLot, setLineLot] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([]);

  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");

  const presentations = useMemo<PresentationChoice[]>(() => ingredients.flatMap((ingredient) =>
    ingredient.active
      ? (ingredient.presentations ?? [])
          .filter((presentation) => presentation.active)
          .map((presentation) => ({ ...presentation, ingredient }))
      : [],
  ), [ingredients]);
  const selectedPresentation = presentations.find((presentation) => presentation.id === presentationId) ?? null;
  const activeSuppliers = suppliers.filter((supplier) => supplier.active);
  const total = lines.reduce((sum, line) => sum + line.total_cost, 0);
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
      const [nextPurchases, nextIngredients, nextSuppliers] = await Promise.all([
        fetchPage<Purchase>("/purchases", token),
        fetchAllPages<Ingredient>("/ingredients", token),
        api<Supplier[]>("/catalogs/suppliers", token),
      ]);
      if (currentRequest !== requestId.current) return;
      setPurchases(nextPurchases.data);
      setPurchasePage(nextPurchases.current_page);
      setPurchaseLastPage(nextPurchases.last_page);
      setIngredients(nextIngredients);
      setSuppliers(nextSuppliers);
      const activePresentationIds = new Set(nextIngredients.flatMap((ingredient) =>
        ingredient.active ? (ingredient.presentations ?? []).filter((presentation) => presentation.active).map((presentation) => presentation.id) : [],
      ));
      setPresentationId((current) => current && activePresentationIds.has(current) ? current : activePresentationIds.values().next().value ?? null);
      setSupplierId((current) => current && nextSuppliers.some((supplier) => supplier.id === current && supplier.active) ? current : null);
      setSelectedPurchase((current) => current ? nextPurchases.data.find((purchase) => purchase.id === current.id) ?? current : null);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError((loadError as Error).message);
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
      if (currentRequest === requestId.current) setError((loadError as Error).message);
    } finally {
      if (currentRequest === requestId.current) setLoadingMorePurchases(false);
    }
  }

  useEffect(() => {
    load(true);
    return () => { requestId.current += 1; };
  }, [token]);

  function addLine(): void {
    const quantity = inputNumber(presentationQuantity);
    const cost = inputNumber(lineCost);
    if (!selectedPresentation || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(cost) || cost < 0 || !lineCost.trim()) {
      setError("Selecciona una presentación y captura cantidad y costo válidos.");
      return;
    }
    if (!purchasedAt || purchasedAt > localDateValue()) {
      setError("La fecha de compra es obligatoria y no puede estar en el futuro.");
      return;
    }
    if (lineExpiry && lineExpiry < purchasedAt) {
      setError("La caducidad del renglón no puede ser anterior a la compra.");
      return;
    }
    const baseQuantity = numberValue(selectedPresentation.base_quantity) * quantity;
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) {
      setError("La presentación seleccionada no tiene una conversión base válida.");
      return;
    }
    setLines((current) => [...current, {
      ingredient_presentation_id: selectedPresentation.id,
      ingredientName: selectedPresentation.ingredient.name,
      presentationName: selectedPresentation.name,
      presentations_quantity: quantity,
      baseQuantity,
      baseUnitSymbol: selectedPresentation.ingredient.base_unit?.symbol ?? "u",
      total_cost: cost,
      expires_at: lineExpiry || undefined,
      lot_code: lineLot.trim() || undefined,
    }]);
    setPresentationQuantity("1");
    setLineCost("");
    setLineExpiry("");
    setLineLot("");
    setError("");
  }

  async function savePurchase(): Promise<void> {
    if (saveLock.current || !lines.length) return;
    if (!purchasedAt || purchasedAt > localDateValue()) {
      setError("La fecha de compra es obligatoria y no puede estar en el futuro.");
      return;
    }
    if (!(await confirmAction(`¿Registrar ${lines.length} renglón(es) por un total de $${moneyText(total)}? Esta acción aumentará el inventario por lote.`))) return;
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
            expires_at: line.expires_at,
            lot_code: line.lot_code,
          })),
        }),
      });
      setLines([]);
      setPurchaseNotes("");
      setMessage(`Compra #${purchase.id} registrada. Se crearon sus lotes y movimientos de entrada.`);
      await load();
      setSelectedPurchase(purchase);
      setTab("history");
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function createSupplier(): Promise<void> {
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
      setError((supplierError as Error).message);
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
      setError((detailError as Error).message);
    } finally {
      setDetailLoadingId(null);
    }
  }

  if (loading) return <LoadingState text="Cargando compras, proveedores y presentaciones..." />;

  return <View style={ops.screen}>
    <View style={ops.toolbar}>
      <Tabs
        active={tab}
        items={[{ key: "register", label: "Registrar compra" }, { key: "history", label: `Historial (${purchases.length})` }]}
        onChange={(key) => setTab(key as PurchaseTab)}
      />
      <Pressable disabled={refreshing} onPress={() => load()} style={[ops.outlineButton, refreshing && ops.disabled]}><Text style={ops.outlineText}>{refreshing ? "Actualizando..." : "Actualizar"}</Text></Pressable>
    </View>
    <Feedback error={error} message={message} />

    {tab === "register" && <>
      {isAdministrator && <Section title="Alta rápida de proveedor">
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={supplierName} onChangeText={setSupplierName} placeholder="Nombre del proveedor" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={supplierPhone} onChangeText={setSupplierPhone} placeholder="Teléfono opcional" keyboardType="phone-pad" />
          <Pressable disabled={saving || !supplierName.trim()} onPress={createSupplier} style={[ops.outlineButton, (saving || !supplierName.trim()) && ops.disabled]}><Text style={ops.outlineText}>Guardar proveedor</Text></Pressable>
        </View>
      </Section>}

      <Section title="Datos de la compra">
        <Text style={ops.label}>Proveedor</Text>
        <View style={ops.chips}>
          <Pressable onPress={() => setSupplierId(null)} style={[ops.chip, supplierId === null && ops.chipActive]}><Text>Sin proveedor</Text></Pressable>
          {activeSuppliers.map((supplier) => <Pressable key={supplier.id} onPress={() => setSupplierId(supplier.id)} style={[ops.chip, supplierId === supplier.id && ops.chipActive]}><Text>{supplier.name}</Text></Pressable>)}
        </View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={purchasedAt} onChangeText={setPurchasedAt} placeholder="Fecha AAAA-MM-DD" autoCapitalize="none" />
          <TextInput style={[ops.input, ops.fieldGrow, ops.textArea]} value={purchaseNotes} onChangeText={setPurchaseNotes} placeholder="Notas generales opcionales" multiline />
        </View>
        <Text style={ops.label}>Origen del pago</Text>
        <View style={ops.chips}>{paymentSources.map((source) => <Pressable key={source.key} onPress={() => setPaymentSource(source.key)} style={[ops.chip, paymentSource === source.key && ops.chipActive]}><Text>{source.label}</Text></Pressable>)}</View>
      </Section>

      <Section title="Agregar renglones">
        <Text style={ops.label}>Presentación comprada</Text>
        {!presentations.length ? <EmptyState text={isAdministrator ? "No hay presentaciones activas. Registra una desde Inventario." : "No hay presentaciones activas; solicita a un administrador que las configure en Inventario."} /> : <View style={ops.chips}>{presentations.map((presentation) => <Pressable key={presentation.id} onPress={() => setPresentationId(presentation.id)} style={[ops.chip, presentationId === presentation.id && ops.chipActive]}><Text>{presentation.ingredient.name} · {presentation.name}</Text></Pressable>)}</View>}
        {selectedPresentation && <View style={ops.noticeBox}>
          <Text style={ops.notice}>Conversión: 1 {selectedPresentation.name} = {quantityText(selectedPresentation.base_quantity)} {selectedPresentation.ingredient.base_unit?.symbol ?? "u"} de {selectedPresentation.ingredient.name}.</Text>
        </View>}
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={presentationQuantity} onChangeText={setPresentationQuantity} placeholder="Cantidad de presentaciones" keyboardType="decimal-pad" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={lineCost} onChangeText={setLineCost} placeholder="Costo total del renglón" keyboardType="decimal-pad" />
        </View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={lineLot} onChangeText={setLineLot} placeholder="Código de lote opcional" autoCapitalize="characters" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={lineExpiry} onChangeText={setLineExpiry} placeholder="Caducidad AAAA-MM-DD" autoCapitalize="none" />
        </View>
        <Pressable disabled={!selectedPresentation} onPress={addLine} style={[ops.outlineButton, !selectedPresentation && ops.disabled]}><Text style={ops.outlineText}>Agregar renglón</Text></Pressable>
        {!!lines.length && <View style={ops.insetCard}>
          {lines.map((line, index) => <View style={ops.card} key={`${line.ingredient_presentation_id}-${line.lot_code ?? "sin-lote"}-${index}`}>
            <View style={ops.row}>
              <View style={ops.rowGrow}>
                <Text style={ops.strong}>{line.ingredientName} · {line.presentationName}</Text>
                <Text style={ops.muted}>{quantityText(line.presentations_quantity)} presentación(es) → {quantityText(line.baseQuantity)} {line.baseUnitSymbol}</Text>
                <Text style={ops.muted}>Lote {line.lot_code || "automático/sin código"} · caduca {line.expires_at ? dateText(line.expires_at) : "sin fecha"}</Text>
              </View>
              <Text style={ops.value}>${moneyText(line.total_cost)}</Text>
            </View>
            <Pressable onPress={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} style={ops.dangerButton}><Text style={ops.dangerText}>Quitar renglón</Text></Pressable>
          </View>)}
        </View>}
        <View style={ops.row}><Text style={ops.sectionTitle}>Total</Text><Text style={ops.value}>${moneyText(total)}</Text></View>
        <Pressable disabled={saving || !lines.length} onPress={savePurchase} style={[ops.button, (saving || !lines.length) && ops.disabled]}>{saving ? <ActivityIndicator color="white" /> : <Text style={ops.buttonText}>Registrar compra y aumentar inventario</Text>}</Pressable>
      </Section>
    </>}

    {tab === "history" && <Section title="Compras registradas">
      {!purchases.length ? <EmptyState text="No hay compras registradas." /> : purchases.map((purchase) => <View style={ops.card} key={purchase.id}>
        <View style={ops.row}>
          <View style={ops.rowGrow}>
            <Text style={ops.strong}>Compra #{purchase.id} · {purchase.supplier?.name ?? "Sin proveedor"}</Text>
            <Text style={ops.muted}>{dateText(purchase.purchased_at)} · {paymentSourceLabel(purchase.payment_source)} · {purchase.items?.length ?? 0} renglón(es)</Text>
          </View>
          <Text style={ops.value}>${moneyText(purchase.total)}</Text>
        </View>
        {!!purchase.notes && <Text>{purchase.notes}</Text>}
        <Pressable disabled={detailLoadingId === purchase.id} onPress={() => showDetail(purchase)} style={ops.outlineButton}>
          <Text style={ops.outlineText}>{detailLoadingId === purchase.id ? "Cargando detalle..." : selectedPurchase?.id === purchase.id ? "Ocultar detalle" : "Ver detalle"}</Text>
        </Pressable>
        {selectedPurchase?.id === purchase.id && <View style={ops.insetCard}>
          {!selectedPurchase.items?.length ? <EmptyState text="La compra no tiene renglones." /> : selectedPurchase.items.map((item) => <View style={ops.card} key={item.id}>
            <View style={ops.row}>
              <View style={ops.rowGrow}>
                <Text style={ops.strong}>{ingredientById.get(item.ingredient_id)?.name ?? item.ingredient?.name ?? `Insumo #${item.ingredient_id}`}</Text>
                <Text style={ops.muted}>{quantityText(item.presentations_quantity)} × {presentationById.get(item.ingredient_presentation_id)?.name ?? "presentación"} → {quantityText(item.base_quantity)} {ingredientById.get(item.ingredient_id)?.base_unit?.symbol ?? "u"}</Text>
                <Text style={ops.muted}>Lote {item.lot_code || "sin código"} · caduca {item.expires_at ? dateText(item.expires_at) : "sin fecha"}</Text>
              </View>
              <View><Text style={ops.strong}>${moneyText(item.total_cost)}</Text><Text style={ops.muted}>${moneyText(item.base_unit_cost)} / {ingredientById.get(item.ingredient_id)?.base_unit?.symbol ?? "u"}</Text></View>
            </View>
          </View>)}
        </View>}
      </View>)}
      {purchasePage < purchaseLastPage && <Pressable disabled={loadingMorePurchases} onPress={loadMorePurchases} style={[ops.outlineButton, loadingMorePurchases && ops.disabled]}>
        <Text style={ops.outlineText}>{loadingMorePurchases ? "Cargando compras..." : `Cargar más compras (página ${purchasePage + 1} de ${purchaseLastPage})`}</Text>
      </Pressable>}
    </Section>}
  </View>;
}
