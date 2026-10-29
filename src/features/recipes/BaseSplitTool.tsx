import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../api";
import { ActionButton } from "../../components/ActionButton";
import { confirmAction } from "../../components/ConfirmationDialog";
import { Notice, useFeedback } from "../../components/Notice";
import { useActionGate } from "../../forms/useActionGate";
import { operationError } from "../../forms/validation";
import { ThemedText } from "../../theme/ThemedText";
import { quantityText, Section, useOpsStyles } from "../operations/ui";
import { ProductPicker, type PickedProduct } from "./wizard";

type Item = { ingredient_id: number; quantity: number; name?: string | null; unit?: string | null };
type VariantPlan = { variant_id: number; variant_name: string; applicable: boolean; reason: string | null; base_preview?: Item[]; flavors: { recipe_id: number; flavor_name: string | null; preview?: Item[] }[] };
type Plan = { revision: string; variants: VariantPlan[] };

const itemText = (item: Item) => `${item.name ?? "Ingrediente"} ${quantityText(item.quantity)} ${item.unit ?? ""}`.trim();

/** Moves the ingredients every flavor repeats into one shared base, after showing exactly what changes. */
export function BaseSplitTool({ token, onDone, onClose }: { token: string; onDone: (message: string) => void; onClose: () => void }) {
  const ops = useOpsStyles();
  const gate = useActionGate();
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [message, setMessage, kind] = useFeedback("info");
  const applicable = plan?.variants.filter((variant) => variant.applicable) ?? [];

  function preview(next: PickedProduct) {
    return gate.run(async () => {
      setProduct(next); setPlan(null); setMessage("");
      try { setPlan(await api<Plan>("/recipes/base-split", token, { method: "POST", body: JSON.stringify({ product_id: next.id }) })); }
      catch (error) { setMessage(operationError(error, "preparar la propuesta"), "error"); }
    });
  }

  function apply() {
    return gate.run(async () => {
      if (!product || !plan || !applicable.length) return;
      if (!await confirmAction(`Se creará una base en ${applicable.map((variant) => variant.variant_name).join(", ")} y cada sabor conservará solo lo que agrega. Las ventas de un solo sabor descontarán lo mismo que hoy; en mitad y mitad la base se descontará una sola vez.`, { title: "Separar base común", acceptLabel: "Separar base común", cancelLabel: "Revisar otra vez" })) return;
      try {
        await api("/recipes/base-split", token, { method: "POST", body: JSON.stringify({ product_id: product.id, apply: true, revision: plan.revision }) });
        onDone(`Base común creada para ${product.name} en ${applicable.length} tamaño(s).`);
      } catch (error) {
        const status = typeof error === "object" && error && "status" in error ? error.status : undefined;
        if (status === 409) { setPlan(null); setMessage("Las recetas cambiaron mientras revisabas. Vuelve a elegir el producto para ver la propuesta actualizada.", "warning"); return; }
        setMessage(operationError(error, "separar la base común", true), "error");
      }
    });
  }

  return <Section title="Separar base común" subtitle="Si cada sabor repite masa, salsa o queso, muévelos a una base que se descuenta una sola vez.">
    <Pressable accessibilityRole="button" onPress={onClose} disabled={gate.busy} style={ops.backLink}><ThemedText style={ops.backLinkText}>← Volver al listado</ThemedText></Pressable>
    <ThemedText style={ops.label}>1. Elige el producto</ThemedText>
    <ProductPicker token={token} selectedId={product?.id ?? null} onPick={(next) => { void preview(next); }} disabled={gate.busy} />
    <Notice kind={kind} message={message} />
    {plan && <>
      <ThemedText style={ops.label}>2. Revisa la propuesta</ThemedText>
      {plan.variants.map((variant) => <View key={variant.variant_id} style={[ops.insetCard, !variant.applicable && ops.disabled]}>
        <ThemedText style={ops.strong}>{variant.variant_name}</ThemedText>
        {!variant.applicable ? <ThemedText style={ops.muted}>Sin cambios: {variant.reason}</ThemedText> : <>
          <ThemedText style={ops.statusGood}>Base: {(variant.base_preview ?? []).map(itemText).join(" · ")}</ThemedText>
          {variant.flavors.map((flavor) => <ThemedText key={flavor.recipe_id}>• {flavor.flavor_name ?? "Sabor"}: {flavor.preview?.length ? `agrega ${flavor.preview.map(itemText).join(" · ")}` : "usa solo la base"}</ThemedText>)}
        </>}
      </View>)}
      {applicable.length
        ? <ActionButton label="Separar base común" loading={gate.busy} onPress={apply} />
        : <ThemedText style={ops.muted}>No hay nada que separar en este producto.</ThemedText>}
    </>}
  </Section>;
}
