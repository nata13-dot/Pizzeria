import { useState } from "react";
import { View } from "react-native";
import { api } from "../../api";
import { ActionButton } from "../../components/ActionButton";
import { confirmAction } from "../../components/ConfirmationDialog";
import { FloatingTextInput as Field } from "../../components/FloatingTextInput";
import { Notice, useFeedback } from "../../components/Notice";
import { Pagination, RemoteListStatus } from "../../components/RemoteListStatus";
import { useActionGate } from "../../forms/useActionGate";
import { operationError } from "../../forms/validation";
import { usePaginatedResource } from "../../hooks/useRemoteResource";
import { ThemedText } from "../../theme/ThemedText";
import { useWorkField, useWorkGuard } from "../../work/WorkProvider";
import { Section, useOpsStyles } from "../operations/ui";
import { BaseSplitTool } from "./BaseSplitTool";
import { blankSaleDraft, draftFromRecipe, saleSignature, SaleRecipeWizard, type RecipeDetail, type SaleDraft } from "./SaleRecipeWizard";
import type { Destination } from "./wizard";

type RecipeRow = { id: number; name: string; active: boolean; product_flavor_id: number | null; applies_to_flavors?: boolean; base_only?: boolean; items_count?: number; variant: { id: number; name: string; product: { name: string } }; flavor?: { name: string } | null };

const purpose = (recipe: RecipeRow) => recipe.flavor?.name ?? (recipe.applies_to_flavors ? "Base de todos los sabores" : "Sin sabor");

export function SaleRecipes({ token }: { token: string }) {
  const ops = useOpsStyles();
  const [draft, setDraft] = useWorkField<SaleDraft>("recipe", "wizard", blankSaleDraft);
  const [tool, setTool] = useState(false);
  const [message, setMessage, kind] = useFeedback();
  const gate = useActionGate();
  const directory = usePaginatedResource<RecipeRow>("/recipes", token, "las recetas", 300);
  const dirty = saleSignature(draft) !== (draft.baseline || saleSignature(blankSaleDraft()));
  useWorkGuard("recipe", "la receta de venta", dirty, gate.busy, true);

  async function mayReplace() {
    return !dirty || await confirmAction("Se reemplazará la receta que tienes sin guardar.", { title: "Reemplazar receta sin guardar", acceptLabel: "Reemplazar receta", cancelLabel: "Conservar borrador" });
  }
  const create = () => gate.run(async () => { if (await mayReplace()) { setMessage(""); setDraft({ ...blankSaleDraft(), open: true }); } });
  const openRecipe = (id: number) => gate.run(async () => {
    if (!await mayReplace()) return;
    try {
      const recipe = await api<RecipeDetail>(`/recipes/${id}`, token, { cache: "reload" });
      const size = await api<Destination>(`/recipes/destinations/${recipe.variant.id}`, token, { cache: "reload" });
      setMessage(""); setDraft(draftFromRecipe(recipe, size));
    } catch (error) { setMessage(operationError(error, "abrir la receta"), "error"); }
  });
  const toggle = (recipe: RecipeRow) => gate.run(async () => {
    if (recipe.active && !await confirmAction(`${recipe.name} dejará de usarse en ventas nuevas de ${recipe.variant.product.name} ${recipe.variant.name}. No cambia el inventario ni los pedidos registrados.`, { title: "Desactivar receta", acceptLabel: "Desactivar receta", cancelLabel: "Conservar receta" })) return;
    try {
      await api(`/recipes/${recipe.id}`, token, recipe.active ? { method: "DELETE" } : { method: "PATCH", body: JSON.stringify({ active: true }) });
      setMessage(recipe.active ? `${recipe.name} fue desactivada.` : `${recipe.name} está activa de nuevo.`); directory.reload();
    } catch (error) {
      const errors = typeof error === "object" && error && "errors" in error ? (error as { errors?: Record<string, unknown> }).errors : undefined;
      setMessage(errors?.base_only ? "No se puede desactivar esta base: hay sabores que usan solo la base. Cámbialos primero." : operationError(error, recipe.active ? "desactivar la receta" : "reactivar la receta", true), "error");
    }
  });

  if (tool) return <BaseSplitTool token={token} onClose={() => setTool(false)} onDone={(done) => { setTool(false); setMessage(done); directory.reload(); }} />;
  if (draft.open) return <SaleRecipeWizard token={token} draft={draft} setDraft={setDraft} onClose={() => setDraft({ ...draft, open: false })} onSaved={(done) => { setDraft(blankSaleDraft()); setMessage(done); directory.reload(); }} />;

  return <Section title="Recetas de venta" subtitle="Lo que se descuenta del inventario al enviar a cocina cada producto vendido. Las preparaciones como masa o salsa se configuran en Producción.">
    <Notice kind={kind} message={message} />
    {dirty && <Notice kind="info" message={`Tienes una receta sin guardar${draft.product ? ` de ${draft.product.name}` : ""}.`} />}
    <View style={ops.actionsRow}>
      {dirty ? <ActionButton label="Continuar receta pendiente" onPress={() => setDraft({ ...draft, open: true })} /> : <ActionButton label="Crear receta" loadingLabel="Abriendo…" disabled={gate.busy} onPress={create} />}
      {dirty && <ActionButton label="Crear receta" variant="secondary" loadingLabel="Abriendo…" disabled={gate.busy} onPress={create} />}
      <ActionButton label="Separar base común" variant="secondary" disabled={gate.busy} onPress={() => setTool(true)} />
    </View>
    <Field label="Buscar receta, producto, tamaño o sabor" value={directory.search} maxLength={100} onChangeText={directory.setSearch} />
    <RemoteListStatus {...directory} count={directory.items.length} emptyText="Aún no hay recetas. Pulsa “Crear receta” para empezar." onRetry={directory.reload} />
    <View style={[ops.chips, { gap: 10 }]}>{directory.items.map((recipe) => <View key={recipe.id} style={[ops.card, { flexBasis: 300, flexGrow: 1 }, !recipe.active && ops.disabled]}>
      <ThemedText style={ops.strong}>{recipe.name}</ThemedText>
      <ThemedText style={ops.muted}>{recipe.variant.product.name} · {recipe.variant.name} · {purpose(recipe)}</ThemedText>
      <View style={ops.actionsRow}>
        {!recipe.active && <ThemedText style={[ops.statusPill, ops.pillNeutral]}>Inactiva</ThemedText>}
        {recipe.base_only && <ThemedText style={[ops.statusPill, ops.pillGood]}>Solo base</ThemedText>}
        {recipe.applies_to_flavors && <ThemedText style={[ops.statusPill, ops.pillWarning]}>Base común</ThemedText>}
      </View>
      <View style={ops.actionsRow}>
        <ActionButton label="Editar" accessibilityLabel={`Editar receta ${recipe.name}`} variant="secondary" loadingLabel="Abriendo…" disabled={gate.busy} onPress={() => openRecipe(recipe.id)} />
        <ActionButton label={recipe.active ? "Desactivar" : "Reactivar"} accessibilityLabel={`${recipe.active ? "Desactivar" : "Reactivar"} receta ${recipe.name}`} variant={recipe.active ? "destructive" : "secondary"} disabled={gate.busy} onPress={() => toggle(recipe)} />
      </View>
    </View>)}</View>
    <Pagination {...directory} onPage={directory.setPage} />
  </Section>;
}
