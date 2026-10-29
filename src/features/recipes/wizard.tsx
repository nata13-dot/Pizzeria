import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { ActionButton } from "../../components/ActionButton";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { Pagination, RemoteListStatus } from "../../components/RemoteListStatus";
import { usePaginatedResource } from "../../hooks/useRemoteResource";
import { ThemedText } from "../../theme/ThemedText";
import type { Ingredient } from "../operations/types";
import { useOpsStyles } from "../operations/ui";

export type Flavor = { id: number; name: string; active: boolean };
export type RecipeSlot = { id: number; product_flavor_id: number | null; active: boolean; name: string; applies_to_flavors?: boolean; base_only?: boolean };
export type Destination = { id: number; name: string; active: boolean; product: { id: number; name: string; type: string; active: boolean; flavors?: Flavor[] }; recipes?: RecipeSlot[] };
export type PickedProduct = { id: number; name: string; type: string; flavors: Flavor[] };

/** Server-side ingredient search; works no matter which page an ingredient is on. */
export function IngredientSearch({ token, onPick, picked, actionLabel = "Agregar", pickedLabel = "✓ Agregado", disabled = false, label = "Buscar ingrediente" }: {
  token: string;
  onPick: (ingredient: Ingredient) => void;
  picked: (ingredient: Ingredient) => boolean;
  actionLabel?: string;
  pickedLabel?: string;
  disabled?: boolean;
  label?: string;
}) {
  const ops = useOpsStyles();
  const ingredients = usePaginatedResource<Ingredient>("/ingredients?active=1&per_page=25", token, "los ingredientes", 300);
  return <View style={ops.choiceGroup}>
    <TextInput label={label} placeholder="Nombre o código" value={ingredients.search} maxLength={100} onChangeText={ingredients.setSearch} />
    <RemoteListStatus {...ingredients} count={ingredients.items.length} emptyText="No hay insumos activos. Regístralos en Inventario." onRetry={ingredients.reload} />
    {ingredients.items.map((ingredient) => {
      const done = picked(ingredient);
      const unit = ingredient.base_unit?.symbol;
      return <View key={ingredient.id} style={[ops.insetCard, ops.row, { alignItems: "center" }]}>
        <View style={ops.rowGrow}>
          <ThemedText style={ops.strong}>{ingredient.name}</ThemedText>
          <ThemedText style={ops.muted}>{unit ? `Se mide en ${unit}` : "Unidad no disponible"}</ThemedText>
        </View>
        <ActionButton label={done ? pickedLabel : actionLabel} accessibilityLabel={done ? `${ingredient.name} ya está elegido` : `${actionLabel} ${ingredient.name}`} variant={done ? "secondary" : "primary"} disabled={disabled || done || !unit} onPress={() => onPick(ingredient)} />
      </View>;
    })}
    <Pagination {...ingredients} onPage={ingredients.setPage} />
  </View>;
}

/** Finds a product by name and returns it once, even if it has several sizes. */
export function ProductPicker({ token, selectedId, onPick, disabled = false }: { token: string; selectedId: number | null; onPick: (product: PickedProduct) => void; disabled?: boolean }) {
  const ops = useOpsStyles();
  const destinations = usePaginatedResource<Destination>("/recipes/destinations", token, "los productos", 300);
  const products = useMemo(() => {
    const unique = new Map<number, PickedProduct & { sizes: string[] }>();
    destinations.items.forEach((destination) => {
      const current = unique.get(destination.product.id) ?? { id: destination.product.id, name: destination.product.name, type: destination.product.type, flavors: (destination.product.flavors ?? []).filter((flavor) => flavor.active), sizes: [] };
      current.sizes.push(destination.name);
      unique.set(destination.product.id, current);
    });
    return [...unique.values()];
  }, [destinations.items]);
  return <View style={ops.choiceGroup}>
    <TextInput label="Buscar producto" placeholder="Ej. Pizza, Alitas" value={destinations.search} maxLength={100} onChangeText={destinations.setSearch} />
    <RemoteListStatus {...destinations} count={products.length} emptyText="No hay productos activos con tamaños. Configúralos en Productos." onRetry={destinations.reload} />
    <View accessibilityRole="radiogroup" accessibilityLabel="Producto" style={ops.chips}>
      {products.map((product) => <Pressable key={product.id} accessibilityRole="radio" accessibilityLabel={product.name} accessibilityHint={`Tamaños: ${product.sizes.join(", ")}`} aria-checked={selectedId === product.id} aria-disabled={disabled} disabled={disabled} onPress={() => onPick(product)} style={[ops.chip, selectedId === product.id && ops.chipActive]}>
        <ThemedText style={selectedId === product.id ? ops.chipTextActive : undefined}>{product.name}</ThemedText>
        <ThemedText style={ops.chipHint}>{product.sizes.join(" · ")}</ThemedText>
      </Pressable>)}
    </View>
    <Pagination {...destinations} onPage={destinations.setPage} />
  </View>;
}

export function WizardNav({ onBack, onNext, nextLabel = "Siguiente →", backLabel = "← Atrás", nextDisabled = false, disabledReason, busy = false }: {
  onBack?: () => void;
  onNext: () => void | Promise<void>;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  disabledReason?: string;
  busy?: boolean;
}) {
  const ops = useOpsStyles();
  return <View style={[ops.actionsRow, { justifyContent: "space-between" }]}>
    {onBack ? <ActionButton label={backLabel} variant="secondary" disabled={busy} onPress={onBack} /> : <View />}
    <ActionButton label={nextLabel} loading={busy} disabled={nextDisabled} disabledReason={disabledReason} onPress={onNext} />
  </View>;
}

/** Accepts "1,5" or "1.5" with up to four decimals. */
export function quantityError(value: string): string {
  const text = value.trim();
  const parsed = Number(text.replace(",", "."));
  return !/^\d+(?:[.,]\d{1,4})?$/.test(text) || !Number.isFinite(parsed) || parsed <= 0 || parsed > 999999999999.9999 ? "Escribe una cantidad mayor que cero, con hasta cuatro decimales." : "";
}
