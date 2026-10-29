import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../../api";
import { ActionButton } from "../../../components/ActionButton";
import { FloatingTextInput as TextInput } from "../../../components/FloatingTextInput";
import { Notice } from "../../../components/Notice";
import { RemoteListStatus } from "../../../components/RemoteListStatus";
import { useActionGate } from "../../../forms/useActionGate";
import { useFormErrors } from "../../../forms/useFormErrors";
import { decimalInput, moneyInput, operationError, required, validDate } from "../../../forms/validation";
import { useRemoteResource } from "../../../hooks/useRemoteResource";
import { useResponsiveLayout } from "../../../layout/responsive";
import { money, moneyDivide, moneyMultiply } from "../../../money";
import { ThemedText } from "../../../theme/ThemedText";
import type { Ingredient, IngredientPresentation, Unit } from "../types";
import { Choices, moneyText, numberValue, quantityText, useOpsStyles } from "../ui";

export type PurchaseLine = {
  ingredient_id: number;
  ingredient_presentation_id: number;
  ingredientName: string;
  presentationName: string;
  presentations_quantity: number;
  baseQuantity: number;
  baseUnitSymbol: string;
  total_cost: number;
  presentationRevision: string;
  presentationQuantity: number;
  presentationUnitSymbol: string;
  invalid?: string;
  expires_at?: string;
  lot_code?: string;
};

/** Builds one ticket line; keeps the audited presentation conversion and revision. */
export function lineFor(ingredient: Pick<Ingredient, "id" | "name" | "base_unit">, presentation: IngredientPresentation, quantity: number, total: number, extra: { expires_at?: string; lot_code?: string } = {}): PurchaseLine | null {
  const baseQuantity = numberValue(presentation.base_quantity) * quantity;
  if (!Number.isFinite(baseQuantity) || baseQuantity <= 0 || !presentation.purchase_revision) return null;
  return {
    ingredient_id: ingredient.id, ingredient_presentation_id: presentation.id, ingredientName: ingredient.name, presentationName: presentation.name,
    presentations_quantity: quantity, baseQuantity, baseUnitSymbol: ingredient.base_unit?.symbol ?? "u", total_cost: money(total),
    presentationRevision: presentation.purchase_revision, presentationQuantity: numberValue(presentation.quantity), presentationUnitSymbol: presentation.equivalent_unit?.symbol ?? "u",
    expires_at: extra.expires_at || undefined, lot_code: extra.lot_code?.trim() || undefined,
  };
}

type PriceMode = "unit" | "total";

/** Quantity and price for one ingredient; offers to create its purchase presentation when missing. */
export function LineEditor({ token, ingredientId, editing, purchasedAt, isAdministrator, onSave, onCancel }: {
  token: string;
  ingredientId: number;
  editing: PurchaseLine | null;
  purchasedAt: string;
  isAdministrator: boolean;
  onSave: (line: PurchaseLine) => void;
  onCancel: () => void;
}) {
  const ops = useOpsStyles();
  const { compact } = useResponsiveLayout();
  const form = useFormErrors();
  const detail = useRemoteResource<Ingredient>(`/ingredients/${ingredientId}`, token, "las presentaciones del insumo");
  const presentations = (detail.data?.active ? detail.data.presentations ?? [] : []).filter((presentation) => presentation.active && presentation.purchase_revision);
  const [presentationId, setPresentationId] = useState<number | null>(editing?.ingredient_presentation_id ?? null);
  const [quantity, setQuantity] = useState(editing ? String(editing.presentations_quantity) : "1");
  const [mode, setMode] = useState<PriceMode>("unit");
  const [price, setPrice] = useState(editing ? String(moneyDivide(editing.total_cost, editing.presentations_quantity)) : "");
  const [more, setMore] = useState(!!(editing?.expires_at || editing?.lot_code));
  const [expiry, setExpiry] = useState(editing?.expires_at ?? "");
  const [lot, setLot] = useState(editing?.lot_code ?? "");
  const [error, setError] = useState("");
  const selected = presentations.find((presentation) => presentation.id === presentationId) ?? (presentations.length === 1 ? presentations[0] : null);
  const amount = decimalInput(quantity);
  const priceValue = moneyInput(price);
  const validAmount = Number.isFinite(amount) && amount > 0;
  const total = (() => {
    if (!validAmount || !Number.isFinite(priceValue)) return null;
    try { return mode === "unit" ? moneyMultiply(priceValue, quantity.trim().replace(",", ".")) : money(priceValue); } catch { return null; }
  })();
  const unit = detail.data?.base_unit?.symbol ?? "u";

  function save() {
    setError("");
    if (!form.validate({
      presentation: !selected ? "Elige cómo lo compraste." : "",
      quantity: !validAmount ? "Escribe cuántas compraste, mayor que cero." : "",
      price: !Number.isFinite(priceValue) || priceValue < 0 ? "Escribe el precio con números, por ejemplo 45.50." : total === null ? "El importe supera el límite permitido." : "",
      expiry: expiry && (!validDate(expiry) || expiry < purchasedAt) ? "Usa una fecha AAAA-MM-DD igual o posterior a la compra." : "",
    }) || !selected || total === null || !detail.data) return;
    const line = lineFor(detail.data, selected, amount, total, { expires_at: expiry, lot_code: lot });
    if (!line) { setError("Esta presentación no tiene una conversión verificable. Revísala en Inventario."); return; }
    onSave(line);
  }

  if (detail.loading && !detail.data) return <RemoteListStatus loading error="" count={0} emptyText="" onRetry={detail.reload} />;
  if (detail.error) return <RemoteListStatus loading={false} error={detail.error} count={0} emptyText="" onRetry={detail.reload} />;
  if (!detail.data) return null;

  return <View style={ops.card}>
    <ThemedText style={ops.subtitle}>{editing ? "Cambiar" : "Agregar"} {detail.data.name}</ThemedText>
    {!presentations.length ? (isAdministrator
      ? <QuickPresentation token={token} ingredient={detail.data} onCreated={() => detail.reload()} />
      : <Notice kind="warning" message="Este insumo aún no tiene forma de compra (bolsa, caja…). Pide a un administrador que la registre en Inventario." />)
    : <>
      <Choices label="¿Cómo lo compraste?" value={selected?.id ?? null} onChange={setPresentationId} error={form.errors.presentation} options={presentations.map((presentation) => ({ key: presentation.id, label: presentation.name, hint: `= ${quantityText(presentation.base_quantity)} ${unit}` }))} />
      <View style={[ops.inline, compact && ops.inlineCompact]}>
        <TextInput style={ops.fieldGrow} label={`¿Cuántas${selected ? ` ${selected.name}` : ""}?`} required keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} {...form.field("quantity")} />
        <TextInput style={ops.fieldGrow} label={mode === "unit" ? `Precio por ${selected?.name ?? "pieza"}` : "Total pagado"} required keyboardType="decimal-pad" value={price} onChangeText={setPrice} {...form.field("price")} />
      </View>
      <Choices value={mode} onChange={setMode} options={[{ key: "unit", label: "Escribo el precio de cada una" }, { key: "total", label: "Escribo el total del renglón" }]} />
      {selected?.last_unit_cost != null && <Pressable accessibilityRole="button" accessibilityLabel={`Usar el precio de la última compra, ${moneyText(selected.last_unit_cost)} pesos`} onPress={() => { setMode("unit"); setPrice(String(selected.last_unit_cost)); }} style={ops.backLink}>
        <ThemedText style={ops.backLinkText}>Última compra: ${moneyText(selected.last_unit_cost)} por {selected.name} · Usar este precio</ThemedText>
      </Pressable>}
      {selected && validAmount && <ThemedText style={ops.notice} accessibilityLiveRegion="polite">Entrarán {quantityText(numberValue(selected.base_quantity) * amount)} {unit} al inventario{total !== null ? ` · Total $${moneyText(total)}` : ""}{total !== null && mode === "total" ? ` ($${moneyText(moneyDivide(total, quantity.trim().replace(",", ".")))} c/u)` : ""}.</ThemedText>}
      <Pressable accessibilityRole="button" aria-expanded={more} onPress={() => setMore((value) => !value)} style={ops.backLink}><ThemedText style={ops.backLinkText}>{more ? "▾ Ocultar lote y caducidad" : "▸ Lote y caducidad (opcional)"}</ThemedText></Pressable>
      {more && <View style={[ops.inline, compact && ops.inlineCompact]}>
        <TextInput style={ops.fieldGrow} label="Caducidad" placeholder="AAAA-MM-DD" autoCapitalize="none" value={expiry} onChangeText={setExpiry} {...form.field("expiry")} />
        <TextInput style={ops.fieldGrow} label="Código de lote" autoCapitalize="characters" value={lot} onChangeText={setLot} />
      </View>}
      <Notice kind="error" message={error} />
    </>}
    <View style={ops.actionsRow}>
      {presentations.length > 0 && <ActionButton label={editing ? "Guardar cambios del renglón" : "Agregar a la compra"} onPress={save} />}
      <ActionButton label="Cancelar" variant="secondary" onPress={onCancel} />
    </View>
  </View>;
}

/** Creates the first purchase presentation without leaving the purchase. */
function QuickPresentation({ token, ingredient, onCreated }: { token: string; ingredient: Ingredient; onCreated: () => void }) {
  const ops = useOpsStyles();
  const gate = useActionGate();
  const form = useFormErrors();
  const units = useRemoteResource<Unit[]>("/catalogs/units", token, "las unidades");
  const compatible = (units.data ?? []).filter((unit) => unit.active && unit.dimension === ingredient.base_unit?.dimension);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const unit = compatible.find((candidate) => candidate.id === unitId) ?? null;
  const amount = decimalInput(quantity);
  const preview = unit && ingredient.base_unit && Number.isFinite(amount) && amount > 0 ? amount * numberValue(unit.base_factor) / numberValue(ingredient.base_unit.base_factor) : null;

  const create = () => gate.run(async () => {
    setError("");
    if (!form.validate({ name: required(name, "cómo se llama, por ejemplo Bolsa de 2 kg"), quantity: !Number.isFinite(amount) || amount <= 0 ? "Escribe cuánto contiene, mayor que cero." : "", unit: unit ? "" : "Elige la unidad." }) || !unit) return;
    try {
      await api(`/ingredients/${ingredient.id}/presentations`, token, { method: "POST", body: JSON.stringify({ name: name.trim(), quantity: amount, equivalent_unit_id: unit.id, supplier_sku: null, active: true }) });
      onCreated();
    } catch (createError) { setError(operationError(createError, "guardar la forma de compra", true)); }
  });

  return <View style={ops.choiceGroup}>
    <Notice kind="info" message={`Primero indica cómo compras ${ingredient.name}. Solo se hace una vez.`} />
    <TextInput label="¿Cómo lo compras?" placeholder="Ej. Bolsa de 2 kg" required maxLength={150} value={name} onChangeText={setName} {...form.field("name")} />
    <TextInput label="¿Cuánto contiene?" required keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} {...form.field("quantity")} />
    <RemoteListStatus loading={units.loading} error={units.error} count={compatible.length} emptyText="No hay unidades compatibles." onRetry={units.reload} />
    {compatible.length > 0 && <Choices label="Unidad" value={unitId} onChange={setUnitId} error={form.errors.unit} options={compatible.map((candidate) => ({ key: candidate.id, label: `${candidate.name} (${candidate.symbol})` }))} />}
    {preview !== null && <ThemedText style={ops.notice}>Cada {name.trim() || "presentación"} sumará {quantityText(preview)} {ingredient.base_unit?.symbol} al inventario.</ThemedText>}
    <Notice kind="error" message={error} />
    <ActionButton label="Guardar y continuar con la compra" loading={gate.busy} onPress={create} />
  </View>;
}
