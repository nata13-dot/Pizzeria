import { useState } from "react";
import { Pressable, View } from "react-native";
import { ActionButton } from "../../../components/ActionButton";
import { FloatingTextInput as TextInput } from "../../../components/FloatingTextInput";
import { Notice } from "../../../components/Notice";
import { RemoteListStatus } from "../../../components/RemoteListStatus";
import { useFormErrors } from "../../../forms/useFormErrors";
import { decimalInput, moneyInput } from "../../../forms/validation";
import { useRemoteResource } from "../../../hooks/useRemoteResource";
import { moneyMultiply } from "../../../money";
import { ThemedText } from "../../../theme/ThemedText";
import type { PurchaseSuggestion } from "../types";
import { moneyText, quantityText, useOpsStyles } from "../ui";
import { lineFor, type PurchaseLine } from "./LineEditor";

type Row = { include: boolean; quantity: string; price: string };

/** Pre-fills the ticket with what is below its minimum; the user only confirms amounts and prices. */
export function ShortagePicker({ token, alreadyIn, onAdd, onConfigure, onClose }: {
  token: string;
  alreadyIn: (ingredientId: number) => boolean;
  onAdd: (lines: PurchaseLine[]) => void;
  onConfigure: (ingredientId: number) => void;
  onClose: () => void;
}) {
  const ops = useOpsStyles();
  const form = useFormErrors();
  const suggestions = useRemoteResource<{ data: PurchaseSuggestion[] }>("/purchases/suggestions", token, "lo que falta comprar");
  const rowsData = (suggestions.data?.data ?? []).filter((suggestion) => !alreadyIn(suggestion.ingredient.id));
  const [rows, setRows] = useState<Record<number, Row>>({});
  const rowFor = (suggestion: PurchaseSuggestion): Row => rows[suggestion.ingredient.id] ?? { include: !!suggestion.suggested_presentation_id, quantity: String(suggestion.suggested_quantity ?? ""), price: "" };
  const setRow = (id: number, patch: Partial<Row>, suggestion: PurchaseSuggestion) => setRows((current) => ({ ...current, [id]: { ...rowFor(suggestion), ...patch } }));
  const chosen = rowsData.filter((suggestion) => suggestion.suggested_presentation_id && rowFor(suggestion).include);

  function add() {
    const errors: Record<string, string> = {};
    const lines: PurchaseLine[] = [];
    chosen.forEach((suggestion) => {
      const row = rowFor(suggestion);
      const presentation = suggestion.presentations.find((candidate) => candidate.id === suggestion.suggested_presentation_id)!;
      const quantity = decimalInput(row.quantity), price = moneyInput(row.price);
      if (!Number.isFinite(quantity) || quantity <= 0) { errors[`q.${suggestion.ingredient.id}`] = "Escribe una cantidad mayor que cero."; return; }
      if (!Number.isFinite(price) || price < 0) { errors[`p.${suggestion.ingredient.id}`] = "Escribe el precio de cada una."; return; }
      const line = lineFor(suggestion.ingredient, presentation, quantity, moneyMultiply(price, row.quantity.trim().replace(",", ".")));
      if (line) lines.push(line);
    });
    if (!form.validate(errors)) return;
    onAdd(lines);
  }

  return <View style={ops.card}>
    <ThemedText style={ops.subtitle}>Lo que falta para llegar al mínimo</ThemedText>
    <RemoteListStatus loading={suggestions.loading} error={suggestions.error} count={rowsData.length} emptyText="No falta nada: todos los insumos están en su mínimo o arriba." onRetry={suggestions.reload} />
    {rowsData.map((suggestion) => {
      const id = suggestion.ingredient.id;
      const row = rowFor(suggestion);
      const presentation = suggestion.presentations.find((candidate) => candidate.id === suggestion.suggested_presentation_id);
      const unit = suggestion.ingredient.base_unit?.symbol ?? "";
      return <View key={id} style={[ops.insetCard, !row.include && presentation && ops.disabled]}>
        <View style={ops.row}>
          <View style={ops.rowGrow}>
            <ThemedText style={ops.strong}>{suggestion.ingredient.name}</ThemedText>
            <ThemedText style={ops.muted}>Tienes {quantityText(suggestion.ingredient.current_stock)} {unit} · faltan {quantityText(suggestion.ingredient.missing_to_minimum)} {unit}</ThemedText>
          </View>
          {presentation && <Pressable accessibilityRole="checkbox" aria-checked={row.include} accessibilityLabel={`Incluir ${suggestion.ingredient.name}`} onPress={() => setRow(id, { include: !row.include }, suggestion)} style={[ops.chip, row.include && ops.chipActive]}>
            <ThemedText style={row.include ? ops.chipTextActive : undefined}>{row.include ? "✓ Incluir" : "Incluir"}</ThemedText>
          </Pressable>}
        </View>
        {!presentation ? <ActionButton label="Indicar cómo lo compras" accessibilityLabel={`Indicar cómo compras ${suggestion.ingredient.name}`} variant="secondary" onPress={() => onConfigure(id)} />
          : row.include && <View style={[ops.inline, { flexWrap: "wrap" }]}>
            <TextInput style={[ops.fieldGrow, { minWidth: 120 }]} label={`${presentation.name} (cantidad)`} accessibilityLabel={`Cantidad de ${presentation.name} de ${suggestion.ingredient.name}`} keyboardType="decimal-pad" value={row.quantity} onChangeText={(quantity) => setRow(id, { quantity }, suggestion)} {...form.field(`q.${id}`)} />
            <TextInput style={[ops.fieldGrow, { minWidth: 120 }]} label={`Precio por ${presentation.name}`} accessibilityLabel={`Precio por ${presentation.name} de ${suggestion.ingredient.name}`} helperText={presentation.last_unit_cost != null ? `Última compra: $${moneyText(presentation.last_unit_cost)}` : undefined} keyboardType="decimal-pad" value={row.price} onChangeText={(price) => setRow(id, { price }, suggestion)} {...form.field(`p.${id}`)} />
          </View>}
      </View>;
    })}
    {!!rowsData.length && !chosen.length && <Notice kind="info" message="Marca al menos un insumo para agregarlo." />}
    <View style={ops.actionsRow}>
      {chosen.length > 0 && <ActionButton label={`Agregar ${chosen.length} a la compra`} onPress={add} />}
      <ActionButton label="Cerrar" variant="secondary" onPress={onClose} />
    </View>
  </View>;
}
