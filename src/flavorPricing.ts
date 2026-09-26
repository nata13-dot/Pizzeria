type FlavorSettings = {
  half_and_half_extra: number;
  additional_wing_flavor_extra: number;
};

// Match OrderService::selectionExtra. Complements such as the Tricombo
// include their selected flavors in the base price.
export function flavorSelectionExtra(type: string, flavorIds: number[], settings: FlavorSettings): number {
  const count = new Set(flavorIds).size;
  if (count < 2) return 0;
  if (type === "pizza") return Number(settings.half_and_half_extra);
  if (type === "wings") return Number(settings.additional_wing_flavor_extra) * (count - 1);
  return 0;
}
