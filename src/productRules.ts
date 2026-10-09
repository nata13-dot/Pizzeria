import type { Variant } from "./features/pos/types";

function normalizedWords(value: string | null | undefined): string[] {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function allowsStuffedCrust(variantName: string): boolean {
  const words = normalizedWords(variantName);
  return !words.includes("cuadrada") && !words.includes("napolitana");
}

export function allowedModifierIds(variant: Variant, modifierIds: number[]): number[] {
  if (allowsStuffedCrust(variant.name)) return modifierIds;
  const stuffedIds = new Set(
    variant.modifier_rules
      .filter((rule) => rule.modifier.type === "stuffed_crust")
      .map((rule) => rule.modifier_id),
  );
  return modifierIds.filter((id) => !stuffedIds.has(id));
}

export function hasForbiddenStuffedCrust(variant: Variant, modifierIds: number[]): boolean {
  return allowedModifierIds(variant, modifierIds).length !== modifierIds.length;
}
