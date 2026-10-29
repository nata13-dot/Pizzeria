import { useState } from "react";
import { Pressable, View } from "react-native";
import { Pagination, RemoteListStatus } from "../../../components/RemoteListStatus";
import { usePaginatedResource } from "../../../hooks/useRemoteResource";
import { ThemedText } from "../../../theme/ThemedText";
import type { PaymentSource, Purchase } from "../types";
import { dateText, moneyText, quantityText, Section, useOpsStyles } from "../ui";

export const paymentSources: { key: PaymentSource; label: string }[] = [
  { key: "cash", label: "Caja" },
  { key: "owner", label: "Dueño" },
  { key: "bank", label: "Banco" },
  { key: "credit", label: "Crédito" },
  { key: "other", label: "Otro" },
];
export const paymentSourceLabel = (source: PaymentSource) => paymentSources.find((item) => item.key === source)?.label ?? source;

export function PurchaseHistory({ token, highlightId }: { token: string; highlightId: number | null }) {
  const ops = useOpsStyles();
  const purchases = usePaginatedResource<Purchase>("/purchases", token, "el historial de compras");
  const [open, setOpen] = useState<number | null>(highlightId);
  return <Section title="Compras registradas" subtitle="Las más recientes primero.">
    <RemoteListStatus loading={purchases.loading && !purchases.items.length} error={purchases.error} count={purchases.items.length} emptyText="Todavía no hay compras registradas." onRetry={purchases.reload} />
    {purchases.items.map((purchase) => {
      const expanded = open === purchase.id;
      return <View style={[ops.card, purchase.id === highlightId && ops.chipActive]} key={purchase.id}>
        <View style={ops.row}>
          <View style={ops.rowGrow}>
            <ThemedText style={ops.strong}>Compra #{purchase.id} · {purchase.supplier?.name ?? "Sin proveedor"}</ThemedText>
            <ThemedText style={ops.muted}>{dateText(purchase.purchased_at)} · Pagó: {paymentSourceLabel(purchase.payment_source)} · {purchase.items?.length ?? 0} producto(s)</ThemedText>
          </View>
          <ThemedText style={ops.value}>${moneyText(purchase.total)}</ThemedText>
        </View>
        {!!purchase.notes && <ThemedText>{purchase.notes}</ThemedText>}
        <Pressable accessibilityRole="button" aria-expanded={expanded} accessibilityLabel={`${expanded ? "Ocultar" : "Ver"} productos de la compra ${purchase.id}`} onPress={() => setOpen(expanded ? null : purchase.id)} style={ops.inlineTextAction}>
          <ThemedText style={ops.outlineText}>{expanded ? "Ocultar productos" : "Ver productos"}</ThemedText>
        </Pressable>
        {expanded && (purchase.items ?? []).map((item) => {
          const unit = item.ingredient?.base_unit?.symbol ?? "";
          return <View style={ops.insetCard} key={item.id}>
            <View style={ops.row}>
              <View style={ops.rowGrow}>
                <ThemedText style={ops.strong}>{item.ingredient?.name ?? `Insumo #${item.ingredient_id}`}</ThemedText>
                <ThemedText style={ops.muted}>{quantityText(item.presentations_quantity)} × {item.presentation?.name ?? "presentación"} → {quantityText(item.base_quantity)} {unit}</ThemedText>
                {(item.lot_code || item.expires_at) && <ThemedText style={ops.muted}>{item.lot_code ? `Lote ${item.lot_code}` : ""}{item.lot_code && item.expires_at ? " · " : ""}{item.expires_at ? `caduca ${dateText(item.expires_at)}` : ""}</ThemedText>}
              </View>
              <View><ThemedText style={ops.strong}>${moneyText(item.total_cost)}</ThemedText><ThemedText style={ops.muted}>${moneyText(item.base_unit_cost)} por {unit || "unidad"}</ThemedText></View>
            </View>
          </View>;
        })}
      </View>;
    })}
    <Pagination data={purchases.data} loading={purchases.loading} onPage={purchases.setPage} />
  </Section>;
}
