import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../api";
import { ActionButton } from "../../components/ActionButton";
import { confirmAction } from "../../components/ConfirmationDialog";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { Notice, useFeedback } from "../../components/Notice";
import { Pagination, RemoteListStatus } from "../../components/RemoteListStatus";
import { useActionGate } from "../../forms/useActionGate";
import { useFormErrors } from "../../forms/useFormErrors";
import { decimalInput, operationError, required } from "../../forms/validation";
import { usePaginatedResource, useRemoteResource } from "../../hooks/useRemoteResource";
import { ThemedText } from "../../theme/ThemedText";
import { useWorkField, useWorkGuard } from "../../work/WorkProvider";
import type { Ingredient, ProductionRecipe, Unit } from "../operations/types";
import { Choices, numberValue, quantityText, Section, useOpsStyles, WorkflowSteps } from "../operations/ui";
import { IngredientSearch, quantityError, WizardNav } from "./wizard";

type Step = "output" | "yield" | "inputs" | "review";
type Output = { id: number; name: string; unit: string; base_unit_id: number; dimension: string; base_factor: number };
type Row = { ingredient_id: number; name: string; unit: string; base_unit_id: number; quantity: string };
type Draft = { open: boolean; step: Step; id: number | null; name: string; output: Output | null; yieldQuantity: string; yieldUnitId: number | null; shelfLife: string; active: boolean; rows: Row[]; baseline: string };
const blank = (): Draft => ({ open: false, step: "output", id: null, name: "", output: null, yieldQuantity: "1", yieldUnitId: null, shelfLife: "1", active: true, rows: [], baseline: "" });
const signature = (draft: Draft) => JSON.stringify([draft.id, draft.name, draft.output?.id, draft.yieldQuantity, draft.yieldUnitId, draft.shelfLife, draft.active, draft.rows]);
const toOutput = (ingredient: Ingredient): Output | null => ingredient.base_unit ? { id: ingredient.id, name: ingredient.name, unit: ingredient.base_unit.symbol, base_unit_id: ingredient.base_unit_id, dimension: ingredient.base_unit.dimension, base_factor: numberValue(ingredient.base_unit.base_factor) } : null;
function fromRecipe(recipe: ProductionRecipe): Draft {
  const draft: Draft = {
    ...blank(), open: true, step: "inputs", id: recipe.id, name: recipe.name, output: recipe.output_ingredient ? toOutput(recipe.output_ingredient) : null,
    yieldQuantity: String(Number(recipe.yield_quantity)), yieldUnitId: recipe.yield_unit_id, shelfLife: String(recipe.shelf_life_days), active: recipe.active,
    rows: recipe.items.map((item) => ({ ingredient_id: item.ingredient_id, name: item.ingredient?.name ?? `Insumo #${item.ingredient_id}`, unit: item.ingredient?.base_unit?.symbol ?? "u", base_unit_id: item.ingredient?.base_unit_id ?? 0, quantity: String(Number(item.quantity)) })),
  };
  return { ...draft, baseline: signature(draft) };
}

/** Production recipes: list plus a guided editor (what you make → yield → inputs → review). */
export function ProductionRecipes({ token, isAdministrator, onSaved }: { token: string; isAdministrator: boolean; onSaved: (recipe: ProductionRecipe) => void }) {
  const ops = useOpsStyles();
  const [draft, setDraft] = useWorkField<Draft>("productionRecipe", "wizard", blank);
  const [message, setMessage, kind] = useFeedback();
  const gate = useActionGate();
  const form = useFormErrors();
  const directory = usePaginatedResource<ProductionRecipe>("/production-recipes?paginated=1", token, "las recetas de producción", 300, !draft.open);
  const units = useRemoteResource<Unit[]>(draft.open ? "/catalogs/units" : null, token, "las unidades");
  const dirty = signature(draft) !== (draft.baseline || signature(blank()));
  useWorkGuard("production-recipe", "la receta de producción", dirty, gate.busy, true);
  const update = (patch: Partial<Draft>) => { if (!gate.busy) setDraft({ ...draft, ...patch }); };

  const compatible = (units.data ?? []).filter((unit) => unit.active && unit.dimension === draft.output?.dimension);
  const yieldUnit = compatible.find((unit) => unit.id === draft.yieldUnitId) ?? null;
  const yieldAmount = decimalInput(draft.yieldQuantity);
  const perBatch = yieldUnit && draft.output && Number.isFinite(yieldAmount) && yieldAmount > 0 ? yieldAmount * numberValue(yieldUnit.base_factor) / draft.output.base_factor : null;
  const lostUnit = draft.yieldUnitId !== null && units.data && !yieldUnit;

  async function mayReplace() {
    return !dirty || await confirmAction("Se reemplazará la receta de producción que tienes sin guardar.", { title: "Reemplazar receta sin guardar", acceptLabel: "Reemplazar receta", cancelLabel: "Conservar borrador" });
  }
  const create = () => gate.run(async () => { if (await mayReplace()) { form.clear(); setMessage(""); setDraft({ ...blank(), open: true }); } });
  const edit = (recipe: ProductionRecipe) => gate.run(async () => { if (await mayReplace()) { form.clear(); setMessage(""); setDraft(fromRecipe(recipe)); } });

  function chooseOutput(ingredient: Ingredient) {
    return gate.run(async () => {
      const output = toOutput(ingredient);
      if (!output || draft.output?.id === output.id) return;
      if (draft.output && !await confirmAction(`La receta producirá ${output.name}. Revisa el rendimiento: la cantidad no se convierte automáticamente.`, { title: "Cambiar lo que se prepara", acceptLabel: "Cambiar y revisar rendimiento", cancelLabel: "Conservar salida" })) return;
      setDraft({ ...draft, output, yieldUnitId: output.base_unit_id, name: !draft.name.trim() || draft.name === `Preparación de ${draft.output?.name}` ? `Preparación de ${output.name}` : draft.name, rows: draft.rows.filter((row) => row.ingredient_id !== output.id) });
    });
  }

  const validators = {
    output: () => form.validate({ output: draft.output ? "" : "Elige qué se prepara." }),
    yield: () => form.validate({
      yield: !Number.isFinite(yieldAmount) || yieldAmount <= 0 ? "Escribe cuánto produce una tanda, mayor que cero." : "",
      unit: !yieldUnit ? "Elige la unidad de lo que produce." : "",
      days: !Number.isInteger(decimalInput(draft.shelfLife)) || decimalInput(draft.shelfLife) < 0 ? "Escribe días enteros, desde cero." : "",
    }),
    inputs: () => form.validate({
      items: !draft.rows.length ? "Agrega al menos un ingrediente." : "",
      ...Object.fromEntries(draft.rows.map((row, index) => [`row.${index}`, quantityError(row.quantity)])),
    }),
  };
  const go = (step: Step, check?: () => boolean) => { if (!check || check()) { setMessage(""); update({ step }); } };

  function save() {
    return gate.run(async () => {
      if (!validators.output()) { update({ step: "output" }); return; }
      if (!validators.yield()) { update({ step: "yield" }); return; }
      if (!validators.inputs()) { update({ step: "inputs" }); return; }
      if (!form.validate({ name: required(draft.name, "el nombre de la receta") }) || !draft.output || !yieldUnit) return;
      if (!draft.active && !await confirmAction("No se podrán registrar producciones nuevas con esta receta. Los lotes existentes se conservan.", { title: "Desactivar receta de producción", acceptLabel: "Guardar receta inactiva", cancelLabel: "Seguir editando" })) return;
      setMessage("");
      try {
        for (const row of draft.rows) {
          const current = await api<Ingredient>(`/ingredients/${row.ingredient_id}`, token, { cache: "reload" });
          if (!current.active || current.base_unit_id !== row.base_unit_id) { setMessage(`Revisa ${row.name}: cambió su disponibilidad o unidad. No se guardó la receta.`, "error"); return; }
        }
        const recipe = await api<ProductionRecipe>(draft.id ? `/production-recipes/${draft.id}` : "/production-recipes", token, {
          method: draft.id ? "PUT" : "POST",
          body: JSON.stringify({ name: draft.name.trim(), output_ingredient_id: draft.output.id, yield_quantity: yieldAmount, yield_unit_id: yieldUnit.id, shelf_life_days: decimalInput(draft.shelfLife), active: draft.active, items: draft.rows.map((row) => ({ ingredient_id: row.ingredient_id, quantity: decimalInput(row.quantity) })) }),
        });
        setDraft(blank()); form.clear();
        setMessage(draft.id ? `Receta “${recipe.name}” actualizada.` : `Receta “${recipe.name}” registrada.`);
        directory.reload(); onSaved(recipe);
      } catch (error) {
        form.fromError(error, { name: "el nombre", output_ingredient_id: "lo que se prepara", yield_quantity: "el rendimiento", yield_unit_id: "la unidad", shelf_life_days: "los días de vida útil", items: "los ingredientes" }, { output_ingredient_id: "output", yield_quantity: "yield", yield_unit_id: "unit", shelf_life_days: "days" });
        setMessage(operationError(error, "guardar la receta", true), "error");
      }
    });
  }

  if (!draft.open) return <Section title="Recetas de producción" subtitle="Cómo preparas masa, salsa u otros insumos a partir de tus ingredientes.">
    <Notice kind={kind} message={message} />
    {isAdministrator && <View style={ops.actionsRow}>
      {dirty && <ActionButton label="Continuar receta pendiente" onPress={() => setDraft({ ...draft, open: true })} />}
      <ActionButton label="Nueva receta de producción" variant={dirty ? "secondary" : "primary"} disabled={gate.busy} onPress={create} />
    </View>}
    <TextInput label="Buscar receta o preparación" value={directory.search} maxLength={100} onChangeText={directory.setSearch} />
    <RemoteListStatus {...directory} count={directory.items.length} emptyText="Aún no hay recetas de producción." onRetry={directory.reload} />
    {directory.items.map((recipe) => <View style={[ops.card, !recipe.active && ops.disabled]} key={recipe.id}>
      <View style={ops.row}>
        <View style={ops.rowGrow}>
          <ThemedText style={ops.strong}>{recipe.name}{!recipe.active ? " (inactiva)" : ""}</ThemedText>
          <ThemedText style={ops.muted}>Produce {quantityText(recipe.yield_quantity)} {recipe.yield_unit?.symbol ?? "u"} de {recipe.output_ingredient?.name ?? "salida sin configurar"} · dura {recipe.shelf_life_days} día(s)</ThemedText>
        </View>
        {isAdministrator && <ActionButton label="Editar" accessibilityLabel={`Editar ${recipe.name}`} variant="secondary" disabled={gate.busy} onPress={() => edit(recipe)} />}
      </View>
      <ThemedText style={ops.muted}>{recipe.items.map((item) => `${item.ingredient?.name ?? `Insumo #${item.ingredient_id}`} ${quantityText(item.quantity)} ${item.ingredient?.base_unit?.symbol ?? "u"}`).join(" · ")}</ThemedText>
    </View>)}
    <Pagination {...directory} onPage={directory.setPage} />
  </Section>;

  return <Section title={draft.id ? "Editar receta de producción" : "Nueva receta de producción"} subtitle={draft.output ? `Prepara ${draft.output.name}` : "Define qué preparas y qué consume cada tanda."}>
    <Pressable accessibilityRole="button" disabled={gate.busy} onPress={() => setDraft({ ...draft, open: false })} style={ops.backLink}><ThemedText style={ops.backLinkText}>← Volver al listado</ThemedText></Pressable>
    <WorkflowSteps current={draft.step} items={[
      { key: "output", label: "Qué preparas", detail: "Elige el insumo que obtendrás, por ejemplo Masa." },
      { key: "yield", label: "Rendimiento", detail: "Cuánto sale de una tanda y cuántos días dura." },
      { key: "inputs", label: "Ingredientes", detail: "Qué consume cada tanda." },
      { key: "review", label: "Revisar y guardar" },
    ]} />
    <Notice kind={kind} message={message} />

    {draft.step === "output" && <>
      {draft.output && <ThemedText style={ops.notice}>Prepara: {draft.output.name} ({draft.output.unit})</ThemedText>}
      {!!form.errors.output && <Notice kind="error" message={form.errors.output} />}
      <IngredientSearch token={token} label="Buscar lo que preparas" actionLabel="Elegir" pickedLabel="✓ Elegido" disabled={gate.busy} onPick={(ingredient) => { void chooseOutput(ingredient); }} picked={(ingredient) => ingredient.id === draft.output?.id} />
      <WizardNav onNext={() => go("yield", validators.output)} busy={gate.busy} />
    </>}

    {draft.step === "yield" && <>
      <TextInput label="Cantidad que produce una tanda" required keyboardType="decimal-pad" value={draft.yieldQuantity} editable={!gate.busy} onChangeText={(yieldQuantity) => update({ yieldQuantity })} {...form.field("yield")} />
      {lostUnit && <Notice kind="error" message="La unidad anterior ya no está disponible. Elige una unidad y revisa la cantidad antes de guardar." />}
      <RemoteListStatus loading={units.loading} error={units.error} count={compatible.length} emptyText="No hay unidades compatibles con lo que preparas." onRetry={units.reload} />
      {compatible.length > 0 && <Choices label="Unidad (obligatorio)" value={draft.yieldUnitId} disabled={gate.busy} error={form.errors.unit} onChange={(yieldUnitId) => update({ yieldUnitId })} options={compatible.map((unit) => ({ key: unit.id, label: `${unit.name} (${unit.symbol})` }))} />}
      {perBatch !== null && <ThemedText style={ops.notice} accessibilityLiveRegion="polite">Una tanda suma {quantityText(perBatch)} {draft.output?.unit} de {draft.output?.name} al inventario.</ThemedText>}
      <TextInput label="¿Cuántos días dura?" required keyboardType="number-pad" value={draft.shelfLife} editable={!gate.busy} onChangeText={(shelfLife) => update({ shelfLife })} {...form.field("days")} />
      <WizardNav onBack={() => go("output")} onNext={() => go("inputs", validators.yield)} busy={gate.busy} />
    </>}

    {draft.step === "inputs" && <>
      <ThemedText style={ops.subtitle}>Ingredientes por tanda · {draft.rows.length}</ThemedText>
      {!!form.errors.items && <Notice kind="error" message={form.errors.items} />}
      {draft.rows.map((row, index) => <View key={row.ingredient_id} style={[ops.insetCard, ops.row, { alignItems: "flex-start" }]}>
        <TextInput style={ops.fieldGrow} label={`Cantidad de ${row.name} (${row.unit})`} required keyboardType="decimal-pad" value={row.quantity} editable={!gate.busy} onChangeText={(quantity) => update({ rows: draft.rows.map((current, i) => i === index ? { ...current, quantity } : current) })} {...form.field(`row.${index}`)} />
        <ActionButton label="Quitar" accessibilityLabel={`Quitar ${row.name}`} variant="destructive" disabled={gate.busy} onPress={() => update({ rows: draft.rows.filter((_, i) => i !== index) })} />
      </View>)}
      <IngredientSearch token={token} disabled={gate.busy} onPick={(ingredient) => ingredient.base_unit && update({ rows: [...draft.rows, { ingredient_id: ingredient.id, name: ingredient.name, unit: ingredient.base_unit.symbol, base_unit_id: ingredient.base_unit_id, quantity: "" }] })} picked={(ingredient) => ingredient.id === draft.output?.id || draft.rows.some((row) => row.ingredient_id === ingredient.id)} />
      <WizardNav onBack={() => go("yield")} onNext={() => go("review", validators.inputs)} busy={gate.busy} nextLabel="Revisar →" />
    </>}

    {draft.step === "review" && <>
      <TextInput label="Nombre de la receta" required maxLength={150} value={draft.name} editable={!gate.busy} onChangeText={(name) => update({ name })} {...form.field("name")} />
      <View style={ops.insetCard}>
        <ThemedText style={ops.strong}>Cada tanda</ThemedText>
        <ThemedText>Produce {perBatch !== null ? `${quantityText(perBatch)} ${draft.output?.unit}` : "—"} de {draft.output?.name} · dura {draft.shelfLife} día(s)</ThemedText>
        {draft.rows.map((row) => <ThemedText key={row.ingredient_id}>• Consume {row.name}: {row.quantity.trim().replace(",", ".")} {row.unit}</ThemedText>)}
      </View>
      {!!draft.id && <Pressable accessibilityRole="checkbox" aria-checked={draft.active} onPress={() => update({ active: !draft.active })} style={[ops.chip, draft.active && ops.chipActive, ops.fullWidthButton]}><ThemedText style={draft.active ? ops.chipTextActive : undefined}>{draft.active ? "✓ Receta activa" : "Receta inactiva (no se podrá producir)"}</ThemedText></Pressable>}
      <WizardNav onBack={() => go("inputs")} onNext={save} busy={gate.busy} nextLabel={draft.id ? "Guardar cambios" : "Guardar receta"} />
    </>}
  </Section>;
}
