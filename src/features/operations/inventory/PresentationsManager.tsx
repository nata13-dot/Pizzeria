import { useState } from "react";
import { View } from "react-native";
import { api } from "../../../api";
import { ActionButton } from "../../../components/ActionButton";
import { confirmAction } from "../../../components/ConfirmationDialog";
import { FloatingTextInput as TextInput } from "../../../components/FloatingTextInput";
import { Notice } from "../../../components/Notice";
import { RemoteListStatus } from "../../../components/RemoteListStatus";
import { useActionGate } from "../../../forms/useActionGate";
import { useFormErrors } from "../../../forms/useFormErrors";
import { decimalInput, operationError, required } from "../../../forms/validation";
import { useRemoteResource } from "../../../hooks/useRemoteResource";
import { useResponsiveLayout } from "../../../layout/responsive";
import { ThemedText } from "../../../theme/ThemedText";
import { useWorkField, useWorkGuard } from "../../../work/WorkProvider";
import type { IngredientPresentation, InventoryItem, Unit } from "../types";
import { Choices, numberValue, quantityText, Section, useOpsStyles } from "../ui";

type Draft = { ingredientId: number | null; id: number | null; name: string; quantity: string; unitId: number | null; sku: string };
const blank = (ingredientId: number | null = null): Draft => ({ ingredientId, id: null, name: "", quantity: "", unitId: null, sku: "" });

/** Lists and edits the ways one ingredient is bought (bag, box…) and their equivalence. */
export function PresentationsManager({ token, item, onChanged, onBack }: { token: string; item: InventoryItem; onChanged: (message: string) => void; onBack: () => void }) {
  const ops = useOpsStyles();
  const { compact } = useResponsiveLayout();
  const gate = useActionGate();
  const form = useFormErrors();
  const [stored, setDraft] = useWorkField<Draft>("inventory", "presentation", blank);
  const draft = stored.ingredientId === item.id ? stored : blank(item.id);
  const [error, setError] = useState("");
  const units = useRemoteResource<Unit[]>("/catalogs/units", token, "las unidades");
  const dirty = !!(draft.name.trim() || draft.quantity.trim() || draft.sku.trim());
  useWorkGuard("inventory-presentation", `la presentación de ${item.name}`, dirty, gate.busy, true);
  const update = (patch: Partial<Draft>) => { if (!gate.busy) setDraft({ ...draft, ...patch }); };

  const base = item.base_unit;
  const compatible = (units.data ?? []).filter((unit) => unit.active && unit.dimension === base?.dimension);
  const unit = compatible.find((candidate) => candidate.id === draft.unitId) ?? null;
  const amount = decimalInput(draft.quantity);
  const conversion = unit && base && Number.isFinite(amount) && amount > 0 ? amount * numberValue(unit.base_factor) / numberValue(base.base_factor) : null;
  const presentations = item.presentations ?? [];

  function edit(presentation: IngredientPresentation) {
    form.clear(); setError("");
    setDraft({ ingredientId: item.id, id: presentation.id, name: presentation.name, quantity: String(Number(presentation.quantity)), unitId: presentation.equivalent_unit_id, sku: presentation.supplier_sku ?? "" });
  }

  function write(presentation: { id: number | null; name: string; quantity: number; unitId: number; sku: string | null; active: boolean }, done: string) {
    const path = `/ingredients/${item.id}/presentations${presentation.id ? `/${presentation.id}` : ""}`;
    return api(path, token, { method: presentation.id ? "PUT" : "POST", body: JSON.stringify({ name: presentation.name, quantity: presentation.quantity, equivalent_unit_id: presentation.unitId, supplier_sku: presentation.sku, active: presentation.active }) })
      .then(() => { setDraft(blank(item.id)); form.clear(); onChanged(done); });
  }

  function save() {
    return gate.run(async () => {
      setError("");
      if (!form.validate({
        name: required(draft.name, "el nombre de la presentación"),
        quantity: !Number.isFinite(amount) || amount <= 0 ? "Escribe cuánto contiene, mayor que cero." : "",
        unit: !unit ? "Elige la unidad de lo que contiene." : "",
      }) || !unit) return;
      try { await write({ id: draft.id, name: draft.name.trim(), quantity: amount, unitId: unit.id, sku: draft.sku.trim() || null, active: true }, draft.id ? "Presentación actualizada." : "Presentación agregada."); }
      catch (saveError) {
        form.fromError(saveError, { name: "el nombre", quantity: "la cantidad", equivalent_unit_id: "la unidad" }, { equivalent_unit_id: "unit" });
        setError(operationError(saveError, "guardar la presentación", true));
      }
    });
  }

  function toggle(presentation: IngredientPresentation) {
    return gate.run(async () => {
      setError("");
      try {
        if (presentation.active) {
          if (!await confirmAction(`“${presentation.name}” ya no aparecerá al registrar compras nuevas. Las compras anteriores no cambian.`, { title: "Desactivar presentación", acceptLabel: "Desactivar presentación", cancelLabel: "Conservar presentación" })) return;
          await api(`/ingredients/${item.id}/presentations/${presentation.id}`, token, { method: "DELETE" });
          onChanged(`“${presentation.name}” fue desactivada.`);
        } else {
          await write({ id: presentation.id, name: presentation.name, quantity: numberValue(presentation.quantity), unitId: presentation.equivalent_unit_id, sku: presentation.supplier_sku ?? null, active: true }, `“${presentation.name}” está activa de nuevo.`);
        }
      } catch (toggleError) { setError(operationError(toggleError, "cambiar la presentación", true)); }
    });
  }

  return <Section title={`Cómo compras ${item.name}`} subtitle={`Indica qué contiene cada presentación para convertir tus compras a ${base?.name ?? "su unidad"} automáticamente.`}>
    {!presentations.length && <ThemedText style={ops.muted}>Todavía no hay presentaciones. Agrega la primera abajo, por ejemplo “Bolsa de 2 kg”.</ThemedText>}
    {presentations.map((presentation) => <View key={presentation.id} style={[ops.insetCard, !presentation.active && ops.disabled]}>
      <View style={ops.row}>
        <View style={ops.rowGrow}>
          <ThemedText style={ops.strong}>{presentation.name}{presentation.active ? "" : " · inactiva"}</ThemedText>
          <ThemedText style={ops.muted}>1 {presentation.name} = {quantityText(presentation.base_quantity)} {base?.symbol ?? ""}{presentation.supplier_sku ? ` · Código ${presentation.supplier_sku}` : ""}</ThemedText>
        </View>
        <View style={ops.actionsRow}>
          {presentation.active && <ActionButton label="Editar" accessibilityLabel={`Editar ${presentation.name}`} variant="secondary" disabled={gate.busy} onPress={() => edit(presentation)} />}
          <ActionButton label={presentation.active ? "Desactivar" : "Reactivar"} accessibilityLabel={`${presentation.active ? "Desactivar" : "Reactivar"} ${presentation.name}`} variant={presentation.active ? "destructive" : "secondary"} disabled={gate.busy} onPress={() => toggle(presentation)} />
        </View>
      </View>
    </View>)}

    <ThemedText style={ops.subtitle}>{draft.id ? "Editar presentación" : "Agregar presentación"}</ThemedText>
    <View style={[ops.inline, compact && ops.inlineCompact]}>
      <TextInput style={ops.fieldGrow} label="Nombre" placeholder="Ej. Bolsa de 2 kg" required maxLength={150} value={draft.name} editable={!gate.busy} onChangeText={(name) => update({ name })} {...form.field("name")} />
      <TextInput style={ops.fieldGrow} label="¿Cuánto contiene?" required keyboardType="decimal-pad" value={draft.quantity} editable={!gate.busy} onChangeText={(quantity) => update({ quantity })} {...form.field("quantity")} />
    </View>
    <RemoteListStatus loading={units.loading} error={units.error} count={compatible.length} emptyText="No hay unidades compatibles con este insumo." onRetry={units.reload} />
    {compatible.length > 0 && <Choices label="Unidad de lo que contiene (obligatorio)" value={draft.unitId} onChange={(unitId) => update({ unitId })} disabled={gate.busy} error={form.errors.unit} options={compatible.map((candidate) => ({ key: candidate.id, label: `${candidate.name} (${candidate.symbol})` }))} />}
    <TextInput label="Código del proveedor (opcional)" autoCapitalize="characters" maxLength={100} value={draft.sku} editable={!gate.busy} onChangeText={(sku) => update({ sku })} />
    {conversion !== null && <ThemedText style={ops.notice} accessibilityLiveRegion="polite">Al comprar 1 {draft.name.trim() || "presentación"} se sumarán {quantityText(conversion)} {base?.symbol} al inventario.</ThemedText>}
    <Notice kind="error" message={error} />
    <View style={ops.actionsRow}>
      <ActionButton label={draft.id ? "Guardar presentación" : "Agregar presentación"} loading={gate.busy} onPress={save} />
      {(draft.id !== null || dirty) && <ActionButton label="Limpiar" variant="secondary" disabled={gate.busy} onPress={() => { setDraft(blank(item.id)); form.clear(); }} />}
      <ActionButton label="Volver a inventario" variant="secondary" disabled={gate.busy} onPress={onBack} />
    </View>
  </Section>;
}
