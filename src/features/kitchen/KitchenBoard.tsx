import {ThemedText} from "../../theme/ThemedText";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { useResponsiveLayout } from "../../layout/responsive";
import { confirmAction } from "../../components/ConfirmationDialog";
import { useAppStyles } from "../../styles/appStyles";
import type { Order, OrderItem, OrderStatus, OrderStatusAction } from "../orders/types";
import { DocumentButton, quantityLabel } from "../orders/shared";
import {useTheme} from "../../theme/ThemeProvider";
import type {Theme} from "../../theme/tokens";
export function KitchenBoard({ orders, token, onAction }: { orders: Order[]; token: string; onAction: OrderStatusAction }) {
  const s=useAppStyles();
  const {theme}=useTheme();
  const { compact, mobile } = useResponsiveLayout();
  const [activeStatus, setActiveStatus] = useState<OrderStatus>("kitchen_pending");
  const [workingOrderIds, setWorkingOrderIds] = useState<number[]>([]);
  const actionLocks = useRef(new Set<number>());
  const columns: { status: OrderStatus; title: string; empty: string; icon: string }[] = [
    { status: "kitchen_pending", title: "Pendientes", empty: "No hay pedidos pendientes", icon: "▱" },
    { status: "preparing", title: "Preparando", empty: "No hay pedidos en preparación", icon: "♨" },
    { status: "prepared", title: "Listos", empty: "No hay pedidos listos para entregar", icon: "✓" },
  ];
  const activeStatusRef = useRef(activeStatus);
  activeStatusRef.current = activeStatus;
  const swipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => compact && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
    onPanResponderRelease: (_event, gesture) => {
      const isIntentionalSwipe = Math.abs(gesture.dx) >= 70 || (Math.abs(gesture.dx) >= 35 && Math.abs(gesture.vx) >= 0.35);
      if (!isIntentionalSwipe) return;
      const currentIndex = columns.findIndex((column) => column.status === activeStatusRef.current);
      const direction = gesture.dx < 0 ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(columns.length - 1, currentIndex + direction));
      if (nextIndex !== currentIndex) setActiveStatus(columns[nextIndex].status);
    },
    onPanResponderTerminationRequest: () => true,
  }), [compact]);
  async function advance(order: Order) {
    if (actionLocks.current.has(order.id)) return;
    actionLocks.current.add(order.id);
    setWorkingOrderIds((current) => [...current, order.id]);
    const next: OrderStatus = order.status === "kitchen_pending" ? "preparing" : order.status === "preparing" ? "prepared" : "ready";
    const label = next === "preparing" ? "iniciar la preparación" : next === "prepared" ? "marcar la orden como preparada" : order.type === "delivery" ? "enviarla a reparto" : "marcarla lista para recoger";
    try {
      if (await confirmAction(`¿Deseas ${label}?`)) await onAction(order, next);
    } finally {
      actionLocks.current.delete(order.id);
      setWorkingOrderIds((current) => current.filter((id) => id !== order.id));
    }
  }
  const visibleColumns = compact ? columns.filter((column) => column.status === activeStatus) : columns;
  return <View style={[s.kitchenBoard, mobile && s.kitchenBoardMobile]}>
    {compact && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.kitchenTabs}>{columns.map((column) => {
      const count = orders.filter((order) => order.status === column.status).length;
      const tone = kitchenTone(column.status,theme);
      return <Pressable accessibilityRole="tab" accessibilityState={{selected:activeStatus===column.status}} key={column.status} onPress={() => setActiveStatus(column.status)} style={[s.kitchenTab, activeStatus === column.status && s.kitchenTabActive, activeStatus === column.status && { borderBottomColor: tone }]}><ThemedText style={[s.kitchenTabText, activeStatus === column.status && { color: tone }]}>{column.title} ({count})</ThemedText></Pressable>;
    })}</ScrollView>}
    <View accessibilityLabel={compact?"Pedidos de cocina. Desliza horizontalmente para cambiar de etapa.":undefined} {...(compact ? swipeResponder.panHandlers : {})} style={[s.board, compact && s.boardCompact]}>{visibleColumns.map(({ status, title, empty, icon }) => {
    const columnOrders = orders.filter((order) => order.status === status);
    const tone = kitchenTone(status,theme);
    return <View style={[s.boardColumn, compact && s.boardColumnCompact]} key={status}>
      {!compact && <ThemedText style={[s.boardTitle, { color: tone }]}>{title.toUpperCase()} ({columnOrders.length})</ThemedText>}
      {columnOrders.map((order) => {
        const working = workingOrderIds.includes(order.id);
        return <View accessibilityLabel={`Comanda ${order.daily_number}`} style={s.kitchenOrder} key={order.id}>
          <View pointerEvents="none" style={s.kitchenPaperHoles}>{Array.from({length:11},(_,index)=><View key={index} style={s.kitchenPaperHole}/>)}</View>
          <View pointerEvents="none" style={s.kitchenPaperMargin}/>
          <View style={s.kitchenOrderHeader}><ThemedText style={s.kitchenOrderNo}>#{String(order.daily_number).padStart(3, "0")}</ThemedText><KitchenTimerBadge order={order} /></View>
          <View style={s.kitchenBadges}><ThemedText style={s.kitchenTypeBadge}>{kitchenServiceLabel(order)}</ThemedText>{kitchenCustomerLabel(order) && <ThemedText style={s.kitchenCustomerBadge}>{kitchenCustomerLabel(order)}</ThemedText>}</View>
          <View style={s.kitchenProducts}>{(order.items ?? []).map((item, index) => <KitchenItem item={item} key={item.id ?? `${item.name}-${index}`} />)}</View>
          {!!order.notes && <View style={s.kitchenNote}><ThemedText style={s.kitchenNoteTitle}>NOTA DEL CLIENTE</ThemedText><ThemedText style={s.kitchenNoteText}>{order.notes}</ThemedText></View>}
          <ThemedText style={s.kitchenStageTime}>{kitchenStageTime(order)}</ThemedText>
          <Pressable disabled={working} style={[s.kitchenAction, { backgroundColor: tone }, working && s.disabled]} onPress={() => advance(order)}>{working ? <ActivityIndicator color={theme.colors.primaryText} /> : <ThemedText style={s.kitchenActionText}>{status === "kitchen_pending" ? "♨  INICIAR PREPARACIÓN" : status === "preparing" ? "✓  TERMINAR" : order.type === "delivery" ? "▣  LISTO PARA REPARTO" : "▣  LISTO PARA ENTREGAR"}</ThemedText>}</Pressable>
          <DocumentButton order={order} token={token} kind="kitchen" compact />
          <View pointerEvents="none" style={s.kitchenPaperTear}>{Array.from({length:15},(_,index)=><View key={index} style={s.kitchenPaperTooth}/>)}</View>
        </View>})}
      {!columnOrders.length && <View style={s.kitchenEmpty}><ThemedText style={[s.kitchenEmptyIcon, { color: tone }]}>{icon}</ThemedText><ThemedText style={s.kitchenEmptyTitle}>{empty}</ThemedText><View style={[s.kitchenEmptyLine, { backgroundColor: tone }]} /></View>}
    </View>;
  })}</View></View>;
}
function latestHistoryDate(order: Order, status: OrderStatus): string | undefined {
  return order.histories
    ?.filter((history) => history.to_status === status && Number.isFinite(Date.parse(history.created_at)))
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]?.created_at;
}
function kitchenTone(status: OrderStatus,theme:Theme): string {
  return status === "kitchen_pending" ? theme.colors.danger : status === "preparing" ? theme.colors.warning : theme.colors.success;
}
function kitchenServiceLabel(order: Order): string {
  if (order.type === "delivery") return "ENTREGA";
  if (order.type === "dine_in") return "LOCAL";
  return "RECOGER · LOCAL";
}
function kitchenCustomerLabel(order: Order): string {
  return order.delivery?.recipient || order.customer?.name || "";
}
function kitchenStatusDate(order: Order): string | undefined {
  const kitchenPendingAt = latestHistoryDate(order, "kitchen_pending");
  const preparingAt = latestHistoryDate(order, "preparing");
  const preparedAt = latestHistoryDate(order, "prepared");
  if (order.status === "preparing") return preparingAt ?? kitchenPendingAt ?? order.created_at;
  if (order.status === "prepared") return preparedAt ?? preparingAt ?? kitchenPendingAt ?? order.created_at;
  return kitchenPendingAt ?? order.created_at;
}
function KitchenTimerBadge({ order }: { order: Order }) {
  const s=useAppStyles();
  const {theme}=useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const from = kitchenStatusDate(order);
  if (!from) return null;
  const fromTime = Date.parse(from);
  if (!Number.isFinite(fromTime)) return null;
  const minutes = Math.max(0, Math.floor((now - fromTime) / 60000));
  const color = order.status === "prepared" ? theme.colors.success : minutes >= 20 ? theme.colors.danger : minutes >= 10 ? theme.colors.warning : theme.colors.success;
  return <ThemedText style={[s.kitchenTimer, { color }]}>◷ {order.status === "prepared" ? "Listo" : `${minutes} min`}</ThemedText>;
}
function kitchenStageTime(order: Order): string {
  const source = kitchenStatusDate(order);
  if (!source || !Number.isFinite(Date.parse(source))) return "";
  const time = new Date(source).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  return order.status === "preparing" ? `Preparando desde ${time}` : order.status === "prepared" ? `Listo desde ${time}` : `Pedido: ${time}`;
}
function KitchenItem({ item }: { item: OrderItem }) {
  const s=useAppStyles();
  const flavors = (item.flavors ?? []).map((flavor) => flavor.flavor?.name ?? flavor.name).filter((name): name is string => !!name);
  const modifiers = (item.modifiers ?? []).map((modifier) => modifier.name);
  return <View style={s.kitchenItem}>
    <ThemedText style={s.kitchenItemName}>{quantityLabel(item.quantity)} × {item.name}</ThemedText>
    {!!flavors.length && <ThemedText style={s.kitchenItemOption}>· {flavors.join(" / ")}</ThemedText>}
    {!!modifiers.length && <ThemedText style={s.kitchenItemOption}>· {modifiers.join(", ")}</ThemedText>}
    {(item.components ?? []).map((component, index) => <ThemedText style={s.kitchenItemOption} key={component.id ?? `${component.name}-${index}`}>· {quantityLabel(component.quantity)} × {component.name}{component.flavors?.length ? ` · ${component.flavors.join(" / ")}` : ""}</ThemedText>)}
    {!!item.notes && <ThemedText style={s.kitchenItemNote}>· {item.notes}</ThemedText>}
  </View>;
}
