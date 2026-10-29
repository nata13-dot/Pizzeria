import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../../api";
import { ActionButton } from "../../../components/ActionButton";
import { confirmAction } from "../../../components/ConfirmationDialog";
import { FloatingTextInput as TextInput } from "../../../components/FloatingTextInput";
import { Notice } from "../../../components/Notice";
import { useActionGate } from "../../../forms/useActionGate";
import { useFormErrors } from "../../../forms/useFormErrors";
import { decimalInput, operationError, required } from "../../../forms/validation";
import { ThemedText } from "../../../theme/ThemedText";
import { useWorkField, useWorkGuard } from "../../../work/WorkProvider";
import type { InventoryBatch, InventoryItem } from "../types";
import { Choices, dateText, localDateValue, numberValue, quantityText, Section, useOpsStyles } from "../ui";

type Reason = "waste" | "expiry" | "preparation_error" | "gift" | "internal_use" | "loss" | "correction";
type ChoiceKey = Exclude<Reason, "correction"> | "count_up" | "count_down";

const choices: { key: ChoiceKey; label: string; reason: Reason; adds: boolean }[] = [
  { key: "waste", label: "Merma o se echó a perder", reason: "waste", adds: false },
  { key: "expiry", label: "Caducó", reason: "expiry", adds: false },
  { key: "preparation_error", label: "Error al preparar", reason: "preparation_error", adds: false },
  { key: "internal_use", label: "Consumo del personal", reason: "internal_use", adds: false },
  { key: "gift", label: "Regalo o cortesía", reason: "gift", adds: false },
  { key: "loss", label: "Se perdió", reason: "loss", adds: false },
  { key: "count_down", label: "Conté y hay menos", reason: "correction", adds: false },
  { key: "count_up", label: "Conté y hay más", reason: "correction", adds: true },
];

type Draft = { ingredientId: number | null; choice: ChoiceKey | null; quantity: string; comment: string; batchId: number | null; pickLot: boolean };
const blank = (ingredientId: number | null = null, batchId: number | null = null): Draft => ({ ingredientId, choice: null, quantity: "", comment: "", batchId, pickLot: batchId !== null });

const expired = (batch: InventoryBatch) => Boolean(batch.expires_at && batch.expires_at.slice(0, 10) < localDateValue());

/** Records waste or a stock count correction for one ingredient; the API picks lots FEFO unless one is chosen. */
export function AdjustStockForm({ token, item, initialBatchId, onDone, onCancel }: {
  token: string;
  item: InventoryItem;
  initialBatchId: number | null;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const ops = useOpsStyles();
  const gate = useActionGate();
  const form = useFormErrors();
  const [stored, setDraft] = useWorkField<Draft>("inventory", "adjustment", blank);
  const draft = stored.ingredientId === item.id && (initialBatchId === null || stored.batchId === initialBatchId) ? stored : blank(item.id, initialBatchId);
  const [error, setError] = useState("");
  const dirty = !!(draft.choice || draft.quantity.trim() || draft.comment.trim());
  useWorkGuard("inventory-adjustment", `el ajuste de ${item.name}`, dirty, gate.busy, true);
  const update = (patch: Partial<Draft>) => { if (!gate.busy) setDraft({ ...draft, ...patch }); };

  const unit = item.base_unit?.symbol ?? "u";
  const lots = (item.batches ?? []).filter((batch) => numberValue(batch.available_quantity) > 0);
  const lot = draft.pickLot ? lots.find((batch) => batch.id === draft.batchId) ?? null : null;
  const selected = choices.find((choice) => choice.key === draft.choice) ?? null;
  const amount = decimalInput(draft.quantity);
  const usable = numberValue(item.current_stock);
  const limit = lot ? numberValue(lot.available_quantity) : selected?.reason === "expiry" ? null : usable;
  const after = selected && Number.isFinite(amount) && amount > 0 ? usable + (selected.adds ? amount : -amount) : null;

  function quantityError(): string {
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d+(?:[.,]\d{1,4})?$/.test(draft.quantity.trim())) return "Escribe una cantidad mayor que cero, con hasta cuatro decimales.";
    if (selected && !selected.adds && limit !== null && amount > limit + 0.00001) return `Solo hay ${quantityText(limit)} ${unit} disponibles${lot ? " en ese lote" : ""}.`;
    if (selected?.adds && lot && expired(lot)) return "Ese lote ya caducó. Elige otro lote o deja la opción automática.";
    return "";
  }

  function save() {
    return gate.run(async () => {
      setError("");
      if (!form.validate({ choice: selected ? "" : "Elige qué pasó con el insumo.", quantity: quantityError(), comment: required(draft.comment, "una explicación breve") }) || !selected) return;
      try {
        await api("/inventory/adjustments", token, {
          method: "POST",
          body: JSON.stringify({
            ...(lot ? { inventory_batch_id: lot.id } : { ingredient_id: item.id }),
            quantity: selected.adds ? amount : -amount,
            reason: selected.reason,
            comment: draft.comment.trim(),
          }),
        });
        setDraft(blank());
        form.clear();
        onDone(`Listo: se ${selected.adds ? "sumaron" : "descontaron"} ${quantityText(amount)} ${unit} de ${item.name}.`);
      } catch (saveError) {
        form.fromError(saveError, { quantity: "la cantidad", inventory_batch_id: "el lote", comment: "la explicación" });
        setError(operationError(saveError, "registrar el ajuste", true));
      }
    });
  }

  async function cancel() {
    if (dirty && !await confirmAction("Se perderán los datos que escribiste en este ajuste.", { title: "Descartar ajuste", acceptLabel: "Descartar ajuste", cancelLabel: "Seguir editando" })) return;
    setDraft(blank()); onCancel();
  }

  return <Section title={`Ajustar existencia de ${item.name}`} subtitle="Registra lo que salió del inventario sin venta o corrige un conteo.">
    <View style={ops.insetCard}>
      <ThemedText style={ops.muted}>Ahora tienes</ThemedText>
      <ThemedText style={ops.bigNumber}>{quantityText(usable)} {unit}</ThemedText>
    </View>
    <Choices label="1. ¿Qué pasó? (obligatorio)" options={choices.map(({ key, label }) => ({ key, label }))} value={draft.choice} onChange={(choice) => update({ choice })} disabled={gate.busy} error={form.errors.choice} />
    <TextInput label={`2. ¿Cuánto? (${unit})`} required keyboardType="decimal-pad" value={draft.quantity} editable={!gate.busy} onChangeText={(quantity) => update({ quantity })} {...form.field("quantity")} />
    {after !== null && !lot && selected?.reason !== "expiry" && <ThemedText style={after < 0 ? ops.statusDanger : ops.muted} accessibilityLiveRegion="polite">Después del ajuste quedarán {quantityText(Math.max(0, after))} {unit}.</ThemedText>}
    {selected?.reason === "expiry" && !lot && <ThemedText style={ops.muted}>Se retira primero la existencia que ya caducó y después la que caduca antes.</ThemedText>}
    <TextInput label="3. Explica brevemente por qué" required multiline maxLength={1000} style={ops.textArea} value={draft.comment} editable={!gate.busy} onChangeText={(comment) => update({ comment })} {...form.field("comment")} />

    <Pressable accessibilityRole="button" aria-expanded={draft.pickLot} onPress={() => update({ pickLot: !draft.pickLot, batchId: draft.pickLot ? null : draft.batchId })} style={ops.backLink}>
      <ThemedText style={ops.backLinkText}>{draft.pickLot ? "▾ Usar lote automático" : "▸ Elegir un lote específico (opcional)"}</ThemedText>
    </Pressable>
    {draft.pickLot && (lots.length
      ? <Choices label="Lote" value={draft.batchId} onChange={(batchId) => update({ batchId })} disabled={gate.busy} options={lots.map((batch) => ({
        key: batch.id,
        label: `${batch.lot_code || `Lote #${batch.id}`} · ${quantityText(batch.available_quantity)} ${unit}`,
        hint: batch.expires_at ? `${expired(batch) ? "Caducó" : "Caduca"} ${dateText(batch.expires_at)}` : "Sin caducidad",
      }))} />
      : <ThemedText style={ops.muted}>Este insumo no tiene lotes con existencia. Se usará la opción automática.</ThemedText>)}
    {draft.pickLot && !lot && lots.length > 0 && <ThemedText style={ops.muted}>Si no eliges un lote se usará el que caduca antes.</ThemedText>}

    <Notice kind="error" message={error} />
    <View style={ops.actionsRow}>
      <ActionButton label={selected?.adds ? "Sumar a la existencia" : "Registrar salida"} loadingLabel="Registrando…" loading={gate.busy} onPress={save} />
      <ActionButton label="Cancelar" variant="secondary" disabled={gate.busy} onPress={cancel} />
    </View>
  </Section>;
}
