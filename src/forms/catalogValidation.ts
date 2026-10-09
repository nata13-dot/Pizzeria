import {decimalInput,moneyInput,required,type FieldErrors} from './validation';
type VariantFields={name:string;price:string;max_flavors:string;allows_half_and_half?:boolean};
export function variantErrors(variant:VariantFields,prefix=''):FieldErrors {
  const count=decimalInput(variant.max_flavors);
  return {[`${prefix}name`]:required(variant.name,'el nombre del tamaño'),[`${prefix}price`]:Number.isFinite(moneyInput(variant.price))?'':'Ingresa un precio válido, igual o mayor que cero.',[`${prefix}max_flavors`]:!Number.isInteger(count)||count<1||(variant.allows_half_and_half&&count<2)?'Ingresa un número entero de sabores; mitad y mitad requiere al menos dos.':''};
}
