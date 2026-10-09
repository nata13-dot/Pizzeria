import {ThemedText} from "../../theme/ThemedText";
import { usePaginatedResource, useRemoteResource } from "../../hooks/useRemoteResource";
import { RemoteListStatus, Pagination } from "../../components/RemoteListStatus";
import { ActionButton } from "../../components/ActionButton";
import { useActionGate } from "../../forms/useActionGate";
import { useFormErrors } from "../../forms/useFormErrors";
import { useWorkField, useWorkGuard } from "../../work/WorkProvider";
import { decimalInput, required, operationError } from "../../forms/validation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useResponsiveLayout } from "../../layout/responsive";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { api } from "../../api";
import type {
  Ingredient,
  ProductionBatch,
  ProductionRecipe,
  Unit,
} from "./types";
import {
  appendUniqueById,
  confirmAction,
  dateText,
  EmptyState,
  Feedback,
  fetchAllPages,
  fetchPage,
  inputNumber,
  LoadingState,
  localDateTimeValue,
  moneyText,
  numberValue,
  useOpsStyles,
  quantityText,
  Section,
  Tabs,
  WorkflowSteps,
} from "./ui";

type ProductionTab = "produce" | "recipes" | "batches";
type RecipeDraftItem = { ingredient_id: number; name: string; unit: string; base_unit_id: number; quantity: string };
type PortionDraft = { id: number; portion_name: string; quantity: number; grams_per_portion: number };

function recipeOutputBaseQuantity(recipe: ProductionRecipe | null, multiplier: number): number {
  if (!recipe?.yield_unit || !recipe.output_ingredient?.base_unit || multiplier <= 0) return 0;
  const outputFactor = numberValue(recipe.output_ingredient.base_unit.base_factor);
  if (outputFactor <= 0) return 0;
  return numberValue(recipe.yield_quantity) * (numberValue(recipe.yield_unit.base_factor) / outputFactor) * multiplier;
}

function productionExpiry(producedAt: string, shelfLifeDays: number): string {
  const date = new Date(producedAt);
  if (!Number.isFinite(date.getTime())) return "Fecha inválida";
  date.setDate(date.getDate() + shelfLifeDays);
  return date.toLocaleDateString();
}

export function ProductionScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const ops=useOpsStyles();
  const { compact, mobile } = useResponsiveLayout();
  const [tab, setTab] = useState<ProductionTab>("produce");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const recipeDirectory = usePaginatedResource<ProductionRecipe>("/production-recipes?paginated=1", token, "las recetas de producción", 300, tab === "recipes");
  const productionDirectory = usePaginatedResource<ProductionRecipe>("/production-recipes?paginated=1&active=1", token, "las preparaciones disponibles", 300, tab === "produce");
  const recipes = recipeDirectory.items;
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [batchPage, setBatchPage] = useState(1);
  const [batchLastPage, setBatchLastPage] = useState(1);
  const [loadingMoreBatches, setLoadingMoreBatches] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastProduction, setLastProduction] = useState<ProductionBatch | null>(null);
  const requestId = useRef(0);
  const saveLock = useRef(false);
  const portionId = useRef(1);

  const [editingRecipeId, setEditingRecipeId] = useWorkField<number | null>("productionRecipe", "editingRecipeId", null);
  const [recipeName, setRecipeName] = useWorkField("productionRecipe", "recipeName", "");
  const [recipeOutputIngredientId, setRecipeOutputIngredientId] = useWorkField<number | null>("productionRecipe", "recipeOutputIngredientId", null);
  const [yieldQuantity, setYieldQuantity] = useWorkField("productionRecipe", "yieldQuantity", "1");
  const [yieldUnitId, setYieldUnitId] = useWorkField<number | null>("productionRecipe", "yieldUnitId", null);
  const [shelfLifeDays, setShelfLifeDays] = useWorkField("productionRecipe", "shelfLifeDays", "1");
  const [recipeActive, setRecipeActive] = useWorkField("productionRecipe", "recipeActive", true);
  const [inputIngredientId, setInputIngredientId] = useWorkField<number | null>("productionRecipe", "inputIngredientId", null);
  const [inputQuantity, setInputQuantity] = useWorkField("productionRecipe", "inputQuantity", "");
  const [recipeItems, setRecipeItems] = useWorkField<RecipeDraftItem[]>("productionRecipe", "recipeItems", []);

  const [productionRecipeId, setProductionRecipeId] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [producedAt, setProducedAt] = useState(localDateTimeValue);
  const [productionNotes, setProductionNotes] = useState("");
  const [portionName, setPortionName] = useState("");
  const [portionQuantity, setPortionQuantity] = useState("");
  const [gramsPerPortion, setGramsPerPortion] = useState("");
  const [portions, setPortions] = useState<PortionDraft[]>([]);

  const recipeGate = useActionGate();
  const recipeForm = useFormErrors();
  const [baseline, setBaseline] = useWorkField("productionRecipe", "baseline", "");
  const snapshot = JSON.stringify([editingRecipeId, recipeName, recipeOutputIngredientId, yieldQuantity, yieldUnitId, shelfLifeDays, recipeActive, recipeItems]);
  const recipeDirty = baseline ? snapshot !== baseline || !!inputQuantity : !!(recipeName.trim() || recipeItems.length || inputQuantity || recipeOutputIngredientId || yieldQuantity !== "1" || shelfLifeDays !== "1");
  useWorkGuard("production-recipe", "la receta de producción", recipeDirty, saving || recipeGate.busy, true);
  async function replaceRecipe(action: () => void) {
    await recipeGate.run(async () => {
      if (recipeDirty && !await confirmAction("Se reemplazarán los cambios de la receta de producción abierta.", {title:"Cambiar de receta",acceptLabel:"Reemplazar cambios",cancelLabel:"Seguir editando"})) return;
      action();
    });
  }
  const activeIngredients = ingredients.filter((ingredient) => ingredient.active);
  const activeUnits = units.filter((unit) => unit.active);
  const ingredientById = useMemo(() => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);
  const recipeOutputIngredient = ingredients.find((ingredient) => ingredient.id === recipeOutputIngredientId) ?? null;
  const compatibleYieldUnits = activeUnits.filter((unit) => unit.dimension === recipeOutputIngredient?.base_unit?.dimension);
  const recipeDetail = useRemoteResource<ProductionRecipe>(productionRecipeId ? `/production-recipes/${productionRecipeId}` : null, token, "la receta seleccionada");
  const selectedRecipe = recipeDetail.data;
  const parsedMultiplier = decimalInput(multiplier);
  const validMultiplier = Number.isFinite(parsedMultiplier) && parsedMultiplier > 0 ? parsedMultiplier : 0;
  const outputBaseQuantity = recipeOutputBaseQuantity(selectedRecipe, validMultiplier);
  const selectedRecipeYieldInGrams = selectedRecipe?.yield_unit?.dimension === "mass"
    ? numberValue(selectedRecipe.yield_quantity) * numberValue(selectedRecipe.yield_unit.base_factor) * validMultiplier
    : 0;
  const portionedGrams = portions.reduce((sum, portion) => sum + portion.quantity * portion.grams_per_portion, 0);
  const producedAtDate = new Date(producedAt);
  const producedAtTimestamp = producedAtDate.getTime();
  const producedAtInstant = Number.isFinite(producedAtTimestamp) ? producedAtDate.toISOString() : null;
  const productionDateValid = producedAtInstant !== null && producedAtTimestamp <= Date.now();
  const inputPreview = (selectedRecipe?.items ?? []).map((item) => {
    const ingredient = item.ingredient ?? ingredients.find((candidate) => candidate.id === item.ingredient_id) ?? null;
    const required = numberValue(item.quantity) * validMultiplier;
    const available = numberValue(ingredient?.current_stock);
    return { ingredientId: item.ingredient_id, ingredient, required, available, shortage: Math.max(0, required - available) };
  });
  const hasKnownShortage = inputPreview.some((item) => item.shortage > 0.00001);

  async function load(initial = false): Promise<void> {
    const currentRequest = ++requestId.current;
    if (!initial) { recipeDirectory.reload(); productionDirectory.reload(); recipeDetail.reload(); }
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const [nextIngredients, nextUnits, nextBatches] = await Promise.all([
        fetchAllPages<Ingredient>("/ingredients", token),
        api<Unit[]>("/catalogs/units", token),
        fetchPage<ProductionBatch>("/production-batches", token),
      ]);
      if (currentRequest !== requestId.current) return;
      setIngredients(nextIngredients);
      setUnits(nextUnits);
      setBatches(nextBatches.data);
      setBatchPage(nextBatches.current_page);
      setBatchLastPage(nextBatches.last_page);
      setInputIngredientId((current) => current ?? nextIngredients.find((ingredient) => ingredient.active)?.id ?? null);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError(operationError(loadError, "cargar la información"));
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  async function loadMoreBatches(): Promise<void> {
    if (loadingMoreBatches || batchPage >= batchLastPage) return;
    const currentRequest = requestId.current;
    setLoadingMoreBatches(true);
    setError("");
    try {
      const next = await fetchPage<ProductionBatch>("/production-batches", token, batchPage + 1);
      if (currentRequest !== requestId.current) return;
      setBatches((current) => appendUniqueById(current, next.data));
      setBatchPage(next.current_page);
      setBatchLastPage(next.last_page);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError(operationError(loadError, "cargar la información"));
    } finally {
      if (currentRequest === requestId.current) setLoadingMoreBatches(false);
    }
  }

  useEffect(() => {
    load(true);
    return () => { requestId.current += 1; };
  }, [token]);

  useEffect(() => {
    if (selectedRecipe && selectedRecipe.yield_unit?.dimension !== "mass" && portions.length) setPortions([]);
  }, [productionRecipeId, selectedRecipe?.yield_unit?.dimension]);

  function resetRecipeForm(): void {
    recipeForm.clear();
    setEditingRecipeId(null);
    setRecipeName("");
    setRecipeOutputIngredientId(null);
    setBaseline("");
    setYieldQuantity("1");
    setYieldUnitId(null);
    setShelfLifeDays("1");
    setRecipeActive(true);
    setRecipeItems([]);
    setInputQuantity("");
  }

  function editRecipe(recipe: ProductionRecipe): void {
    recipeForm.clear();
    setEditingRecipeId(recipe.id);
    setRecipeName(recipe.name);
    setRecipeOutputIngredientId(recipe.output_ingredient_id);
    setYieldQuantity(String(recipe.yield_quantity));
    setYieldUnitId(recipe.yield_unit_id);
    setShelfLifeDays(String(recipe.shelf_life_days));
    setRecipeActive(recipe.active);
    setRecipeItems(recipe.items.map((item) => ({
      ingredient_id: item.ingredient_id,
      name: item.ingredient?.name ?? `Insumo #${item.ingredient_id}`,
      unit: item.ingredient?.base_unit?.symbol ?? "u",
      base_unit_id: item.ingredient?.base_unit_id ?? 0,
      quantity: String(item.quantity),
    })));
    setBaseline(JSON.stringify([recipe.id, recipe.name, recipe.output_ingredient_id, String(recipe.yield_quantity), recipe.yield_unit_id, String(recipe.shelf_life_days), recipe.active, recipe.items.map(item => ({ingredient_id:item.ingredient_id,name:item.ingredient?.name ?? `Insumo #${item.ingredient_id}`,unit:item.ingredient?.base_unit?.symbol ?? "u",base_unit_id:item.ingredient?.base_unit_id ?? 0,quantity:String(item.quantity)}))]));
    setInputQuantity("");
    setError("");
    setMessage("");
    setTab("recipes");
  }

  async function chooseOutput(ingredient: Ingredient) {
    await recipeGate.run(async () => {
      if (recipeOutputIngredientId === ingredient.id) return;
      if (recipeOutputIngredientId && !await confirmAction(`La receta producirá ${ingredient.name}. Revisa el rendimiento: no se convierte automáticamente la cantidad capturada.`, {title:"Cambiar lo que se prepara",acceptLabel:"Cambiar y revisar rendimiento",cancelLabel:"Conservar salida"})) return;
      setRecipeOutputIngredientId(ingredient.id);
      setYieldUnitId(activeUnits.find(unit => unit.id === ingredient.base_unit_id)?.id ?? null);
    });
  }

  function addRecipeItem(): void {
    const ingredient = activeIngredients.find((item) => item.id === inputIngredientId);
    const quantity = decimalInput(inputQuantity);
    if (!ingredient?.base_unit || !Number.isFinite(quantity) || quantity <= 0) {
      setError("Selecciona un insumo y captura una cantidad mayor que cero.");
      return;
    }
    if (recipeItems.some(item => item.ingredient_id === ingredient.id)) { setError("Este ingrediente ya está agregado. Edita su cantidad en la lista."); return; }
    setRecipeItems(current => [...current, {ingredient_id:ingredient.id,name:ingredient.name,unit:ingredient.base_unit?.symbol ?? "u",base_unit_id:ingredient.base_unit_id,quantity:String(quantity)}]);
    setInputQuantity("");
    setError("");
  }

  async function saveRecipe(): Promise<void> {
    if (!isAdministrator || saveLock.current) return;
    const yieldAmount = decimalInput(yieldQuantity);
    const shelfLife = decimalInput(shelfLifeDays);
    const yieldUnit = compatibleYieldUnits.find((unit) => unit.id === yieldUnitId);
    if (!recipeForm.validate({name:required(recipeName,"el nombre de la receta"),output:!recipeOutputIngredient?"Selecciona qué se prepara.":"",yield:!yieldUnit || !Number.isFinite(yieldAmount)||yieldAmount<=0?"Indica cuánto produce y una unidad compatible.":"",days:!Number.isInteger(shelfLife)||shelfLife<0?"Ingresa días enteros, desde cero.":"",items:!recipeItems.length?"Agrega ingredientes.":inputQuantity.trim()?"Agrega o limpia la cantidad pendiente.":"",...Object.fromEntries(recipeItems.map((r,i)=>[`row.${i}`,!Number.isFinite(decimalInput(r.quantity))||decimalInput(r.quantity)<=0?"Ingresa una cantidad mayor que cero.":""]))}) || !recipeOutputIngredient || !yieldUnit) return;
    if (!recipeActive && !await confirmAction("No se podrán registrar nuevas producciones con esta receta. Los lotes existentes se conservan.", {title:"Desactivar receta de producción",acceptLabel:"Guardar receta inactiva",cancelLabel:"Seguir editando"})) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      for (const row of recipeItems) {
        const current = await api<Ingredient>(`/ingredients/${row.ingredient_id}`, token, {cache:"reload"});
        if (!current.active || current.base_unit_id !== row.base_unit_id) {setError(`Revisa ${row.name}: cambió su disponibilidad o unidad. No se guardó la receta.`);return;}
      }
      const recipe = await api<ProductionRecipe>(editingRecipeId ? `/production-recipes/${editingRecipeId}` : "/production-recipes", token, {
        method: editingRecipeId ? "PUT" : "POST",
        body: JSON.stringify({
          name: recipeName.trim(),
          output_ingredient_id: recipeOutputIngredient.id,
          yield_quantity: yieldAmount,
          yield_unit_id: yieldUnit.id,
          shelf_life_days: shelfLife,
          active: recipeActive,
          items: recipeItems.map((item) => ({ ingredient_id: item.ingredient_id, quantity: decimalInput(item.quantity) })),
        }),
      });
      setMessage(editingRecipeId ? `Receta “${recipe.name}” actualizada.` : `Receta “${recipe.name}” registrada.`);
      resetRecipeForm();
      await load();
      setProductionRecipeId(recipe.active ? recipe.id : null);
    } catch (saveError) {
      recipeForm.fromError(saveError, {name:"el nombre",output_ingredient_id:"lo que se prepara",yield_quantity:"el rendimiento",yield_unit_id:"la unidad",shelf_life_days:"los días de vida útil",items:"los ingredientes"}, {output_ingredient_id:"output",yield_quantity:"yield",yield_unit_id:"yield",shelf_life_days:"days"});
      setError(operationError(saveError, "guardar la receta", true));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function addPortion(): void {
    const quantity = inputNumber(portionQuantity);
    const grams = inputNumber(gramsPerPortion);
    if (selectedRecipe?.yield_unit?.dimension !== "mass") {
      setError("Las porciones en gramos solo aplican a recetas con rendimiento de masa.");
      return;
    }
    if (!portionName.trim() || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(grams) || grams <= 0) {
      setError("Captura nombre, número entero de porciones y gramos mayores que cero.");
      return;
    }
    if (portions.some((portion) => portion.portion_name.toLocaleLowerCase() === portionName.trim().toLocaleLowerCase())) {
      setError("Cada tipo de porción debe tener un nombre distinto.");
      return;
    }
    if (portionedGrams + quantity * grams > selectedRecipeYieldInGrams + 0.0001) {
      setError("Las porciones excederían el rendimiento total calculado.");
      return;
    }
    setPortions((current) => [...current, { id: portionId.current++, portion_name: portionName.trim(), quantity, grams_per_portion: grams }]);
    setPortionName("");
    setPortionQuantity("");
    setGramsPerPortion("");
    setError("");
  }

  async function produce(): Promise<void> {
    if (saveLock.current || !selectedRecipe || !selectedRecipe.active || recipeDetail.loading || recipeDetail.error) return;
    if (!validMultiplier || !productionDateValid || !producedAtInstant) {
      setError("La cantidad de tandas debe ser mayor que cero y la fecha no puede estar en el futuro.");
      return;
    }
    if (!outputBaseQuantity) {
      setError("La receta no produce una cantidad base válida; revisa sus unidades y rendimiento.");
      return;
    }
    if (hasKnownShortage) {
      setError("No hay inventario suficiente para los insumos indicados. Corrige existencias antes de producir.");
      return;
    }
    if (portionedGrams > selectedRecipeYieldInGrams + 0.0001) {
      setError("Las porciones declaradas exceden el rendimiento total.");
      return;
    }
    const outputName = selectedRecipe.output_ingredient?.name ?? "insumo de salida";
    if (!(await confirmAction(`¿Registrar esta producción? Consumirá primero los ingredientes que caducan antes y generará ${quantityText(outputBaseQuantity)} ${selectedRecipe.output_ingredient?.base_unit?.symbol ?? "u"} de ${outputName}.`))) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const batch = await api<ProductionBatch>("/production-batches", token, {
        method: "POST",
        body: JSON.stringify({
          production_recipe_id: selectedRecipe.id,
          multiplier: validMultiplier,
          produced_at: producedAtInstant,
          notes: productionNotes.trim() || null,
          outputs: portions.length ? portions.map(({ portion_name, quantity, grams_per_portion }) => ({ portion_name, quantity, grams_per_portion })) : undefined,
        }),
      });
      setLastProduction(batch);
      setMultiplier("1");
      setProducedAt(localDateTimeValue());
      setProductionNotes("");
      setPortions([]);
      setMessage(`Producción #${batch.id} registrada; insumos consumidos y lote de salida creado.`);
      await load();
    } catch (productionError) {
      setError(operationError(productionError, "guardar los cambios", true));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const recipeOutputPreview = useMemo(() => {
    const unit = compatibleYieldUnits.find((candidate) => candidate.id === yieldUnitId);
    const baseUnit = recipeOutputIngredient?.base_unit;
    const amount = decimalInput(yieldQuantity);
    if (!unit || !baseUnit || !Number.isFinite(amount) || amount <= 0) return null;
    return amount * (numberValue(unit.base_factor) / numberValue(baseUnit.base_factor));
  }, [yieldUnitId, yieldQuantity, recipeOutputIngredientId, units]);

  if (loading) return <LoadingState text="Cargando recetas, insumos y lotes de producción..." />;

  return <View style={[ops.screen, mobile && ops.screenMobile]}>
    <View style={[ops.toolbar, mobile && ops.toolbarMobile]}>
      <Tabs
        active={tab}
        items={[
          { key: "produce", label: "Registrar producción" },
          { key: "recipes", label: "Recetas" },
          { key: "batches", label: `Lotes producidos (${batches.length})` },
        ]}
        onChange={(key) => { if (!saving && !recipeGate.busy) setTab(key as ProductionTab); }}
      />
      <Pressable disabled={refreshing || saving || recipeGate.busy} onPress={() => load()} style={[ops.outlineButton, mobile && ops.fullWidthButton, refreshing && ops.disabled]}><ThemedText style={ops.outlineText}>{refreshing ? "Actualizando..." : "Actualizar"}</ThemedText></Pressable>
    </View>
    <Feedback error={error} message={message} />

    {tab === "produce" && <Section title="Registrar producción" compact={mobile}>
      <WorkflowSteps current={!selectedRecipe ? "recipe" : !validMultiplier ? "quantity" : "review"} items={[
        { key: "recipe", label: "Elige la preparación", detail: "Selecciona una receta activa." },
        { key: "quantity", label: "Indica las tandas", detail: "Calcularemos consumo, salida y caducidad." },
        { key: "review", label: "Revisa y produce", detail: "Confirma existencias y cantidades." },
      ]}/>
      <ThemedText style={ops.label}>Receta activa</ThemedText>
      <TextInput label="Buscar preparación" value={productionDirectory.search} maxLength={100} onChangeText={productionDirectory.setSearch} style={ops.input}/>
      <RemoteListStatus {...productionDirectory} count={productionDirectory.items.length} emptyText="No hay recetas activas. Solicita su configuración antes de producir." onRetry={productionDirectory.reload}/>
      <View style={ops.chips}>{productionDirectory.items.map((recipe) => <Pressable disabled={saving || recipeGate.busy} key={recipe.id} onPress={() => setProductionRecipeId(recipe.id)} style={[ops.chip, productionRecipeId === recipe.id && ops.chipActive]}><ThemedText>{recipe.name}</ThemedText></Pressable>)}</View>
      <Pagination {...productionDirectory} onPage={productionDirectory.setPage}/>
      {!!productionRecipeId && <RemoteListStatus {...recipeDetail} count={selectedRecipe ? 1 : 0} emptyText="Selecciona una preparación." onRetry={recipeDetail.reload}/>}
      {selectedRecipe && !selectedRecipe.active && <Feedback error="La receta seleccionada está inactiva. Elige otra preparación."/>}
      {selectedRecipe && <><ThemedText style={ops.subtitle}>Preparación seleccionada: {selectedRecipe.name}</ThemedText>
        <View style={ops.noticeBox}>
          <ThemedText style={ops.notice}>Una tanda produce: {quantityText(recipeOutputBaseQuantity(selectedRecipe, 1))} {selectedRecipe.output_ingredient?.base_unit?.symbol ?? "u"} de {selectedRecipe.output_ingredient?.name ?? "salida sin nombre"}.</ThemedText>
        </View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput editable={!saving && !recipeGate.busy} style={[ops.input, ops.fieldGrow]} value={multiplier} onChangeText={setMultiplier} placeholder="¿Cuántas tandas prepararás?" keyboardType="decimal-pad" />
          <TextInput editable={!saving && !recipeGate.busy} style={[ops.input, ops.fieldGrow]} value={producedAt} onChangeText={setProducedAt} placeholder="AAAA-MM-DDTHH:mm" autoCapitalize="none" />
        </View>
        <TextInput editable={!saving && !recipeGate.busy} style={[ops.input, ops.textArea]} value={productionNotes} onChangeText={setProductionNotes} placeholder="Notas opcionales del lote" multiline />
        <View style={[ops.metrics, mobile && ops.metricsMobile]}>
          <View style={ops.metric}><ThemedText style={ops.metricValue}>{quantityText(outputBaseQuantity)}</ThemedText><ThemedText style={ops.muted}>{selectedRecipe.output_ingredient?.base_unit?.symbol ?? "u"} producidos</ThemedText></View>
          <View style={ops.metric}><ThemedText style={ops.metricValue}>{productionExpiry(producedAt, selectedRecipe.shelf_life_days)}</ThemedText><ThemedText style={ops.muted}>Caducidad calculada</ThemedText></View>
        </View>
        <ThemedText style={ops.subtitle}>Vas a consumir (primero lo que caduca antes)</ThemedText>
        {inputPreview.map((item) => <View style={ops.insetCard} key={item.ingredientId}>
          <View style={ops.row}>
            <ThemedText style={ops.strong}>{item.ingredient?.name ?? "Insumo desconocido"}</ThemedText>
            <ThemedText style={item.shortage > 0.00001 ? ops.statusDanger : ops.statusGood}>{quantityText(item.required)} {item.ingredient?.base_unit?.symbol ?? "u"}</ThemedText>
          </View>
          <ThemedText style={ops.muted}>Disponible {quantityText(item.available)}{item.shortage > 0.00001 ? ` · faltan ${quantityText(item.shortage)}` : " · suficiente"}</ThemedText>
        </View>)}
        {selectedRecipe.yield_unit?.dimension === "mass" && <View style={ops.insetCard}>
          <ThemedText style={ops.subtitle}>Porciones opcionales</ThemedText>
          <ThemedText style={ops.muted}>Distribuye hasta {quantityText(selectedRecipeYieldInGrams)} g. Declarado: {quantityText(portionedGrams)} g.</ThemedText>
          <View style={[ops.inline, compact && ops.inlineCompact]}>
            <TextInput editable={!saving && !recipeGate.busy} style={[ops.input, ops.fieldGrow]} value={portionName} onChangeText={setPortionName} placeholder="Nombre (grande, mediana...)" />
            <TextInput editable={!saving && !recipeGate.busy} style={[ops.input, ops.fieldGrow]} value={portionQuantity} onChangeText={setPortionQuantity} placeholder="Número de porciones" keyboardType="number-pad" />
            <TextInput editable={!saving && !recipeGate.busy} style={[ops.input, ops.fieldGrow]} value={gramsPerPortion} onChangeText={setGramsPerPortion} placeholder="Gramos por porción" keyboardType="decimal-pad" />
          </View>
          <Pressable disabled={saving || recipeGate.busy} onPress={addPortion} style={ops.outlineButton}><ThemedText style={ops.outlineText}>Agregar porciones</ThemedText></Pressable>
          {portions.map((portion) => <View style={ops.row} key={portion.id}><ThemedText>{portion.quantity} × {portion.portion_name} de {quantityText(portion.grams_per_portion)} g</ThemedText><Pressable style={ops.inlineTextAction} disabled={saving || recipeGate.busy} onPress={() => setPortions((current) => current.filter((candidate) => candidate.id !== portion.id))}><ThemedText style={ops.dangerText}>Quitar</ThemedText></Pressable></View>)}
        </View>}
        <ActionButton label="Confirmar consumo y producción" loading={saving || recipeGate.busy} disabled={!selectedRecipe.active || recipeDetail.loading || !!recipeDetail.error || !validMultiplier || !productionDateValid || hasKnownShortage} disabledReason={!selectedRecipe.active ? "Selecciona una receta activa." : recipeDetail.loading || recipeDetail.error ? "Espera o reintenta la carga de la receta." : !validMultiplier ? "Indica cuántas tandas prepararás." : !productionDateValid ? "Corrige la fecha; no puede estar en el futuro." : "Faltan ingredientes: revisa las cantidades disponibles indicadas arriba."} onPress={() => recipeGate.run(produce)} />
      </>}
      {lastProduction && <View style={ops.noticeBox}>
        <ThemedText style={ops.notice}>Último resultado: producción #{lastProduction.id}, vence {dateText(lastProduction.expires_at)}.</ThemedText>
        {lastProduction.outputs.filter((output) => !output.portion_name).map((output) => <ThemedText style={ops.notice} key={output.id}>Lote {output.inventory_batch?.lot_code || `#${output.inventory_batch_id}`}: {quantityText(output.quantity)} {ingredientById.get(output.ingredient_id)?.base_unit?.symbol ?? "u"}</ThemedText>)}
      </View>}
    </Section>}

    {tab === "recipes" && <>
      {isAdministrator && <Section title={editingRecipeId ? "Editar receta de producción" : "Nueva receta de producción"} compact={mobile}>
        <WorkflowSteps current={recipeItems.length ? "inputs" : recipeOutputIngredientId ? "yield" : "output"} items={[
          { key: "output", label: "Qué se prepara", detail: "Elige el insumo que obtendrás." },
          { key: "yield", label: "Rendimiento", detail: "Define cantidad y vida útil por tanda." },
          { key: "inputs", label: "Insumos", detail: "Indica qué consume cada tanda." },
        ]}/>
        <TextInput editable={!saving && !recipeGate.busy} style={ops.input} value={recipeName} onChangeText={setRecipeName} placeholder="Nombre de la receta" required {...recipeForm.field("name")} />
        <Feedback error={recipeForm.errors.output || recipeForm.errors.items || ""}/><ThemedText style={ops.label}>¿Qué se prepara?</ThemedText>
        <View style={ops.chips}>{activeIngredients.map((ingredient) => <Pressable accessibilityRole="button" disabled={saving || recipeGate.busy} accessibilityState={{selected:recipeOutputIngredientId === ingredient.id}} key={ingredient.id} onPress={() => chooseOutput(ingredient)} style={[ops.chip, recipeOutputIngredientId === ingredient.id && ops.chipActive]}><ThemedText>{ingredient.name}</ThemedText></Pressable>)}</View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput editable={!saving && !recipeGate.busy} style={[ops.input, ops.fieldGrow]} value={yieldQuantity} onChangeText={setYieldQuantity} placeholder="Cantidad que produce una tanda" required {...recipeForm.field("yield")} keyboardType="decimal-pad" />
          <TextInput editable={!saving && !recipeGate.busy} style={[ops.input, ops.fieldGrow]} value={shelfLifeDays} onChangeText={setShelfLifeDays} placeholder="Días de vida útil" required {...recipeForm.field("days")} keyboardType="number-pad" />
        </View>
        <ThemedText style={ops.label}>Unidad de lo que produce una tanda</ThemedText>{yieldUnitId !== null && !compatibleYieldUnits.some(unit => unit.id === yieldUnitId) && <Feedback error="La unidad anterior ya no está disponible. Selecciona una unidad y revisa la cantidad antes de guardar."/>}
        <View style={ops.chips}>{compatibleYieldUnits.map((unit) => <Pressable accessibilityRole="button" disabled={saving || recipeGate.busy} accessibilityState={{selected:yieldUnitId === unit.id}} key={unit.id} onPress={() => setYieldUnitId(unit.id)} style={[ops.chip, yieldUnitId === unit.id && ops.chipActive]}><ThemedText>{unit.symbol} · {unit.name}</ThemedText></Pressable>)}</View>
        {recipeOutputPreview !== null && <ThemedText style={ops.notice}>Resultado base por tanda: {quantityText(recipeOutputPreview)} {recipeOutputIngredient?.base_unit?.symbol ?? "u"} de {recipeOutputIngredient?.name}.</ThemedText>}
        <ThemedText style={ops.label}>Insumos consumidos por tanda (en unidad base)</ThemedText>
        <View style={ops.chips}>{activeIngredients.map((ingredient) => <Pressable accessibilityRole="button" disabled={saving || recipeGate.busy} accessibilityState={{selected:inputIngredientId === ingredient.id}} key={ingredient.id} onPress={() => setInputIngredientId(ingredient.id)} style={[ops.chip, inputIngredientId === ingredient.id && ops.chipActive]}><ThemedText>{ingredient.name}</ThemedText></Pressable>)}</View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput editable={!saving && !recipeGate.busy} style={[ops.input, ops.fieldGrow]} value={inputQuantity} onChangeText={setInputQuantity} placeholder={`Cantidad (${ingredientById.get(inputIngredientId ?? 0)?.base_unit?.symbol ?? "selecciona ingrediente"})`} keyboardType="decimal-pad" />
          <ActionButton label="Agregar insumo" variant="secondary" disabled={saving || recipeGate.busy} onPress={addRecipeItem} />
        </View>
        {recipeItems.map((item, index) => <View style={ops.insetCard} key={item.ingredient_id}><TextInput editable={!saving && !recipeGate.busy} label={`Cantidad de ${item.name} (${item.unit})`} required value={item.quantity} onChangeText={quantity => setRecipeItems(rows => rows.map((row,i) => i === index ? {...row,quantity} : row))} {...recipeForm.field(`row.${index}`)}/><View style={ops.row}><ThemedText>{item.name} · {item.unit}</ThemedText><Pressable accessibilityRole="button" style={ops.inlineTextAction} disabled={saving || recipeGate.busy} onPress={() => setRecipeItems((current) => current.filter((candidate) => candidate.ingredient_id !== item.ingredient_id))}><ThemedText style={ops.dangerText}>Quitar {item.name}</ThemedText></Pressable></View></View>)}
        {editingRecipeId && <Pressable accessibilityRole="button" disabled={saving || recipeGate.busy} onPress={() => setRecipeActive((value) => !value)} style={[ops.chip, recipeActive && ops.chipActive]}><ThemedText>{recipeActive ? "Receta activa" : "Receta inactiva"}</ThemedText></Pressable>}
        <View style={ops.chips}>
          <ActionButton label={editingRecipeId ? "Guardar cambios" : "Guardar receta"} loading={saving || recipeGate.busy} onPress={() => recipeGate.run(saveRecipe)} />
          <ActionButton label="Descartar cambios de producción" variant="secondary" disabled={saving || recipeGate.busy} onPress={() => replaceRecipe(resetRecipeForm)} />
        </View>
      </Section>}
      <Section title="Recetas configuradas">
        <TextInput label="Buscar receta o preparación" style={ops.input} value={recipeDirectory.search} maxLength={100} onChangeText={recipeDirectory.setSearch}/>
        <RemoteListStatus {...recipeDirectory} count={recipes.length} emptyText="Aún no hay recetas de producción." onRetry={recipeDirectory.reload}/>
        {recipes.map((recipe) => <View style={[ops.card, !recipe.active && ops.disabled]} key={recipe.id}>
          <View style={ops.row}>
            <View style={ops.rowGrow}>
              <ThemedText style={ops.strong}>{recipe.name}{!recipe.active ? " (inactiva)" : ""}</ThemedText>
              <ThemedText style={ops.muted}>Produce {quantityText(recipe.yield_quantity)} {recipe.yield_unit?.symbol ?? "u"} de {recipe.output_ingredient?.name ?? "salida sin configurar"} · vida útil {recipe.shelf_life_days} día(s)</ThemedText>
            </View>
            {isAdministrator && <Pressable accessibilityRole="button" disabled={saving || recipeGate.busy} onPress={() => replaceRecipe(() => editRecipe(recipe))} style={ops.outlineButton}><ThemedText style={ops.outlineText}>Editar</ThemedText></Pressable>}
          </View>
          <ThemedText style={ops.label}>Insumos por tanda</ThemedText>
          {recipe.items.map((item) => <ThemedText style={ops.muted} key={item.id ?? item.ingredient_id}>• {item.ingredient?.name ?? `Insumo #${item.ingredient_id}`}: {quantityText(item.quantity)} {item.ingredient?.base_unit?.symbol ?? "u"}</ThemedText>)}
        </View>)}
        <Pagination {...recipeDirectory} onPage={recipeDirectory.setPage}/>
      </Section>
    </>}

    {tab === "batches" && <Section title="Producciones registradas">
      {!batches.length ? <EmptyState text="No hay lotes de producción." /> : batches.map((batch) => <View style={ops.card} key={batch.id}>
        <View style={ops.row}>
          <View style={ops.rowGrow}>
            <ThemedText style={ops.strong}>Producción #{batch.id} · {batch.recipe?.name ?? "Receta"}</ThemedText>
            <ThemedText style={ops.muted}>{dateText(batch.produced_at, true)} · multiplicador ×{quantityText(batch.multiplier)} · vence {dateText(batch.expires_at)}</ThemedText>
          </View>
          <ThemedText style={ops.badge}>{batch.recipe?.output_ingredient?.name ?? "Salida"}</ThemedText>
        </View>
        {!!batch.notes && <ThemedText>{batch.notes}</ThemedText>}
        {batch.outputs.filter((output) => !output.portion_name).map((output) => <View style={ops.insetCard} key={output.id}>
          <ThemedText style={ops.strong}>Lote {output.inventory_batch?.lot_code || `#${output.inventory_batch_id}`}: {quantityText(output.quantity)} {ingredientById.get(output.ingredient_id)?.base_unit?.symbol ?? "u"}</ThemedText>
          <ThemedText style={ops.muted}>Costo unitario ${moneyText(output.inventory_batch?.unit_cost)} · disponible {quantityText(output.inventory_batch?.available_quantity)}</ThemedText>
        </View>)}
        {batch.outputs.filter((output) => output.portion_name).map((output) => <ThemedText style={ops.muted} key={output.id}>• {quantityText(output.quantity)} × {output.portion_name} de {quantityText(output.grams_per_portion)} g</ThemedText>)}
      </View>)}
      {batchPage < batchLastPage && <Pressable disabled={loadingMoreBatches} onPress={loadMoreBatches} style={[ops.outlineButton, loadingMoreBatches && ops.disabled]}>
        <ThemedText style={ops.outlineText}>{loadingMoreBatches ? "Cargando producciones..." : `Cargar más producciones (página ${batchPage + 1} de ${batchLastPage})`}</ThemedText>
      </Pressable>}
    </Section>}
  </View>;
}
