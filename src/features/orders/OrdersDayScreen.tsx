import { ActionButton } from "../../components/ActionButton";
import {ThemedText} from "../../theme/ThemedText";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { api, ApiError, type ApiStockWarning } from "../../api";
import { confirmAction } from "../../components/ConfirmationDialog";
import { ordersChannel } from "../../realtime";
import { coalescedReloadDelay, operationalPollInterval } from "../../refreshPolicy";
import { useKitchenSentSound } from "../../sounds";
import { useAppStyles } from "../../styles/appStyles";
import type { Order, OrderStatus, PaginatedOrders } from "./types";
import { ORDER_GROUPS, ORDER_STATUS_LABELS, OrderContents, openPhoneDialer } from "./shared";
import {useTheme} from "../../theme/ThemeProvider";
import { IconBadge, type IconTone } from "../../components/IconBadge";
type KitchenSendFailure = { warnings: ApiStockWarning[]; message: string };
const ORDER_GROUP_PRESENTATION: Record<string,{icon:string;tone:IconTone;description:string}>={
  draft:{icon:"▤",tone:"neutral",description:"Pedidos guardados para continuar después."},
  pending:{icon:"$",tone:"warning",description:"Pedidos que esperan confirmación de pago."},
  confirmed:{icon:"▣",tone:"info",description:"Confirmados y programados para preparación."},
  process:{icon:"♨",tone:"warning",description:"Pedidos que se encuentran en preparación o reparto."},
  ready:{icon:"✓",tone:"success",description:"Listos para entrega o recolección."},
  delivered:{icon:"➜",tone:"info",description:"Pedidos entregados durante la operación."},
  cancelled:{icon:"×",tone:"danger",description:"Pedidos cancelados durante la operación."},
};

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stockWarningDescription(warnings: ApiStockWarning[]): string {
  if (!warnings.length) return "La API reportó inventario insuficiente sin detalle de insumos.";
  return warnings.map((warning) => {
    const required = warning.required === undefined ? "sin dato" : String(warning.required);
    const available = warning.available === undefined ? "sin dato" : String(warning.available);
    return `${warning.name}: requerido ${required}, disponible ${available}, faltan ${warning.shortage}`;
  }).join("\n");
}
export function OrdersDayScreen({ token, branchId, isAdministrator }: { token: string; branchId: number; isAdministrator: boolean }) {
  const s=useAppStyles();
  const {theme}=useTheme();
  const playKitchenSentSound = useKitchenSentSound();
  const { width } = useWindowDimensions();
  const compact = width < 780;
  const [date, setDate] = useState(localDateKey);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [workingOrderIds, setWorkingOrderIds] = useState<number[]>([]);
  const [sendFailures, setSendFailures] = useState<Record<number, KitchenSendFailure>>({});
  const [cancellationReasons, setCancellationReasons] = useState<Record<number, string>>({});
  const [activeGroupKey,setActiveGroupKey]=useState("process");
  const loadRequestId = useRef(0);
  const loadInFlight = useRef<Promise<Order[] | null> | null>(null);
  const loadInFlightSource = useRef("");
  const lastLoadAt = useRef(0);
  const actionLocks = useRef(new Set<number>());

  async function load(initial = false, indicate = false): Promise<Order[] | null> {
    const source = `${date}\u0000${token}`;
    if (loadInFlight.current) {
      const pending = loadInFlight.current;
      const pendingSource = loadInFlightSource.current;
      const result = await pending;
      return pendingSource === source ? result : load(initial, indicate);
    }
    const operation = (async (): Promise<Order[] | null> => {
    const requestId = ++loadRequestId.current;
    if (initial) setBusy(true);
    if (indicate) setRefreshing(true);
    setError("");
    try {
      const basePath = `/orders?date=${encodeURIComponent(date)}`;
      const firstPage = await api<PaginatedOrders>(`${basePath}&page=1`, token);
      const lastPage = Math.max(1, Number(firstPage.last_page) || 1);
      const remainingPages = lastPage > 1
        ? await Promise.all(Array.from({ length: lastPage - 1 }, (_, index) => api<PaginatedOrders>(`${basePath}&page=${index + 2}`, token)))
        : [];
      if (requestId !== loadRequestId.current) return null;
      const uniqueOrders = new Map<number, Order>();
      [firstPage, ...remainingPages].forEach((page) => page.data.forEach((order) => uniqueOrders.set(order.id, order)));
      const nextOrders = Array.from(uniqueOrders.values());
      setOrders(nextOrders);
      setSendFailures((current) => Object.fromEntries(
        Object.entries(current).filter(([orderId]) => uniqueOrders.get(Number(orderId))?.status === "confirmed"),
      ));
      return nextOrders;
    } catch (loadError) {
      if (requestId === loadRequestId.current) setError((loadError as Error).message);
      return null;
    } finally {
      if (requestId === loadRequestId.current) {
        setBusy(false);
        setRefreshing(false);
      }
    }
    })();
    loadInFlight.current = operation;
    loadInFlightSource.current = source;
    try {
      const result = await operation;
      lastLoadAt.current = Date.now();
      return result;
    } finally {
      if (loadInFlight.current === operation) loadInFlight.current = null;
    }
  }

  useEffect(() => {
    load(true);
    return () => { loadRequestId.current += 1; };
  }, [date, token]);
  useEffect(() => {
    const midnightCheck = setInterval(() => setDate((current) => {
      const today = localDateKey();
      return current === today ? current : today;
    }), 60000);
    return () => clearInterval(midnightCheck);
  }, []);
  useEffect(() => {
    let connected = false;
    let background = AppState.currentState !== "active";
    let poll: ReturnType<typeof setTimeout>;
    let coalesce: ReturnType<typeof setTimeout> | undefined;
    const schedulePoll = () => {
      clearTimeout(poll);
      poll = setTimeout(async () => { if (!background) await load(false); schedulePoll(); }, operationalPollInterval(connected, !background));
    };
    const requestReload = () => {
      clearTimeout(coalesce);
      const delay = coalescedReloadDelay(lastLoadAt.current);
      coalesce = setTimeout(() => { if (!background) void load(false); }, delay);
    };
    const leave = ordersChannel(token, branchId, requestReload, (value) => { connected = value; schedulePoll(); });
    const subscription = AppState.addEventListener("change", (state) => { background = state !== "active"; if (!background) requestReload(); schedulePoll(); });
    schedulePoll();
    return () => {
      clearTimeout(poll);
      clearTimeout(coalesce);
      subscription.remove();
      leave();
    };
  }, [date, token, branchId]);

  function beginAction(orderId: number): boolean {
    if (actionLocks.current.has(orderId)) return false;
    actionLocks.current.add(orderId);
    setWorkingOrderIds((current) => current.includes(orderId) ? current : [...current, orderId]);
    setActionError("");
    setNotice("");
    return true;
  }
  function finishAction(orderId: number): void {
    actionLocks.current.delete(orderId);
    setWorkingOrderIds((current) => current.filter((id) => id !== orderId));
  }
  function clearSendFailure(orderId: number): void {
    setSendFailures((current) => {
      if (!current[orderId]) return current;
      const next = { ...current };
      delete next[orderId];
      return next;
    });
  }
  async function reconcileOperation(
    orderId: number,
    completed: (order: Order) => boolean,
    successMessage: string,
  ): Promise<boolean> {
    const refreshedOrders = await load(false);
    const refreshedOrder = refreshedOrders?.find((order) => order.id === orderId);
    if (refreshedOrder && completed(refreshedOrder)) {
      clearSendFailure(orderId);
      setActionError("");
      setNotice(successMessage);
      return true;
    }
    return false;
  }

  async function confirmOrder(order: Order): Promise<void> {
    if (!beginAction(order.id)) return;
    try {
      const total = Number(order.total);
      if (!Number.isFinite(total) || total < 0) {
        setActionError(`La orden #${order.daily_number} no tiene un total válido.`);
        return;
      }
      const collectOnDelivery = order.type === "delivery" && order.collect_on_delivery === true;
      const paymentMessage = order.courtesy
        ? `¿Confirmas la cortesía de la orden #${order.daily_number}?`
        : collectOnDelivery
          ? `¿Confirmas la orden #${order.daily_number} con cobro de $${total.toFixed(2)} contra entrega?`
          : `¿Confirmas el pago en efectivo de $${total.toFixed(2)} para la orden #${order.daily_number}?`;
      if (!(await confirmAction(paymentMessage))) return;
      try {
        await api<Order>(`/orders/${order.id}/confirm`, token, {
          method: "POST",
          body: JSON.stringify({ payments: order.courtesy || collectOnDelivery ? [] : [{ method: "cash", amount: total }] }),
        });
        setNotice(order.courtesy
          ? `Orden #${order.daily_number} confirmada como cortesía.`
          : collectOnDelivery
            ? `Orden #${order.daily_number} confirmada con cobro contra entrega.`
            : `Orden #${order.daily_number} confirmada con pago en efectivo.`);
        await load(false);
      } catch (confirmError) {
        const reconciled = await reconcileOperation(
          order.id,
          (current) => !["draft", "pending_payment", "cancelled"].includes(current.status),
          `La orden #${order.daily_number} ya quedó confirmada; se recuperó su estado actualizado.`,
        );
        if (!reconciled) setActionError((confirmError as Error).message);
      }
    } finally {
      finishAction(order.id);
    }
  }

  async function performKitchenSend(order: Order, allowStockShortage: boolean): Promise<boolean> {
    try {
      await api<Order>(`/orders/${order.id}/send-to-kitchen`, token, {
        method: "POST",
        body: allowStockShortage ? JSON.stringify({ allow_stock_shortage: true }) : undefined,
      });
      clearSendFailure(order.id);
      playKitchenSentSound();
      setNotice(`Orden #${order.daily_number} enviada a cocina${allowStockShortage ? " con faltante autorizado" : ""}.`);
      await load(false);
      return true;
    } catch (sendError) {
      if (sendError instanceof ApiError && sendError.code === "stock_shortage") {
        const warnings = sendError.stockWarnings;
        setSendFailures((current) => ({ ...current, [order.id]: { warnings, message: sendError.message } }));
        setNotice(`La orden #${order.daily_number} sigue confirmada y no se duplicó; falta autorizar inventario insuficiente.`);
        if (!isAdministrator) {
          setActionError(`La orden #${order.daily_number} requiere que un administrador autorice el faltante de inventario.`);
          return false;
        }
        if (!allowStockShortage && await confirmAction(`${stockWarningDescription(warnings)}\n\n¿Autorizas el faltante y el envío de la orden #${order.daily_number} a cocina?`)) {
          return performKitchenSend(order, true);
        }
        return false;
      }
      const reconciled = await reconcileOperation(
        order.id,
        (current) => current.status !== "confirmed",
        `La orden #${order.daily_number} ya avanzó; se recuperó su estado actualizado sin repetirla.`,
      );
      if (!reconciled) {
        const message = (sendError as Error).message;
        setSendFailures((current) => ({ ...current, [order.id]: { warnings: [], message } }));
        setActionError(`No se pudo enviar la orden #${order.daily_number}. Puedes reintentar únicamente el envío a cocina.`);
      }
      return reconciled;
    }
  }

  async function sendToKitchen(order: Order): Promise<void> {
    if (!beginAction(order.id)) return;
    try {
      const persistedWarnings = order.status === "confirmed" ? order.stock_warnings ?? [] : [];
      const failure = sendFailures[order.id] ?? (persistedWarnings.length
        ? { warnings: persistedWarnings, message: "La orden está detenida por inventario insuficiente." }
        : undefined);
      if (failure?.warnings.length) {
        if (!isAdministrator) {
          setActionError(`La orden #${order.daily_number} requiere que un administrador autorice el faltante de inventario.`);
          return;
        }
        if (!(await confirmAction(`${stockWarningDescription(failure.warnings)}\n\n¿Autorizas el faltante y el envío de la orden #${order.daily_number} a cocina?`))) return;
        await performKitchenSend(order, true);
        return;
      }
      const prompt = failure
        ? `¿Deseas reintentar únicamente el envío de la orden #${order.daily_number} a cocina?`
        : `¿Deseas enviar la orden #${order.daily_number} a cocina?`;
      if (await confirmAction(prompt)) await performKitchenSend(order, false);
    } finally {
      finishAction(order.id);
    }
  }

  async function cancelOrder(order: Order): Promise<void> {
    if (!beginAction(order.id)) return;
    try {
      const advanced = ["preparing", "prepared", "ready", "on_way"].includes(order.status);
      const reason = cancellationReasons[order.id]?.trim() ?? "";
      if (advanced && !reason) {
        setActionError(`Escribe el motivo antes de cancelar la orden #${order.daily_number}; la preparación ya inició.`);
        return;
      }
      const wasteWarning = advanced
        ? " La preparación ya inició y la cancelación puede registrar merma."
        : "";
      if (!(await confirmAction(`¿Confirmas cancelar la orden #${order.daily_number}?${wasteWarning}`))) return;
      try {
        await api<Order>(`/orders/${order.id}/cancel`, token, {
          method: "POST",
          body: JSON.stringify({ comment: reason || "Cancelado desde Pedidos del día" }),
        });
        clearSendFailure(order.id);
        setCancellationReasons((current) => {
          if (!current[order.id]) return current;
          const next = { ...current };
          delete next[order.id];
          return next;
        });
        setNotice(`Orden #${order.daily_number} cancelada.`);
        await load(false);
      } catch (cancelError) {
        const reconciled = await reconcileOperation(
          order.id,
          (current) => current.status === "cancelled",
          `La orden #${order.daily_number} ya estaba cancelada; se recuperó su estado actualizado.`,
        );
        if (!reconciled) setActionError((cancelError as Error).message);
      }
    } finally {
      finishAction(order.id);
    }
  }

  async function markDelivered(order: Order): Promise<void> {
    if (!beginAction(order.id)) return;
    try {
      if (!(await confirmAction(`¿Confirmas que la orden #${order.daily_number} fue entregada?`))) return;
      try {
        await api<Order>(`/orders/${order.id}/status`, token, {
          method: "POST",
          body: JSON.stringify({ status: "delivered" }),
        });
        setNotice(`Orden #${order.daily_number} entregada.`);
        await load(false);
      } catch (deliveryError) {
        const reconciled = await reconcileOperation(
          order.id,
          (current) => current.status === "delivered",
          `La orden #${order.daily_number} ya estaba entregada; se recuperó su estado actualizado.`,
        );
        if (!reconciled) setActionError((deliveryError as Error).message);
      }
    } finally {
      finishAction(order.id);
    }
  }

  function orderCard(order: Order) {
    const working = workingOrderIds.includes(order.id);
    const storedWarnings = order.status === "confirmed" ? order.stock_warnings ?? [] : [];
    const sendFailure = sendFailures[order.id] ?? (storedWarnings.length
      ? { warnings: storedWarnings, message: "La orden está detenida por inventario insuficiente." }
      : undefined);
    const canConfirm = ["draft", "pending_payment"].includes(order.status);
    const scheduledAt = order.scheduled_at ? Date.parse(order.scheduled_at) : Number.NaN;
    const scheduledIsDue = Number.isFinite(scheduledAt) && scheduledAt <= Date.now();
    const canSend = order.status === "confirmed" && (!order.scheduled_at || scheduledIsDue || Boolean(sendFailure?.warnings.length));
    const canDeliver = order.status === "ready" && order.type !== "delivery";
    const contactPhone = order.delivery?.phone || order.contact_phone || order.customer?.phone;
    const advancedCancellation = ["preparing", "prepared", "ready", "on_way"].includes(order.status);
    const canCancel = !["delivered", "cancelled"].includes(order.status) && (!advancedCancellation || isAdministrator);
    return <View style={s.order} key={order.id}>
      <OrderContents order={order} />
      <View style={[s.orderSummary, compact && s.orderSummaryCompact]}>
        <ThemedText style={s.badge}>{ORDER_STATUS_LABELS[order.status]}</ThemedText>
        <ThemedText style={s.orderTotal}>${Number(order.total).toFixed(2)}</ThemedText>
      </View>
      {order.customer && <ThemedText style={s.muted}>Cliente: {order.customer.name}{order.customer.phone ? ` · ${order.customer.phone}` : ""}</ThemedText>}
      {!order.customer && order.contact_name && <ThemedText style={s.muted}>Cliente: {order.contact_name}{order.contact_phone ? ` · ${order.contact_phone}` : ""}</ThemedText>}
      {order.status === "confirmed" && order.scheduled_at && <ThemedText style={s.scheduled}>Se enviará automáticamente a cocina en su ventana de preparación.</ThemedText>}
      {sendFailure && <View style={s.warningBox}>
        <ThemedText style={s.label}>{sendFailure.warnings.length ? "Faltante de inventario" : "Envío a cocina pendiente"}</ThemedText>
        {sendFailure.warnings.length
          ? sendFailure.warnings.map((warning) => <ThemedText style={s.muted} key={`${order.id}-${warning.ingredient_id ?? warning.name}`}>{warning.name}: requerido {warning.required ?? "-"}, disponible {warning.available ?? "-"}, faltan {warning.shortage}</ThemedText>)
          : <ThemedText style={s.muted}>{sendFailure.message}</ThemedText>}
        {!!sendFailure.warnings.length && !isAdministrator && <ThemedText style={s.error}>Solicita la autorización de un administrador.</ThemedText>}
      </View>}
      {advancedCancellation && canCancel && <TextInput
        style={s.cancelReasonInput}
        placeholderTextColor={theme.colors.textSubtle}
        value={cancellationReasons[order.id] ?? ""}
        onChangeText={(value) => setCancellationReasons((current) => ({ ...current, [order.id]: value }))}
        placeholder="Motivo obligatorio para cancelar y registrar merma"
        multiline
      />}
      {advancedCancellation && !isAdministrator && <ThemedText style={s.muted}>Solo un administrador puede cancelar este pedido porque la preparación ya inició.</ThemedText>}
      <View style={s.reportActions}>
        {!!contactPhone && <ActionButton label={`☎ Llamar ${contactPhone}`} variant="secondary" onPress={() => openPhoneDialer(contactPhone)} />}
        {canConfirm && <ActionButton label={order.courtesy ? "Confirmar cortesía" : order.collect_on_delivery ? "Confirmar contra entrega" : "Confirmar y cobrar efectivo"} disabled={working} onPress={() => confirmOrder(order)} />}
        {canSend && (!sendFailure?.warnings.length || isAdministrator) && <ActionButton label={sendFailure?.warnings.length ? "Autorizar faltante y enviar" : sendFailure ? "Reintentar envío a cocina" : "Enviar a cocina"} disabled={working} onPress={() => sendToKitchen(order)} />}
        {canDeliver && <ActionButton label="Marcar entregado" disabled={working} onPress={() => markDelivered(order)} />}
        {canCancel && <ActionButton label="Cancelar pedido" variant="destructive" disabled={working} onPress={() => cancelOrder(order)} />}
        {working && <ActivityIndicator color={theme.colors.primary} />}
      </View>
    </View>;
  }

  const activeGroup=ORDER_GROUPS.find((group)=>group.key===activeGroupKey)??ORDER_GROUPS[0];
  const activeOrders=orders.filter((order)=>activeGroup.statuses.includes(order.status));
  function groupSummary(group:(typeof ORDER_GROUPS)[number]){
    const groupOrders=orders.filter((order)=>group.statuses.includes(order.status));
    const presentation=ORDER_GROUP_PRESENTATION[group.key];
    const active=activeGroup.key===group.key;
    return <Pressable accessibilityRole="button" aria-pressed={active} key={group.key} onPress={()=>setActiveGroupKey(group.key)} style={({pressed})=>[s.orderStatusCard,active&&s.orderStatusCardActive,pressed&&s.metricPressed]}>
      <View style={s.orderStatusHeading}><IconBadge glyph={presentation.icon} tone={presentation.tone} size="large" selected={active}/><View style={s.orderStatusCopy}><ThemedText style={s.orderStatusTitle}>{group.label}</ThemedText><ThemedText style={s.orderStatusCount}>{groupOrders.length}</ThemedText></View><ThemedText style={s.orderStatusChevron}>›</ThemedText></View>
      <View style={s.orderStatusBody}><ThemedText style={s.orderStatusEmptyIcon}>{groupOrders.length?presentation.icon:"○"}</ThemedText><ThemedText style={s.orderStatusBodyTitle}>{groupOrders.length?`${groupOrders.length} ${groupOrders.length===1?"pedido":"pedidos"}`:"Sin pedidos en este estado"}</ThemedText><ThemedText style={s.orderStatusDescription}>{presentation.description}</ThemedText><View style={[s.orderStatusAction,active&&s.orderStatusActionActive]}><ThemedText style={[s.orderStatusActionText,active&&s.orderStatusActionTextActive]}>{groupOrders.length?"Ver pedidos":"Consultar estado"}</ThemedText></View></View>
    </Pressable>;
  }

  return <View>
    <View style={[s.ordersToolbar, compact && s.ordersToolbarCompact]}>
      <View style={s.ordersHeading}><IconBadge glyph="▣" tone="info"/><View>
        <ThemedText style={s.sectionTitle}>Operación de {new Date(`${date}T00:00:00`).toLocaleDateString()}</ThemedText>
        <ThemedText style={s.muted}>{orders.length} pedido(s), incluyendo estados cerrados</ThemedText>
      </View></View>
      <ActionButton label={refreshing ? "Actualizando..." : "↻  Actualizar"} variant="secondary" disabled={refreshing} onPress={() => load(false, true)} />
    </View>
    {!!error && <View style={s.warningBox}><ThemedText style={s.error}>{error}</ThemedText><ActionButton label="Reintentar actualización" variant="secondary" onPress={() => load(!orders.length, true)} /></View>}
    {!!actionError && <ThemedText style={s.error}>{actionError}</ThemedText>}
    {!!notice && <ThemedText style={s.notice}>{notice}</ThemedText>}
    {busy ? <ActivityIndicator color={theme.colors.primary} style={{ margin: 40 }} /> : <>
      {compact?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.ordersOverviewMobile}>{ORDER_GROUPS.map(groupSummary)}</ScrollView>:<View style={s.ordersOverviewGrid}>{ORDER_GROUPS.map(groupSummary)}</View>}
      <View style={s.ordersDetailPanel}><View style={s.ordersDetailHeading}><View><ThemedText style={s.ordersDetailEyebrow}>DETALLE DEL ESTADO</ThemedText><ThemedText style={s.sectionTitle}>{activeGroup.label}</ThemedText></View><ThemedText style={s.ordersDetailCount}>{activeOrders.length}</ThemedText></View>
        {activeOrders.map(orderCard)}
        {!activeOrders.length&&<View style={s.ordersDetailEmpty}><ThemedText style={s.orderStatusEmptyIcon}>○</ThemedText><ThemedText style={s.orderStatusBodyTitle}>No hay pedidos para mostrar</ThemedText><ThemedText style={s.orderStatusDescription}>{ORDER_GROUP_PRESENTATION[activeGroup.key].description}</ThemedText></View>}
      </View>
    </>}
  </View>;
}
