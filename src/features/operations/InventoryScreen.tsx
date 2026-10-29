import {ThemedText} from "../../theme/ThemedText";
import { loadErrorMessage } from "../../loadState";
import { RemoteListStatus } from "../../components/RemoteListStatus";
import { Pagination } from "../../components/RemoteListStatus";
import { ActionButton } from "../../components/ActionButton";
import { usePaginatedResource, useRemoteResource } from "../../hooks/useRemoteResource";
import { useNavigationField } from "../../navigation/NavigationContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useResponsiveLayout } from "../../layout/responsive";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { api } from "../../api";
import type {
  InventoryAlert,
  InventoryBatch,
  InventoryMovement,
  InventoryItem,
  InventoryStatus,
  InventorySummary,
} from "./types";
import {
  appendUniqueById,
  Choices,
  dateText,
  EmptyState,
  Feedback,
  fetchPage,
  LoadingState,
  localDateValue,
  moneyText,
  numberValue,
  useOpsStyles,
  quantityText,
  Section,
  Tabs,
} from "./ui";
import { AdjustStockForm } from "./inventory/AdjustStockForm";
import { IngredientForm } from "./inventory/IngredientForm";
import { PresentationsManager } from "./inventory/PresentationsManager";

const sourceLabels = { batches: "los lotes", alerts: "las alertas", movements: "los movimientos" };
type SourceKey = keyof typeof sourceLabels;
type SourceState = { loading: boolean; error: string; loaded: boolean };
const sourceKeys = Object.keys(sourceLabels) as SourceKey[];
function initialSources(): Record<SourceKey, SourceState> {
  return Object.fromEntries(sourceKeys.map((key) => [key, { loading: false, error: "", loaded: false }])) as Record<SourceKey, SourceState>;
}

type InventoryTab = "stock" | "batches" | "alerts" | "movements";
type StatusFilter = "" | InventoryStatus;
/** One management task shown at a time instead of several forms stacked on one page. */
type Task = { kind: "ingredient" | "adjust" | "presentations"; id: number | null; batchId?: number | null } | null;

const statusLabels: Record<InventoryStatus, string> = { available: "Disponible", low: "Existencia baja", critical: "Existencia crítica", out: "Agotado" };
const reasonLabels: Record<string, string> = { waste: "Merma", expiry: "Caducidad", preparation_error: "Error al preparar", gift: "Regalo o cortesía", internal_use: "Consumo del personal", manual: "Ajuste manual", loss: "Pérdida", correction: "Corrección de conteo", initial: "Existencia inicial" };

function batchIsExpired(batch: InventoryBatch): boolean {
  return Boolean(batch.expires_at && batch.expires_at.slice(0, 10) < localDateValue());
}

export function InventoryScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const ops=useOpsStyles();
  const { mobile } = useResponsiveLayout();
  const [navigationContext,setNavigationContext]=useNavigationField("inventory",{tab:"stock" as InventoryTab,search:"",status:"" as StatusFilter,active:"1" as "1"|"0"|"",page:1,detailId:null as number|null,task:null as Task});
  const [tab, setTab] = useState<InventoryTab>((["stock","batches","alerts","movements"] as const).includes(navigationContext.tab) ? navigationContext.tab : "stock");
  const [task, setTask] = useState<Task>(isAdministrator ? navigationContext.task ?? null : null);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [batchPage, setBatchPage] = useState(1);
  const [batchLastPage, setBatchLastPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [movementLastPage, setMovementLastPage] = useState(1);
  const [loadingMoreBatches, setLoadingMoreBatches] = useState(false);
  const [loadingMoreMovements, setLoadingMoreMovements] = useState(false);
  const [sources, setSources] = useState(initialSources);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchFilter, setBatchFilter] = useState<"" | "expiring" | "expired">("");
  const batchEndpoint = `/inventory/batches${batchFilter ? `?status=${batchFilter}` : ""}`;
  const [movementTotal, setMovementTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [inventorySearch, setInventorySearch] = useState(navigationContext.search);
  const [inventoryStatus, setInventoryStatus] = useState<StatusFilter>(navigationContext.status);
  const [inventoryActive, setInventoryActive] = useState<"1" | "0" | "">(navigationContext.active);
  const [detailId, setDetailId] = useState<number | null>(navigationContext.detailId);
  const inventoryEndpoint = `/inventory/items?${new URLSearchParams({
    ...(inventoryStatus ? { status: inventoryStatus } : {}),
    ...(inventoryActive ? { active: inventoryActive } : {}),
  }).toString()}`;
  const inventory = usePaginatedResource<InventoryItem>(inventoryEndpoint, token, "las existencias", 300, true,{search:navigationContext.search,page:navigationContext.page});
  const summary = useRemoteResource<InventorySummary>("/inventory/summary", token, "el resumen de inventario", 0, true);
  const detail = useRemoteResource<InventoryItem>(detailId && !task ? `/inventory/items/${detailId}` : null, token, "el detalle del insumo");
  const taskItem = useRemoteResource<InventoryItem>(task?.id ? `/inventory/items/${task.id}` : null, token, "el insumo seleccionado");
  const requestIds = useRef<Record<SourceKey, number>>({ batches: 0, alerts: 0, movements: 0 });
  const controllers = useRef<Partial<Record<SourceKey, AbortController>>>({});
  const refreshing = inventory.loading || sourceKeys.some((key) => sources[key].loading);
  useEffect(()=>setNavigationContext({tab,search:inventory.search,status:inventoryStatus,active:inventoryActive,page:inventory.page,detailId,task}),[tab,inventory.search,inventoryStatus,inventoryActive,inventory.page,detailId,task]);

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
        case "batches": {
          const page = await fetchPage<InventoryBatch>(batchEndpoint, token, 1, options);
          if (!current()) return;
          setBatches(page.data); setBatchPage(page.current_page); setBatchLastPage(page.last_page); setBatchTotal(page.total ?? page.data.length);
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
      }
      if (current()) setSources((state) => ({ ...state, [key]: { loading: false, error: "", loaded: true } }));
    } catch (error) {
      if (current()) setSources((state) => ({ ...state, [key]: { ...state[key], loading: false, error: loadErrorMessage(sourceLabels[key], error) } }));
    }
  }

  async function load(): Promise<void> {
    summary.reload(); inventory.reload(); detail.reload();
    // Sections already visited are refreshed too, so counts never stay stale after a change.
    await Promise.allSettled(sourceKeys.filter((key) => key === tab || sources[key].loaded).map((key) => loadSource(key)));
  }

  async function loadMore(key: "batches" | "movements"): Promise<void> {
    const isBatches = key === "batches";
    const [page, lastPage, busy] = isBatches ? [batchPage, batchLastPage, loadingMoreBatches] : [movementPage, movementLastPage, loadingMoreMovements];
    const setBusy = isBatches ? setLoadingMoreBatches : setLoadingMoreMovements;
    if (busy || sources[key].loading || page >= lastPage) return;
    const revision = requestIds.current[key];
    setBusy(true);
    setSources((state) => ({ ...state, [key]: { ...state[key], error: "" } }));
    try {
      if (isBatches) {
        const next = await fetchPage<InventoryBatch>(batchEndpoint, token, page + 1, { cache: "reload" });
        if (revision !== requestIds.current.batches) return;
        setBatches((current) => appendUniqueById(current, next.data));
        setBatchPage(next.current_page); setBatchLastPage(next.last_page); setBatchTotal(next.total ?? next.data.length);
      } else {
        const next = await fetchPage<InventoryMovement>("/inventory/movements", token, page + 1, { cache: "reload" });
        if (revision !== requestIds.current.movements) return;
        setMovements((current) => appendUniqueById(current, next.data));
        setMovementPage(next.current_page); setMovementLastPage(next.last_page); setMovementTotal(next.total ?? next.data.length);
      }
    } catch (error) {
      if (revision === requestIds.current[key]) setSources((state) => ({ ...state, [key]: { ...state[key], error: loadErrorMessage(isBatches ? "más lotes" : "más movimientos", error) } }));
    } finally {
      if (revision === requestIds.current[key]) setBusy(false);
    }
  }

  useEffect(() => {
    setBatches([]); setAlerts([]); setMovements([]);
    setSources(initialSources());
    return () => { sourceKeys.forEach((key) => { requestIds.current[key]++; controllers.current[key]?.abort(); }); };
  }, [token]);

  useEffect(() => { inventory.setSearch(inventorySearch); }, [inventorySearch]);
  useEffect(() => { inventory.setPage(1); }, [inventoryStatus, inventoryActive]);
  useEffect(() => {
    if (tab !== "stock" && !sources[tab].loaded && !sources[tab].loading) void loadSource(tab, false);
  }, [tab]);
  useEffect(() => { if (sources.batches.loaded) void loadSource("batches", false); }, [batchFilter]);

  const ready = (key: SourceKey) => sources[key].loaded && !sources[key].loading && !sources[key].error;
  const sourceCount = { batches: batches.length, alerts: alerts.length, movements: movements.length };
  const unitByIngredient = useMemo(() => new Map(inventory.items.map((item) => [item.id, item.base_unit?.symbol ?? "u"])), [inventory.items]);

  function openTask(next: Task) { setMessage(""); setTask(next); }
  function finishTask(done: string) {
    setTask(null); setMessage(done);
    void load();
  }

  if (task && isAdministrator) {
    const back = <Pressable accessibilityRole="button" onPress={() => setTask(null)} style={ops.backLink}><ThemedText style={ops.backLinkText}>← Volver a inventario</ThemedText></Pressable>;
    if (task.kind === "ingredient" && task.id === null) return <View style={[ops.screen, mobile && ops.screenMobile]}>{back}<IngredientForm token={token} item={null} onDone={finishTask} onCancel={() => setTask(null)} /></View>;
    return <View style={[ops.screen, mobile && ops.screenMobile]}>
      {back}
      <RemoteListStatus loading={taskItem.loading && !taskItem.data} error={taskItem.error} count={taskItem.data ? 1 : 0} emptyText="No encontramos este insumo. Vuelve a inventario y elígelo de nuevo." onRetry={taskItem.reload} />
      {taskItem.data && task.kind === "ingredient" && <IngredientForm token={token} item={taskItem.data} onDone={finishTask} onCancel={() => setTask(null)} />}
      {taskItem.data && task.kind === "adjust" && <AdjustStockForm token={token} item={taskItem.data} initialBatchId={task.batchId ?? null} onDone={finishTask} onCancel={() => setTask(null)} />}
      {taskItem.data && task.kind === "presentations" && <PresentationsManager token={token} item={taskItem.data} onChanged={(done) => { setMessage(done); taskItem.reload(); }} onBack={() => setTask(null)} />}
      <Feedback message={message} />
    </View>;
  }

  const metric = (value: number, label: string, tone: "good" | "warning" | "danger", onPress: () => void, selected: boolean) =>
    <Pressable key={label} accessibilityRole="button" aria-selected={selected} accessibilityLabel={`${value} ${label}. Mostrar solo estos`} onPress={onPress} style={[ops.metric, selected && ops.chipActive]}>
      <ThemedText style={value ? (tone === "good" ? ops.statusGood : tone === "warning" ? ops.statusWarning : ops.statusDanger) : ops.metricValue}>{value}</ThemedText>
      <ThemedText style={ops.muted}>{label}</ThemedText>
    </Pressable>;

  return <View style={[ops.screen, mobile && ops.screenMobile]}>
    <View style={[ops.toolbar, mobile && ops.toolbarMobile]}>
      <Tabs
        active={tab}
        items={[
          { key: "stock", label: `Existencias (${inventory.data?.total ?? "…"})` },
          { key: "alerts", label: `Alertas (${sources.alerts.loaded ? alerts.length : "…"})` },
          { key: "batches", label: "Lotes y caducidades" },
          { key: "movements", label: "Historial" },
        ]}
        onChange={(key) => setTab(key as InventoryTab)}
      />
      <View style={ops.actionsRow}>
        {isAdministrator && <ActionButton label="+ Nuevo insumo" onPress={() => openTask({ kind: "ingredient", id: null })} />}
        <ActionButton label="Actualizar" variant="secondary" loading={refreshing} loadingLabel="Actualizando…" onPress={() => load()} />
      </View>
    </View>
    <Feedback message={message} />
    {sourceKeys.filter((key) => sources[key].error).map((key) => <RemoteListStatus key={key} {...sources[key]} count={sourceCount[key]} emptyText="" onRetry={() => loadSource(key)} />)}
    {tab !== "stock" && sources[tab].loading && !sourceCount[tab] && <LoadingState text="Cargando esta sección..." />}

    {tab === "stock" && <>
      {!summary.unavailable && <RemoteListStatus loading={summary.loading && !summary.data} error={summary.error} count={summary.data ? 1 : 0} emptyText="No hay resumen disponible." onRetry={summary.reload}/>}
      {summary.data && <View style={ops.metrics}>
        {metric(summary.data.available, "Disponibles", "good", () => setInventoryStatus((s) => s === "available" ? "" : "available"), inventoryStatus === "available")}
        {metric(summary.data.low, "Bajos o críticos", "warning", () => setInventoryStatus((s) => s === "low" ? "" : "low"), inventoryStatus === "low")}
        {metric(summary.data.out, "Agotados", "danger", () => setInventoryStatus((s) => s === "out" ? "" : "out"), inventoryStatus === "out")}
        {metric(summary.data.expiring, "Por caducar", "warning", () => { setBatchFilter("expiring"); setTab("batches"); }, false)}
      </View>}
      <Section title="¿Qué tengo?" subtitle="Busca un insumo para ver cuánto tienes y cuánto te falta.">
        <TextInput label="Buscar insumo" placeholder="Nombre o código" value={inventorySearch} onChangeText={setInventorySearch} />
        <Choices label="Mostrar" value={inventoryStatus} onChange={setInventoryStatus} options={[
          { key: "", label: "Todos" }, { key: "available", label: "Disponibles" }, { key: "low", label: "Existencia baja" }, { key: "critical", label: "Críticos" }, { key: "out", label: "Agotados" },
        ]} />
        {isAdministrator && <Choices value={inventoryActive} onChange={setInventoryActive} options={[{ key: "1", label: "Activos" }, { key: "0", label: "Desactivados" }, { key: "", label: "Activos y desactivados" }]} />}
        <RemoteListStatus loading={inventory.loading && !inventory.items.length} error={inventory.error} count={inventory.items.length} search={inventory.search} emptyText={isAdministrator ? "No hay insumos registrados. Usa “+ Nuevo insumo” para agregar el primero." : "No hay insumos registrados."} onRetry={inventory.reload}/>
        {inventory.items.map((ingredient) => {
          const unit = ingredient.base_unit?.symbol ?? "u";
          const status = ingredient.stock_status;
          const tone = status === "out" || status === "critical" ? ops.statusDanger : status === "low" ? ops.statusWarning : ops.statusGood;
          const pill = status === "out" || status === "critical" ? ops.pillDanger : status === "low" ? ops.pillWarning : ops.pillGood;
          const open = detailId === ingredient.id;
          return <View style={[ops.card, !ingredient.active && ops.disabled]} key={ingredient.id}>
            <View style={ops.row}>
              <View style={[ops.rowGrow, { gap: 6 }]}>
                <ThemedText style={ops.strong}>{ingredient.name}{!ingredient.active ? " (desactivado)" : ""}</ThemedText>
                <ThemedText style={[ops.statusPill, ingredient.active ? pill : ops.pillNeutral]}>{statusLabels[status]}</ThemedText>
              </View>
              <View>
                <ThemedText style={[ops.bigNumber, tone]}>{quantityText(ingredient.current_stock)} {unit}</ThemedText>
                {numberValue(ingredient.minimum_stock) > 0 && <ThemedText style={ops.muted}>Mínimo {quantityText(ingredient.minimum_stock)} {unit}</ThemedText>}
              </View>
            </View>
            {numberValue(ingredient.minimum_stock) > 0 && numberValue(ingredient.missing_to_minimum) > 0 && <ThemedText style={ops.notice}>Faltan {quantityText(ingredient.missing_to_minimum)} {unit} para alcanzar el mínimo.</ThemedText>}
            {numberValue(ingredient.minimum_stock) === 0 && isAdministrator && <ThemedText style={ops.muted}>Sin aviso de existencia baja. Configúralo en Editar.</ThemedText>}
            {!!ingredient.next_expiry && <ThemedText style={ops.muted}>Próxima caducidad: {dateText(ingredient.next_expiry)}</ThemedText>}
            <View style={ops.actionsRow}>
              {isAdministrator && ingredient.active && <ActionButton label="Ajustar existencia" accessibilityLabel={`Ajustar existencia de ${ingredient.name}`} variant="secondary" onPress={() => openTask({ kind: "adjust", id: ingredient.id })} />}
              {isAdministrator && <ActionButton label="Editar" accessibilityLabel={`Editar ${ingredient.name}`} variant="secondary" onPress={() => openTask({ kind: "ingredient", id: ingredient.id })} />}
              <Pressable accessibilityRole="button" aria-expanded={open} onPress={() => setDetailId((current) => current === ingredient.id ? null : ingredient.id)} style={ops.inlineTextAction}><ThemedText style={ops.outlineText}>{open ? "Ocultar detalle" : "Ver detalle"}</ThemedText></Pressable>
            </View>
            {open && <View style={ops.insetCard}>
              <RemoteListStatus loading={detail.loading && !detail.data} error={detail.error} count={detail.data ? 1 : 0} emptyText="No se encontró el detalle." onRetry={detail.reload}/>
              {detail.data && <>
                <ThemedText style={ops.label}>Cómo lo compras</ThemedText>
                {!detail.data.presentations?.length ? <ThemedText style={ops.muted}>No hay presentaciones de compra.</ThemedText> : detail.data.presentations.map((presentation) => <ThemedText key={presentation.id}>{presentation.name} = {quantityText(presentation.base_quantity)} {unit}{!presentation.active ? " · inactiva" : ""}</ThemedText>)}
                {isAdministrator && <ActionButton label="Administrar presentaciones de compra" accessibilityLabel={`Administrar presentaciones de compra de ${ingredient.name}`} variant="secondary" onPress={() => openTask({ kind: "presentations", id: ingredient.id })} />}
                <ThemedText style={ops.label}>Lotes</ThemedText>
                {!detail.data.batches?.length ? <ThemedText style={ops.muted}>No hay lotes.</ThemedText> : detail.data.batches.map((batch) => <ThemedText key={batch.id} style={batchIsExpired(batch) ? ops.statusDanger : undefined}>{batch.lot_code || `Lote #${batch.id}`} · {quantityText(batch.available_quantity)} {unit} · {batch.expires_at ? `${batchIsExpired(batch) ? "caducó" : "caduca"} ${dateText(batch.expires_at)}` : "sin caducidad"}</ThemedText>)}
                <ThemedText style={ops.label}>Cambios recientes</ThemedText>
                {!detail.data.movements?.length ? <ThemedText style={ops.muted}>No hay movimientos.</ThemedText> : detail.data.movements.map((movement) => <ThemedText key={movement.id}>{numberValue(movement.quantity) > 0 ? "+" : ""}{quantityText(movement.quantity)} {unit} · {movement.type_label}{movement.origin_label ? ` · ${movement.origin_label}` : ""}</ThemedText>)}
              </>}
            </View>}
          </View>;
        })}
        <Pagination data={inventory.data} loading={inventory.loading} onPage={inventory.setPage}/>
      </Section>
    </>}

    {tab === "batches" && <Section title="Lotes y caducidades" subtitle="Los que caducan antes aparecen primero. Úsalos primero para no desperdiciar.">
      <Choices label="Mostrar" value={batchFilter} onChange={setBatchFilter} options={[{ key: "", label: "Todos" }, { key: "expiring", label: "Por caducar" }, { key: "expired", label: "Caducados con existencia" }]} />
      {!batches.length ? (ready("batches") ? <EmptyState text="No hay lotes registrados. Se crean al registrar compras o existencia inicial." /> : null) : batches.map((batch) => {
        const expired = batchIsExpired(batch);
        const unit = batch.ingredient?.base_unit?.symbol ?? unitByIngredient.get(batch.ingredient_id) ?? "u";
        return <View style={ops.insetCard} key={batch.id}>
          <View style={ops.row}>
            <View style={ops.rowGrow}>
              <ThemedText style={ops.strong}>{batch.ingredient?.name ?? `Insumo #${batch.ingredient_id}`}</ThemedText>
              <ThemedText style={ops.muted}>Lote {batch.lot_code || `#${batch.id}`} · recibido {dateText(batch.received_at)}</ThemedText>
            </View>
            <ThemedText style={expired ? ops.statusDanger : ops.value}>{quantityText(batch.available_quantity)} {unit}</ThemedText>
          </View>
          <ThemedText style={expired ? ops.statusDanger : ops.muted}>{batch.expires_at ? `${expired ? "Caducó el" : "Caduca el"} ${dateText(batch.expires_at)}` : "Sin caducidad"}{expired ? " · retíralo del inventario" : ""}</ThemedText>
          <ThemedText style={ops.muted}>Entraron {quantityText(batch.initial_quantity)} {unit} · costo ${moneyText(batch.unit_cost)} por {unit}</ThemedText>
          {isAdministrator && numberValue(batch.available_quantity) > 0 && <ActionButton label={expired ? "Retirar existencia caducada" : "Ajustar este lote"} accessibilityLabel={`${expired ? "Retirar existencia caducada" : "Ajustar"} del lote ${batch.lot_code || batch.id}`} variant={expired ? "destructive" : "secondary"} onPress={() => openTask({ kind: "adjust", id: batch.ingredient_id, batchId: batch.id })} />}
        </View>;
      })}
      {sources.batches.loaded && batchTotal > 0 && <ThemedText style={ops.muted}>Mostrando {batches.length} de {batchTotal} lotes</ThemedText>}
      {batchPage < batchLastPage && <ActionButton variant="secondary" label="Mostrar más lotes" loading={loadingMoreBatches} loadingLabel="Cargando lotes…" disabled={sources.batches.loading} onPress={() => loadMore("batches")} />}
    </Section>}

    {tab === "alerts" && <Section title="¿Qué me falta?" subtitle="Primero lo agotado o urgente, después lo que está por caducar.">
      {!alerts.length ? (ready("alerts") ? <EmptyState text="Todo en orden: no hay faltantes ni caducidades próximas." /> : null) : alerts.map((alert) => <View style={ops.insetCard} key={alert.id}>
        <View style={ops.row}>
          <ThemedText style={[ops.statusPill, alert.severity === "critical" ? ops.pillDanger : ops.pillWarning]}>{{low_stock:"Existencia baja",critical_stock:"Agotado o urgente",expiring:"Por caducar",expired:"Caducado",insufficient_dough:"Insumo insuficiente"}[alert.type] ?? "Revisar inventario"}</ThemedText>
          <ThemedText style={ops.muted}>{dateText(alert.created_at, true)}</ThemedText>
        </View>
        <ThemedText style={ops.strong}>{alert.ingredient?.name ?? "Insumo"}</ThemedText>
        <ThemedText>{alert.message}</ThemedText>
        {!!alert.batch && <ThemedText style={ops.muted}>Lote {alert.batch.lot_code || `#${alert.batch.id}`}</ThemedText>}
        {isAdministrator && !!alert.ingredient_id && (alert.type === "expired" || alert.type === "expiring") && <ActionButton label="Ajustar existencia" accessibilityLabel={`Ajustar existencia de ${alert.ingredient?.name ?? "este insumo"}`} variant="secondary" onPress={() => openTask({ kind: "adjust", id: alert.ingredient_id ?? null, batchId: alert.inventory_batch_id ?? null })} />}
      </View>)}
    </Section>}

    {tab === "movements" && <Section title="¿Qué cambió?" subtitle="Entradas, salidas y ajustes, con la existencia antes y después.">
      {!movements.length ? (ready("movements") ? <EmptyState text="Todavía no hay movimientos de inventario." /> : null) : movements.map((movement) => {
        const unit = movement.ingredient?.base_unit?.symbol ?? unitByIngredient.get(movement.ingredient_id) ?? "";
        return <View style={ops.insetCard} key={movement.id}>
          <View style={ops.row}>
            <View style={ops.rowGrow}>
              <ThemedText style={ops.strong}>{movement.ingredient?.name ?? `Insumo #${movement.ingredient_id}`}</ThemedText>
              <ThemedText style={ops.muted}>{movement.type_label ?? "Movimiento de inventario"}{movement.origin_label ? ` · ${movement.origin_label}` : ""} · {dateText(movement.created_at, true)}</ThemedText>
            </View>
            <ThemedText style={numberValue(movement.quantity) < 0 ? ops.statusDanger : ops.statusGood}>{numberValue(movement.quantity) > 0 ? "+" : ""}{quantityText(movement.quantity)} {unit}</ThemedText>
          </View>
          <ThemedText style={ops.muted}>Lote {movement.batch?.lot_code || `#${movement.inventory_batch_id}`} · de {quantityText(movement.quantity_before)} a {quantityText(movement.quantity_after)}</ThemedText>
          {!!movement.reason && <ThemedText style={ops.muted}>Motivo: {reasonLabels[movement.reason] ?? movement.reason.replaceAll("_", " ")}</ThemedText>}
          {!!movement.comment && <ThemedText>{movement.comment}</ThemedText>}
        </View>;
      })}
      {sources.movements.loaded && movementTotal > 0 && <ThemedText style={ops.muted}>Mostrando {movements.length} de {movementTotal} movimientos</ThemedText>}
      {movementPage < movementLastPage && <ActionButton variant="secondary" label="Mostrar más movimientos" loading={loadingMoreMovements} loadingLabel="Cargando movimientos…" disabled={sources.movements.loading} onPress={() => loadMore("movements")} />}
    </Section>}
  </View>;
}
