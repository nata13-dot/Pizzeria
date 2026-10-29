import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../../api";
import { ActionButton } from "../../../components/ActionButton";
import { confirmAction } from "../../../components/ConfirmationDialog";
import { FloatingTextInput as TextInput } from "../../../components/FloatingTextInput";
import { Notice } from "../../../components/Notice";
import { RemoteListStatus } from "../../../components/RemoteListStatus";
import { useActionGate } from "../../../forms/useActionGate";
import { useFormErrors } from "../../../forms/useFormErrors";
import { decimalInput, operationError, required, validDate } from "../../../forms/validation";
import { useRemoteResource } from "../../../hooks/useRemoteResource";
import { useResponsiveLayout } from "../../../layout/responsive";
import { ThemedText } from "../../../theme/ThemedText";
import { useWorkField, useWorkGuard } from "../../../work/WorkProvider";
import type { Ingredient, IngredientType, InventoryItem, Unit } from "../types";
import { Choices, Section, useOpsStyles } from "../ui";

type Draft = {
  id: number | null; name: string; sku: string; unitId: number | null; typeId: number | null;
  minimum: string; critical: string; shelfLife: string; alertDays: string;
  hasStock: boolean; stock: string; cost: string; lot: string; expiry: string; more: boolean; baseline: string;
};
const blank = (): Draft => ({ id: null, name: "", sku: "", unitId: null, typeId: null, minimum: "0", critical: "0", shelfLife: "", alertDays: "3", hasStock: false, stock: "", cost: "", lot: "", expiry: "", more: false, baseline: "" });
const fromItem = (item: Ingredient): Draft => {
  const draft: Draft = { ...blank(), id: item.id, name: item.name, sku: item.sku ?? "", unitId: item.base_unit_id, typeId: item.ingredient_type_id ?? null, minimum: String(Number(item.minimum_stock)), critical: String(Number(item.critical_stock)), shelfLife: item.shelf_life_days == null ? "" : String(item.shelf_life_days), alertDays: String(item.expiry_alert_days ?? 0) };
  return { ...draft, baseline: signature(draft) };
};
const signature = (draft: Draft) => JSON.stringify([draft.name, draft.sku, draft.unitId, draft.typeId, draft.minimum, draft.critical, draft.shelfLife, draft.alertDays, draft.hasStock, draft.stock, draft.cost, draft.lot, draft.expiry]);
const amountError = (value: string, label: string, integer = false) => {
  const parsed = decimalInput(value);
  return !Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed)) ? `Escribe ${label} como un número ${integer ? "entero " : ""}mayor o igual a cero.` : "";
};

/** Creates or edits an ingredient; null `item` means a new one. */
export function IngredientForm({ token, item, onDone, onCancel }: { token: string; item: InventoryItem | null; onDone: (message: string) => void; onCancel: () => void }) {
  const ops = useOpsStyles();
  const { compact } = useResponsiveLayout();
  const gate = useActionGate();
  const form = useFormErrors();
  const [stored, setDraft] = useWorkField<Draft>("inventory", "ingredient", blank);
  const draft = stored.id === (item?.id ?? null) ? stored : item ? fromItem(item) : blank();
  const [error, setError] = useState("");
  const units = useRemoteResource<Unit[]>(item ? null : "/catalogs/units", token, "las unidades");
  const types = useRemoteResource<IngredientType[]>("/catalogs/ingredient-types", token, "los tipos de insumo");
  const dirty = signature(draft) !== (draft.baseline || signature(blank()));
  useWorkGuard("inventory-ingredient", item ? `la edición de ${item.name}` : "el insumo nuevo", dirty, gate.busy, true);
  const update = (patch: Partial<Draft>) => { if (!gate.busy) setDraft({ ...draft, ...patch }); };

  const activeUnits = (units.data ?? []).filter((unit) => unit.active);
  const unitSymbol = item?.base_unit?.symbol ?? activeUnits.find((unit) => unit.id === draft.unitId)?.symbol ?? "";
  const inUnit = unitSymbol ? ` (${unitSymbol})` : "";

  function validate(): boolean {
    const critical = decimalInput(draft.critical), minimum = decimalInput(draft.minimum);
    return form.validate({
      name: required(draft.name, "el nombre del insumo"),
      unit: !item && !draft.unitId ? "Elige la unidad con la que contarás este insumo." : "",
      minimum: amountError(draft.minimum, "el aviso de existencia baja"),
      critical: amountError(draft.critical, "el nivel urgente") || (critical > minimum ? "El nivel urgente debe ser menor o igual al aviso de existencia baja." : ""),
      alertDays: amountError(draft.alertDays, "los días de aviso", true),
      shelfLife: draft.shelfLife.trim() ? amountError(draft.shelfLife, "la vida útil", true) : "",
      stock: !item && draft.hasStock ? amountError(draft.stock, "la cantidad inicial") : "",
      cost: !item && draft.hasStock && draft.cost.trim() ? amountError(draft.cost, "el costo") : "",
      expiry: !item && draft.hasStock && draft.expiry.trim() && !validDate(draft.expiry.trim()) ? "Escribe la fecha como AAAA-MM-DD, por ejemplo 2026-12-31." : "",
    });
  }

  function save() {
    return gate.run(async () => {
      setError("");
      if (!validate()) return;
      const body = {
        name: draft.name.trim(), sku: draft.sku.trim() || null, ingredient_type_id: draft.typeId,
        minimum_stock: decimalInput(draft.minimum), critical_stock: decimalInput(draft.critical),
        shelf_life_days: draft.shelfLife.trim() ? decimalInput(draft.shelfLife) : null, expiry_alert_days: decimalInput(draft.alertDays),
        ...(!item ? {
          active: true, base_unit_id: draft.unitId,
          initial_stock: draft.hasStock ? decimalInput(draft.stock) : 0,
          initial_unit_cost: draft.hasStock && draft.cost.trim() ? decimalInput(draft.cost) : 0,
          initial_lot_code: draft.hasStock ? draft.lot.trim() || null : null,
          initial_expires_at: draft.hasStock ? draft.expiry.trim() || null : null,
        } : {}),
      };
      try {
        await api(item ? `/ingredients/${item.id}` : "/ingredients", token, { method: item ? "PATCH" : "POST", body: JSON.stringify(body) });
        setDraft(blank()); form.clear();
        onDone(item ? `Cambios de ${body.name} guardados.` : `${body.name} quedó registrado${draft.hasStock ? " con su existencia inicial" : ""}.`);
      } catch (saveError) {
        form.fromError(saveError, { name: "el nombre", sku: "el código", base_unit_id: "la unidad", minimum_stock: "el aviso de existencia baja", critical_stock: "el nivel urgente", shelf_life_days: "la vida útil", expiry_alert_days: "los días de aviso", initial_stock: "la cantidad inicial", initial_unit_cost: "el costo", initial_expires_at: "la fecha de caducidad" }, { base_unit_id: "unit", minimum_stock: "minimum", critical_stock: "critical", shelf_life_days: "shelfLife", expiry_alert_days: "alertDays", initial_stock: "stock", initial_unit_cost: "cost", initial_expires_at: "expiry" });
        setError(operationError(saveError, "guardar el insumo", true));
      }
    });
  }

  function setActive(active: boolean) {
    return gate.run(async () => {
      if (!item) return;
      if (!active && !await confirmAction(`${item.name} dejará de aparecer en compras nuevas. Las recetas que lo usan no podrán venderse ni producirse hasta que lo reactives o lo reemplaces.`, { title: "Desactivar insumo", acceptLabel: "Desactivar insumo", cancelLabel: "Conservar insumo" })) return;
      setError("");
      try {
        await api(`/ingredients/${item.id}`, token, active ? { method: "PATCH", body: JSON.stringify({ active: true }) } : { method: "DELETE" });
        setDraft(blank());
        onDone(active ? `${item.name} está activo de nuevo.` : `${item.name} fue desactivado.`);
      } catch (activeError) { setError(operationError(activeError, active ? "reactivar el insumo" : "desactivar el insumo", true)); }
    });
  }

  async function cancel() {
    if (dirty && !await confirmAction("Se perderán los datos que escribiste en este insumo.", { title: "Descartar cambios del insumo", acceptLabel: "Descartar cambios", cancelLabel: "Seguir editando" })) return;
    setDraft(blank()); onCancel();
  }

  const row = [ops.inline, compact && ops.inlineCompact];
  return <Section title={item ? `Editar ${item.name}` : "Nuevo insumo"} subtitle={item ? "Cambia su nombre, sus avisos de existencia o su caducidad." : "Registra un ingrediente o material que compras y usas en tus recetas."}>
    <TextInput label="Nombre del insumo" placeholder="Ej. Queso mozzarella" required maxLength={150} value={draft.name} editable={!gate.busy} onChangeText={(name) => update({ name })} {...form.field("name")} />
    {!item && <>
      <RemoteListStatus loading={units.loading} error={units.error} count={activeUnits.length} emptyText="No hay unidades activas. Pide a un administrador que registre una." onRetry={units.reload} />
      {activeUnits.length > 0 && <Choices label="¿En qué unidad lo cuentas? (obligatorio)" value={draft.unitId} onChange={(unitId) => update({ unitId })} disabled={gate.busy} error={form.errors.unit} options={activeUnits.map((unit) => ({ key: unit.id, label: `${unit.name} (${unit.symbol})` }))} />}
      <ThemedText style={ops.muted}>Usa la unidad más pequeña que manejes (por ejemplo gramos). No podrá cambiarse después.</ThemedText>
    </>}
    {!!item && <ThemedText style={ops.muted}>Se cuenta en {item.base_unit?.name ?? "su unidad"}{inUnit}. La unidad no cambia para no alterar recetas ni movimientos.</ThemedText>}

    <ThemedText style={ops.subtitle}>Avisos de existencia</ThemedText>
    <View style={row}>
      <TextInput style={ops.fieldGrow} label={`Avisarme cuando queden menos de${inUnit}`} keyboardType="decimal-pad" value={draft.minimum} editable={!gate.busy} onChangeText={(minimum) => update({ minimum })} {...form.field("minimum")} />
      <TextInput style={ops.fieldGrow} label={`Nivel urgente${inUnit}`} keyboardType="decimal-pad" helperText="Se marca en rojo al llegar a esta cantidad." value={draft.critical} editable={!gate.busy} onChangeText={(critical) => update({ critical })} {...form.field("critical")} />
    </View>

    {!item && <>
      <Pressable accessibilityRole="checkbox" aria-checked={draft.hasStock} onPress={() => update({ hasStock: !draft.hasStock })} style={[ops.chip, draft.hasStock && ops.chipActive, ops.fullWidthButton]}>
        <ThemedText style={draft.hasStock ? ops.chipTextActive : undefined}>{draft.hasStock ? "✓ Ya tengo existencia de este insumo" : "¿Ya tienes existencia? Regístrala aquí (opcional)"}</ThemedText>
      </Pressable>
      {draft.hasStock && <>
        <View style={row}>
          <TextInput style={ops.fieldGrow} label={`Cantidad que tienes${inUnit}`} required keyboardType="decimal-pad" value={draft.stock} editable={!gate.busy} onChangeText={(stock) => update({ stock })} {...form.field("stock")} />
          <TextInput style={ops.fieldGrow} label={`Costo por ${unitSymbol || "unidad"} (opcional)`} keyboardType="decimal-pad" value={draft.cost} editable={!gate.busy} onChangeText={(cost) => update({ cost })} {...form.field("cost")} />
        </View>
        <View style={row}>
          <TextInput style={ops.fieldGrow} label="Caducidad (opcional)" placeholder="AAAA-MM-DD" autoCapitalize="none" value={draft.expiry} editable={!gate.busy} onChangeText={(expiry) => update({ expiry })} {...form.field("expiry")} />
          <TextInput style={ops.fieldGrow} label="Código de lote (opcional)" autoCapitalize="characters" value={draft.lot} editable={!gate.busy} onChangeText={(lot) => update({ lot })} />
        </View>
      </>}
    </>}

    <Pressable accessibilityRole="button" aria-expanded={draft.more} onPress={() => update({ more: !draft.more })} style={ops.backLink}>
      <ThemedText style={ops.backLinkText}>{draft.more ? "▾ Ocultar opciones adicionales" : "▸ Más opciones: tipo, código y caducidad"}</ThemedText>
    </Pressable>
    {draft.more && <>
      {(types.data ?? []).some((type) => type.active) && <Choices label="Tipo de insumo (opcional)" value={draft.typeId ?? 0} onChange={(typeId) => update({ typeId: typeId || null })} disabled={gate.busy} options={[{ key: 0, label: "Sin tipo" }, ...(types.data ?? []).filter((type) => type.active).map((type) => ({ key: type.id, label: type.name }))]} />}
      {!!types.error && <RemoteListStatus loading={false} error={types.error} count={0} emptyText="" onRetry={types.reload} />}
      <TextInput label="Código interno o SKU (opcional)" autoCapitalize="characters" maxLength={100} value={draft.sku} editable={!gate.busy} onChangeText={(sku) => update({ sku })} {...form.field("sku")} />
      <View style={row}>
        <TextInput style={ops.fieldGrow} label="¿Cuántos días dura? (opcional)" keyboardType="number-pad" value={draft.shelfLife} editable={!gate.busy} onChangeText={(shelfLife) => update({ shelfLife })} {...form.field("shelfLife")} />
        <TextInput style={ops.fieldGrow} label="Avisar días antes de caducar" keyboardType="number-pad" value={draft.alertDays} editable={!gate.busy} onChangeText={(alertDays) => update({ alertDays })} {...form.field("alertDays")} />
      </View>
    </>}

    <Notice kind="error" message={error} />
    <View style={ops.actionsRow}>
      <ActionButton label={item ? "Guardar cambios" : "Registrar insumo"} loading={gate.busy} onPress={save} />
      <ActionButton label="Cancelar" variant="secondary" disabled={gate.busy} onPress={cancel} />
    </View>
    {!!item && <View style={ops.divider} />}
    {!!item && (item.active
      ? <ActionButton label="Desactivar insumo" variant="destructive" disabled={gate.busy || dirty} disabledReason="Guarda o descarta los cambios antes de desactivarlo." onPress={() => setActive(false)} />
      : <ActionButton label="Reactivar insumo" variant="secondary" disabled={gate.busy || dirty} disabledReason="Guarda o descarta los cambios antes de reactivarlo." onPress={() => setActive(true)} />)}
  </Section>;
}
