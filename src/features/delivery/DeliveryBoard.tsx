import {ThemedText} from "../../theme/ThemedText";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { useResponsiveLayout } from "../../layout/responsive";
import { api } from "../../api";
import { confirmAction } from "../../components/ConfirmationDialog";
import { useAppStyles } from "../../styles/appStyles";
import type { Order, OrderStatus, OrderStatusAction } from "../orders/types";
import { DocumentButton, Empty, OrderContents, openPhoneDialer } from "../orders/shared";
export function DeliveryBoard({ orders, token, onAction, onReload }: { orders: Order[]; token: string; onAction: OrderStatusAction; onReload: () => void }) {
  const s=useAppStyles();
  const { compact, mobile } = useResponsiveLayout();
  const [activeLane, setActiveLane] = useState<"ready" | "on_way" | "scheduled">("ready");
  const [paymentError, setPaymentError] = useState("");
  const ready = orders.filter((order) => order.status === "ready");
  const onWay = orders.filter((order) => order.status === "on_way");
  const scheduled = orders.filter((order) => !["ready", "on_way"].includes(order.status) && order.scheduled_at);
  const amountDue = (order: Order) => {
    const value = Number(order.amount_due);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const mustCollect = (order: Order) => order.collection_required === true && amountDue(order) > 0.009;
  async function advance(order: Order) {
    const next: OrderStatus = order.status === "ready" ? "on_way" : "delivered";
    if (next === "delivered" && mustCollect(order)) {
      setPaymentError(`La orden #${order.daily_number} todavía tiene saldo pendiente. Registra el cobro antes de entregarla.`);
      return;
    }
    if (await confirmAction(next === "on_way" ? "¿Confirmas que el pedido va en camino?" : "¿Confirmas que el pedido fue entregado?")) {
      await onAction(order, next);
    }
  }
  async function payment(order: Order) {
    const due = amountDue(order);
    if (!mustCollect(order) || !(await confirmAction(`¿Confirmas que recibiste $${due.toFixed(2)} en efectivo?`))) return;
    setPaymentError("");
    try {
      await api(`/delivery/orders/${order.id}/payment-received`, token, {
        method: "POST",
        body: JSON.stringify({ method: "cash" }),
      });
      onReload();
    } catch (error) {
      setPaymentError((error as Error).message);
    }
  }
  function card(order: Order) {
    const delivery = order.delivery;
    const due = amountDue(order);
    const collectionRequired = mustCollect(order);
    const paymentLabel = order.payment_status === "courtesy"
      ? "Cortesía, sin cobro"
      : order.payment_status === "partial"
        ? "Pago parcial"
        : order.payment_status === "unpaid"
          ? "Pendiente de pago"
          : "Pago completo";
    const mapUrl = delivery?.map_url ?? (delivery?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.address)}` : null);
    return <View style={[s.order, mobile && s.deliveryOrderMobile]} key={order.id}>
      <OrderContents order={order} />
      <ThemedText style={s.productName}>{delivery?.recipient ?? "Cliente sin nombre"}</ThemedText>
      <ThemedText>{delivery?.address ?? "Dirección pendiente"}</ThemedText>
      {delivery?.references && <ThemedText style={s.muted}>Referencias: {delivery.references}</ThemedText>}
      {collectionRequired
        ? <ThemedText style={s.total}>Cobrar ${due.toFixed(2)}</ThemedText>
        : <ThemedText style={s.paid}>✓ Sin saldo por cobrar</ThemedText>}
      <ThemedText style={s.muted}>Pago: {paymentLabel}</ThemedText>
      <View style={[s.reportActions, mobile && s.deliveryActionsMobile]}>
        {delivery?.phone && <Pressable style={[s.secondaryButton, mobile && s.deliveryActionMobile]} onPress={() => openPhoneDialer(delivery.phone)}><ThemedText style={s.secondaryText}>☎ Llamar</ThemedText></Pressable>}
        {delivery?.phone && <Pressable style={[s.secondaryButton, mobile && s.deliveryActionMobile]} onPress={() => Linking.openURL(`https://wa.me/${delivery.phone.replace(/\D/g, "")}`)}><ThemedText style={s.secondaryText}>WhatsApp</ThemedText></Pressable>}
        {mapUrl && <Pressable style={[s.secondaryButton, mobile && s.deliveryActionMobile]} onPress={() => Linking.openURL(mapUrl)}><ThemedText style={s.secondaryText}>Mapa</ThemedText></Pressable>}
      </View>
      {["ready", "on_way"].includes(order.status) && <Pressable style={s.smallButton} onPress={() => advance(order)}><ThemedText style={s.primaryText}>{order.status === "ready" ? "Marcar en camino" : "Marcar entregado"}</ThemedText></Pressable>}
      {["ready", "on_way"].includes(order.status) && collectionRequired && <Pressable style={s.secondaryButton} onPress={() => payment(order)}><ThemedText style={s.secondaryText}>Registrar cobro en efectivo</ThemedText></Pressable>}
      <DocumentButton order={order} token={token} kind="delivery" />
    </View>;
  }
  const lanes = [
    { key: "ready" as const, label: "Listos para entregar", orders: ready },
    { key: "on_way" as const, label: "En camino", orders: onWay },
    { key: "scheduled" as const, label: "Programados próximos", orders: scheduled },
  ];
  const visibleLanes = compact ? lanes.filter((lane) => lane.key === activeLane) : lanes;
  return <View style={s.deliveryBoard}>
    {!!paymentError && <ThemedText style={s.error}>{paymentError}</ThemedText>}
    {compact && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.deliveryTabs}>{lanes.map((lane) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeLane === lane.key }} key={lane.key} onPress={() => setActiveLane(lane.key)} style={[s.deliveryTab, activeLane === lane.key && s.deliveryTabActive]}><ThemedText style={[s.deliveryTabText, activeLane === lane.key && s.deliveryTabTextActive]}>{lane.label} ({lane.orders.length})</ThemedText></Pressable>)}</ScrollView>}
    <View style={[s.deliveryColumns, compact && s.deliveryColumnsCompact]}>{visibleLanes.map((lane) => <View style={[s.deliveryColumn, compact && s.deliveryColumnCompact]} key={lane.key}><ThemedText style={s.sectionTitle}>{lane.label} ({lane.orders.length})</ThemedText>{lane.orders.map(card)}{!lane.orders.length && <Empty />}</View>)}</View>
  </View>;
}
