import type { CartLine, Product, Variant, Combo, OperationalSettings } from './features/pos/types';
import { flavorSelectionExtra } from './flavorPricing';
import { moneySum, moneyMultiply } from './money';
import { allowedModifierIds } from './productRules';

type Selection = Extract<CartLine, {kind: 'combo'}>['components'][number];
export function selectionPrice(product: Product, variant: Variant, flavors: number[], modifiers: number[], settings: OperationalSettings): number {
  const permittedModifiers = allowedModifierIds(variant, modifiers);
  return moneySum([flavorSelectionExtra(product.type, flavors, settings), ...variant.modifier_rules.filter(rule => rule.allowed && permittedModifiers.includes(rule.modifier_id)).map(rule => rule.price_override ?? rule.modifier.price)]);
}
export function productPrice(product: Product, variant: Variant, flavors: number[], modifiers: number[], settings: OperationalSettings): number {
  return moneySum([variant.price, selectionPrice(product, variant, flavors, modifiers, settings)]);
}
export function comboPrice(combo: Combo, selections: Selection[], products: Product[], settings: OperationalSettings): number {
  return moneySum([combo.price, ...selections.map(selection => {
    const item = combo.items.find(item => item.id === selection.combo_item_id);
    const product = products.find(product => product.variants.some(variant => variant.id === item?.product_variant_id));
    const variant = product?.variants.find(variant => variant.id === item?.product_variant_id);
    if (!item || !product || !variant) throw new Error('Un componente del paquete ya no está disponible.');
    return moneyMultiply(selectionPrice(product, variant, selection.flavor_ids, selection.modifier_ids, settings), selection.unit_index ? 1 : item.quantity);
  })]);
}
