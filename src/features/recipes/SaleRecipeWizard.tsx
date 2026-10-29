import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../api";
import { ActionButton } from "../../components/ActionButton";
import { confirmAction } from "../../components/ConfirmationDialog";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { Notice, useFeedback } from "../../components/Notice";
import { RemoteListStatus } from "../../components/RemoteListStatus";
import { useActionGate } from "../../forms/useActionGate";
import { useFormErrors } from "../../forms/useFormErrors";
import { decimalInput, operationError, required } from "../../forms/validation";
import { useRemoteResource } from "../../hooks/useRemoteResource";
import { useResponsiveLayout } from "../../layout/responsive";
import type { Page } from "../../loadState";
import { ThemedText } from "../../theme/ThemedText";
import type { Ingredient } from "../operations/types";
import { Choices, Section, useOpsStyles, WorkflowSteps } from "../operations/ui";
import { IngredientSearch, ProductPicker, quantityError, WizardNav, type Destination, type Flavor, type PickedProduct } from "./wizard";

export type Target = "base" | "none" | number;
type Step = "product" | "target" | "ingredients" | "review";
type Row = { ingredient_id: number; name: string; unit: string; base_unit_id: number; component: string; quantities: Record<string, string> };
type RecipeDetail = { id: number; name: string; active: boolean; product_flavor_id: number | null; applies_to_flavors?: boolean; base_only?: boolean; variant: Destination; items: { ingredient_id: number; quantity: string | number; component: string; ingredient?: Ingredient }[] };
export type SaleDraft = {
  open: boolean; step: Step; product: PickedProduct | null; sizes: Destination[]; target: Target | null; baseOnly: boolean;
  name: string; rows: Row[]; recipeIds: Record<string, number | null>; inactive: Record<string, boolean>; loadedFor: string; baseline: string;
};
export const blankSaleDraft = (): SaleDraft => ({ open: false, step: "product", product: null, sizes: [], target: null, baseOnly: false, name: "", rows: [], recipeIds: {}, inactive: {}, loadedFor: "", baseline: "" });
export const saleSignature = (draft: SaleDraft) => JSON.stringify([draft.product?.id, draft.sizes.map((size) => size.id), draft.target, draft.baseOnly, draft.name, draft.rows]);

const components: { key: string; label: string }[] = [{ key: "base", label: "Base" }, { key: "topping", label: "Cobertura" }, { key: "sauce", label: "Salsa" }, { key: "packaging", label: "Empaque" }, { key: "other", label: "Otro" }];
const slotFor = (size: Destination, target: Target | null) => target === null ? undefined : size.recipes?.find((slot) => typeof target === "number" ? slot.product_flavor_id === target : slot.product_flavor_id === null);
const hasBase = (size: Destination) => !!size.recipes?.some((slot) => slot.product_flavor_id === null && slot.applies_to_flavors && slot.active);
const hasLegacyFlavorless = (size: Destination) => !!size.recipes?.some((slot) => slot.product_flavor_id === null && !slot.applies_to_flavors);
export const targetLabel = (target: Target | null, flavors: Flavor[]) => target === "base" ? "Base para todos los sabores" : target === "none" ? "Venta sin sabor" : target === null ? "Sin elegir" : flavors.find((flavor) => flavor.id === target)?.name ?? "Sabor no disponible";
const loadKey = (draft: SaleDraft) => JSON.stringify([draft.target, draft.sizes.map((size) => size.id)]);

export type { RecipeDetail };
/** Opens a saved recipe directly on its ingredients, with its size and flavor already chosen. */
export function draftFromRecipe(recipe: RecipeDetail, size: Destination): SaleDraft {
  const product: PickedProduct = { id: size.product.id, name: size.product.name, type: size.product.type, flavors: (size.product.flavors ?? []).filter((flavor) => flavor.active) };
  const target: Target = recipe.product_flavor_id ?? (recipe.applies_to_flavors ? "base" : "none");
  const rows: Row[] = recipe.items.map((item) => ({ ingredient_id: item.ingredient_id, name: item.ingredient?.name ?? "Ingrediente no disponible", unit: item.ingredient?.base_unit?.symbol ?? "", base_unit_id: item.ingredient?.base_unit_id ?? 0, component: item.component, quantities: { [size.id]: String(Number(item.quantity)) } }));
  const draft: SaleDraft = { ...blankSaleDraft(), open: true, step: recipe.base_only ? "review" : "ingredients", product, sizes: [size], target, baseOnly: !!recipe.base_only, name: recipe.name, rows, recipeIds: { [size.id]: recipe.id }, inactive: { [size.id]: !recipe.active } };
  draft.loadedFor = loadKey(draft);
  return { ...draft, baseline: saleSignature(draft) };
}

/** Guided sale recipe editor: product and sizes → flavor → ingredients → review. */
export function SaleRecipeWizard({ token, draft, setDraft, onSaved, onClose }: {
  token: string;
  draft: SaleDraft;
  setDraft: (next: SaleDraft) => void;
  onSaved: (message: string) => void;
  onClose: () => void;
}) {
  const ops = useOpsStyles();
  const { compact } = useResponsiveLayout();
  const gate = useActionGate();
  const form = useFormErrors();
  const [message, setMessage, kind] = useFeedback("info");
  const [conflict, setConflict] = useState(false);
  const update = (patch: Partial<SaleDraft>) => { if (!gate.busy) setDraft({ ...draft, ...patch }); };
  const flavors = draft.product?.flavors ?? [];
  const hasFlavors = flavors.length > 0;
  const variants = useRemoteResource<Page<Destination>>(draft.product && draft.step === "product" ? `/recipes/destinations?product_id=${draft.product.id}` : null, token, "los tamaños del producto");
  const allBase = draft.sizes.length > 0 && draft.sizes.every(hasBase);
  const baseMode = draft.target === "base" || (typeof draft.target === "number" && allBase);
  const defaultComponent = draft.target === "base" ? "base" : typeof draft.target === "number" && allBase ? "topping" : "base";
  const showComponents = !baseMode && hasFlavors;

  function pickProduct(product: PickedProduct) {
    return gate.run(async () => {
      if (draft.product?.id === product.id) return;
      if (draft.product && draft.rows.length && !await confirmAction(`Los ingredientes se conservarán y se usarán para ${product.name}. Revisa las cantidades por tamaño.`, { title: "Cambiar de producto", acceptLabel: "Cambiar producto", cancelLabel: "Conservar producto" })) return;
      setDraft({ ...draft, product, sizes: [], target: product.flavors.length ? null : "none", recipeIds: {}, inactive: {}, loadedFor: "", rows: draft.rows.map((row) => ({ ...row, quantities: {} })) });
    });
  }

  function toggleSize(size: Destination) {
    const selected = draft.sizes.some((current) => current.id === size.id);
    update({ sizes: selected ? draft.sizes.filter((current) => current.id !== size.id) : [...draft.sizes, size].sort((a, b) => a.id - b.id) });
  }

  /** Loads saved recipes for the chosen sizes so editing never starts from a blank copy by mistake. */
  async function loadExisting(): Promise<SaleDraft | null> {
    const key = loadKey(draft);
    if (draft.loadedFor === key) return draft;
    const occupied = draft.sizes.map((size) => [size, slotFor(size, draft.target)] as const).filter(([, slot]) => !!slot);
    let next: SaleDraft = { ...draft, recipeIds: Object.fromEntries(draft.sizes.map((size) => [size.id, null])), inactive: {}, loadedFor: key };
    if (!occupied.length) return next;
    const names = occupied.map(([size]) => size.name).join(", ");
    const useSaved = !draft.rows.length || await confirmAction(`${targetLabel(draft.target, flavors)} ya tiene receta guardada en ${names}. Puedes cargarla o reemplazarla con las cantidades que ya escribiste.`, { title: "Ya existe una receta", acceptLabel: "Cargar la receta guardada", cancelLabel: "Usar mis cantidades" });
    try {
      const saved = await Promise.all(occupied.map(([, slot]) => api<RecipeDetail>(`/recipes/${slot!.id}`, token, { cache: "reload" })));
      const rows = useSaved ? draft.rows.map((row) => ({ ...row, quantities: Object.fromEntries(Object.entries(row.quantities).filter(([sizeId]) => !occupied.some(([size]) => String(size.id) === sizeId))) })) : [...draft.rows];
      saved.forEach((recipe) => {
        next.recipeIds[recipe.variant.id] = recipe.id;
        next.inactive[recipe.variant.id] = !recipe.active;
        if (!useSaved) return;
        recipe.items.forEach((item) => {
          let row = rows.find((candidate) => candidate.ingredient_id === item.ingredient_id && candidate.component === item.component);
          if (!row) {
            row = { ingredient_id: item.ingredient_id, name: item.ingredient?.name ?? "Ingrediente no disponible", unit: item.ingredient?.base_unit?.symbol ?? "", base_unit_id: item.ingredient?.base_unit_id ?? 0, component: item.component, quantities: {} };
            rows.push(row);
          }
          row.quantities = { ...row.quantities, [recipe.variant.id]: String(Number(item.quantity)) };
        });
      });
      next = { ...next, rows: rows.filter((row) => Object.values(row.quantities).some((value) => value.trim()) || !useSaved), name: next.name || saved[0].name, baseOnly: useSaved ? saved.every((recipe) => recipe.base_only) : next.baseOnly };
      return next;
    } catch (error) {
      setMessage(operationError(error, "cargar la receta guardada"), "error");
      return null;
    }
  }

  function goTarget() {
    if (!form.validate({ sizes: draft.sizes.length ? "" : "Elige al menos un tamaño." })) return;
    setMessage("");
    if (hasFlavors) { update({ step: "target" }); return; }
    return gate.run(async () => { const next = await loadExisting(); if (next) setDraft({ ...next, target: "none", step: "ingredients" }); });
  }

  function goIngredients() {
    if (!form.validate({ target: draft.target === null ? "Elige para qué sabor es esta receta." : "" })) return;
    return gate.run(async () => {
      const next = await loadExisting();
      if (!next) return;
      const baseOnly = next.baseOnly && typeof next.target === "number" && allBase;
      setDraft({ ...next, baseOnly, step: baseOnly ? "review" : "ingredients", name: next.name || defaultName(next) });
    });
  }
  const defaultName = (current: SaleDraft) => hasFlavors ? `${current.product?.name ?? "Receta"} · ${targetLabel(current.target, flavors)}` : current.product?.name ?? "Receta";

  function addIngredient(ingredient: Ingredient) {
    if (!ingredient.base_unit) return;
    update({ rows: [...draft.rows, { ingredient_id: ingredient.id, name: ingredient.name, unit: ingredient.base_unit.symbol, base_unit_id: ingredient.base_unit_id, component: defaultComponent, quantities: {} }] });
  }
  const setRow = (index: number, patch: Partial<Row>) => update({ rows: draft.rows.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const fieldKey = (index: number, sizeId: number) => `q.${index}.${sizeId}`;

  function validateIngredients(): boolean {
    const errors: Record<string, string> = {};
    draft.rows.forEach((row, index) => draft.sizes.forEach((size) => {
      const value = row.quantities[size.id] ?? "";
      if (value.trim()) errors[fieldKey(index, size.id)] = quantityError(value);
    }));
    const emptySize = draft.sizes.find((size) => !draft.rows.some((row) => (row.quantities[size.id] ?? "").trim()));
    errors.items = !draft.rows.length ? "Agrega al menos un ingrediente." : emptySize ? `Escribe al menos una cantidad para ${emptySize.name}.` : "";
    const unused = draft.rows.find((row) => !draft.sizes.some((size) => (row.quantities[size.id] ?? "").trim()));
    if (!errors.items && unused) errors.items = `${unused.name} no tiene cantidad en ningún tamaño. Escríbela o quítalo.`;
    return form.validate(errors);
  }
  function goReview() { if (validateIngredients()) { setMessage(""); update({ step: "review", name: draft.name || defaultName(draft) }); } }

  function save() {
    return gate.run(async () => {
      setConflict(false); setMessage("");
      if (!form.validate({ name: required(draft.name, "el nombre de la receta") }) || draft.target === null || !draft.product) return;
      if (!draft.baseOnly && !validateIngredients()) { setDraft({ ...draft, step: "ingredients" }); return; }
      try {
        // Revalidate the exact sizes; never trust the list loaded minutes ago.
        const fresh = await Promise.all(draft.sizes.map((size) => api<Destination>(`/recipes/destinations/${size.id}`, token, { cache: "reload" })));
        for (const size of fresh) {
          const slot = slotFor(size, draft.target);
          if (!size.active || !size.product.active) { setMessage(`${size.product.name} ${size.name} ya no está disponible. Quítalo de los tamaños.`, "error"); return; }
          if (slot && slot.id !== (draft.recipeIds[size.id] ?? null)) {
            setDraft({ ...draft, sizes: fresh, loadedFor: "" }); setConflict(true);
            setMessage(`Ya existe una receta de ${targetLabel(draft.target, flavors)} en ${size.name}. Puede que un guardado anterior sí se completara. Carga la receta guardada antes de continuar.`, "warning");
            return;
          }
        }
        if (draft.baseOnly && !fresh.every(hasBase)) { setMessage("Algún tamaño ya no tiene base activa. Crea primero la base para todos los sabores.", "error"); return; }
        const used = [...new Map(draft.rows.map((row) => [row.ingredient_id, row])).values()];
        if (!draft.baseOnly) for (const row of used) {
          const ingredient = await api<Ingredient>(`/ingredients/${row.ingredient_id}`, token, { cache: "reload" });
          if (!ingredient.active || ingredient.base_unit_id !== row.base_unit_id) { setMessage(`Revisa ${row.name}: cambió su disponibilidad o unidad. No se guardó la receta.`, "error"); return; }
        }
        await api("/recipes/batch", token, { method: "POST", body: JSON.stringify({ recipes: fresh.map((size) => ({
          id: draft.recipeIds[size.id] ?? null,
          product_variant_id: size.id,
          product_flavor_id: typeof draft.target === "number" ? draft.target : null,
          applies_to_flavors: draft.target === "base",
          base_only: draft.baseOnly,
          name: draft.name.trim(),
          active: true,
          items: draft.baseOnly ? [] : draft.rows.filter((row) => (row.quantities[size.id] ?? "").trim()).map((row) => ({ ingredient_id: row.ingredient_id, quantity: decimalInput(row.quantities[size.id]), component: row.component })),
        })) }) });
        const sizes = draft.sizes.map((size) => size.name).join(", ");
        form.clear();
        onSaved(hasFlavors ? `Receta de ${targetLabel(draft.target, flavors)} guardada para ${sizes}.` : `Receta guardada para ${sizes}.`);
      } catch (error) {
        setMessage(operationError(error, "guardar la receta", true) + " Si el resultado no se confirmó, revisa el listado antes de repetir.", "error");
      }
    });
  }

  async function close() {
    if (draft.rows.length && !await confirmAction("La receta sigue guardada como borrador en este equipo. Puedes continuarla desde el listado.", { title: "Volver al listado", acceptLabel: "Volver al listado", cancelLabel: "Seguir editando" })) return;
    onClose();
  }

  const steps = [
    { key: "product", label: "Producto y tamaños", detail: "Elige el producto y los tamaños que comparten esta receta." },
    ...(hasFlavors ? [{ key: "target", label: "Sabor", detail: "La base se usa en todos los sabores; cada sabor agrega lo suyo." }] : []),
    { key: "ingredients", label: "Ingredientes", detail: "Escribe la cantidad de cada ingrediente por tamaño." },
    { key: "review", label: "Revisar y guardar", detail: "Confirma antes de guardar." },
  ];
  const sizeLabel = draft.sizes.map((size) => size.name).join(", ");
  const loadedVariants = (variants.data?.data ?? []).filter((size) => size.active);

  return <Section title={draft.loadedFor && Object.values(draft.recipeIds).some(Boolean) ? "Editar receta de venta" : "Nueva receta de venta"} subtitle={draft.product ? `${draft.product.name}${sizeLabel ? ` · ${sizeLabel}` : ""}${draft.target !== null && hasFlavors ? ` · ${targetLabel(draft.target, flavors)}` : ""}` : "Define qué se descuenta del inventario al vender."}>
    <Pressable accessibilityRole="button" onPress={close} disabled={gate.busy} style={ops.backLink}><ThemedText style={ops.backLinkText}>← Volver al listado</ThemedText></Pressable>
    <WorkflowSteps current={draft.step} items={steps} />
    <Notice kind={kind} message={message} />
    {conflict && <ActionButton label="Cargar la receta guardada" variant="secondary" disabled={gate.busy} onPress={goIngredients} />}

    {draft.step === "product" && <>
      <ProductPicker token={token} selectedId={draft.product?.id ?? null} onPick={(product) => { void pickProduct(product); }} disabled={gate.busy} />
      {draft.product && <>
        <RemoteListStatus loading={variants.loading} error={variants.error} count={loadedVariants.length} emptyText="Este producto no tiene tamaños activos." onRetry={variants.reload} />
        {loadedVariants.length > 0 && <View style={ops.choiceGroup}>
          <ThemedText style={ops.label}>¿Para qué tamaños? (obligatorio)</ThemedText>
          <ThemedText style={ops.muted}>Elige varios si llevan los mismos ingredientes; después escribes la cantidad de cada uno.</ThemedText>
          <View style={ops.chips}>{loadedVariants.map((size) => {
            const checked = draft.sizes.some((current) => current.id === size.id);
            return <Pressable key={size.id} accessibilityRole="checkbox" accessibilityLabel={size.name} aria-checked={checked} aria-disabled={gate.busy} disabled={gate.busy} onPress={() => toggleSize(size)} style={[ops.chip, checked && ops.chipActive]}>
              <ThemedText style={checked ? ops.chipTextActive : undefined}>{checked ? "✓ " : ""}{size.name}</ThemedText>
            </Pressable>;
          })}</View>
          {loadedVariants.length > 1 && <Pressable accessibilityRole="button" onPress={() => update({ sizes: loadedVariants })} style={ops.backLink}><ThemedText style={ops.backLinkText}>Elegir todos los tamaños</ThemedText></Pressable>}
          {!!form.errors.sizes && <ThemedText accessibilityRole="alert" style={ops.fieldError}>Error: {form.errors.sizes}</ThemedText>}
        </View>}
      </>}
      <WizardNav onNext={goTarget} busy={gate.busy} nextDisabled={!draft.product} disabledReason="Elige un producto para continuar." />
    </>}

    {draft.step === "target" && <>
      <Choices label="¿Para qué sabor es esta receta? (obligatorio)" value={draft.target} disabled={gate.busy} error={form.errors.target} onChange={(target) => update({ target, baseOnly: false })} options={[
        { key: "base" as Target, label: "Base para todos los sabores", hint: coverage("base") },
        ...(draft.sizes.some(hasLegacyFlavorless) ? [{ key: "none" as Target, label: "Venta sin sabor", hint: coverage("none") }] : []),
        ...flavors.map((flavor) => ({ key: flavor.id as Target, label: flavor.name, hint: coverage(flavor.id) })),
      ]} />
      {draft.target === "base" && <ThemedText style={ops.notice}>La base (masa, salsa, queso, caja…) se descuenta una vez en cada venta, con cualquier sabor. En cada sabor registra solo lo que agrega.</ThemedText>}
      {draft.target === "base" && draft.sizes.some(hasLegacyFlavorless) && <Notice kind="warning" message="Algún tamaño tiene una receta de venta sin sabor. Al convertirla en base se descontará también en cada sabor: revisa que los sabores no repitan esos ingredientes." />}
      {typeof draft.target === "number" && (allBase
        ? <Pressable accessibilityRole="checkbox" aria-checked={draft.baseOnly} onPress={() => update({ baseOnly: !draft.baseOnly })} style={[ops.chip, draft.baseOnly && ops.chipActive, ops.fullWidthButton]}>
          <ThemedText style={draft.baseOnly ? ops.chipTextActive : undefined}>{draft.baseOnly ? "✓ Este sabor usa solo la base" : "Este sabor no agrega ingredientes (usa solo la base)"}</ThemedText>
        </Pressable>
        : <ThemedText style={ops.muted}>{draft.sizes.some(hasBase) ? "Solo algunos tamaños tienen base. " : ""}Sin base, registra todos los ingredientes de este sabor (masa incluida).</ThemedText>)}
      <WizardNav onBack={() => update({ step: "product" })} onNext={goIngredients} busy={gate.busy} nextLabel={draft.baseOnly ? "Revisar →" : "Siguiente →"} />
    </>}

    {draft.step === "ingredients" && <>
      {baseMode && <ThemedText style={ops.muted}>{draft.target === "base" ? "Agrega lo que llevan todos los sabores." : `Agrega solo lo que distingue a ${targetLabel(draft.target, flavors)}; la base ya se descuenta aparte.`}{draft.sizes.length > 1 ? " Deja vacío un tamaño si no lleva ese ingrediente." : ""}</ThemedText>}
      <ThemedText style={ops.subtitle}>En la receta · {draft.rows.length}</ThemedText>
      {!!form.errors.items && <Notice kind="error" message={form.errors.items} />}
      {!draft.rows.length && <ThemedText style={ops.muted}>Busca abajo un ingrediente y pulsa Agregar.</ThemedText>}
      {draft.rows.map((row, index) => <View key={`${row.ingredient_id}:${row.component}`} style={ops.card}>
        <View style={ops.row}>
          <ThemedText style={[ops.strong, ops.rowGrow]}>{row.name}{row.unit ? ` (${row.unit})` : ""}</ThemedText>
          <ActionButton label="Quitar" accessibilityLabel={`Quitar ${row.name}`} variant="destructive" disabled={gate.busy} onPress={() => update({ rows: draft.rows.filter((_, i) => i !== index) })} />
        </View>
        <View style={[ops.inline, compact && ops.inlineCompact, { flexWrap: "wrap" }]}>
          {draft.sizes.map((size) => <TextInput key={size.id} style={[ops.fieldGrow, { minWidth: 120 }]} label={draft.sizes.length > 1 ? `${size.name} (${row.unit})` : `Cantidad (${row.unit})`} accessibilityLabel={draft.sizes.length > 1 ? `Cantidad de ${row.name} en ${size.name}` : `Cantidad de ${row.name}`} keyboardType="decimal-pad" value={row.quantities[size.id] ?? ""} editable={!gate.busy} onChangeText={(value) => setRow(index, { quantities: { ...row.quantities, [size.id]: value } })} {...form.field(fieldKey(index, size.id))} />)}
        </View>
        {draft.sizes.length > 1 && !!(row.quantities[draft.sizes[0].id] ?? "").trim() && <Pressable accessibilityRole="button" accessibilityLabel={`Usar la cantidad de ${draft.sizes[0].name} en todos los tamaños para ${row.name}`} onPress={() => setRow(index, { quantities: Object.fromEntries(draft.sizes.map((size) => [size.id, row.quantities[draft.sizes[0].id]])) })} style={ops.backLink}><ThemedText style={ops.backLinkText}>Usar la misma cantidad en todos</ThemedText></Pressable>}
        {showComponents && <Choices label="Al combinar sabores" value={row.component} disabled={gate.busy} onChange={(component) => setRow(index, { component })} options={components} />}
      </View>)}
      {showComponents && draft.rows.length > 0 && <ThemedText style={ops.muted}>{draft.product?.type === "pizza" ? "En mitad y mitad, Base, Salsa y Empaque se usan completos; Cobertura y Otro se reparten." : "Al combinar sabores, Salsa se reparte; lo demás se toma completo."}</ThemedText>}
      <ThemedText style={ops.subtitle}>Agregar ingrediente</ThemedText>
      <IngredientSearch token={token} disabled={gate.busy} onPick={addIngredient} picked={(ingredient) => draft.rows.some((row) => row.ingredient_id === ingredient.id && row.component === defaultComponent)} />
      <WizardNav onBack={() => update({ step: hasFlavors ? "target" : "product" })} onNext={goReview} busy={gate.busy} nextLabel="Revisar →" />
    </>}

    {draft.step === "review" && <>
      <TextInput label="Nombre de la receta" required maxLength={150} value={draft.name} editable={!gate.busy} onChangeText={(name) => update({ name })} {...form.field("name")} />
      {draft.sizes.map((size) => {
        const rows = draft.rows.filter((row) => (row.quantities[size.id] ?? "").trim());
        const existing = draft.recipeIds[size.id];
        return <View key={size.id} style={ops.insetCard}>
          <View style={ops.row}>
            <ThemedText style={ops.strong}>{size.name}</ThemedText>
            <ThemedText style={[ops.statusPill, existing ? ops.pillWarning : ops.pillGood]}>{existing ? draft.inactive[size.id] ? "Se actualiza y reactiva" : "Se actualiza" : "Receta nueva"}</ThemedText>
          </View>
          {draft.baseOnly ? <ThemedText style={ops.muted}>Usa solo la base de este tamaño.</ThemedText> : rows.map((row) => <ThemedText key={`${row.ingredient_id}:${row.component}`}>• {row.name}: {row.quantities[size.id].trim().replace(",", ".")} {row.unit}{showComponents ? ` · ${components.find((c) => c.key === row.component)?.label}` : ""}</ThemedText>)}
        </View>;
      })}
      <ThemedText style={ops.muted}>Guardar no mueve inventario: se descontará al enviar cada venta a cocina.</ThemedText>
      <WizardNav onBack={() => update({ step: draft.baseOnly ? "target" : "ingredients" })} onNext={save} busy={gate.busy} nextLabel={draft.sizes.length > 1 ? `Guardar ${draft.sizes.length} recetas` : "Guardar receta"} />
    </>}
  </Section>;

  function coverage(target: Target): string {
    const existing = draft.sizes.filter((size) => slotFor(size, target)).map((size) => size.name);
    if (!draft.sizes.length) return "";
    if (!existing.length) return "Nueva en todos los tamaños";
    return existing.length === draft.sizes.length ? "Ya existe: se edita" : `Ya existe en ${existing.join(", ")}`;
  }
}
