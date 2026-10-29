import {ThemedText} from "../../theme/ThemedText";
import { usePaginatedResource, useRemoteResource } from "../../hooks/useRemoteResource";
import { RemoteListStatus, Pagination } from "../../components/RemoteListStatus";
import { ActionButton } from "../../components/ActionButton";
import { useActionGate } from "../../forms/useActionGate";
import { decimalInput, operationError } from "../../forms/validation";
import { ProductionRecipes } from "../recipes/ProductionRecipes";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useResponsiveLayout } from "../../layout/responsive";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { api } from "../../api";
import type {
  Ingredient,
  ProductionBatch,
  ProductionRecipe,
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
  const productionDirectory = usePaginatedResource<ProductionRecipe>("/production-recipes?paginated=1&active=1", token, "las preparaciones disponibles", 300, tab === "produce");
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

  const [productionRecipeId, setProductionRecipeId] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [producedAt, setProducedAt] = useState(localDateTimeValue);
  const [productionNotes, setProductionNotes] = useState("");
  const [portionName, setPortionName] = useState("");
  const [portionQuantity, setPortionQuantity] = useState("");
  const [gramsPerPortion, setGramsPerPortion] = useState("");
  const [portions, setPortions] = useState<PortionDraft[]>([]);

  const gate = useActionGate();
  const ingredientById = useMemo(() => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);
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
    if (!initial) { productionDirectory.reload(); recipeDetail.reload(); }
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const [nextIngredients, nextBatches] = await Promise.all([
        fetchAllPages<Ingredient>("/ingredients", token),
        fetchPage<ProductionBatch>("/production-batches", token),
      ]);
      if (currentRequest !== requestId.current) return;
      setIngredients(nextIngredients);
      setBatches(nextBatches.data);
      setBatchPage(nextBatches.current_page);
      setBatchLastPage(nextBatches.last_page);
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
    if (!(await confirmAction(`¿Registrar esta producción? Consumirá primero los ingredientes que caducan antes y generará ${quantityText(outputBaseQuantity)} ${selectedRecipe.output_ingredient?.base_unit?.symbol ?? "u"} de ${outputName}.`, { title: "Registrar producción", acceptLabel: "Registrar producción", cancelLabel: "Revisar cantidades" }))) return;
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
        onChange={(key) => { if (!saving && !gate.busy) setTab(key as ProductionTab); }}
      />
      <Pressable disabled={refreshing || saving || gate.busy} onPress={() => load()} style={[ops.outlineButton, mobile && ops.fullWidthButton, refreshing && ops.disabled]}><ThemedText style={ops.outlineText}>{refreshing ? "Actualizando..." : "Actualizar"}</ThemedText></Pressable>
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
      <View style={ops.chips}>{productionDirectory.items.map((recipe) => <Pressable disabled={saving || gate.busy} key={recipe.id} onPress={() => setProductionRecipeId(recipe.id)} style={[ops.chip, productionRecipeId === recipe.id && ops.chipActive]}><ThemedText>{recipe.name}</ThemedText></Pressable>)}</View>
      <Pagination {...productionDirectory} onPage={productionDirectory.setPage}/>
      {!!productionRecipeId && <RemoteListStatus {...recipeDetail} count={selectedRecipe ? 1 : 0} emptyText="Selecciona una preparación." onRetry={recipeDetail.reload}/>}
      {selectedRecipe && !selectedRecipe.active && <Feedback error="La receta seleccionada está inactiva. Elige otra preparación."/>}
      {selectedRecipe && <><ThemedText style={ops.subtitle}>Preparación seleccionada: {selectedRecipe.name}</ThemedText>
        <View style={ops.noticeBox}>
          <ThemedText style={ops.notice}>Una tanda produce: {quantityText(recipeOutputBaseQuantity(selectedRecipe, 1))} {selectedRecipe.output_ingredient?.base_unit?.symbol ?? "u"} de {selectedRecipe.output_ingredient?.name ?? "salida sin nombre"}.</ThemedText>
        </View>
        <View style={[ops.inline, compact && ops.inlineCompact]}>
          <TextInput editable={!saving && !gate.busy} style={[ops.input, ops.fieldGrow]} value={multiplier} onChangeText={setMultiplier} placeholder="¿Cuántas tandas prepararás?" keyboardType="decimal-pad" />
          <TextInput editable={!saving && !gate.busy} style={[ops.input, ops.fieldGrow]} value={producedAt} onChangeText={setProducedAt} placeholder="AAAA-MM-DDTHH:mm" autoCapitalize="none" />
        </View>
        <TextInput editable={!saving && !gate.busy} style={[ops.input, ops.textArea]} value={productionNotes} onChangeText={setProductionNotes} placeholder="Notas opcionales del lote" multiline />
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
            <TextInput editable={!saving && !gate.busy} style={[ops.input, ops.fieldGrow]} value={portionName} onChangeText={setPortionName} placeholder="Nombre (grande, mediana...)" />
            <TextInput editable={!saving && !gate.busy} style={[ops.input, ops.fieldGrow]} value={portionQuantity} onChangeText={setPortionQuantity} placeholder="Número de porciones" keyboardType="number-pad" />
            <TextInput editable={!saving && !gate.busy} style={[ops.input, ops.fieldGrow]} value={gramsPerPortion} onChangeText={setGramsPerPortion} placeholder="Gramos por porción" keyboardType="decimal-pad" />
          </View>
          <Pressable disabled={saving || gate.busy} onPress={addPortion} style={ops.outlineButton}><ThemedText style={ops.outlineText}>Agregar porciones</ThemedText></Pressable>
          {portions.map((portion) => <View style={ops.row} key={portion.id}><ThemedText>{portion.quantity} × {portion.portion_name} de {quantityText(portion.grams_per_portion)} g</ThemedText><Pressable style={ops.inlineTextAction} disabled={saving || gate.busy} onPress={() => setPortions((current) => current.filter((candidate) => candidate.id !== portion.id))}><ThemedText style={ops.dangerText}>Quitar</ThemedText></Pressable></View>)}
        </View>}
        <ActionButton label="Confirmar consumo y producción" loading={saving || gate.busy} disabled={!selectedRecipe.active || recipeDetail.loading || !!recipeDetail.error || !validMultiplier || !productionDateValid || hasKnownShortage} disabledReason={!selectedRecipe.active ? "Selecciona una receta activa." : recipeDetail.loading || recipeDetail.error ? "Espera o reintenta la carga de la receta." : !validMultiplier ? "Indica cuántas tandas prepararás." : !productionDateValid ? "Corrige la fecha; no puede estar en el futuro." : "Faltan ingredientes: revisa las cantidades disponibles indicadas arriba."} onPress={() => gate.run(produce)} />
      </>}
      {lastProduction && <View style={ops.noticeBox}>
        <ThemedText style={ops.notice}>Último resultado: producción #{lastProduction.id}, vence {dateText(lastProduction.expires_at)}.</ThemedText>
        {lastProduction.outputs.filter((output) => !output.portion_name).map((output) => <ThemedText style={ops.notice} key={output.id}>Lote {output.inventory_batch?.lot_code || `#${output.inventory_batch_id}`}: {quantityText(output.quantity)} {ingredientById.get(output.ingredient_id)?.base_unit?.symbol ?? "u"}</ThemedText>)}
      </View>}
    </Section>}

    {tab === "recipes" && <ProductionRecipes token={token} isAdministrator={isAdministrator} onSaved={(recipe) => { void load(); setProductionRecipeId(recipe.active ? recipe.id : null); }} />}

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
