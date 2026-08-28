import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
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
  ops,
  quantityText,
  Section,
  Tabs,
} from "./ui";

type ProductionTab = "produce" | "recipes" | "batches";
type RecipeDraftItem = { ingredient_id: number; name: string; unit: string; quantity: number };
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
  const { width } = useWindowDimensions();
  const compact = width < 980;
  const [tab, setTab] = useState<ProductionTab>("produce");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [recipes, setRecipes] = useState<ProductionRecipe[]>([]);
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

  const [editingRecipeId, setEditingRecipeId] = useState<number | null>(null);
  const [recipeName, setRecipeName] = useState("");
  const [recipeOutputIngredientId, setRecipeOutputIngredientId] = useState<number | null>(null);
  const [yieldQuantity, setYieldQuantity] = useState("1");
  const [yieldUnitId, setYieldUnitId] = useState<number | null>(null);
  const [shelfLifeDays, setShelfLifeDays] = useState("1");
  const [recipeActive, setRecipeActive] = useState(true);
  const [inputIngredientId, setInputIngredientId] = useState<number | null>(null);
  const [inputQuantity, setInputQuantity] = useState("");
  const [recipeItems, setRecipeItems] = useState<RecipeDraftItem[]>([]);

  const [productionRecipeId, setProductionRecipeId] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [producedAt, setProducedAt] = useState(localDateTimeValue);
  const [productionNotes, setProductionNotes] = useState("");
  const [portionName, setPortionName] = useState("");
  const [portionQuantity, setPortionQuantity] = useState("");
  const [gramsPerPortion, setGramsPerPortion] = useState("");
  const [portions, setPortions] = useState<PortionDraft[]>([]);

  const activeIngredients = ingredients.filter((ingredient) => ingredient.active);
  const activeUnits = units.filter((unit) => unit.active);
  const ingredientById = useMemo(() => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);
  const recipeOutputIngredient = ingredients.find((ingredient) => ingredient.id === recipeOutputIngredientId) ?? null;
  const compatibleYieldUnits = activeUnits.filter((unit) => unit.dimension === recipeOutputIngredient?.base_unit?.dimension);
  const selectedRecipe = recipes.find((recipe) => recipe.id === productionRecipeId) ?? null;
  const parsedMultiplier = inputNumber(multiplier);
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
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const [nextIngredients, nextUnits, nextRecipes, nextBatches] = await Promise.all([
        fetchAllPages<Ingredient>("/ingredients", token),
        api<Unit[]>("/catalogs/units", token),
        api<ProductionRecipe[]>("/production-recipes", token),
        fetchPage<ProductionBatch>("/production-batches", token),
      ]);
      if (currentRequest !== requestId.current) return;
      setIngredients(nextIngredients);
      setUnits(nextUnits);
      setRecipes(nextRecipes);
      setBatches(nextBatches.data);
      setBatchPage(nextBatches.current_page);
      setBatchLastPage(nextBatches.last_page);
      const firstActiveRecipe = nextRecipes.find((recipe) => recipe.active && recipe.output_ingredient_id);
      setProductionRecipeId((current) => current && nextRecipes.some((recipe) => recipe.id === current && recipe.active) ? current : firstActiveRecipe?.id ?? null);
      setRecipeOutputIngredientId((current) => current ?? nextIngredients.find((ingredient) => ingredient.active)?.id ?? null);
      setInputIngredientId((current) => current ?? nextIngredients.find((ingredient) => ingredient.active)?.id ?? null);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError((loadError as Error).message);
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
      if (currentRequest === requestId.current) setError((loadError as Error).message);
    } finally {
      if (currentRequest === requestId.current) setLoadingMoreBatches(false);
    }
  }

  useEffect(() => {
    load(true);
    return () => { requestId.current += 1; };
  }, [token]);

  useEffect(() => {
    if (!recipeOutputIngredient?.base_unit) return;
    const currentUnit = units.find((unit) => unit.id === yieldUnitId);
    if (!currentUnit?.active || currentUnit.dimension !== recipeOutputIngredient.base_unit.dimension) {
      setYieldUnitId(units.find((unit) => unit.active && unit.dimension === recipeOutputIngredient.base_unit?.dimension)?.id ?? null);
    }
  }, [recipeOutputIngredientId, units]);

  useEffect(() => {
    if (selectedRecipe?.yield_unit?.dimension !== "mass" && portions.length) setPortions([]);
  }, [productionRecipeId, selectedRecipe?.yield_unit?.dimension]);

  function resetRecipeForm(): void {
    setEditingRecipeId(null);
    setRecipeName("");
    setRecipeOutputIngredientId(activeIngredients[0]?.id ?? null);
    setYieldQuantity("1");
    setYieldUnitId(null);
    setShelfLifeDays("1");
    setRecipeActive(true);
    setRecipeItems([]);
    setInputQuantity("");
  }

  function editRecipe(recipe: ProductionRecipe): void {
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
      quantity: numberValue(item.quantity),
    })));
    setError("");
    setMessage("");
    setTab("recipes");
  }

  function addRecipeItem(): void {
    const ingredient = activeIngredients.find((item) => item.id === inputIngredientId);
    const quantity = inputNumber(inputQuantity);
    if (!ingredient || !Number.isFinite(quantity) || quantity <= 0) {
      setError("Selecciona un insumo y captura una cantidad mayor que cero.");
      return;
    }
    setRecipeItems((current) => [
      ...current.filter((item) => item.ingredient_id !== ingredient.id),
      { ingredient_id: ingredient.id, name: ingredient.name, unit: ingredient.base_unit?.symbol ?? "u", quantity },
    ]);
    setInputQuantity("");
    setError("");
  }

  async function saveRecipe(): Promise<void> {
    if (!isAdministrator || saveLock.current) return;
    const yieldAmount = inputNumber(yieldQuantity);
    const shelfLife = inputNumber(shelfLifeDays);
    const yieldUnit = compatibleYieldUnits.find((unit) => unit.id === yieldUnitId);
    if (!recipeName.trim() || !recipeOutputIngredient || !yieldUnit || !Number.isFinite(yieldAmount) || yieldAmount <= 0 || !Number.isInteger(shelfLife) || shelfLife < 0 || !recipeItems.length) {
      setError("Completa nombre, salida, rendimiento compatible, vida útil e insumos de la receta.");
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const recipe = await api<ProductionRecipe>(editingRecipeId ? `/production-recipes/${editingRecipeId}` : "/production-recipes", token, {
        method: editingRecipeId ? "PUT" : "POST",
        body: JSON.stringify({
          name: recipeName.trim(),
          output_ingredient_id: recipeOutputIngredient.id,
          yield_quantity: yieldAmount,
          yield_unit_id: yieldUnit.id,
          shelf_life_days: shelfLife,
          active: recipeActive,
          items: recipeItems.map((item) => ({ ingredient_id: item.ingredient_id, quantity: item.quantity })),
        }),
      });
      setMessage(editingRecipeId ? `Receta “${recipe.name}” actualizada.` : `Receta “${recipe.name}” registrada.`);
      resetRecipeForm();
      await load();
      setProductionRecipeId(recipe.active ? recipe.id : null);
    } catch (saveError) {
      setError((saveError as Error).message);
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
    if (saveLock.current || !selectedRecipe) return;
    if (!validMultiplier || !productionDateValid || !producedAtInstant) {
      setError("El multiplicador debe ser mayor que cero y la fecha no puede estar en el futuro.");
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
    if (!(await confirmAction(`¿Registrar esta producción? Consumirá los insumos por FEFO y generará ${quantityText(outputBaseQuantity)} ${selectedRecipe.output_ingredient?.base_unit?.symbol ?? "u"} de ${outputName}.`))) return;
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
      setError((productionError as Error).message);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const recipeOutputPreview = useMemo(() => {
    const unit = compatibleYieldUnits.find((candidate) => candidate.id === yieldUnitId);
    const baseUnit = recipeOutputIngredient?.base_unit;
    const amount = inputNumber(yieldQuantity);
    if (!unit || !baseUnit || !Number.isFinite(amount) || amount <= 0) return null;
    return amount * (numberValue(unit.base_factor) / numberValue(baseUnit.base_factor));
  }, [yieldUnitId, yieldQuantity, recipeOutputIngredientId, units]);

  if (loading) return <LoadingState text="Cargando recetas, insumos y lotes de producción..." />;

  return <View style={ops.screen}>
    <View style={ops.toolbar}>
      <Tabs
        active={tab}
        items={[
          { key: "produce", label: "Registrar producción" },
          { key: "recipes", label: `Recetas (${recipes.length})` },
          { key: "batches", label: `Lotes producidos (${batches.length})` },
        ]}
        onChange={(key) => setTab(key as ProductionTab)}
      />
      <Pressable disabled={refreshing} onPress={() => load()} style={[ops.outlineButton, refreshing && ops.disabled]}><Text style={ops.outlineText}>{refreshing ? "Actualizando..." : "Actualizar"}</Text></Pressable>
    </View>
    <Feedback error={error} message={message} />

    {tab === "produce" && <Section title="Registrar producción">
      <Text style={ops.label}>Receta activa</Text>
      <View style={ops.chips}>{recipes.filter((recipe) => recipe.active).map((recipe) => <Pressable key={recipe.id} onPress={() => setProductionRecipeId(recipe.id)} style={[ops.chip, productionRecipeId === recipe.id && ops.chipActive]}><Text>{recipe.name}</Text></Pressable>)}</View>
      {!recipes.some((recipe) => recipe.active) && <EmptyState text={isAdministrator ? "No hay recetas activas. Crea o reactiva una en la pestaña Recetas." : "No hay recetas de producción activas; solicita su configuración a un administrador."} />}
      {selectedRecipe && <>
        <View style={ops.noticeBox}>
          <Text style={ops.notice}>Resultado por multiplicador 1: {quantityText(recipeOutputBaseQuantity(selectedRecipe, 1))} {selectedRecipe.output_ingredient?.base_unit?.symbol ?? "u"} de {selectedRecipe.output_ingredient?.name ?? "salida sin nombre"}.</Text>
        </View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={multiplier} onChangeText={setMultiplier} placeholder="Multiplicador" keyboardType="decimal-pad" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={producedAt} onChangeText={setProducedAt} placeholder="AAAA-MM-DDTHH:mm" autoCapitalize="none" />
        </View>
        <TextInput style={[ops.input, ops.textArea]} value={productionNotes} onChangeText={setProductionNotes} placeholder="Notas opcionales del lote" multiline />
        <View style={ops.metrics}>
          <View style={ops.metric}><Text style={ops.metricValue}>{quantityText(outputBaseQuantity)}</Text><Text style={ops.muted}>{selectedRecipe.output_ingredient?.base_unit?.symbol ?? "u"} producidos</Text></View>
          <View style={ops.metric}><Text style={ops.metricValue}>{productionExpiry(producedAt, selectedRecipe.shelf_life_days)}</Text><Text style={ops.muted}>Caducidad calculada</Text></View>
        </View>
        <Text style={ops.subtitle}>Insumos a consumir por FEFO</Text>
        {inputPreview.map((item) => <View style={ops.insetCard} key={item.ingredientId}>
          <View style={ops.row}>
            <Text style={ops.strong}>{item.ingredient?.name ?? "Insumo desconocido"}</Text>
            <Text style={item.shortage > 0.00001 ? ops.statusDanger : ops.statusGood}>{quantityText(item.required)} {item.ingredient?.base_unit?.symbol ?? "u"}</Text>
          </View>
          <Text style={ops.muted}>Disponible {quantityText(item.available)}{item.shortage > 0.00001 ? ` · faltan ${quantityText(item.shortage)}` : " · suficiente"}</Text>
        </View>)}
        {selectedRecipe.yield_unit?.dimension === "mass" && <View style={ops.insetCard}>
          <Text style={ops.subtitle}>Porciones opcionales</Text>
          <Text style={ops.muted}>Distribuye hasta {quantityText(selectedRecipeYieldInGrams)} g. Declarado: {quantityText(portionedGrams)} g.</Text>
          <View style={[ops.inline, compact && ops.inlineCompact]}>
            <TextInput style={[ops.input, ops.fieldGrow]} value={portionName} onChangeText={setPortionName} placeholder="Nombre (grande, mediana...)" />
            <TextInput style={[ops.input, ops.fieldGrow]} value={portionQuantity} onChangeText={setPortionQuantity} placeholder="Número de porciones" keyboardType="number-pad" />
            <TextInput style={[ops.input, ops.fieldGrow]} value={gramsPerPortion} onChangeText={setGramsPerPortion} placeholder="Gramos por porción" keyboardType="decimal-pad" />
          </View>
          <Pressable onPress={addPortion} style={ops.outlineButton}><Text style={ops.outlineText}>Agregar porciones</Text></Pressable>
          {portions.map((portion) => <View style={ops.row} key={portion.id}><Text>{portion.quantity} × {portion.portion_name} de {quantityText(portion.grams_per_portion)} g</Text><Pressable onPress={() => setPortions((current) => current.filter((candidate) => candidate.id !== portion.id))}><Text style={ops.dangerText}>Quitar</Text></Pressable></View>)}
        </View>}
        <Pressable disabled={saving || !validMultiplier || !productionDateValid || hasKnownShortage} onPress={produce} style={[ops.button, (saving || !validMultiplier || !productionDateValid || hasKnownShortage) && ops.disabled]}>{saving ? <ActivityIndicator color="white" /> : <Text style={ops.buttonText}>Confirmar consumo y producción</Text>}</Pressable>
      </>}
      {lastProduction && <View style={ops.noticeBox}>
        <Text style={ops.notice}>Último resultado: producción #{lastProduction.id}, vence {dateText(lastProduction.expires_at)}.</Text>
        {lastProduction.outputs.filter((output) => !output.portion_name).map((output) => <Text style={ops.notice} key={output.id}>Lote {output.inventory_batch?.lot_code || `#${output.inventory_batch_id}`}: {quantityText(output.quantity)} {ingredientById.get(output.ingredient_id)?.base_unit?.symbol ?? "u"}</Text>)}
      </View>}
    </Section>}

    {tab === "recipes" && <>
      {isAdministrator && <Section title={editingRecipeId ? "Editar receta de producción" : "Nueva receta de producción"}>
        <TextInput style={ops.input} value={recipeName} onChangeText={setRecipeName} placeholder="Nombre de la receta" />
        <Text style={ops.label}>Insumo producido</Text>
        <View style={ops.chips}>{activeIngredients.map((ingredient) => <Pressable key={ingredient.id} onPress={() => setRecipeOutputIngredientId(ingredient.id)} style={[ops.chip, recipeOutputIngredientId === ingredient.id && ops.chipActive]}><Text>{ingredient.name}</Text></Pressable>)}</View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={yieldQuantity} onChangeText={setYieldQuantity} placeholder="Rendimiento" keyboardType="decimal-pad" />
          <TextInput style={[ops.input, ops.fieldGrow]} value={shelfLifeDays} onChangeText={setShelfLifeDays} placeholder="Días de vida útil" keyboardType="number-pad" />
        </View>
        <Text style={ops.label}>Unidad del rendimiento</Text>
        <View style={ops.chips}>{compatibleYieldUnits.map((unit) => <Pressable key={unit.id} onPress={() => setYieldUnitId(unit.id)} style={[ops.chip, yieldUnitId === unit.id && ops.chipActive]}><Text>{unit.symbol} · {unit.name}</Text></Pressable>)}</View>
        {recipeOutputPreview !== null && <Text style={ops.notice}>Resultado base por tanda: {quantityText(recipeOutputPreview)} {recipeOutputIngredient?.base_unit?.symbol ?? "u"} de {recipeOutputIngredient?.name}.</Text>}
        <Text style={ops.label}>Insumos consumidos por tanda (en unidad base)</Text>
        <View style={ops.chips}>{activeIngredients.map((ingredient) => <Pressable key={ingredient.id} onPress={() => setInputIngredientId(ingredient.id)} style={[ops.chip, inputIngredientId === ingredient.id && ops.chipActive]}><Text>{ingredient.name}</Text></Pressable>)}</View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput style={[ops.input, ops.fieldGrow]} value={inputQuantity} onChangeText={setInputQuantity} placeholder="Cantidad en unidad base" keyboardType="decimal-pad" />
          <Pressable onPress={addRecipeItem} style={ops.outlineButton}><Text style={ops.outlineText}>Agregar insumo</Text></Pressable>
        </View>
        {recipeItems.map((item) => <View style={ops.insetCard} key={item.ingredient_id}><View style={ops.row}><Text>{item.name}: {quantityText(item.quantity)} {item.unit}</Text><Pressable onPress={() => setRecipeItems((current) => current.filter((candidate) => candidate.ingredient_id !== item.ingredient_id))}><Text style={ops.dangerText}>Quitar</Text></Pressable></View></View>)}
        {editingRecipeId && <Pressable onPress={() => setRecipeActive((value) => !value)} style={[ops.chip, recipeActive && ops.chipActive]}><Text>{recipeActive ? "Receta activa" : "Receta inactiva"}</Text></Pressable>}
        <View style={ops.chips}>
          <Pressable disabled={saving} onPress={saveRecipe} style={[ops.button, saving && ops.disabled]}>{saving ? <ActivityIndicator color="white" /> : <Text style={ops.buttonText}>{editingRecipeId ? "Actualizar receta" : "Guardar receta"}</Text>}</Pressable>
          {editingRecipeId && <Pressable onPress={resetRecipeForm} style={ops.outlineButton}><Text style={ops.outlineText}>Cancelar edición</Text></Pressable>}
        </View>
      </Section>}
      <Section title="Recetas configuradas">
        {!recipes.length ? <EmptyState text="No hay recetas de producción." /> : recipes.map((recipe) => <View style={[ops.card, !recipe.active && ops.disabled]} key={recipe.id}>
          <View style={ops.row}>
            <View style={ops.rowGrow}>
              <Text style={ops.strong}>{recipe.name}{!recipe.active ? " (inactiva)" : ""}</Text>
              <Text style={ops.muted}>Produce {quantityText(recipe.yield_quantity)} {recipe.yield_unit?.symbol ?? "u"} de {recipe.output_ingredient?.name ?? "salida sin configurar"} · vida útil {recipe.shelf_life_days} día(s)</Text>
            </View>
            {isAdministrator && <Pressable onPress={() => editRecipe(recipe)} style={ops.outlineButton}><Text style={ops.outlineText}>Editar</Text></Pressable>}
          </View>
          <Text style={ops.label}>Insumos por tanda</Text>
          {recipe.items.map((item) => <Text style={ops.muted} key={item.id ?? item.ingredient_id}>• {item.ingredient?.name ?? `Insumo #${item.ingredient_id}`}: {quantityText(item.quantity)} {item.ingredient?.base_unit?.symbol ?? "u"}</Text>)}
        </View>)}
      </Section>
    </>}

    {tab === "batches" && <Section title="Producciones registradas">
      {!batches.length ? <EmptyState text="No hay lotes de producción." /> : batches.map((batch) => <View style={ops.card} key={batch.id}>
        <View style={ops.row}>
          <View style={ops.rowGrow}>
            <Text style={ops.strong}>Producción #{batch.id} · {batch.recipe?.name ?? "Receta"}</Text>
            <Text style={ops.muted}>{dateText(batch.produced_at, true)} · multiplicador ×{quantityText(batch.multiplier)} · vence {dateText(batch.expires_at)}</Text>
          </View>
          <Text style={ops.badge}>{batch.recipe?.output_ingredient?.name ?? "Salida"}</Text>
        </View>
        {!!batch.notes && <Text>{batch.notes}</Text>}
        {batch.outputs.filter((output) => !output.portion_name).map((output) => <View style={ops.insetCard} key={output.id}>
          <Text style={ops.strong}>Lote {output.inventory_batch?.lot_code || `#${output.inventory_batch_id}`}: {quantityText(output.quantity)} {ingredientById.get(output.ingredient_id)?.base_unit?.symbol ?? "u"}</Text>
          <Text style={ops.muted}>Costo unitario ${moneyText(output.inventory_batch?.unit_cost)} · disponible {quantityText(output.inventory_batch?.available_quantity)}</Text>
        </View>)}
        {batch.outputs.filter((output) => output.portion_name).map((output) => <Text style={ops.muted} key={output.id}>• {quantityText(output.quantity)} × {output.portion_name} de {quantityText(output.grams_per_portion)} g</Text>)}
      </View>)}
      {batchPage < batchLastPage && <Pressable disabled={loadingMoreBatches} onPress={loadMoreBatches} style={[ops.outlineButton, loadingMoreBatches && ops.disabled]}>
        <Text style={ops.outlineText}>{loadingMoreBatches ? "Cargando producciones..." : `Cargar más producciones (página ${batchPage + 1} de ${batchLastPage})`}</Text>
      </Pressable>}
    </Section>}
  </View>;
}
