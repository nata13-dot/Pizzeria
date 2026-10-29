import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { api } from "../../api";
import { ActionButton } from "../../components/ActionButton";
import { confirmAction } from "../../components/ConfirmationDialog";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { Notice, useFeedback } from "../../components/Notice";
import { variantErrors } from "../../forms/catalogValidation";
import { useActionGate } from "../../forms/useActionGate";
import { useFormErrors } from "../../forms/useFormErrors";
import { decimalInput, moneyInput, operationError, required } from "../../forms/validation";
import { useResponsiveLayout } from "../../layout/responsive";
import { ThemedText } from "../../theme/ThemedText";
import { useWorkField, useWorkGuard } from "../../work/WorkProvider";
import { LogoPicker } from "../administration/LogoPicker";
import { Choices, moneyText, Section, useOpsStyles, WorkflowSteps } from "../operations/ui";
import { WizardNav } from "../recipes/wizard";
import { productTypeLabel, productTypes, type ProductType } from "./productTypes";

type Step = "product" | "sizes" | "flavors" | "review";
type Size = { key: string; name: string; price: string; maxFlavors: string; half: boolean };
type Draft = { step: Step; name: string; description: string; type: ProductType; image: string; sizes: Size[]; flavors: string[]; flavorInput: string };
let sizeKey = 0;
const newSize = (name = ""): Size => ({ key: `size-${Date.now()}-${sizeKey++}`, name, price: "", maxFlavors: "1", half: false });
const blank = (): Draft => ({ step: "product", name: "", description: "", type: "pizza", image: "", sizes: [newSize()], flavors: [], flavorInput: "" });
const pizzaSizes = ["Chica", "Mediana", "Grande", "Familiar"];

/** Guided product creation: product → sizes and prices → flavors → review. */
export function ProductWizard({ token, onCreated, onOpenRecipes }: { token: string; onCreated: () => unknown; onOpenRecipes: () => void }) {
  const ops = useOpsStyles();
  const { compact } = useResponsiveLayout();
  const gate = useActionGate();
  const form = useFormErrors();
  const [draft, setDraft] = useWorkField<Draft>("productWizard", "draft", blank);
  const [created, setCreated] = useState<string | null>(null);
  const [message, setMessage, kind] = useFeedback();
  const dirty = !!(draft.name.trim() || draft.description.trim() || draft.image || draft.flavors.length || draft.flavorInput.trim() || draft.sizes.length > 1 || draft.sizes.some((size) => size.name.trim() || size.price.trim()));
  useWorkGuard("product-new", "el producto nuevo", dirty, gate.busy, true);
  const update = (patch: Partial<Draft>) => { if (!gate.busy) setDraft({ ...draft, ...patch }); };
  const setSize = (key: string, patch: Partial<Size>) => update({ sizes: draft.sizes.map((size) => size.key === key ? { ...size, ...patch, ...(patch.half && Number(size.maxFlavors) < 2 ? { maxFlavors: "2" } : {}) } : size) });
  const isPizza = draft.type === "pizza";

  function addFlavor() {
    const name = draft.flavorInput.trim();
    if (!name) return;
    if (draft.flavors.some((flavor) => flavor.toLocaleLowerCase() === name.toLocaleLowerCase())) { form.validate({ flavor: `${name} ya está en la lista.` }); return; }
    form.clear(); update({ flavors: [...draft.flavors, name], flavorInput: "" });
  }

  const validators: Record<"product" | "sizes", () => boolean> = {
    product: () => form.validate({ name: required(draft.name, "el nombre del producto") }),
    sizes: () => {
      const names = draft.sizes.map((size) => size.name.trim().toLocaleLowerCase());
      return form.validate({
        sizes: !draft.sizes.length ? "Agrega al menos un tamaño." : names.some((name, index) => name && names.indexOf(name) !== index) ? "Cada tamaño debe tener un nombre distinto." : "",
        ...Object.assign({}, ...draft.sizes.map((size) => variantErrors({ name: size.name, price: size.price, max_flavors: size.maxFlavors, allows_half_and_half: size.half }, `${size.key}.`))),
      });
    },
  };
  const go = (step: Step, check?: () => boolean) => { if (!check || check()) { setMessage(""); update({ step }); } };

  function save() {
    return gate.run(async () => {
      if (!validators.product()) { update({ step: "product" }); return; }
      if (!validators.sizes()) { update({ step: "sizes" }); return; }
      try {
        await api("/products", token, { method: "POST", body: JSON.stringify({
          name: draft.name.trim(), description: draft.description.trim() || null, image_data_uri: draft.image || null, type: draft.type,
          variants: draft.sizes.map((size) => ({ name: size.name.trim(), price: moneyInput(size.price), max_flavors: decimalInput(size.maxFlavors), allows_half_and_half: isPizza && size.half })),
          flavors: draft.flavors.map((name) => ({ name })),
        }) });
        const name = draft.name.trim();
        setDraft(blank()); form.clear(); setCreated(name);
        try { await onCreated(); } catch { setMessage("El producto se guardó. No pudimos actualizar el catálogo; vuelve a cargarlo.", "warning"); }
      } catch (error) {
        form.fromError(error, { name: "el nombre", type: "el tipo", image_data_uri: "la imagen", flavors: "los sabores", variants: "los tamaños" });
        setMessage(operationError(error, "registrar el producto", true), "error");
      }
    });
  }

  async function discard() {
    if (!await confirmAction("Se borrarán los datos del producto que estás creando.", { title: "Descartar producto nuevo", acceptLabel: "Descartar producto", cancelLabel: "Seguir editando" })) return;
    setDraft(blank()); form.clear(); setMessage("");
  }

  if (created) return <Section title="Producto creado" subtitle={`${created} ya aparece en Caja.`}>
    <Notice kind="info" message="Para que descuente inventario al venderse, crea su receta: qué ingredientes lleva cada tamaño." />
    <View style={ops.actionsRow}>
      <ActionButton label="Crear su receta" onPress={() => { setCreated(null); onOpenRecipes(); }} />
      <ActionButton label="Agregar otro producto" variant="secondary" onPress={() => setCreated(null)} />
    </View>
  </Section>;

  const row = [ops.inline, compact && ops.inlineCompact];
  return <Section title="Nuevo producto" subtitle="Lo que verá Caja: nombre, tamaños con su precio y sabores.">
    <WorkflowSteps current={draft.step} items={[
      { key: "product", label: "Producto", detail: "Nombre, tipo y foto." },
      { key: "sizes", label: "Tamaños y precios", detail: "Agrega todos los tamaños que vendes." },
      { key: "flavors", label: "Sabores", detail: "Opcional; uno por renglón." },
      { key: "review", label: "Revisar y guardar" },
    ]} />
    <Notice kind={kind} message={message} />

    {draft.step === "product" && <>
      <TextInput label="Nombre del producto" placeholder="Ej. Pizza, Alitas, Refresco" required maxLength={150} value={draft.name} editable={!gate.busy} onChangeText={(name) => update({ name })} {...form.field("name")} />
      <Choices label="¿Qué tipo de producto es?" value={draft.type} onChange={(type) => update({ type, sizes: type === "pizza" ? draft.sizes : draft.sizes.map((size) => ({ ...size, half: false })) })} options={productTypes.map(([key, label]) => ({ key, label }))} />
      <TextInput label="Descripción corta (opcional)" multiline maxLength={500} style={ops.textArea} value={draft.description} editable={!gate.busy} onChangeText={(description) => update({ description })} />
      <LogoPicker value={draft.image} onChange={(image) => update({ image })} onError={() => setMessage("No pudimos cargar la imagen. Usa una foto PNG o JPG de hasta 5 MB.", "error")} emptyLabel="Seleccionar o arrastrar foto (opcional)" changeLabel="Cambiar foto" />
      {!!draft.image && <ActionButton label="Quitar foto" variant="secondary" onPress={() => update({ image: "" })} />}
      <WizardNav onNext={() => go("sizes", validators.product)} />
    </>}

    {draft.step === "sizes" && <>
      {isPizza && <View style={ops.actionsRow}>{pizzaSizes.filter((name) => !draft.sizes.some((size) => size.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())).map((name) =>
        <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Agregar tamaño ${name}`} onPress={() => update({ sizes: [...draft.sizes.filter((size) => size.name.trim() || size.price.trim()), newSize(name)] })} style={ops.chip}><ThemedText>+ {name}</ThemedText></Pressable>)}</View>}
      {!!form.errors.sizes && <Notice kind="error" message={form.errors.sizes} />}
      {draft.sizes.map((size, index) => <View key={size.key} style={ops.card}>
        <View style={row}>
          <TextInput style={ops.fieldGrow} label={draft.sizes.length > 1 ? `Tamaño ${index + 1}` : "Tamaño o presentación"} placeholder="Ej. Mediana, 1 litro, 10 piezas" required value={size.name} editable={!gate.busy} onChangeText={(name) => setSize(size.key, { name })} {...form.field(`${size.key}.name`)} />
          <TextInput style={ops.fieldGrow} label="Precio" accessibilityLabel={`Precio de ${size.name || `tamaño ${index + 1}`}`} required keyboardType="decimal-pad" value={size.price} editable={!gate.busy} onChangeText={(price) => setSize(size.key, { price })} {...form.field(`${size.key}.price`)} />
        </View>
        <View style={row}>
          <TextInput style={ops.fieldGrow} label="¿Cuántos sabores puede llevar?" required keyboardType="number-pad" value={size.maxFlavors} editable={!gate.busy} onChangeText={(maxFlavors) => setSize(size.key, { maxFlavors })} {...form.field(`${size.key}.max_flavors`)} />
          {isPizza && <Pressable accessibilityRole="checkbox" aria-checked={size.half} onPress={() => setSize(size.key, { half: !size.half })} style={[ops.chip, size.half && ops.chipActive, ops.fieldGrow]}>
            <ThemedText style={size.half ? ops.chipTextActive : undefined}>{size.half ? "✓ Permite mitad y mitad" : "Permitir mitad y mitad"}</ThemedText>
          </Pressable>}
        </View>
        {draft.sizes.length > 1 && <ActionButton label="Quitar tamaño" accessibilityLabel={`Quitar tamaño ${size.name || index + 1}`} variant="destructive" onPress={() => update({ sizes: draft.sizes.filter((candidate) => candidate.key !== size.key) })} />}
      </View>)}
      <ActionButton label="+ Agregar otro tamaño" variant="secondary" onPress={() => update({ sizes: [...draft.sizes, newSize()] })} />
      <WizardNav onBack={() => go("product")} onNext={() => go("flavors", validators.sizes)} />
    </>}

    {draft.step === "flavors" && <>
      <ThemedText style={ops.muted}>Si el producto no tiene sabores (por ejemplo, un refresco), continúa sin agregar ninguno.</ThemedText>
      <View style={[ops.inline, { alignItems: "flex-start" }]}>
        <TextInput style={ops.fieldGrow} label="Nombre del sabor" placeholder="Ej. Pepperoni" value={draft.flavorInput} onChangeText={(flavorInput) => update({ flavorInput })} onSubmitEditing={addFlavor} {...form.field("flavor")} />
        <ActionButton label="Agregar" variant="secondary" disabled={!draft.flavorInput.trim()} onPress={addFlavor} />
      </View>
      {draft.flavors.map((flavor) => <View key={flavor} style={[ops.insetCard, ops.row, { alignItems: "center" }]}>
        <ThemedText style={[ops.strong, ops.rowGrow]}>{flavor}</ThemedText>
        <ActionButton label="Quitar" accessibilityLabel={`Quitar sabor ${flavor}`} variant="destructive" onPress={() => update({ flavors: draft.flavors.filter((candidate) => candidate !== flavor) })} />
      </View>)}
      <WizardNav onBack={() => go("sizes")} onNext={() => { if (draft.flavorInput.trim()) { form.validate({ flavor: "Pulsa Agregar o borra el sabor escrito antes de continuar." }); return; } go("review"); }} nextLabel="Revisar →" />
    </>}

    {draft.step === "review" && <>
      <View style={[ops.card, ops.row]}>
        {draft.image ? <Image source={{ uri: draft.image }} resizeMode="cover" style={{ width: 96, height: 96, borderRadius: 16 }} /> : null}
        <View style={ops.rowGrow}>
          <ThemedText style={ops.strong}>{draft.name.trim()}</ThemedText>
          <ThemedText style={ops.muted}>{productTypeLabel(draft.type)}{draft.description.trim() ? ` · ${draft.description.trim()}` : ""}</ThemedText>
          {draft.sizes.map((size) => <ThemedText key={size.key}>• {size.name.trim()}: ${moneyText(moneyInput(size.price))}{size.half ? " · mitad y mitad" : ""}{Number(size.maxFlavors) > 1 ? ` · hasta ${size.maxFlavors} sabores` : ""}</ThemedText>)}
          <ThemedText style={ops.muted}>{draft.flavors.length ? `Sabores: ${draft.flavors.join(", ")}` : "Sin sabores"}</ThemedText>
        </View>
      </View>
      <WizardNav onBack={() => go("flavors")} onNext={save} busy={gate.busy} nextLabel="Guardar producto" />
    </>}
    {dirty && <Pressable accessibilityRole="button" onPress={() => { void discard(); }} style={ops.backLink}><ThemedText style={ops.dangerText}>Descartar producto nuevo</ThemedText></Pressable>}
  </Section>;
}
