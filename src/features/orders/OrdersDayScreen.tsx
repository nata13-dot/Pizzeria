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
type KitchenSendFailure = { warnings: ApiStockWarning[]; message: string };

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
        {!!contactPhone && <Pressable style={s.secondaryButton} onPress={() => openPhoneDialer(contactPhone)}><ThemedText style={s.secondaryText}>☎ Llamar {contactPhone}</ThemedText></Pressable>}
        {canConfirm && <Pressable disabled={working} style={[s.smallButton, working && s.disabled]} onPress={() => confirmOrder(order)}><ThemedText style={s.primaryText}>{order.courtesy ? "Confirmar cortesía" : order.collect_on_delivery ? "Confirmar contra entrega" : "Confirmar y cobrar efectivo"}</ThemedText></Pressable>}
        {canSend && (!sendFailure?.warnings.length || isAdministrator) && <Pressable disabled={working} style={[s.smallButton, working && s.disabled]} onPress={() => sendToKitchen(order)}><ThemedText style={s.primaryText}>{sendFailure?.warnings.length ? "Autorizar faltante y enviar" : sendFailure ? "Reintentar envío a cocina" : "Enviar a cocina"}</ThemedText></Pressable>}
        {canDeliver && <Pressable disabled={working} style={[s.smallButton, working && s.disabled]} onPress={() => markDelivered(order)}><ThemedText style={s.primaryText}>Marcar entregado</ThemedText></Pressable>}
        {canCancel && <Pressable disabled={working} style={[s.dangerButton, working && s.disabled]} onPress={() => cancelOrder(order)}><ThemedText style={s.dangerText}>Cancelar pedido</ThemedText></Pressable>}
        {working && <ActivityIndicator color={theme.colors.primary} />}
      </View>
    </View>;
  }

  return <View>
    <View style={[s.ordersToolbar, compact && s.ordersToolbarCompact]}>
      <View>
        <ThemedText style={s.sectionTitle}>Operación de {new Date(`${date}T00:00:00`).toLocaleDateString()}</ThemedText>
        <ThemedText style={s.muted}>{orders.length} pedido(s), incluyendo estados cerrados</ThemedText>
      </View>
      <Pressable disabled={refreshing} style={[s.secondaryButton, refreshing && s.disabled]} onPress={() => load(false, true)}>
        <ThemedText style={s.secondaryText}>{refreshing ? "Actualizando..." : "Actualizar"}</ThemedText>
      </Pressable>
    </View>
    {!!error && <View style={s.warningBox}><ThemedText style={s.error}>{error}</ThemedText><Pressable style={s.secondaryButton} onPress={() => load(!orders.length, true)}><ThemedText style={s.secondaryText}>Reintentar actualización</ThemedText></Pressable></View>}
    {!!actionError && <ThemedText style={s.error}>{actionError}</ThemedText>}
    {!!notice && <ThemedText style={s.notice}>{notice}</ThemedText>}
    {busy ? <ActivityIndicator color={theme.colors.primary} style={{ margin: 40 }} /> : ORDER_GROUPS.map((group) => {
      const groupOrders = orders.filter((order) => group.statuses.includes(order.status));
      return <View style={s.orderGroup} key={group.key}>
        <ThemedText style={s.boardTitle}>{group.label} ({groupOrders.length})</ThemedText>
        {groupOrders.map(orderCard)}
        {!groupOrders.length && <ThemedText style={s.groupEmpty}>Sin pedidos en este estado.</ThemedText>}
      </View>;
    })}
  </View>;
}
