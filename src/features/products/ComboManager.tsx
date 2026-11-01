import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { api } from "../../api";
import { ActionButton } from "../../components/ActionButton";
import { confirmAction } from "../../components/ConfirmationDialog";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { Notice, useFeedback } from "../../components/Notice";
import { RemoteListStatus } from "../../components/RemoteListStatus";
import { useActionGate } from "../../forms/useActionGate";
import { useFormErrors } from "../../forms/useFormErrors";
import { moneyInput, operationError, required } from "../../forms/validation";
import { useRemoteResource } from "../../hooks/useRemoteResource";
import { useResponsiveLayout } from "../../layout/responsive";
import { moneyMultiply, moneySum } from "../../money";
import { ThemedText } from "../../theme/ThemedText";
import { useTheme } from "../../theme/ThemeProvider";
import { useWorkField, useWorkGuard } from "../../work/WorkProvider";
import { LogoPicker } from "../administration/LogoPicker";
import { Choices, moneyText, Section, useOpsStyles } from "../operations/ui";

type Flavor = { id: number; name: string; active?: boolean };
type Variant = { id: number; name: string; price: string | number; active?: boolean };
export type CatalogProduct = { id: number; name: string; type: string; active?: boolean; flavors?: Flavor[]; variants?: Variant[] };
type ComboItem = { id: number; product_variant_id: number; quantity: string | number; flavor_required: boolean; flavor_selection_count: number | null; active: boolean; options: { product_flavor_id: number | null; modifier_id: number | null }[]; variant?: { id: number; name: string; product?: { id: number; name: string } } };
type Combo = { id: number; name: string; price: string | number; image_data_uri: string | null; active: boolean; available_days: number[] | null; items: ComboItem[] };
type Row = { key: string; id: number | null; productId: number | null; variantId: number | null; quantity: string; chooseFlavor: boolean; limit: boolean; flavorIds: number[]; selectionCount: number | null };
type Draft = { open: boolean; id: number | null; name: string; price: string; image: string; days: number[]; rows: Row[] };

const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const weekOrder = [1, 2, 3, 4, 5, 6, 0];
export const daysText = (days: number[] | null | undefined) => !days?.length || days.length === 7 ? "Todos los días" : weekOrder.filter((day) => days.includes(day)).map((day) => dayNames[day]).join(", ");
let rowKey = 0;
const newRow = (): Row => ({ key: `row-${Date.now()}-${rowKey++}`, id: null, productId: null, variantId: null, quantity: "1", chooseFlavor: true, limit: false, flavorIds: [], selectionCount: null });
const blank = (): Draft => ({ open: false, id: null, name: "", price: "", image: "", days: [], rows: [newRow()] });

/** Packages and promotions: several products at one price, one flavor per piece, optional days. */
export function ComboManager({ products, token }: { products: CatalogProduct[]; token: string }) {
  const ops = useOpsStyles();
  const { theme } = useTheme();
  const { compact } = useResponsiveLayout();
  const gate = useActionGate();
  const form = useFormErrors();
  const [message, setMessage, kind] = useFeedback();
  const [draft, setDraft] = useWorkField<Draft>("combo", "draft", blank);
  const combos = useRemoteResource<Combo[]>("/combos?include_inactive=1", token, "los paquetes");
  const dirty = draft.open && !!(draft.name.trim() || draft.price.trim() || draft.image || draft.rows.some((row) => row.variantId));
  useWorkGuard("combo", "el paquete", dirty, gate.busy, true);
  const update = (patch: Partial<Draft>) => { if (!gate.busy) setDraft({ ...draft, ...patch }); };
  const setRow = (key: string, patch: Partial<Row>) => update({ rows: draft.rows.map((row) => row.key === key ? { ...row, ...patch } : row) });

  const activeProducts = products.filter((product) => product.active !== false && (product.variants ?? []).some((variant) => variant.active !== false));
  const productOf = (productId: number | null) => products.find((product) => product.id === productId) ?? null;
  const variantOf = (row: Row) => productOf(row.productId)?.variants?.find((variant) => variant.id === row.variantId) ?? null;
  const findVariant = (variantId: number) => { for (const product of products) { const variant = product.variants?.find((candidate) => candidate.id === variantId); if (variant) return { product, variant }; } return null; };
  const regular = (() => { try { return moneySum(draft.rows.map((row) => { const variant = variantOf(row); const quantity = Number(row.quantity); return variant && Number.isInteger(quantity) && quantity > 0 ? moneyMultiply(variant.price, quantity) : 0; })); } catch { return 0; } })();
  const price = moneyInput(draft.price);

  function edit(combo: Combo) {
    form.clear(); setMessage("");
    setDraft({
      open: true, id: combo.id, name: combo.name, price: String(Number(combo.price)), image: combo.image_data_uri ?? "", days: combo.available_days ?? [],
      rows: combo.items.filter((item) => item.active !== false).map((item) => {
        const found = findVariant(item.product_variant_id);
        const flavorIds = item.options.map((option) => option.product_flavor_id).filter((id): id is number => id !== null);
        return { ...newRow(), id: item.id, productId: found?.product.id ?? item.variant?.product?.id ?? null, variantId: item.product_variant_id, quantity: String(Number(item.quantity)), chooseFlavor: item.flavor_required, limit: flavorIds.length > 0, flavorIds, selectionCount: item.flavor_selection_count };
      }),
    });
  }

  function validate(): boolean {
    const errors: Record<string, string> = {
      name: required(draft.name, "el nombre del paquete"),
      price: !Number.isFinite(price) || price < 0 ? "Escribe el precio del paquete, por ejemplo 299." : "",
      rows: !draft.rows.length ? "Agrega al menos un producto." : "",
    };
    draft.rows.forEach((row) => {
      const quantity = Number(row.quantity);
      if (!row.variantId) errors[`${row.key}.variant`] = "Elige el producto y su tamaño.";
      if (!Number.isInteger(quantity) || quantity < 1) errors[`${row.key}.quantity`] = "Escribe cuántas piezas, un número entero.";
      if (row.limit && !row.flavorIds.length) errors[`${row.key}.flavors`] = "Elige al menos un sabor permitido o quita el límite.";
    });
    return form.validate(errors);
  }

  function save() {
    return gate.run(async () => {
      setMessage("");
      if (!validate()) return;
      const body = {
        name: draft.name.trim(), price, image_data_uri: draft.image || null, available_days: draft.days.length && draft.days.length < 7 ? draft.days : null,
        items: draft.rows.map((row) => {
          const hasFlavors = !!productOf(row.productId)?.flavors?.some((flavor) => flavor.active !== false);
          return { ...(row.id ? { id: row.id } : {}), product_variant_id: row.variantId, quantity: Number(row.quantity), flavor_required: hasFlavors && row.chooseFlavor, flavor_selection_count: row.selectionCount, options: row.limit ? row.flavorIds.map((id) => ({ product_flavor_id: id })) : [] };
        }),
      };
      try {
        await api(draft.id ? `/combos/${draft.id}` : "/combos", token, { method: draft.id ? "PUT" : "POST", body: JSON.stringify(body) });
        setMessage(draft.id ? `${body.name} actualizado.` : `${body.name} creado. Ya aparece en Caja ${daysText(body.available_days).toLocaleLowerCase()}.`);
        setDraft(blank()); form.clear(); combos.reload();
      } catch (error) {
        form.fromError(error, { name: "el nombre (puede que ya exista otro paquete con ese nombre)", price: "el precio", image_data_uri: "la imagen", available_days: "los días", items: "los productos del paquete" }, { items: "rows" });
        setMessage(operationError(error, "guardar el paquete", true), "error");
      }
    });
  }

  const toggle = (combo: Combo) => gate.run(async () => {
    if (combo.active && !await confirmAction(`${combo.name} dejará de aparecer en Caja. Los pedidos registrados no cambian y podrás reactivarlo.`, { title: "Desactivar paquete", acceptLabel: "Desactivar paquete", cancelLabel: "Conservar paquete" })) return;
    try {
      await api(`/combos/${combo.id}`, token, combo.active ? { method: "DELETE" } : { method: "PATCH", body: JSON.stringify({ active: true }) });
      setMessage(combo.active ? `${combo.name} fue desactivado.` : `${combo.name} está activo de nuevo.`); combos.reload();
    } catch (error) { setMessage(operationError(error, combo.active ? "desactivar el paquete" : "reactivar el paquete", true), "error"); }
  });

  async function close() {
    if (dirty && !await confirmAction("Se perderán los cambios de este paquete.", { title: "Descartar cambios del paquete", acceptLabel: "Descartar cambios", cancelLabel: "Seguir editando" })) return;
    setDraft(blank()); form.clear();
  }

  if (draft.open) return <Section title={draft.id ? `Editar ${draft.name || "paquete"}` : "Nuevo paquete o promoción"} subtitle="Varios productos a un precio. En Caja se elige el sabor de cada pieza.">
    <Pressable accessibilityRole="button" onPress={() => { void close(); }} style={ops.backLink}><ThemedText style={ops.backLinkText}>← Volver a paquetes</ThemedText></Pressable>
    <Notice kind={kind} message={message} />
    <View style={[ops.inline, compact && ops.inlineCompact]}>
      <TextInput style={ops.fieldGrow} label="Nombre" placeholder="Ej. 2 medianas por $299" required maxLength={150} value={draft.name} editable={!gate.busy} onChangeText={(name) => update({ name })} {...form.field("name")} />
      <TextInput style={ops.fieldGrow} label="Precio del paquete" required keyboardType="decimal-pad" value={draft.price} editable={!gate.busy} onChangeText={(value) => update({ price: value })} {...form.field("price")} />
    </View>

    <ThemedText style={ops.subtitle}>¿Qué incluye?</ThemedText>
    {!!form.errors.rows && <Notice kind="error" message={form.errors.rows} />}
    {draft.rows.map((row, index) => {
      const product = productOf(row.productId);
      const flavors = (product?.flavors ?? []).filter((flavor) => flavor.active !== false);
      const variants = (product?.variants ?? []).filter((variant) => variant.active !== false || variant.id === row.variantId);
      return <View key={row.key} style={ops.card}>
        <View style={ops.row}>
          <ThemedText style={[ops.strong, ops.rowGrow]}>Producto {index + 1}{variantOf(row) ? `: ${product?.name} ${variantOf(row)?.name}` : ""}</ThemedText>
          {draft.rows.length > 1 && <ActionButton label="Quitar" accessibilityLabel={`Quitar producto ${index + 1} del paquete`} variant="destructive" onPress={() => update({ rows: draft.rows.filter((candidate) => candidate.key !== row.key) })} />}
        </View>
        <Choices label="Producto" value={row.productId} onChange={(productId) => setRow(row.key, { productId, variantId: (productOf(productId)?.variants ?? []).filter((variant) => variant.active !== false).length === 1 ? productOf(productId)!.variants!.find((variant) => variant.active !== false)!.id : null, flavorIds: [], limit: false })} options={activeProducts.map((candidate) => ({ key: candidate.id, label: candidate.name }))} />
        {product && <Choices label="Tamaño" value={row.variantId} error={form.errors[`${row.key}.variant`]} onChange={(variantId) => setRow(row.key, { variantId })} options={variants.map((variant) => ({ key: variant.id, label: variant.name, hint: `$${moneyText(variant.price)}` }))} />}
        {!product && !!form.errors[`${row.key}.variant`] && <ThemedText accessibilityRole="alert" style={ops.fieldError}>Error: {form.errors[`${row.key}.variant`]}</ThemedText>}
        <TextInput label="¿Cuántas piezas?" accessibilityLabel={`Piezas del producto ${index + 1}`} required keyboardType="number-pad" value={row.quantity} editable={!gate.busy} onChangeText={(quantity) => setRow(row.key, { quantity })} {...form.field(`${row.key}.quantity`)} />
        {flavors.length > 0 && <>
          <Pressable accessibilityRole="checkbox" aria-checked={row.chooseFlavor} onPress={() => setRow(row.key, { chooseFlavor: !row.chooseFlavor })} style={[ops.chip, row.chooseFlavor && ops.chipActive, ops.fullWidthButton]}>
            <ThemedText style={row.chooseFlavor ? ops.chipTextActive : undefined}>{row.chooseFlavor ? `✓ En Caja se elige el sabor${Number(row.quantity) > 1 ? " de cada pieza" : ""}` : "El cliente no elige sabor"}</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="checkbox" aria-checked={row.limit} onPress={() => setRow(row.key, { limit: !row.limit, flavorIds: row.limit ? [] : row.flavorIds })} style={[ops.chip, row.limit && ops.chipActive, ops.fullWidthButton]}>
            <ThemedText style={row.limit ? ops.chipTextActive : undefined}>{row.limit ? "✓ Solo algunos sabores" : "Limitar a algunos sabores (opcional)"}</ThemedText>
          </Pressable>
          {row.limit && <View style={ops.choiceGroup}>
            <ThemedText style={ops.label}>Sabores permitidos</ThemedText>
            <View style={ops.chips}>{flavors.map((flavor) => {
              const checked = row.flavorIds.includes(flavor.id);
              return <Pressable key={flavor.id} accessibilityRole="checkbox" aria-checked={checked} onPress={() => setRow(row.key, { flavorIds: checked ? row.flavorIds.filter((id) => id !== flavor.id) : [...row.flavorIds, flavor.id] })} style={[ops.chip, checked && ops.chipActive]}><ThemedText style={checked ? ops.chipTextActive : undefined}>{checked ? "✓ " : ""}{flavor.name}</ThemedText></Pressable>;
            })}</View>
            {!!form.errors[`${row.key}.flavors`] && <ThemedText accessibilityRole="alert" style={ops.fieldError}>Error: {form.errors[`${row.key}.flavors`]}</ThemedText>}
          </View>}
        </>}
      </View>;
    })}
    <ActionButton label="+ Agregar otro producto" variant="secondary" onPress={() => update({ rows: [...draft.rows, newRow()] })} />

    <ThemedText style={ops.subtitle}>¿Qué días se vende?</ThemedText>
    <View style={ops.chips}>
      <Pressable accessibilityRole="checkbox" aria-checked={!draft.days.length} onPress={() => update({ days: [] })} style={[ops.chip, !draft.days.length && ops.chipActive]}><ThemedText style={!draft.days.length ? ops.chipTextActive : undefined}>Todos los días</ThemedText></Pressable>
      {weekOrder.map((day) => {
        const checked = draft.days.includes(day);
        return <Pressable key={day} accessibilityRole="checkbox" aria-checked={checked} accessibilityLabel={dayNames[day]} onPress={() => update({ days: checked ? draft.days.filter((candidate) => candidate !== day) : [...draft.days, day] })} style={[ops.chip, checked && ops.chipActive]}><ThemedText style={checked ? ops.chipTextActive : undefined}>{dayNames[day].slice(0, 3)}</ThemedText></Pressable>;
      })}
    </View>
    <ThemedText style={ops.muted}>{daysText(draft.days)}. Fuera de esos días no aparece en Caja.</ThemedText>

    <LogoPicker value={draft.image} onChange={(image) => update({ image })} onError={() => setMessage("No pudimos cargar la imagen. Usa una foto PNG o JPG de hasta 5 MB.", "error")} emptyLabel="Seleccionar foto del paquete (opcional)" changeLabel="Cambiar foto" />
    {!!draft.image && <ActionButton label="Quitar foto" variant="secondary" onPress={() => update({ image: "" })} />}

    {regular > 0 && Number.isFinite(price) && <Notice kind={price < regular ? "info" : "warning"} message={price < regular ? `Precio normal $${moneyText(regular)} · el cliente ahorra $${moneyText(regular - price)}.` : `Precio normal $${moneyText(regular)}: el paquete cuesta igual o más que comprar por separado.`} />}
    <View style={ops.actionsRow}>
      <ActionButton label={draft.id ? "Guardar cambios" : "Crear paquete"} loading={gate.busy} onPress={save} />
      <ActionButton label="Cancelar" variant="secondary" disabled={gate.busy} onPress={() => { void close(); }} />
    </View>
  </Section>;

  const list = combos.data ?? [];
  return <Section title="Paquetes y promociones" subtitle="Varios productos a un precio especial, por ejemplo “2 medianas por $299”.">
    <Notice kind={kind} message={message} />
    <ActionButton label="+ Nuevo paquete o promoción" onPress={() => { form.clear(); setMessage(""); setDraft({ ...blank(), open: true }); }} />
    <RemoteListStatus loading={combos.loading && !combos.data} error={combos.error} count={list.length} emptyText="Todavía no hay paquetes ni promociones." onRetry={combos.reload} />
    <View style={[ops.chips, { gap: 10 }]}>{list.map((combo) => <View key={combo.id} style={[ops.card, { flexBasis: 300, flexGrow: 1 }, !combo.active && ops.disabled]}>
      <View style={[ops.row, { alignItems: "center" }]}>
        {combo.image_data_uri ? <Image source={{ uri: combo.image_data_uri }} style={{ width: 56, height: 56, borderRadius: 14 }} /> : <ThemedText style={{ fontSize: 32 * theme.fontScale }}>🍕</ThemedText>}
        <View style={ops.rowGrow}>
          <ThemedText style={ops.strong}>{combo.name}</ThemedText>
          <ThemedText style={ops.value}>${moneyText(combo.price)}</ThemedText>
        </View>
      </View>
      <ThemedText style={ops.muted}>{combo.items.filter((item) => item.active !== false).map((item) => `${Number(item.quantity)} × ${item.variant?.product?.name ?? "Producto"} ${item.variant?.name ?? ""}`.trim()).join(" + ")}</ThemedText>
      <ThemedText style={ops.muted}>{daysText(combo.available_days)}{combo.active ? "" : " · Desactivado"}</ThemedText>
      <View style={ops.actionsRow}>
        <ActionButton label="Editar" accessibilityLabel={`Editar paquete ${combo.name}`} variant="secondary" disabled={gate.busy} onPress={() => edit(combo)} />
        <ActionButton label={combo.active ? "Desactivar" : "Reactivar"} accessibilityLabel={`${combo.active ? "Desactivar" : "Reactivar"} paquete ${combo.name}`} variant={combo.active ? "destructive" : "secondary"} disabled={gate.busy} onPress={() => toggle(combo)} />
      </View>
    </View>)}</View>
  </Section>;
}
