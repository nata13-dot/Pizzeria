import {ThemedText} from "../../theme/ThemedText";
import {useThemedStyles} from "../../theme/ThemeProvider";
import type {Theme} from "../../theme/tokens";
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useResponsiveLayout } from '../../layout/responsive';
import { api } from '../../api';
import { ActionButton } from '../../components/ActionButton';
import { Notice, useFeedback } from '../../components/Notice';
import { FloatingTextInput as Field } from '../../components/FloatingTextInput';
import { confirmAction } from '../../components/ConfirmationDialog';
import { Pagination, RemoteListStatus } from '../../components/RemoteListStatus';
import { usePaginatedResource } from '../../hooks/useRemoteResource';
import { useWorkField, useWorkGuard } from '../../work/WorkProvider';
import { useActionGate } from '../../forms/useActionGate';
import { useFormErrors } from '../../forms/useFormErrors';
import { decimalInput, operationError, required } from '../../forms/validation';
import type { Ingredient } from '../operations/types';

type Flavor = { id: number; name: string; active: boolean };
type Slot = { id: number; product_flavor_id: number | null; active: boolean; name: string };
type Destination = { id: number; name: string; active: boolean; product: { id: number; name: string; type: string; active: boolean; flavors?: Flavor[] }; recipes?: Slot[] };
type Recipe = { id: number; name: string; active: boolean; product_flavor_id: number | null; variant: Destination; flavor?: Flavor | null; items: { ingredient_id: number; quantity: string | number; component: string; ingredient?: Ingredient }[] };
type Row = { ingredient_id: number; name: string; unit: string; base_unit_id: number; quantity: string; component: string };
type Draft = { id: number | null; source: string; destination: Destination | null; flavor: number | null; name: string; active: boolean; rows: Row[]; ingredient: Ingredient | null; quantity: string; component: string; baseline: string; view: 'list' | 'edit' | 'review' };
const blank = (): Draft => ({ id: null, source: '', destination: null, flavor: null, name: '', active: true, rows: [], ingredient: null, quantity: '', component: 'base', baseline: '', view: 'list' });
const labels: Record<string, string> = { base: 'Base', topping: 'Cobertura', sauce: 'Salsa', packaging: 'Empaque', other: 'Otro' };
const signature = (d: Draft) => JSON.stringify([d.id, d.destination?.id, d.flavor, d.name, d.active, d.rows]);
const destinationLabel = (d: Destination | null, flavor: number | null) => d ? `${d.product.name} · ${d.name} · ${flavor === null ? 'Sin sabor seleccionado' : d.product.flavors?.find(f => f.id === flavor)?.name ?? 'Sabor no disponible'}` : 'Selecciona el producto y su presentación';
const quantityError = (value: string) => { const n = decimalInput(value); return !Number.isFinite(n) || n <= 0 || n > 999999999999.9999 || !/^\d+(?:[.,]\d{1,4})?$/.test(value.trim()) ? 'Ingresa una cantidad mayor que cero, con hasta cuatro decimales.' : ''; };

export function SaleRecipes({ token }: { token: string }) {
  const styles=useThemedStyles(createStyles);
  const [draft, setDraft] = useWorkField<Draft>('recipe', 'editor', blank);
  const [message, setMessage, kind] = useFeedback();
  const gate = useActionGate();
  const form = useFormErrors();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { compact, mobile } = useResponsiveLayout();
  const directory = usePaginatedResource<Recipe>('/recipes', token, 'las recetas', 300);
  const destinations = usePaginatedResource<Destination>('/recipes/destinations', token, 'los productos y tamaños', 300, draft.view === 'edit' && !draft.id);
  const ingredients = usePaginatedResource<Ingredient>('/ingredients?active=1&per_page=25', token, 'los ingredientes', 300, draft.view === 'edit');
  const dirty = signature(draft) !== (draft.baseline || signature(blank())) || !!draft.quantity || !!draft.ingredient;
  useWorkGuard('recipe', 'la receta de venta', dirty, gate.busy, true);
  const update = (patch: Partial<Draft>) => { if (!gate.busy) setDraft(current => ({ ...current, ...patch })); };
  async function mayReplace() {
    return !dirty || await confirmAction('Se reemplazarán los cambios de la receta abierta. Puedes seguir editándola.', { title: 'Cambiar de receta', acceptLabel: 'Reemplazar cambios', cancelLabel: 'Seguir editando' });
  }
  function fresh() { return gate.run(async () => { if (await mayReplace()) { setDraft({ ...blank(), view: 'edit' }); form.clear(); setMessage(''); } }); }
  async function openRecipe(id: number, copy = false) {
    await gate.run(async () => {
      if (!await mayReplace()) return;
      try {
        const r = await api<Recipe>(`/recipes/${id}`, token, { cache: 'reload' });
        const dest = await api<Destination>(`/recipes/destinations/${r.variant.id}`, token, { cache: 'reload' });
        if (!mounted.current) return;
        const next: Draft = { ...blank(), id: copy ? null : r.id, source: copy ? destinationLabel(dest, r.product_flavor_id) : '', destination: copy ? null : dest, flavor: copy ? null : r.product_flavor_id, name: copy ? `${r.name} (copia)` : r.name, active: copy || r.active, view: 'edit', rows: r.items.map(item => ({ ingredient_id: item.ingredient_id, name: item.ingredient?.name ?? 'Ingrediente no disponible', unit: item.ingredient?.base_unit?.symbol ?? '', base_unit_id: item.ingredient?.base_unit_id ?? 0, quantity: String(item.quantity), component: item.component })) };
        next.baseline = copy ? '' : signature(next);
        setDraft(next); form.clear(); setMessage(copy ? 'Elige un destino nuevo y revisa las cantidades. Aún no se ha creado la copia.' : '');
      } catch (error) { setMessage(operationError(error, 'abrir la receta'), 'error'); }
    });
  }
  const occupied = draft.destination?.recipes?.find(r => r.product_flavor_id === draft.flavor && r.id !== draft.id);
  function chooseDestination(dest: Destination, flavor: number | null = null) {
    return gate.run(async () => {
      if (draft.id || (dest.id === draft.destination?.id && flavor === draft.flavor)) return;
      if (draft.destination && (draft.rows.length || draft.name.trim()) && !await confirmAction(`Los ingredientes se conservarán y se usarán para ${destinationLabel(dest, flavor)}.`, { title: 'Cambiar destino de la receta', acceptLabel: 'Cambiar destino', cancelLabel: 'Conservar destino' })) return;
      setDraft(current => ({ ...current, destination: dest, flavor })); form.clear();
    });
  }
  function add() {
    if (gate.busy) return;
    const duplicate = draft.rows.some(row => row.ingredient_id === draft.ingredient?.id && row.component === draft.component);
    if (!form.validate({ quantity: quantityError(draft.quantity), ingredient: !draft.ingredient ? 'Selecciona un ingrediente.' : !draft.ingredient.base_unit ? 'No conocemos la unidad. Actualiza la búsqueda antes de agregar.' : duplicate ? 'Este ingrediente ya está en esa función. Cambia su cantidad en la lista.' : '' }) || !draft.ingredient?.base_unit) return;
    const ingredient = draft.ingredient;
    update({ rows: [...draft.rows, { ingredient_id: ingredient.id, name: ingredient.name, unit: ingredient.base_unit!.symbol, base_unit_id: ingredient.base_unit_id, quantity: draft.quantity.trim().replace(',', '.'), component: draft.component }], quantity: '', ingredient: null });
  }
  function validate() {
    return form.validate({ name: required(draft.name, 'el nombre de la receta'), destination: !draft.destination ? 'Selecciona el producto y presentación.' : occupied ? 'Ese destino ya tiene receta. Abre la existente para editarla.' : '', items: !draft.rows.length ? 'Agrega al menos un ingrediente.' : draft.ingredient || draft.quantity.trim() ? 'Agrega el ingrediente pendiente o limpia su selección y cantidad antes de guardar.' : '', ...Object.fromEntries(draft.rows.map((row, index) => [`quantity.${index}`, quantityError(row.quantity)])) });
  }
  function review() { if (validate()) update({ view: 'review' }); }
  function save() {
    return gate.run(async () => {
      if (!validate() || !draft.destination) { setDraft(d => ({ ...d, view: 'edit' })); return; }
      setMessage('');
      try {
        // Revalidate the exact selected ID, never a first-page lookup or a default.
        const current = await api<Destination>(`/recipes/destinations/${draft.destination.id}`, token, { cache: 'reload' });
        const existing = current.recipes?.find(r => r.product_flavor_id === draft.flavor && r.id !== draft.id);
        setDraft(d => ({ ...d, destination: current }));
        if (existing) { setMessage('Ya existe una receta en ese destino. Revisa la existente; no se creó otra receta.', 'warning'); return; }
        if (!current.active || !current.product.active || (draft.flavor !== null && !current.product.flavors?.some(f => f.id === draft.flavor && f.active))) { setMessage('El producto, presentación o sabor ya no está disponible. Revisa el destino.', 'error'); return; }
        for (const row of draft.rows) {
          const ingredient = await api<Ingredient>(`/ingredients/${row.ingredient_id}`, token, { cache: 'reload' });
          if (!ingredient.active || ingredient.base_unit_id !== row.base_unit_id) { setMessage(`Revisa ${row.name}: cambió su disponibilidad o unidad. No se guardó la receta.`, 'error'); return; }
        }
        const saved = await api<Recipe>(draft.id ? `/recipes/${draft.id}` : '/recipes', token, { method: draft.id ? 'PUT' : 'POST', body: JSON.stringify({ ...(draft.id ? {} : { product_variant_id: current.id }), product_flavor_id: draft.flavor, name: draft.name.trim(), active: draft.active, items: draft.rows.map(row => ({ ingredient_id: row.ingredient_id, quantity: decimalInput(row.quantity), component: row.component })) }) });
        setDraft(blank()); form.clear(); setMessage(draft.id ? 'Cambios de receta guardados.' : 'Receta de venta registrada.'); directory.reload();
        // A refresh failure cannot convert this confirmed save into another write.
        void saved;
      } catch (error) {
        form.fromError(error, { name: 'el nombre', items: 'los ingredientes y cantidades', product_variant_id: 'el producto y presentación', product_flavor_id: 'el sabor' }, { product_variant_id: 'destination', product_flavor_id: 'destination' });
        setMessage(operationError(error, 'guardar la receta', true) + ' Si el resultado no se confirmó, revisa el listado antes de repetir.', 'error');
      }
    });
  }
  function deactivate() {
    return gate.run(async () => {
      if (!draft.id || !await confirmAction('Esta receta dejará de estar disponible para nuevas selecciones que la necesiten. No se cambia el inventario ni se cancelan pedidos registrados. Puedes reactivarla después.', { title: 'Desactivar receta', acceptLabel: 'Desactivar receta', cancelLabel: 'Conservar receta' })) return;
      try { await api(`/recipes/${draft.id}`, token, { method: 'DELETE' }); setDraft(blank()); directory.reload(); setMessage('Receta desactivada.'); }
      catch (error) { setMessage(operationError(error, 'desactivar la receta', true), 'error'); }
    });
  }
  const choice = (label: string, selected: boolean, onPress: () => void, key: string | number) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected, disabled: gate.busy }} disabled={gate.busy} onPress={onPress} style={[styles.choice, selected && styles.selected]}><ThemedText>{label}</ThemedText></Pressable>;
  return <View style={styles.section}>
    <ThemedText style={styles.title}>Recetas de venta</ThemedText>
    <ThemedText>Define lo que se descuenta al enviar a cocina una unidad vendida. Las recetas de producción se gestionan en Producción.</ThemedText>
    <Notice kind={kind} message={message} />
    <View style={[styles.layout, compact && styles.column, mobile && styles.mobileLayout]}>
      {(!compact || draft.view === 'list') && <View style={styles.panel}>
        <Field style={styles.field} label="Buscar receta, producto, tamaño o sabor" value={directory.search} maxLength={100} onChangeText={directory.setSearch} />
        <ActionButton label="Crear receta" loadingLabel="Abriendo…" variant="secondary" disabled={gate.busy} onPress={fresh} />
        <RemoteListStatus {...directory} count={directory.items.length} emptyText="Aún no hay recetas registradas." onRetry={directory.reload} />
        {directory.items.map(r => <View key={r.id} style={styles.card}><ThemedText style={styles.heading}>{r.name}{!r.active ? ' (inactiva)' : ''}</ThemedText><ThemedText>{r.variant.product.name} · {r.variant.name} · {r.flavor?.name ?? 'Sin sabor seleccionado'}</ThemedText><ActionButton variant="secondary" label={`Editar receta ${r.name}`} loadingLabel="Abriendo…" disabled={gate.busy} onPress={() => openRecipe(r.id)} /><ActionButton variant="secondary" label={`Duplicar receta ${r.name}`} loadingLabel="Preparando copia…" disabled={gate.busy} onPress={() => openRecipe(r.id, true)} /></View>)}
        <Pagination {...directory} onPage={directory.setPage} />
      </View>}
      {draft.view !== 'list' && <View style={styles.panel}>
        <ActionButton variant="secondary" label="Ver listado (conservar cambios)" disabled={gate.busy} onPress={() => update({ view: 'list' })} />
        <ThemedText style={styles.title}>{draft.id ? 'Editar receta de venta' : draft.source ? 'Duplicar receta de venta' : 'Crear receta de venta'}</ThemedText>
        {!!draft.source && <ThemedText>Copiada de: {draft.source}. Ajusta cantidades para el nuevo destino.</ThemedText>}
        <ThemedText style={styles.heading}>{destinationLabel(draft.destination, draft.flavor)}</ThemedText>
        {!!draft.id && <ThemedText>El destino de esta edición está fijo. Para otro tamaño o sabor, usa Duplicar receta desde el listado.</ThemedText>}
        <Notice kind="error" message={form.errors.destination} />
        {!!occupied && <><Notice kind="warning" message="Ya existe una receta para este destino, incluso si está inactiva." /><ActionButton label="Editar receta existente" disabled={gate.busy} onPress={() => openRecipe(occupied.id)} /></>}
        {draft.view === 'edit' && <>
          {!draft.id && <>
            <Field style={styles.field} label="Buscar producto o tamaño" value={destinations.search} maxLength={100} onChangeText={destinations.setSearch} />
            <View style={styles.choices}>{destinations.items.map(d => choice(`${d.product.name} · ${d.name}`, draft.destination?.id === d.id, () => { void chooseDestination(d); }, d.id))}</View>
            <RemoteListStatus {...destinations} count={destinations.items.length} emptyText="No hay presentaciones activas. Configura el producto antes de crear su receta." onRetry={destinations.reload} /><Pagination {...destinations} onPage={destinations.setPage} />
            {!!draft.destination?.product.flavors?.length && <><ThemedText style={styles.heading}>Sabor de esta receta</ThemedText><View style={styles.choices}>{choice('Sin sabor seleccionado', draft.flavor === null, () => { void chooseDestination(draft.destination!); }, 'none')}{draft.destination.product.flavors.filter(f => f.active).map(f => choice(f.name, draft.flavor === f.id, () => { void chooseDestination(draft.destination!, f.id); }, f.id))}</View><ThemedText>Sin sabor no es una receta para todos los sabores. Cada sabor que se venda necesita su receta.</ThemedText></>}
          </>}
          <Field style={styles.field} label="Nombre de la receta" required maxLength={150} value={draft.name} editable={!gate.busy} onChangeText={name => update({ name })} {...form.field('name')} />
          <ThemedText style={styles.heading}>Buscar ingrediente</ThemedText>
          <Field style={styles.field} label="Buscar insumo por nombre o SKU" value={ingredients.search} maxLength={100} onChangeText={ingredients.setSearch} />
          <View style={styles.choices}>{ingredients.items.map(i => choice(`${i.name} · ${i.base_unit?.symbol ?? 'unidad no disponible'}`, draft.ingredient?.id === i.id, () => update({ ingredient: i }), i.id))}</View>
          <RemoteListStatus {...ingredients} count={ingredients.items.length} emptyText="No hay insumos activos registrados." onRetry={ingredients.reload} /><Pagination {...ingredients} onPage={ingredients.setPage} />
          <Notice kind="error" message={form.errors.ingredient} />
          {!!draft.ingredient && <ThemedText>Seleccionado: {draft.ingredient.name} · registra la cantidad en {draft.ingredient.base_unit?.symbol ?? 'unidad no disponible'}.</ThemedText>}
          <ThemedText style={styles.heading}>Función en la receta</ThemedText>
          <View style={styles.choices}>{Object.entries(labels).map(([k, label]) => choice(label, draft.component === k, () => update({ component: k }), k))}</View>
          <ThemedText>{draft.destination?.product.type === 'pizza' ? 'En mitad y mitad, Base, Salsa y Empaque se usan completos; Cobertura y Otro se reparten entre los sabores.' : 'Al combinar sabores, Salsa se reparte entre ellos; las otras funciones se toman completas de una receta.'} No se realizan conversiones de presentación.</ThemedText>
          <Field style={styles.field} label={`Cantidad a agregar${draft.ingredient?.base_unit ? ` (${draft.ingredient.base_unit.symbol})` : ''}`} required keyboardType="decimal-pad" value={draft.quantity} editable={!gate.busy} onChangeText={quantity => update({ quantity })} {...form.field('quantity')} />
          <ActionButton label="Agregar ingrediente" variant="secondary" disabled={gate.busy} onPress={add} />
          {(draft.ingredient || draft.quantity) && <ActionButton label="Limpiar selección pendiente" variant="secondary" disabled={gate.busy} onPress={() => update({ ingredient: null, quantity: '' })} />}
        </>}
        <ThemedText style={styles.heading}>Ingredientes de esta receta · {draft.rows.length}</ThemedText>
        <Notice kind="error" message={form.errors.items} />
        {!draft.rows.length && <ThemedText>Agrega al menos un ingrediente.</ThemedText>}
        {draft.rows.map((row, index) => <View style={styles.card} key={`${row.ingredient_id}-${row.component}`}><ThemedText style={styles.heading}>{row.name} · {labels[row.component] ?? row.component}</ThemedText>{draft.view === 'edit' ? <><Field style={styles.field} label={`Cantidad de ${row.name} (${row.unit || 'unidad no disponible'}) · ${labels[row.component]}`} required keyboardType="decimal-pad" value={row.quantity} editable={!gate.busy} onChangeText={quantity => update({ rows: draft.rows.map((r, i) => i === index ? { ...r, quantity } : r) })} {...form.field(`quantity.${index}`)} /><ActionButton label={`Quitar ${row.name} · ${labels[row.component]}`} variant="secondary" disabled={gate.busy} onPress={() => update({ rows: draft.rows.filter((_, i) => i !== index) })} /></> : <ThemedText>{row.quantity} {row.unit}</ThemedText>}</View>)}
        {!draft.active && <ActionButton label="Reactivar al guardar" variant="secondary" disabled={gate.busy} onPress={() => update({ active: true })} />}
        {draft.view === 'review' ? <><ThemedText>Se {draft.id ? 'actualizará la receta existente' : 'creará una receta nueva'} para {destinationLabel(draft.destination, draft.flavor)}. Guardar no mueve inventario.</ThemedText><ActionButton label="Volver a editar" variant="secondary" disabled={gate.busy} onPress={() => update({ view: 'edit' })} /><ActionButton label={draft.id ? 'Guardar cambios' : 'Guardar receta'} loading={gate.busy} disabled={!!occupied} onPress={save} /></> : <ActionButton label="Revisar receta" disabled={gate.busy || !!occupied} onPress={review} />}
        {!!draft.id && draft.active && <ActionButton label="Desactivar receta" variant="destructive" disabled={gate.busy || dirty} disabledReason="Guarda o descarta los cambios antes de desactivar." onPress={deactivate} />}
        <ActionButton label="Descartar cambios de receta" variant="secondary" disabled={gate.busy} onPress={() => gate.run(async () => { if (await mayReplace()) { setDraft(blank()); form.clear(); } })} />
      </View>}
    </View>
    {draft.view === 'list' && dirty && <ActionButton label="Continuar receta pendiente" onPress={() => update({ view: 'edit' })} />}
  </View>;
}
const createStyles=(theme:Theme)=>StyleSheet.create({ field: { minHeight: theme.control.minTouch, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, padding: 12, backgroundColor: theme.colors.surfaceMuted }, section: { gap: 16, marginVertical: 20 }, title: { ...theme.typography.heading,color:theme.colors.text }, heading: { ...theme.typography.subheading,color:theme.colors.text }, layout: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' }, column: { flexDirection: 'column' }, mobileLayout: { gap: 12 }, panel: { flex: 1, width: '100%', minWidth: 0, gap: 12 }, card: { ...theme.shadows.surface, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 16, borderRadius: theme.radius.card, gap: 12 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { backgroundColor: theme.colors.surfaceMuted, flexGrow: 1, minHeight: theme.control.minTouch, justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill }, selected: { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primary } });
