import type { CartLine, Product, Variant, Combo, OperationalSettings } from '../features/pos/types';
import { productPrice, comboPrice } from '../pricing';
import { hasForbiddenStuffedCrust } from '../productRules';
export { selectionPrice } from '../pricing';
function validateSelection(product:Product,variant:Variant,flavors:number[],modifiers:number[],settings:OperationalSettings,required=variant.required_flavors??0,max=product.type==='wings'?Math.min(variant.max_flavors,settings.max_wing_flavors):variant.max_flavors) {
  if(Array.isArray(variant.available_flavor_ids) && flavors.some(id=>!variant.available_flavor_ids!.includes(id))) throw new Error('El sabor no tiene receta para esta presentación');
  if(hasForbiddenStuffedCrust(variant,modifiers)) throw new Error('Esta presentación solo admite orilla normal');
  if(flavors.some(id=>!product.flavors.some(f=>f.id===id)) || modifiers.some(id=>!variant.modifier_rules.some(r=>r.modifier_id===id&&r.allowed))) throw new Error('Opciones no disponibles');
  if(new Set(flavors).size!==flavors.length || new Set(modifiers).size!==modifiers.length || flavors.length>max || (required && flavors.length!==required)) throw new Error('Revisa los sabores');

}
export function reconcileCart(cart:CartLine[],products:Product[],combos:Combo[],settings:OperationalSettings){
  const invalid:string[]=[];let changed=false;
  const lines=cart.map(line=>{
    try {
      let next:CartLine;
      if(line.kind==='product'){
        const product=products.find(p=>p.variants.some(v=>v.id===line.variantId));const variant=product?.variants.find(v=>v.id===line.variantId);
        if(!product||!variant)throw new Error('Producto no disponible');
        validateSelection(product,variant,line.flavorIds,line.modifierIds,settings);
        if(product.flavors.length && !line.flavorIds.length)throw new Error("Selecciona sabor");
        next={...line,name:`${product.name} · ${variant.name}`,unitPrice:productPrice(product,variant,line.flavorIds,line.modifierIds,settings),flavorNames:product.flavors.filter(f=>line.flavorIds.includes(f.id)).map(f=>f.name),modifierNames:variant.modifier_rules.filter(r=>line.modifierIds.includes(r.modifier_id)).map(r=>r.modifier.name)};
      }else{
        const combo=combos.find(c=>c.id===line.comboId);if(!combo)throw new Error('Paquete no disponible');
        for(const item of combo.items){
          const selections=line.components.filter(c=>c.combo_item_id===item.id);
          const expected=Number.isInteger(Number(item.quantity))&&Number(item.quantity)>1?Number(item.quantity):1;
          if(selections.length!==expected)throw new Error('Revisa los componentes');
          if(expected>1 && (new Set(selections.map(s=>s.unit_index)).size!==expected || selections.some(s=>!s.unit_index||s.unit_index<1||s.unit_index>expected)))throw new Error('Revisa las piezas');
        }
        for(const part of line.components){
          const item=combo.items.find(i=>i.id===part.combo_item_id);const product=products.find(p=>p.variants.some(v=>v.id===item?.product_variant_id));const variant=product?.variants.find(v=>v.id===item?.product_variant_id);
          if(!item||!product||!variant)throw new Error('Componente no disponible');
          const required=item.flavor_selection_count ?? 0;
          validateSelection(product,variant,part.flavor_ids,part.modifier_ids,settings,required,required || (product.type==='wings'?Math.min(variant.max_flavors,settings.max_wing_flavors):variant.max_flavors));
          if(item.flavor_required && !part.flavor_ids.length)throw new Error('Selecciona sabor');
          const allowedFlavors=item.options.filter(o=>o.flavor).map(o=>o.flavor!.id);
          if(allowedFlavors.length && part.flavor_ids.some(id=>!allowedFlavors.includes(id)))throw new Error('Opción de paquete no disponible');
          if(part.modifier_ids.some(id=>!item.options.some(o=>o.modifier?.id===id)))throw new Error('Extra no disponible');
        }
        next={...line,name:combo.name,unitPrice:comboPrice(combo,line.components,products,settings),summary:line.components.map(part=>{const item=combo.items.find(i=>i.id===part.combo_item_id)!;return `${item.variant.product.name} · ${item.variant.name}`;})};
      }
      if(!Number.isFinite(next.unitPrice)||next.unitPrice<0)throw new Error('Precio inválido');
      if(line.unitPrice!==next.unitPrice)changed=true;
      return next;
    }catch{invalid.push(`${line.name}: ya no está disponible con esas opciones. Quita el renglón y selecciónalo nuevamente.`);return {...line,unitPrice:0,...(line.kind==='product'?{flavorNames:[],modifierNames:[]}:{summary:[]})};}
  });
  return {lines,invalid,changed};
}
