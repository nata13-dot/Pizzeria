import {ThemedText} from "../../theme/ThemedText";
import {useTheme} from "../../theme/ThemeProvider";
import { operationError } from "../../forms/validation";
import { loadErrorMessage } from "../../loadState";
import { RemoteListStatus } from "../../components/RemoteListStatus";
import { Pagination } from "../../components/RemoteListStatus";
import { usePaginatedResource, useRemoteResource } from "../../hooks/useRemoteResource";
import { useNavigationField } from "../../navigation/NavigationContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from "react-native";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { api } from "../../api";
import type {
  Ingredient,
  IngredientPresentation,
  IngredientType,
  InventoryAlert,
  InventoryBatch,
  InventoryMovement,
  InventoryItem,
  InventorySummary,
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
  useOpsStyles,
  quantityText,
  Section,
  Tabs,
} from "./ui";

const sourceLabels = { ingredients: "los insumos", batches: "los lotes", alerts: "las alertas", movements: "los movimientos", units: "las unidades", types: "los tipos de insumo" };
type SourceKey = keyof typeof sourceLabels;
type SourceState = { loading: boolean; error: string; loaded: boolean };
const sourceKeys = Object.keys(sourceLabels) as SourceKey[];
function initialSources(): Record<SourceKey, SourceState> {
  return Object.fromEntries(sourceKeys.map((key) => [key, { loading: false, error: "", loaded: false }])) as Record<SourceKey, SourceState>;
}

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

function batchIsExpired(batch: InventoryBatch): boolean {
  return Boolean(batch.expires_at && batch.expires_at.slice(0, 10) < localDateValue());
}

export function InventoryScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const {theme}=useTheme();
  const ops=useOpsStyles();
  const { width } = useWindowDimensions();
  const compact = width < 980;
  const [navigationContext,setNavigationContext]=useNavigationField("inventory",{tab:"stock" as InventoryTab,search:"",status:"" as "" | "available" | "low" | "critical" | "out",active:"1" as "1"|"0"|"",page:1,detailId:null as number|null});
  const [tab, setTab] = useState<InventoryTab>(navigationContext.tab);
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
  const [sources, setSources] = useState(initialSources);
  const refreshing = sourceKeys.some((key) => sources[key].loading);
  const [batchTotal, setBatchTotal] = useState(0);
  const [movementTotal, setMovementTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inventorySearch, setInventorySearch] = useState(navigationContext.search);
  const [inventoryStatus, setInventoryStatus] = useState<"" | "available" | "low" | "critical" | "out">(navigationContext.status);
  const [inventoryActive, setInventoryActive] = useState<"1" | "0" | "">(navigationContext.active);
  const [detailId, setDetailId] = useState<number | null>(navigationContext.detailId);
  const inventoryEndpoint = `/inventory/items?${new URLSearchParams({
    ...(inventoryStatus ? { status: inventoryStatus } : {}),
    ...(inventoryActive ? { active: inventoryActive } : {}),
  }).toString()}`;
  const inventory = usePaginatedResource<InventoryItem>(inventoryEndpoint, token, "las existencias", 300, true,{search:navigationContext.search,page:navigationContext.page});
  const summary = useRemoteResource<InventorySummary>("/inventory/summary", token, "el resumen de inventario", 0, true);
  const detail = useRemoteResource<InventoryItem>(detailId ? `/inventory/items/${detailId}` : null, token, "el detalle del insumo");
  const requestIds = useRef<Record<SourceKey, number>>({ ingredients: 0, batches: 0, alerts: 0, movements: 0, units: 0, types: 0 });
  const controllers = useRef<Partial<Record<SourceKey, AbortController>>>({});
  useEffect(()=>setNavigationContext({tab,search:inventory.search,status:inventoryStatus,active:inventoryActive,page:inventory.page,detailId}),[tab,inventory.search,inventoryStatus,inventoryActive,inventory.page,detailId]);

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

  async function loadSource(key: SourceKey, force = true): Promise<void> {
    const revision = ++requestIds.current[key];
    controllers.current[key]?.abort();
    const controller = new AbortController();
    controllers.current[key] = controller;
    const options = { signal: controller.signal, ...(force ? { cache: "reload" as const } : {}) };
    const current = () => revision === requestIds.current[key];
    setSources((state) => ({ ...state, [key]: { ...state[key], loading: true, error: "" } }));
    if (key === "batches") setLoadingMoreBatches(false);
    if (key === "movements") setLoadingMoreMovements(false);
    try {
      switch (key) {
        case "ingredients": {
          const rows = await fetchAllPages<Ingredient>("/ingredients", token, options);
          if (!current()) return;
          setIngredients(rows);
          setPresentationIngredientId((id) => id ?? rows.find((item) => item.active)?.id ?? null);
          break;
        }
        case "batches": {
          const page = await fetchPage<InventoryBatch>("/inventory/batches", token, 1, options);
          if (!current()) return;
          setBatches(page.data); setBatchPage(page.current_page); setBatchLastPage(page.last_page); setBatchTotal(page.total ?? page.data.length);
          setAdjustmentBatchId((id) => id && page.data.some((item) => item.id === id) ? id : page.data[0]?.id ?? null);
          break;
        }
        case "movements": {
          const page = await fetchPage<InventoryMovement>("/inventory/movements", token, 1, options);
          if (!current()) return;
          setMovements(page.data); setMovementPage(page.current_page); setMovementLastPage(page.last_page); setMovementTotal(page.total ?? page.data.length);
          break;
        }
        case "alerts": {
          const rows = await api<InventoryAlert[]>("/inventory/alerts", token, options);
          if (!current()) return;
          setAlerts(rows); break;
        }
        case "units": {
          const rows = await api<Unit[]>("/catalogs/units", token, options);
          if (!current()) return;
          setUnits(rows); setBaseUnitId((id) => id ?? rows.find((item) => item.active)?.id ?? null); break;
        }
        case "types": {
          const rows = await api<IngredientType[]>("/catalogs/ingredient-types", token, options);
          if (!current()) return;
          setIngredientTypes(rows); break;
        }
      }
      if (current()) setSources((state) => ({ ...state, [key]: { loading: false, error: "", loaded: true } }));
    } catch (error) {
      if (current()) setSources((state) => ({ ...state, [key]: { ...state[key], loading: false, error: loadErrorMessage(sourceLabels[key], error) } }));
    }
  }

  async function load(): Promise<void> {
    summary.reload(); inventory.reload(); detail.reload();
    const relevant: SourceKey[] = tab === "batches" ? ["batches"] : tab === "alerts" ? ["alerts"] : tab === "movements" ? ["movements"] : tab === "admin" ? ["ingredients", "units", "types", "batches"] : [];
    await Promise.allSettled(relevant.map((key) => loadSource(key)));
  }

  async function loadMoreBatches(): Promise<void> {
    if (loadingMoreBatches || sources.batches.loading || batchPage >= batchLastPage) return;
    const revision = requestIds.current.batches;
    setLoadingMoreBatches(true);
    setSources((state) => ({ ...state, batches: { ...state.batches, error: "" } }));
    try {
      const next = await fetchPage<InventoryBatch>("/inventory/batches", token, batchPage + 1, { cache: "reload" });
      if (revision !== requestIds.current.batches) return;
      setBatches((current) => appendUniqueById(current, next.data));
      setBatchPage(next.current_page); setBatchLastPage(next.last_page); setBatchTotal(next.total ?? next.data.length);
    } catch (error) {
      if (revision === requestIds.current.batches) setSources((state) => ({ ...state, batches: { ...state.batches, error: loadErrorMessage("más lotes", error) } }));
    } finally {
      if (revision === requestIds.current.batches) setLoadingMoreBatches(false);
    }
  }

  async function loadMoreMovements(): Promise<void> {
    if (loadingMoreMovements || sources.movements.loading || movementPage >= movementLastPage) return;
    const revision = requestIds.current.movements;
    setLoadingMoreMovements(true);
    setSources((state) => ({ ...state, movements: { ...state.movements, error: "" } }));
    try {
      const next = await fetchPage<InventoryMovement>("/inventory/movements", token, movementPage + 1, { cache: "reload" });
      if (revision !== requestIds.current.movements) return;
      setMovements((current) => appendUniqueById(current, next.data));
      setMovementPage(next.current_page); setMovementLastPage(next.last_page); setMovementTotal(next.total ?? next.data.length);
    } catch (error) {
      if (revision === requestIds.current.movements) setSources((state) => ({ ...state, movements: { ...state.movements, error: loadErrorMessage("más movimientos", error) } }));
    } finally {
      if (revision === requestIds.current.movements) setLoadingMoreMovements(false);
    }
  }

  useEffect(() => {
    setIngredients([]); setBatches([]); setAlerts([]); setMovements([]); setUnits([]); setIngredientTypes([]);
    setSources(initialSources());
    return () => { sourceKeys.forEach((key) => { requestIds.current[key]++; controllers.current[key]?.abort(); }); };
  }, [token]);

  useEffect(() => { inventory.setSearch(inventorySearch); }, [inventorySearch]);
  useEffect(() => { inventory.setPage(1); }, [inventoryStatus, inventoryActive]);
  useEffect(() => {
    const keys: SourceKey[] = tab === "batches" ? ["batches"] : tab === "alerts" ? ["alerts"] : tab === "movements" ? ["movements"] : tab === "admin" ? ["ingredients", "units", "types", "batches"] : [];
    void Promise.allSettled(keys.filter((key) => !sources[key].loaded && !sources[key].loading).map((key) => loadSource(key, false)));
  }, [tab]);

  const ready = (key: SourceKey) => sources[key].loaded && !sources[key].loading && !sources[key].error;
  const sourceCount = { ingredients: ingredients.length, batches: batches.length, alerts: alerts.length, movements: movements.length, units: units.length, types: ingredientTypes.length };

  useEffect(() => {
    if (!selectedPresentationIngredient || !selectedPresentationBaseUnit) return;
    const currentUnit = units.find((unit) => unit.id === presentationUnitId);
    if (!currentUnit?.active || currentUnit.dimension !== selectedPresentationBaseUnit.dimension) {
      if (editingPresentationId !== null && presentationUnitId !== null) return;
      setPresentationUnitId(units.find((unit) => unit.active && unit.dimension === selectedPresentationBaseUnit.dimension)?.id ?? null);
    }
  }, [presentationIngredientId, units, editingPresentationId, presentationUnitId]);

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
      setError(operationError(saveError, "guardar los cambios", true));
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
      setError(operationError(deactivateError, "guardar los cambios", true));
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
      setError(operationError(saveError, "guardar los cambios", true));
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
      setError(operationError(deactivateError, "guardar los cambios", true));
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
      setError(operationError(adjustError, "guardar los cambios", true));
    } finally {
      setSaving(false);
    }
  }

  return <View style={ops.screen}>
    <View style={ops.toolbar}>
      <Tabs
        active={tab}
        items={[
          { key: "stock", label: `Existencias (${inventory.data?.total ?? "…"})` },
          { key: "batches", label: `Lotes (${sources.batches.loaded ? batchTotal : "…"})` },
          { key: "alerts", label: `Alertas (${sources.alerts.loaded ? alerts.length : "…"})` },
          { key: "movements", label: "Movimientos" },
          ...(isAdministrator ? [{ key: "admin", label: "Administrar" }] : []),
        ]}
        onChange={(key) => setTab(key as InventoryTab)}
      />
      <Pressable disabled={refreshing} onPress={() => load()} style={[ops.outlineButton, refreshing && ops.disabled]}>
        <ThemedText style={ops.outlineText}>{refreshing ? "Actualizando..." : "Actualizar todo"}</ThemedText>
      </Pressable>
    </View>
    <Feedback error={error} message={message} />
    {sourceKeys.filter((key) => sources[key].error).map((key) => <RemoteListStatus key={key} {...sources[key]} count={sourceCount[key]} emptyText="" onRetry={() => loadSource(key)} />)}
    {tab !== "stock" && sources[tab === "admin" ? "units" : tab].loading && <LoadingState text="Cargando esta sección..." />}
    {tab === "admin" && refreshing && <ThemedText style={ops.muted}>Algunas opciones estarán disponibles cuando termine su carga.</ThemedText>}

    {tab === "stock" && <>
      {!summary.unavailable && <RemoteListStatus loading={summary.loading} error={summary.error} count={summary.data ? 1 : 0} emptyText="No hay resumen disponible." onRetry={summary.reload}/>}
      {summary.data && <View style={ops.metrics}>
        <View style={ops.metric}><ThemedText style={ops.statusGood}>{summary.data.available}</ThemedText><ThemedText style={ops.muted}>Disponibles</ThemedText></View>
        <View style={ops.metric}><ThemedText style={summary.data.low ? ops.statusWarning : ops.metricValue}>{summary.data.low}</ThemedText><ThemedText style={ops.muted}>Bajos o críticos</ThemedText></View>
        <View style={ops.metric}><ThemedText style={summary.data.out ? ops.statusDanger : ops.metricValue}>{summary.data.out}</ThemedText><ThemedText style={ops.muted}>Agotados</ThemedText></View>
        <View style={ops.metric}><ThemedText style={summary.data.expiring ? ops.statusWarning : ops.metricValue}>{summary.data.expiring}</ThemedText><ThemedText style={ops.muted}>Por caducar</ThemedText></View>
      </View>}
      <Section title="¿Qué tengo?" subtitle="Busca un insumo y revisa su existencia utilizable, mínimo y próxima caducidad.">
        <TextInput value={inventorySearch} onChangeText={setInventorySearch} placeholder="Buscar por nombre o SKU" />
        <ThemedText style={ops.label}>Estado</ThemedText>
        <View style={ops.chips}>{[
          ["", "Todos"], ["available", "Disponibles"], ["low", "Existencia baja"], ["critical", "Críticos"], ["out", "Agotados"],
        ].map(([key, label]) => <Pressable key={key || "all"} accessibilityRole="button" accessibilityState={{selected: inventoryStatus === key}} onPress={() => setInventoryStatus(key as typeof inventoryStatus)} style={[ops.chip, inventoryStatus === key && ops.chipActive]}><ThemedText>{label}</ThemedText></Pressable>)}</View>
        {isAdministrator && <View style={ops.chips}>{[["1", "Activos"], ["0", "Inactivos"], ["", "Todos"]].map(([key, label]) => <Pressable key={key || "all-active"} accessibilityState={{selected: inventoryActive === key}} onPress={() => setInventoryActive(key as typeof inventoryActive)} style={[ops.chip, inventoryActive === key && ops.chipActive]}><ThemedText>{label}</ThemedText></Pressable>)}</View>}
        <RemoteListStatus loading={inventory.loading} error={inventory.error} count={inventory.items.length} search={inventory.search} emptyText="No hay insumos registrados." onRetry={inventory.reload}/>
        {inventory.items.map((ingredient) => {
          const unit = ingredient.base_unit?.symbol ?? "u";
          const labels = { available: "Disponible", low: "Existencia baja", critical: "Existencia crítica", out: "Agotado" };
          const danger = ingredient.stock_status === "out" || ingredient.stock_status === "critical";
          return <View style={[ops.card, !ingredient.active && ops.disabled]} key={ingredient.id}>
            <View style={ops.row}><View style={ops.rowGrow}>
              <ThemedText style={ops.strong}>{ingredient.name} {!ingredient.active && "(inactivo)"}</ThemedText>
              <ThemedText style={ops.muted}>{ingredient.sku ? `SKU ${ingredient.sku} · ` : ""}{labels[ingredient.stock_status]}</ThemedText>
              {numberValue(ingredient.minimum_stock) > 0 && numberValue(ingredient.missing_to_minimum) > 0
                ? <ThemedText style={ops.muted}>Faltan {quantityText(ingredient.missing_to_minimum)} {unit} para alcanzar el mínimo configurado.</ThemedText>
                : numberValue(ingredient.minimum_stock) === 0 ? <ThemedText style={ops.muted}>Sin objetivo mínimo configurado.</ThemedText> : null}
            </View><View><ThemedText style={danger ? ops.statusDanger : ingredient.stock_status === "low" ? ops.statusWarning : ops.statusGood}>{quantityText(ingredient.current_stock)} {unit}</ThemedText><ThemedText style={ops.muted}>Mínimo {quantityText(ingredient.minimum_stock)} {unit}</ThemedText></View></View>
            {!!ingredient.next_expiry && <ThemedText style={ops.muted}>Próxima caducidad: {dateText(ingredient.next_expiry)}</ThemedText>}
            <Pressable onPress={() => setDetailId((current) => current === ingredient.id ? null : ingredient.id)} style={ops.outlineButton}><ThemedText style={ops.outlineText}>{detailId === ingredient.id ? "Ocultar detalle" : "Ver detalle"}</ThemedText></Pressable>
            {detailId === ingredient.id && <View style={ops.insetCard}>
              <RemoteListStatus loading={detail.loading} error={detail.error} count={detail.data ? 1 : 0} emptyText="No se encontró el detalle." onRetry={detail.reload}/>
              {detail.data && <>
                <ThemedText style={ops.label}>Presentaciones de compra</ThemedText>
                {!detail.data.presentations?.length ? <ThemedText style={ops.muted}>No hay presentaciones configuradas.</ThemedText> : detail.data.presentations.map((presentation) => <ThemedText key={presentation.id}>{presentation.name} · {quantityText(presentation.quantity)} {presentation.equivalent_unit?.symbol ?? "u"} = {quantityText(presentation.base_quantity)} {unit}{!presentation.active ? " · Inactiva" : ""}</ThemedText>)}
                <ThemedText style={ops.label}>Lotes recientes</ThemedText>
                {!detail.data.batches?.length ? <ThemedText style={ops.muted}>No hay lotes.</ThemedText> : detail.data.batches.map((batch) => <ThemedText key={batch.id}>{batch.lot_code || `Lote #${batch.id}`} · {quantityText(batch.available_quantity)} {unit} · {batch.expires_at ? `caduca ${dateText(batch.expires_at)}` : "sin caducidad"}</ThemedText>)}
                <ThemedText style={ops.label}>Cambios recientes</ThemedText>
                {!detail.data.movements?.length ? <ThemedText style={ops.muted}>No hay movimientos.</ThemedText> : detail.data.movements.map((movement) => <ThemedText key={movement.id}>{numberValue(movement.quantity) > 0 ? "+" : ""}{quantityText(movement.quantity)} {unit} · {movement.type_label}{movement.origin_label ? ` · ${movement.origin_label}` : ""}</ThemedText>)}
              </>}
            </View>}
          </View>;
        })}
        <Pagination data={inventory.data} loading={inventory.loading} onPage={inventory.setPage}/>
      </Section>
    </>}

    {tab === "batches" && <Section title="Lotes por fecha de caducidad" subtitle="Los que caducan antes aparecen primero para facilitar su uso oportuno.">
      {!batches.length ? (ready("batches") ? <EmptyState text="No hay lotes registrados." /> : null) : batches.map((batch) => {
        const knownIngredient = ingredientById.get(batch.ingredient_id) ?? batch.ingredient;
        const expired = batchIsExpired(batch);
        return <View style={ops.insetCard} key={batch.id}>
          <View style={ops.row}>
            <View style={ops.rowGrow}>
              <ThemedText style={ops.strong}>{knownIngredient?.name ?? `Insumo #${batch.ingredient_id}`}</ThemedText>
              <ThemedText style={ops.muted}>Lote {batch.lot_code || `#${batch.id}`} · recibido {dateText(batch.received_at)}</ThemedText>
            </View>
            <ThemedText style={expired ? ops.statusDanger : ops.value}>{quantityText(batch.available_quantity)} {knownIngredient?.base_unit?.symbol ?? "u"}</ThemedText>
          </View>
          <ThemedText style={expired ? ops.statusDanger : ops.muted}>Caduca: {batch.expires_at ? dateText(batch.expires_at) : "sin caducidad"}{expired ? " · CADUCADO" : ""}</ThemedText>
          <ThemedText style={ops.muted}>Inicial {quantityText(batch.initial_quantity)} · costo unitario ${moneyText(batch.unit_cost)}</ThemedText>
          {isAdministrator && <Pressable style={ops.outlineButton} onPress={() => { setAdjustmentBatchId(batch.id); setTab("admin"); }}><ThemedText style={ops.outlineText}>Ajustar este lote</ThemedText></Pressable>}
        </View>;
      })}
      {sources.batches.loaded && <ThemedText style={ops.muted}>{batches.length} de {batchTotal} lotes · páginas cargadas: {batchPage} de {batchLastPage}</ThemedText>}
      {batchPage < batchLastPage && <Pressable disabled={loadingMoreBatches || sources.batches.loading} onPress={loadMoreBatches} style={[ops.outlineButton, loadingMoreBatches && ops.disabled]}>
        <ThemedText style={ops.outlineText}>{loadingMoreBatches ? "Cargando lotes..." : `Cargar más lotes (página ${batchPage + 1} de ${batchLastPage})`}</ThemedText>
      </Pressable>}
    </Section>}

    {tab === "alerts" && <Section title="Alertas activas" subtitle="Prioriza faltantes, niveles críticos y lotes próximos a caducar.">
      {!alerts.length ? (ready("alerts") ? <EmptyState text="No hay alertas activas de stock o caducidad." /> : null) : alerts.map((alert) => <View style={ops.insetCard} key={alert.id}>
        <View style={ops.row}>
          <ThemedText style={alert.severity === "critical" ? ops.statusDanger : ops.statusWarning}>{{low_stock:"EXISTENCIA BAJA",critical_stock:"AGOTADO O CRÍTICO",expiring:"PRÓXIMO A CADUCAR",expired:"CADUCADO",insufficient_dough:"INSUMO INSUFICIENTE"}[alert.type] ?? "REVISAR INVENTARIO"}</ThemedText>
          <ThemedText style={ops.muted}>{dateText(alert.created_at, true)}</ThemedText>
        </View>
        <ThemedText>{alert.message}</ThemedText>
        <ThemedText style={ops.muted}>{alert.ingredient?.name ?? "Insumo"}{alert.batch ? ` · lote ${alert.batch.lot_code || `#${alert.batch.id}`}` : ""}</ThemedText>
      </View>)}
    </Section>}

    {tab === "movements" && <Section title="Historial de movimientos" subtitle="Consulta entradas, salidas y ajustes con su saldo antes y después.">
      {!movements.length ? (ready("movements") ? <EmptyState text="No hay movimientos de inventario." /> : null) : movements.map((movement) => <View style={ops.insetCard} key={movement.id}>
        <View style={ops.row}>
          <View style={ops.rowGrow}>
            <ThemedText style={ops.strong}>{ingredientById.get(movement.ingredient_id)?.name ?? movement.ingredient?.name ?? `Insumo #${movement.ingredient_id}`}</ThemedText>
            <ThemedText style={ops.muted}>{movement.type_label ?? "Movimiento de inventario"}{movement.origin_label ? ` · ${movement.origin_label}` : ""} · {dateText(movement.created_at, true)}</ThemedText>
          </View>
          <ThemedText style={numberValue(movement.quantity) < 0 ? ops.statusDanger : ops.statusGood}>{numberValue(movement.quantity) > 0 ? "+" : ""}{quantityText(movement.quantity)} {ingredientById.get(movement.ingredient_id)?.base_unit?.symbol ?? "u"}</ThemedText>
        </View>
        <ThemedText style={ops.muted}>Lote {movement.batch?.lot_code || `#${movement.inventory_batch_id}`} · {quantityText(movement.quantity_before)} → {quantityText(movement.quantity_after)}</ThemedText>
        {!!movement.reason && <ThemedText style={ops.muted}>Motivo: {movement.reason.replaceAll("_", " ")}</ThemedText>}
        {!!movement.comment && <ThemedText>{movement.comment}</ThemedText>}
      </View>)}
      {sources.movements.loaded && <ThemedText style={ops.muted}>{movements.length} de {movementTotal} movimientos · páginas cargadas: {movementPage} de {movementLastPage}</ThemedText>}
      {movementPage < movementLastPage && <Pressable disabled={loadingMoreMovements || sources.movements.loading} onPress={loadMoreMovements} style={[ops.outlineButton, loadingMoreMovements && ops.disabled]}>
        <ThemedText style={ops.outlineText}>{loadingMoreMovements ? "Cargando movimientos..." : `Cargar más movimientos (página ${movementPage + 1} de ${movementLastPage})`}</ThemedText>
      </Pressable>}
    </Section>}

    {tab === "admin" && isAdministrator && <>
      <Section title={editingIngredientId ? "Editar insumo" : "Registrar insumo"} subtitle="Configura su unidad de control, niveles de alerta y, si aplica, la existencia inicial.">
        <ThemedText style={ops.subtitle}>Identificación</ThemedText>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={ingredientName} onChangeText={setIngredientName} placeholder="Nombre del insumo" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={ingredientSku} onChangeText={setIngredientSku} placeholder="SKU opcional" autoCapitalize="characters" />
        </View>
        {!editingIngredientId && <><ThemedText style={ops.label}>Unidad base</ThemedText><View style={ops.chips}>{activeUnits.map((unit) => <Pressable key={unit.id} onPress={() => setBaseUnitId(unit.id)} style={[ops.chip, baseUnitId === unit.id && ops.chipActive]}><ThemedText>{unit.symbol} · {unit.name}</ThemedText></Pressable>)}</View></>}
        {editingIngredientId && <ThemedText style={ops.notice}>La unidad base se conserva para no alterar movimientos, recetas ni conversiones existentes.</ThemedText>}
        <ThemedText style={ops.label}>Tipo de insumo</ThemedText>
        <View style={ops.chips}><Pressable onPress={() => setIngredientTypeId(null)} style={[ops.chip, ingredientTypeId === null && ops.chipActive]}><ThemedText>Sin tipo</ThemedText></Pressable>{activeTypes.map((type) => <Pressable key={type.id} onPress={() => setIngredientTypeId(type.id)} style={[ops.chip, ingredientTypeId === type.id && ops.chipActive]}><ThemedText>{type.name}</ThemedText></Pressable>)}</View>
        <ThemedText style={ops.subtitle}>Control de existencias</ThemedText>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={minimumStock} onChangeText={setMinimumStock} placeholder="Stock mínimo" keyboardType="decimal-pad" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={criticalStock} onChangeText={setCriticalStock} placeholder="Stock crítico" keyboardType="decimal-pad" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={expiryAlertDays} onChangeText={setExpiryAlertDays} placeholder="Alerta (días)" keyboardType="number-pad" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={shelfLifeDays} onChangeText={setShelfLifeDays} placeholder="Vida útil (días)" keyboardType="number-pad" />
        </View>
        {editingIngredientId && <View style={ops.chips}><Pressable onPress={() => setIngredientActive((value) => !value)} style={[ops.chip, ingredientActive && ops.chipActive]}><ThemedText>{ingredientActive ? "Activo" : "Inactivo"}</ThemedText></Pressable></View>}
        {!editingIngredientId && <>
          <ThemedText style={ops.subtitle}>Existencia inicial opcional</ThemedText>
          <ThemedText style={ops.muted}>Puedes dejarla vacía y registrar la primera compra posteriormente.</ThemedText>
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
          <Pressable disabled={saving || !ready("units") || !ready("types")} onPress={saveIngredient} style={[ops.button, saving && ops.disabled]}><ThemedText style={ops.buttonText}>{saving ? "Guardando..." : editingIngredientId ? "Actualizar insumo" : "Registrar insumo"}</ThemedText></Pressable>
          {editingIngredientId && <Pressable onPress={resetIngredientForm} style={ops.outlineButton}><ThemedText style={ops.outlineText}>Cancelar edición</ThemedText></Pressable>}
        </View>
      </Section>

      <Section title={editingPresentationId ? "Editar presentación de compra" : "Nueva presentación de compra"} subtitle="Relaciona la forma en que compras el insumo con su unidad base de inventario.">
        <ThemedText style={ops.label}>Insumo</ThemedText>
        <View style={ops.chips}>{activeIngredients.map((ingredient) => <Pressable disabled={editingPresentationId !== null} key={ingredient.id} onPress={() => setPresentationIngredientId(ingredient.id)} style={[ops.chip, presentationIngredientId === ingredient.id && ops.chipActive, editingPresentationId !== null && ops.chipDisabled]}><ThemedText>{ingredient.name}</ThemedText></Pressable>)}</View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={presentationName} onChangeText={setPresentationName} placeholder="Nombre, por ejemplo Bolsa 2 kg" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={presentationSku} onChangeText={setPresentationSku} placeholder="SKU del proveedor" autoCapitalize="characters" />
        </View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={presentationQuantity} onChangeText={setPresentationQuantity} placeholder="Cantidad equivalente" keyboardType="decimal-pad" />
          <View style={ops.fieldGrow}><ThemedText style={ops.label}>Unidad equivalente</ThemedText><View style={ops.chips}>{compatiblePresentationUnits.map((unit) => <Pressable key={unit.id} onPress={() => setPresentationUnitId(unit.id)} style={[ops.chip, presentationUnitId === unit.id && ops.chipActive]}><ThemedText>{unit.symbol}</ThemedText></Pressable>)}</View></View>
        </View>
        {selectedPresentationIngredient && selectedPresentationUnit && <ThemedText style={ops.notice}>Conversión: 1 presentación = {quantityText(presentationConversion)} {selectedPresentationBaseUnit?.symbol}. Esta equivalencia se usará al registrar compras e inventario.</ThemedText>}
        {editingPresentationId && <Pressable onPress={() => setPresentationActive((value) => !value)} style={[ops.chip, presentationActive && ops.chipActive]}><ThemedText>{presentationActive ? "Presentación activa" : "Presentación inactiva"}</ThemedText></Pressable>}
        <View style={ops.chips}>
          <Pressable disabled={saving || !ready("ingredients") || !ready("units")} onPress={savePresentation} style={[ops.button, saving && ops.disabled]}><ThemedText style={ops.buttonText}>{editingPresentationId ? "Actualizar presentación" : "Guardar presentación"}</ThemedText></Pressable>
          {editingPresentationId && <Pressable onPress={() => resetPresentationForm(selectedPresentationIngredient?.id)} style={ops.outlineButton}><ThemedText style={ops.outlineText}>Cancelar edición</ThemedText></Pressable>}
        </View>
      </Section>

      <Section title="Ajuste de inventario por lote" subtitle="Usa esta opción para mermas, correcciones y movimientos que no provienen de una compra o venta.">
        <ThemedText style={ops.label}>Lote</ThemedText>
        <ThemedText style={ops.muted}>{batches.length} de {batchTotal} lotes cargados.</ThemedText>
        {batchPage < batchLastPage && <Pressable disabled={loadingMoreBatches || sources.batches.loading} onPress={loadMoreBatches} style={ops.outlineButton}><ThemedText style={ops.outlineText}>{loadingMoreBatches ? "Cargando..." : "Cargar más lotes"}</ThemedText></Pressable>}
        <View style={ops.chips}>{batches.map((batch) => <Pressable key={batch.id} onPress={() => setAdjustmentBatchId(batch.id)} style={[ops.chip, adjustmentBatchId === batch.id && ops.chipActive]}><ThemedText>{batch.ingredient?.name ?? "Insumo"} · {batch.lot_code || `#${batch.id}`} ({quantityText(batch.available_quantity)}){batchIsExpired(batch) ? " · CADUCADO" : ""}</ThemedText></Pressable>)}</View>
        <ThemedText style={ops.label}>Motivo</ThemedText>
        <View style={ops.chips}>{adjustmentReasons.map((reason) => <Pressable key={reason.key} onPress={() => setAdjustmentReason(reason.key)} style={[ops.chip, adjustmentReason === reason.key && ops.chipActive]}><ThemedText>{reason.label}</ThemedText></Pressable>)}</View>
        {!selectedAdjustmentReason.removal && <View style={ops.chips}><Pressable onPress={() => setAdjustmentDirection("in")} style={[ops.chip, adjustmentDirection === "in" && ops.chipActive]}><ThemedText>Entrada (+)</ThemedText></Pressable><Pressable onPress={() => setAdjustmentDirection("out")} style={[ops.chip, adjustmentDirection === "out" && ops.chipActive]}><ThemedText>Salida (-)</ThemedText></Pressable></View>}
        {selectedAdjustmentReason.removal && <ThemedText style={ops.notice}>Este motivo siempre registra una salida negativa del lote.</ThemedText>}
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={adjustmentQuantity} onChangeText={setAdjustmentQuantity} placeholder="Cantidad absoluta" keyboardType="decimal-pad" />
          <TextInput style={[ops.input, ops.fieldGrow, ops.textArea]} value={adjustmentComment} onChangeText={setAdjustmentComment} placeholder="Explicación obligatoria" multiline />
        </View>
        {selectedAdjustmentBatch && <ThemedText style={ops.muted}>Disponible antes del ajuste: {quantityText(selectedAdjustmentBatch.available_quantity)} {ingredientById.get(selectedAdjustmentBatch.ingredient_id)?.base_unit?.symbol ?? "u"}</ThemedText>}
        {selectedAdjustmentBatch && batchIsExpired(selectedAdjustmentBatch) && <ThemedText style={ops.statusDanger}>Este lote está caducado: solo se permiten salidas para corregir o retirar su existencia.</ThemedText>}
        <Pressable disabled={saving || !batches.length || !ready("batches")} onPress={saveAdjustment} style={[ops.button, (saving || !batches.length) && ops.disabled]}>{saving ? <ActivityIndicator color={theme.colors.primaryText} /> : <ThemedText style={ops.buttonText}>Registrar ajuste</ThemedText>}</Pressable>
      </Section>
    </>}
  </View>;
}
