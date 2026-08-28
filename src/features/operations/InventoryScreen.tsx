import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import { api } from "../../api";
import type {
  Ingredient,
  IngredientPresentation,
  IngredientType,
  InventoryAlert,
  InventoryBatch,
  InventoryMovement,
  Unit,
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

type InventoryTab = "stock" | "batches" | "alerts" | "movements" | "admin";
type AdjustmentReason = "waste" | "expiry" | "preparation_error" | "gift" | "internal_use" | "manual" | "loss" | "correction";
type AdjustmentDirection = "in" | "out";

const adjustmentReasons: { key: AdjustmentReason; label: string; removal: boolean }[] = [
  { key: "waste", label: "Merma", removal: true },
  { key: "expiry", label: "Caducidad", removal: true },
  { key: "preparation_error", label: "Error de preparación", removal: true },
  { key: "gift", label: "Regalo", removal: true },
  { key: "internal_use", label: "Consumo interno", removal: true },
  { key: "loss", label: "Pérdida", removal: true },
  { key: "manual", label: "Manual", removal: false },
  { key: "correction", label: "Corrección", removal: false },
];

function stockLevel(ingredient: Ingredient): "good" | "warning" | "danger" {
  const stock = numberValue(ingredient.current_stock);
  if (stock <= numberValue(ingredient.critical_stock)) return "danger";
  if (stock <= numberValue(ingredient.minimum_stock)) return "warning";
  return "good";
}

function batchIsExpired(batch: InventoryBatch): boolean {
  return Boolean(batch.expires_at && batch.expires_at.slice(0, 10) < localDateValue());
}

export function InventoryScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const { width } = useWindowDimensions();
  const compact = width < 980;
  const [tab, setTab] = useState<InventoryTab>("stock");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [batchPage, setBatchPage] = useState(1);
  const [batchLastPage, setBatchLastPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [movementLastPage, setMovementLastPage] = useState(1);
  const [loadingMoreBatches, setLoadingMoreBatches] = useState(false);
  const [loadingMoreMovements, setLoadingMoreMovements] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [ingredientTypes, setIngredientTypes] = useState<IngredientType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requestId = useRef(0);

  const [editingIngredientId, setEditingIngredientId] = useState<number | null>(null);
  const [ingredientName, setIngredientName] = useState("");
  const [ingredientSku, setIngredientSku] = useState("");
  const [baseUnitId, setBaseUnitId] = useState<number | null>(null);
  const [ingredientTypeId, setIngredientTypeId] = useState<number | null>(null);
  const [minimumStock, setMinimumStock] = useState("0");
  const [criticalStock, setCriticalStock] = useState("0");
  const [shelfLifeDays, setShelfLifeDays] = useState("");
  const [expiryAlertDays, setExpiryAlertDays] = useState("3");
  const [ingredientActive, setIngredientActive] = useState(true);
  const [initialStock, setInitialStock] = useState("0");
  const [initialLot, setInitialLot] = useState("");
  const [initialExpiry, setInitialExpiry] = useState("");
  const [initialUnitCost, setInitialUnitCost] = useState("0");

  const [presentationIngredientId, setPresentationIngredientId] = useState<number | null>(null);
  const [editingPresentationId, setEditingPresentationId] = useState<number | null>(null);
  const [presentationName, setPresentationName] = useState("");
  const [presentationQuantity, setPresentationQuantity] = useState("1");
  const [presentationUnitId, setPresentationUnitId] = useState<number | null>(null);
  const [presentationSku, setPresentationSku] = useState("");
  const [presentationActive, setPresentationActive] = useState(true);

  const [adjustmentBatchId, setAdjustmentBatchId] = useState<number | null>(null);
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState<AdjustmentReason>("correction");
  const [adjustmentDirection, setAdjustmentDirection] = useState<AdjustmentDirection>("out");
  const [adjustmentComment, setAdjustmentComment] = useState("");

  const selectedPresentationIngredient = ingredients.find((ingredient) => ingredient.id === presentationIngredientId) ?? null;
  const selectedPresentationBaseUnit = selectedPresentationIngredient?.base_unit ?? null;
  const compatiblePresentationUnits = units.filter((unit) => unit.active && unit.dimension === selectedPresentationBaseUnit?.dimension);
  const selectedPresentationUnit = compatiblePresentationUnits.find((unit) => unit.id === presentationUnitId) ?? null;
  const presentationConversion = selectedPresentationBaseUnit && selectedPresentationUnit
    ? inputNumber(presentationQuantity) * (numberValue(selectedPresentationUnit.base_factor) / numberValue(selectedPresentationBaseUnit.base_factor))
    : 0;
  const selectedAdjustmentReason = adjustmentReasons.find((reason) => reason.key === adjustmentReason) ?? adjustmentReasons[0];
  const selectedAdjustmentBatch = batches.find((batch) => batch.id === adjustmentBatchId) ?? null;
  const activeIngredients = ingredients.filter((ingredient) => ingredient.active);
  const activeUnits = units.filter((unit) => unit.active);
  const activeTypes = ingredientTypes.filter((type) => type.active);
  const ingredientById = useMemo(() => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);

  async function load(initial = false): Promise<void> {
    const currentRequest = ++requestId.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const [nextIngredients, nextBatches, nextAlerts, nextMovements, nextUnits, nextTypes] = await Promise.all([
        fetchAllPages<Ingredient>("/ingredients", token),
        fetchPage<InventoryBatch>("/inventory/batches", token),
        api<InventoryAlert[]>("/inventory/alerts", token),
        fetchPage<InventoryMovement>("/inventory/movements", token),
        api<Unit[]>("/catalogs/units", token),
        api<IngredientType[]>("/catalogs/ingredient-types", token),
      ]);
      if (currentRequest !== requestId.current) return;
      setIngredients(nextIngredients);
      setBatches(nextBatches.data);
      setBatchPage(nextBatches.current_page);
      setBatchLastPage(nextBatches.last_page);
      setAlerts(nextAlerts);
      setMovements(nextMovements.data);
      setMovementPage(nextMovements.current_page);
      setMovementLastPage(nextMovements.last_page);
      setUnits(nextUnits);
      setIngredientTypes(nextTypes);
      setBaseUnitId((current) => current ?? nextUnits.find((unit) => unit.active)?.id ?? null);
      setPresentationIngredientId((current) => current ?? nextIngredients.find((ingredient) => ingredient.active)?.id ?? null);
      setAdjustmentBatchId((current) => current && nextBatches.data.some((batch) => batch.id === current)
        ? current
        : nextBatches.data[0]?.id ?? null);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError((loadError as Error).message);
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  async function loadMoreBatches(): Promise<void> {
    if (loadingMoreBatches || batchPage >= batchLastPage) return;
    const currentRequest = requestId.current;
    setLoadingMoreBatches(true);
    setError("");
    try {
      const next = await fetchPage<InventoryBatch>("/inventory/batches", token, batchPage + 1);
      if (currentRequest !== requestId.current) return;
      setBatches((current) => appendUniqueById(current, next.data));
      setBatchPage(next.current_page);
      setBatchLastPage(next.last_page);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError((loadError as Error).message);
    } finally {
      if (currentRequest === requestId.current) setLoadingMoreBatches(false);
    }
  }

  async function loadMoreMovements(): Promise<void> {
    if (loadingMoreMovements || movementPage >= movementLastPage) return;
    const currentRequest = requestId.current;
    setLoadingMoreMovements(true);
    setError("");
    try {
      const next = await fetchPage<InventoryMovement>("/inventory/movements", token, movementPage + 1);
      if (currentRequest !== requestId.current) return;
      setMovements((current) => appendUniqueById(current, next.data));
      setMovementPage(next.current_page);
      setMovementLastPage(next.last_page);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError((loadError as Error).message);
    } finally {
      if (currentRequest === requestId.current) setLoadingMoreMovements(false);
    }
  }

  useEffect(() => {
    load(true);
    return () => { requestId.current += 1; };
  }, [token]);

  useEffect(() => {
    if (!selectedPresentationIngredient || !selectedPresentationBaseUnit) return;
    const currentUnit = units.find((unit) => unit.id === presentationUnitId);
    if (!currentUnit?.active || currentUnit.dimension !== selectedPresentationBaseUnit.dimension) {
      setPresentationUnitId(units.find((unit) => unit.active && unit.dimension === selectedPresentationBaseUnit.dimension)?.id ?? null);
    }
  }, [presentationIngredientId, units]);

  function resetIngredientForm(): void {
    setEditingIngredientId(null);
    setIngredientName("");
    setIngredientSku("");
    setBaseUnitId(activeUnits[0]?.id ?? null);
    setIngredientTypeId(null);
    setMinimumStock("0");
    setCriticalStock("0");
    setShelfLifeDays("");
    setExpiryAlertDays("3");
    setIngredientActive(true);
    setInitialStock("0");
    setInitialLot("");
    setInitialExpiry("");
    setInitialUnitCost("0");
  }

  function editIngredient(ingredient: Ingredient): void {
    setEditingIngredientId(ingredient.id);
    setIngredientName(ingredient.name);
    setIngredientSku(ingredient.sku ?? "");
    setBaseUnitId(ingredient.base_unit_id);
    setIngredientTypeId(ingredient.ingredient_type_id ?? null);
    setMinimumStock(String(ingredient.minimum_stock));
    setCriticalStock(String(ingredient.critical_stock));
    setShelfLifeDays(ingredient.shelf_life_days === null || ingredient.shelf_life_days === undefined ? "" : String(ingredient.shelf_life_days));
    setExpiryAlertDays(String(ingredient.expiry_alert_days ?? 0));
    setIngredientActive(ingredient.active);
    setMessage("");
    setError("");
    setTab("admin");
  }

  async function saveIngredient(): Promise<void> {
    const minimum = inputNumber(minimumStock);
    const critical = inputNumber(criticalStock);
    const shelfLife = shelfLifeDays.trim() === "" ? null : inputNumber(shelfLifeDays);
    const expiryDays = inputNumber(expiryAlertDays);
    const openingStock = inputNumber(initialStock);
    const openingCost = inputNumber(initialUnitCost);
    if (!ingredientName.trim() || !baseUnitId || !Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(critical) || critical < 0) {
      setError("Completa el nombre, la unidad y límites de stock válidos.");
      return;
    }
    if (critical > minimum) {
      setError("El stock crítico no puede ser mayor que el stock mínimo.");
      return;
    }
    if ((shelfLife !== null && (!Number.isInteger(shelfLife) || shelfLife < 0)) || !Number.isInteger(expiryDays) || expiryDays < 0) {
      setError("Los días de caducidad y alerta deben ser enteros mayores o iguales a cero.");
      return;
    }
    if (!editingIngredientId && (!Number.isFinite(openingStock) || openingStock < 0 || !Number.isFinite(openingCost) || openingCost < 0)) {
      setError("La existencia y el costo inicial deben ser números mayores o iguales a cero.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = {
        name: ingredientName.trim(),
        sku: ingredientSku.trim() || null,
        ingredient_type_id: ingredientTypeId,
        minimum_stock: minimum,
        critical_stock: critical,
        shelf_life_days: shelfLife,
        expiry_alert_days: expiryDays,
        active: ingredientActive,
        ...(!editingIngredientId ? {
          base_unit_id: baseUnitId,
          initial_stock: openingStock,
          initial_lot_code: initialLot.trim() || null,
          initial_expires_at: initialExpiry || null,
          initial_unit_cost: openingCost,
        } : {}),
      };
      await api<Ingredient>(editingIngredientId ? `/ingredients/${editingIngredientId}` : "/ingredients", token, {
        method: editingIngredientId ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setMessage(editingIngredientId ? "Insumo actualizado." : "Insumo y existencia inicial registrados.");
      resetIngredientForm();
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateIngredient(ingredient: Ingredient): Promise<void> {
    if (!(await confirmAction(`¿Desactivar el insumo “${ingredient.name}”? Dejará de estar disponible para compras y puede impedir la venta o producción de cualquier receta existente que lo utilice. Verifica primero sus dependencias o configura un reemplazo.`))) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/ingredients/${ingredient.id}`, token, { method: "DELETE" });
      setMessage(`Insumo “${ingredient.name}” desactivado.`);
      await load();
    } catch (deactivateError) {
      setError((deactivateError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function resetPresentationForm(ingredientId = presentationIngredientId): void {
    setEditingPresentationId(null);
    setPresentationIngredientId(ingredientId);
    setPresentationName("");
    setPresentationQuantity("1");
    setPresentationSku("");
    setPresentationActive(true);
  }

  function editPresentation(ingredient: Ingredient, presentation: IngredientPresentation): void {
    setPresentationIngredientId(ingredient.id);
    setEditingPresentationId(presentation.id);
    setPresentationName(presentation.name);
    setPresentationQuantity(String(presentation.quantity));
    setPresentationUnitId(presentation.equivalent_unit_id);
    setPresentationSku(presentation.supplier_sku ?? "");
    setPresentationActive(presentation.active);
    setMessage("");
    setError("");
    setTab("admin");
  }

  async function savePresentation(): Promise<void> {
    const quantity = inputNumber(presentationQuantity);
    if (!selectedPresentationIngredient || !presentationName.trim() || !selectedPresentationUnit || !Number.isFinite(quantity) || quantity <= 0 || presentationConversion <= 0) {
      setError("Selecciona un insumo y una unidad compatible, y captura una cantidad mayor que cero.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const path = editingPresentationId
        ? `/ingredients/${selectedPresentationIngredient.id}/presentations/${editingPresentationId}`
        : `/ingredients/${selectedPresentationIngredient.id}/presentations`;
      await api<IngredientPresentation>(path, token, {
        method: editingPresentationId ? "PUT" : "POST",
        body: JSON.stringify({
          name: presentationName.trim(),
          quantity,
          equivalent_unit_id: selectedPresentationUnit.id,
          supplier_sku: presentationSku.trim() || null,
          active: presentationActive,
        }),
      });
      setMessage(editingPresentationId ? "Presentación actualizada y conversión recalculada." : "Presentación registrada con su conversión.");
      resetPresentationForm(selectedPresentationIngredient.id);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivatePresentation(ingredient: Ingredient, presentation: IngredientPresentation): Promise<void> {
    if (!(await confirmAction(`¿Desactivar la presentación “${presentation.name}”? Ya no podrá usarse en compras nuevas.`))) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/ingredients/${ingredient.id}/presentations/${presentation.id}`, token, { method: "DELETE" });
      setMessage(`Presentación “${presentation.name}” desactivada.`);
      await load();
    } catch (deactivateError) {
      setError((deactivateError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAdjustment(): Promise<void> {
    const quantity = Math.abs(inputNumber(adjustmentQuantity));
    if (!selectedAdjustmentBatch || !Number.isFinite(quantity) || quantity <= 0) {
      setError("Selecciona un lote y captura una cantidad mayor que cero.");
      return;
    }
    if (!adjustmentComment.trim()) {
      setError("Escribe un comentario que explique el ajuste para conservar la trazabilidad.");
      return;
    }
    const isRemoval = selectedAdjustmentReason.removal || adjustmentDirection === "out";
    if (!isRemoval && batchIsExpired(selectedAdjustmentBatch)) {
      setError("No se puede agregar existencia a un lote caducado. Registra la entrada en un lote vigente para que el stock sea utilizable.");
      return;
    }
    if (isRemoval && quantity > numberValue(selectedAdjustmentBatch.available_quantity) + 0.00001) {
      setError("La salida no puede superar la existencia disponible del lote.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api("/inventory/adjustments", token, {
        method: "POST",
        body: JSON.stringify({
          inventory_batch_id: selectedAdjustmentBatch.id,
          quantity: isRemoval ? -quantity : quantity,
          reason: selectedAdjustmentReason.key,
          comment: adjustmentComment.trim(),
        }),
      });
      setAdjustmentQuantity("");
      setAdjustmentComment("");
      setMessage("Ajuste registrado; el lote, movimientos y alertas fueron actualizados.");
      await load();
    } catch (adjustError) {
      setError((adjustError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const stockCounts = useMemo(() => ({
    low: ingredients.filter((ingredient) => ingredient.active && stockLevel(ingredient) !== "good").length,
    active: ingredients.filter((ingredient) => ingredient.active).length,
    availableBatches: batches.filter((batch) => numberValue(batch.available_quantity) > 0 && !batchIsExpired(batch)).length,
  }), [ingredients, batches]);

  if (loading) return <LoadingState text="Cargando inventario, lotes, alertas y movimientos..." />;

  return <View style={ops.screen}>
    <View style={ops.toolbar}>
      <Tabs
        active={tab}
        items={[
          { key: "stock", label: `Existencias (${ingredients.length})` },
          { key: "batches", label: `Lotes (${batches.length})` },
          { key: "alerts", label: `Alertas (${alerts.length})` },
          { key: "movements", label: "Movimientos" },
          ...(isAdministrator ? [{ key: "admin", label: "Administrar" }] : []),
        ]}
        onChange={(key) => setTab(key as InventoryTab)}
      />
      <Pressable disabled={refreshing} onPress={() => load()} style={[ops.outlineButton, refreshing && ops.disabled]}>
        <Text style={ops.outlineText}>{refreshing ? "Actualizando..." : "Actualizar todo"}</Text>
      </Pressable>
    </View>
    <Feedback error={error} message={message} />

    {tab === "stock" && <>
      <View style={ops.metrics}>
        <View style={ops.metric}><Text style={ops.metricValue}>{stockCounts.active}</Text><Text style={ops.muted}>Insumos activos</Text></View>
        <View style={ops.metric}><Text style={stockCounts.low ? ops.statusDanger : ops.statusGood}>{stockCounts.low}</Text><Text style={ops.muted}>Bajo mínimo/crítico</Text></View>
        <View style={ops.metric}><Text style={ops.metricValue}>{stockCounts.availableBatches}</Text><Text style={ops.muted}>Lotes utilizables cargados</Text></View>
      </View>
      {!ingredients.length ? <EmptyState text="No hay insumos registrados." /> : ingredients.map((ingredient) => {
        const level = stockLevel(ingredient);
        const unit = ingredient.base_unit?.symbol ?? "u";
        return <View style={[ops.card, !ingredient.active && ops.disabled]} key={ingredient.id}>
          <View style={ops.row}>
            <View style={ops.rowGrow}>
              <Text style={ops.strong}>{ingredient.name} {!ingredient.active && "(inactivo)"}</Text>
              <Text style={ops.muted}>{ingredient.type?.name ?? "Sin tipo"}{ingredient.sku ? ` · SKU ${ingredient.sku}` : ""}</Text>
            </View>
            <View>
              <Text style={level === "danger" ? ops.statusDanger : level === "warning" ? ops.statusWarning : ops.statusGood}>
                {quantityText(ingredient.current_stock)} {unit}
              </Text>
              <Text style={ops.muted}>mín. {quantityText(ingredient.minimum_stock)} · crítico {quantityText(ingredient.critical_stock)}</Text>
            </View>
          </View>
          {!!ingredient.presentations?.length && <View style={ops.insetCard}>
            <Text style={ops.label}>Presentaciones de compra</Text>
            {ingredient.presentations.map((presentation) => <View style={ops.row} key={presentation.id}>
              <Text style={!presentation.active ? ops.muted : undefined}>{presentation.name}{!presentation.active ? " (inactiva)" : ""}</Text>
              <Text style={ops.muted}>1 × {presentation.name} = {quantityText(presentation.base_quantity)} {unit}</Text>
              {isAdministrator && <View style={ops.chips}>
                <Pressable style={ops.outlineButton} onPress={() => editPresentation(ingredient, presentation)}><Text style={ops.outlineText}>Editar</Text></Pressable>
                {presentation.active && <Pressable style={ops.dangerButton} onPress={() => deactivatePresentation(ingredient, presentation)}><Text style={ops.dangerText}>Desactivar</Text></Pressable>}
              </View>}
            </View>)}
          </View>}
          {isAdministrator && <View style={ops.chips}>
            <Pressable style={ops.outlineButton} onPress={() => editIngredient(ingredient)}><Text style={ops.outlineText}>Editar insumo</Text></Pressable>
            <Pressable style={ops.outlineButton} onPress={() => { resetPresentationForm(ingredient.id); setTab("admin"); }}><Text style={ops.outlineText}>Nueva presentación</Text></Pressable>
            {ingredient.active && <Pressable style={ops.dangerButton} onPress={() => deactivateIngredient(ingredient)}><Text style={ops.dangerText}>Desactivar</Text></Pressable>}
          </View>}
        </View>;
      })}
    </>}

    {tab === "batches" && <Section title="Lotes por caducidad (FEFO)">
      {!batches.length ? <EmptyState text="No hay lotes registrados." /> : batches.map((batch) => {
        const knownIngredient = ingredientById.get(batch.ingredient_id) ?? batch.ingredient;
        const expired = batchIsExpired(batch);
        return <View style={ops.insetCard} key={batch.id}>
          <View style={ops.row}>
            <View style={ops.rowGrow}>
              <Text style={ops.strong}>{knownIngredient?.name ?? `Insumo #${batch.ingredient_id}`}</Text>
              <Text style={ops.muted}>Lote {batch.lot_code || `#${batch.id}`} · recibido {dateText(batch.received_at)}</Text>
            </View>
            <Text style={expired ? ops.statusDanger : ops.value}>{quantityText(batch.available_quantity)} {knownIngredient?.base_unit?.symbol ?? "u"}</Text>
          </View>
          <Text style={expired ? ops.statusDanger : ops.muted}>Caduca: {batch.expires_at ? dateText(batch.expires_at) : "sin caducidad"}{expired ? " · CADUCADO" : ""}</Text>
          <Text style={ops.muted}>Inicial {quantityText(batch.initial_quantity)} · costo unitario ${moneyText(batch.unit_cost)}</Text>
          {isAdministrator && <Pressable style={ops.outlineButton} onPress={() => { setAdjustmentBatchId(batch.id); setTab("admin"); }}><Text style={ops.outlineText}>Ajustar este lote</Text></Pressable>}
        </View>;
      })}
      {batchPage < batchLastPage && <Pressable disabled={loadingMoreBatches} onPress={loadMoreBatches} style={[ops.outlineButton, loadingMoreBatches && ops.disabled]}>
        <Text style={ops.outlineText}>{loadingMoreBatches ? "Cargando lotes..." : `Cargar más lotes (página ${batchPage + 1} de ${batchLastPage})`}</Text>
      </Pressable>}
    </Section>}

    {tab === "alerts" && <Section title="Alertas activas">
      {!alerts.length ? <EmptyState text="No hay alertas activas de stock o caducidad." /> : alerts.map((alert) => <View style={ops.insetCard} key={alert.id}>
        <View style={ops.row}>
          <Text style={alert.severity === "critical" ? ops.statusDanger : ops.statusWarning}>{alert.severity.toUpperCase()} · {alert.type}</Text>
          <Text style={ops.muted}>{dateText(alert.created_at, true)}</Text>
        </View>
        <Text>{alert.message}</Text>
        <Text style={ops.muted}>{alert.ingredient?.name ?? "Insumo"}{alert.batch ? ` · lote ${alert.batch.lot_code || `#${alert.batch.id}`}` : ""}</Text>
      </View>)}
    </Section>}

    {tab === "movements" && <Section title="Historial de movimientos">
      {!movements.length ? <EmptyState text="No hay movimientos de inventario." /> : movements.map((movement) => <View style={ops.insetCard} key={movement.id}>
        <View style={ops.row}>
          <View style={ops.rowGrow}>
            <Text style={ops.strong}>{ingredientById.get(movement.ingredient_id)?.name ?? movement.ingredient?.name ?? `Insumo #${movement.ingredient_id}`}</Text>
            <Text style={ops.muted}>{movement.type} · {movement.reason || "sin motivo"} · {dateText(movement.created_at, true)}</Text>
          </View>
          <Text style={numberValue(movement.quantity) < 0 ? ops.statusDanger : ops.statusGood}>{numberValue(movement.quantity) > 0 ? "+" : ""}{quantityText(movement.quantity)} {ingredientById.get(movement.ingredient_id)?.base_unit?.symbol ?? "u"}</Text>
        </View>
        <Text style={ops.muted}>Lote {movement.batch?.lot_code || `#${movement.inventory_batch_id}`} · {quantityText(movement.quantity_before)} → {quantityText(movement.quantity_after)}</Text>
        {!!movement.comment && <Text>{movement.comment}</Text>}
      </View>)}
      {movementPage < movementLastPage && <Pressable disabled={loadingMoreMovements} onPress={loadMoreMovements} style={[ops.outlineButton, loadingMoreMovements && ops.disabled]}>
        <Text style={ops.outlineText}>{loadingMoreMovements ? "Cargando movimientos..." : `Cargar más movimientos (página ${movementPage + 1} de ${movementLastPage})`}</Text>
      </Pressable>}
    </Section>}

    {tab === "admin" && isAdministrator && <>
      <Section title={editingIngredientId ? "Editar insumo" : "Registrar insumo"}>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={ingredientName} onChangeText={setIngredientName} placeholder="Nombre del insumo" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={ingredientSku} onChangeText={setIngredientSku} placeholder="SKU opcional" autoCapitalize="characters" />
        </View>
        {!editingIngredientId && <><Text style={ops.label}>Unidad base</Text><View style={ops.chips}>{activeUnits.map((unit) => <Pressable key={unit.id} onPress={() => setBaseUnitId(unit.id)} style={[ops.chip, baseUnitId === unit.id && ops.chipActive]}><Text>{unit.symbol} · {unit.name}</Text></Pressable>)}</View></>}
        {editingIngredientId && <Text style={ops.notice}>La unidad base se conserva para no alterar movimientos, recetas ni conversiones existentes.</Text>}
        <Text style={ops.label}>Tipo de insumo</Text>
        <View style={ops.chips}><Pressable onPress={() => setIngredientTypeId(null)} style={[ops.chip, ingredientTypeId === null && ops.chipActive]}><Text>Sin tipo</Text></Pressable>{activeTypes.map((type) => <Pressable key={type.id} onPress={() => setIngredientTypeId(type.id)} style={[ops.chip, ingredientTypeId === type.id && ops.chipActive]}><Text>{type.name}</Text></Pressable>)}</View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={minimumStock} onChangeText={setMinimumStock} placeholder="Stock mínimo" keyboardType="decimal-pad" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={criticalStock} onChangeText={setCriticalStock} placeholder="Stock crítico" keyboardType="decimal-pad" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={expiryAlertDays} onChangeText={setExpiryAlertDays} placeholder="Alerta (días)" keyboardType="number-pad" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={shelfLifeDays} onChangeText={setShelfLifeDays} placeholder="Vida útil (días)" keyboardType="number-pad" />
        </View>
        {editingIngredientId && <View style={ops.chips}><Pressable onPress={() => setIngredientActive((value) => !value)} style={[ops.chip, ingredientActive && ops.chipActive]}><Text>{ingredientActive ? "Activo" : "Inactivo"}</Text></Pressable></View>}
        {!editingIngredientId && <>
          <Text style={ops.label}>Existencia inicial opcional</Text>
          <View style={[ops.inline, compact && ops.inlineCompact]}>
            <TextInput style={[ops.input, ops.fieldGrow]} value={initialStock} onChangeText={setInitialStock} placeholder="Cantidad" keyboardType="decimal-pad" />
            <TextInput style={[ops.input, ops.fieldGrow]} value={initialUnitCost} onChangeText={setInitialUnitCost} placeholder="Costo por unidad base" keyboardType="decimal-pad" />
          </View>
          <View style={[ops.inline, compact && ops.inlineCompact]}>
            <TextInput style={[ops.input, ops.fieldGrow]} value={initialLot} onChangeText={setInitialLot} placeholder="Código de lote" autoCapitalize="characters" />
            <TextInput style={[ops.input, ops.fieldGrow]} value={initialExpiry} onChangeText={setInitialExpiry} placeholder="Caducidad AAAA-MM-DD" autoCapitalize="none" />
          </View>
        </>}
        <View style={ops.chips}>
          <Pressable disabled={saving} onPress={saveIngredient} style={[ops.button, saving && ops.disabled]}><Text style={ops.buttonText}>{saving ? "Guardando..." : editingIngredientId ? "Actualizar insumo" : "Registrar insumo"}</Text></Pressable>
          {editingIngredientId && <Pressable onPress={resetIngredientForm} style={ops.outlineButton}><Text style={ops.outlineText}>Cancelar edición</Text></Pressable>}
        </View>
      </Section>

      <Section title={editingPresentationId ? "Editar presentación de compra" : "Nueva presentación de compra"}>
        <Text style={ops.label}>Insumo</Text>
        <View style={ops.chips}>{activeIngredients.map((ingredient) => <Pressable disabled={editingPresentationId !== null} key={ingredient.id} onPress={() => setPresentationIngredientId(ingredient.id)} style={[ops.chip, presentationIngredientId === ingredient.id && ops.chipActive, editingPresentationId !== null && ops.chipDisabled]}><Text>{ingredient.name}</Text></Pressable>)}</View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={presentationName} onChangeText={setPresentationName} placeholder="Nombre, por ejemplo Bolsa 2 kg" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={presentationSku} onChangeText={setPresentationSku} placeholder="SKU del proveedor" autoCapitalize="characters" />
        </View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={presentationQuantity} onChangeText={setPresentationQuantity} placeholder="Cantidad equivalente" keyboardType="decimal-pad" />
          <View style={ops.fieldGrow}><Text style={ops.label}>Unidad equivalente</Text><View style={ops.chips}>{compatiblePresentationUnits.map((unit) => <Pressable key={unit.id} onPress={() => setPresentationUnitId(unit.id)} style={[ops.chip, presentationUnitId === unit.id && ops.chipActive]}><Text>{unit.symbol}</Text></Pressable>)}</View></View>
        </View>
        {selectedPresentationIngredient && selectedPresentationUnit && <Text style={ops.notice}>Conversión: 1 presentación = {quantityText(presentationConversion)} {selectedPresentationBaseUnit?.symbol}. Esta equivalencia se usará al registrar compras e inventario.</Text>}
        {editingPresentationId && <Pressable onPress={() => setPresentationActive((value) => !value)} style={[ops.chip, presentationActive && ops.chipActive]}><Text>{presentationActive ? "Presentación activa" : "Presentación inactiva"}</Text></Pressable>}
        <View style={ops.chips}>
          <Pressable disabled={saving} onPress={savePresentation} style={[ops.button, saving && ops.disabled]}><Text style={ops.buttonText}>{editingPresentationId ? "Actualizar presentación" : "Guardar presentación"}</Text></Pressable>
          {editingPresentationId && <Pressable onPress={() => resetPresentationForm(selectedPresentationIngredient?.id)} style={ops.outlineButton}><Text style={ops.outlineText}>Cancelar edición</Text></Pressable>}
        </View>
      </Section>

      <Section title="Ajuste de inventario por lote">
        <Text style={ops.label}>Lote</Text>
        <View style={ops.chips}>{batches.map((batch) => <Pressable key={batch.id} onPress={() => setAdjustmentBatchId(batch.id)} style={[ops.chip, adjustmentBatchId === batch.id && ops.chipActive]}><Text>{batch.ingredient?.name ?? "Insumo"} · {batch.lot_code || `#${batch.id}`} ({quantityText(batch.available_quantity)}){batchIsExpired(batch) ? " · CADUCADO" : ""}</Text></Pressable>)}</View>
        <Text style={ops.label}>Motivo</Text>
        <View style={ops.chips}>{adjustmentReasons.map((reason) => <Pressable key={reason.key} onPress={() => setAdjustmentReason(reason.key)} style={[ops.chip, adjustmentReason === reason.key && ops.chipActive]}><Text>{reason.label}</Text></Pressable>)}</View>
        {!selectedAdjustmentReason.removal && <View style={ops.chips}><Pressable onPress={() => setAdjustmentDirection("in")} style={[ops.chip, adjustmentDirection === "in" && ops.chipActive]}><Text>Entrada (+)</Text></Pressable><Pressable onPress={() => setAdjustmentDirection("out")} style={[ops.chip, adjustmentDirection === "out" && ops.chipActive]}><Text>Salida (-)</Text></Pressable></View>}
        {selectedAdjustmentReason.removal && <Text style={ops.notice}>Este motivo siempre registra una salida negativa del lote.</Text>}
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={adjustmentQuantity} onChangeText={setAdjustmentQuantity} placeholder="Cantidad absoluta" keyboardType="decimal-pad" />
          <TextInput style={[ops.input, ops.fieldGrow, ops.textArea]} value={adjustmentComment} onChangeText={setAdjustmentComment} placeholder="Explicación obligatoria" multiline />
        </View>
        {selectedAdjustmentBatch && <Text style={ops.muted}>Disponible antes del ajuste: {quantityText(selectedAdjustmentBatch.available_quantity)} {ingredientById.get(selectedAdjustmentBatch.ingredient_id)?.base_unit?.symbol ?? "u"}</Text>}
        {selectedAdjustmentBatch && batchIsExpired(selectedAdjustmentBatch) && <Text style={ops.statusDanger}>Este lote está caducado: solo se permiten salidas para corregir o retirar su existencia.</Text>}
        <Pressable disabled={saving || !batches.length} onPress={saveAdjustment} style={[ops.button, (saving || !batches.length) && ops.disabled]}>{saving ? <ActivityIndicator color="white" /> : <Text style={ops.buttonText}>Registrar ajuste</Text>}</Pressable>
      </Section>
    </>}
  </View>;
}
