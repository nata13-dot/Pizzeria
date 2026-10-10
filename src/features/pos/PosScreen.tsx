import {ThemedText} from "../../theme/ThemedText";
import {useTheme,useThemedStyles} from "../../theme/ThemeProvider";
import type {Theme} from "../../theme/tokens";
import {ActionButton} from "../../components/ActionButton";
import {Notice, useFeedback} from "../../components/Notice";
import {useFormErrors} from "../../forms/useFormErrors";
import {useActionGate} from "../../forms/useActionGate";
import {moneyInput,validLocalDateTime,operationError} from "../../forms/validation";
import { money, moneySum, moneyMultiply, orderTotal } from "../../money";
import { useWork, useWorkField, useWorkGuard } from "../../work/WorkProvider";
import { reconcileCart } from "../../work/reconcile";
import { productPrice, comboPrice, selectionPrice } from "../../pricing";
import { allowedModifierIds, allowsStuffedCrust } from "../../productRules";
import { usePaginatedResource } from "../../hooks/useRemoteResource";
import { Pagination, RemoteListStatus } from "../../components/RemoteListStatus";
import { flavorSelectionExtra } from "../../flavorPricing";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput as NativeTextInput, useWindowDimensions, View } from "react-native";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { confirmAction } from "../../components/ConfirmationDialog";
import { api, ApiError, type ApiStockWarning } from "../../api";
import { cachedApi } from "../../apiCache";
import { useCartAddedFeedback } from "../../haptics";
import { useKitchenSentSound } from "../../sounds";
import { getConfiguredThermalPrinter, isNativeAndroid, printThermalHtml, printThermalHtmlWithAndroid, type SavedPrinter, type ThermalPaperWidth } from "../../printing";

import type { CartLine, Category, Combo, ComboComponent, ComboItem, Customer, CustomerAddress, Flavor, Modifier, OperationalSettings, Order, PendingKitchen, Product, Variant } from "./types";
export type { CartLine, Combo, OperationalSettings, Product, Variant } from "./types";
const defaultSettings: OperationalSettings = { half_and_half_extra: 0, additional_wing_flavor_extra: 0, max_wing_flavors: 2, delivery_zones: [], payment_methods: [{ key: "cash", label: "Efectivo", active: true }, { key: "transfer", label: "Transferencia", active: true }] };

function newKey(): string { return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
function modifierDisplayName(modifier: Modifier): string {
  if (modifier.type !== "stuffed_crust") return modifier.name;
  return `Orilla rellena de queso con ${modifier.name.toLocaleLowerCase().includes("chipotle") ? "chipotle" : "habanero"}`;
}
function scheduledIso(value: string): string | undefined {
  const input = value.trim(); if (!input) return undefined;
  const normalized = input.includes("T") ? input : input.replace(" ", "T");
  const date = new Date(normalized);
  if (!validLocalDateTime(normalized) || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error("La fecha programada debe ser válida, futura y usar AAAA-MM-DD HH:mm.");
  return date.toISOString();
}

function availablePrice(calculate: () => number): number | null {
  try { return calculate(); } catch { return null; }
}

function orderValidationMessage(error: unknown): string {
  if (!(error instanceof ApiError) || error.status !== 422) return operationError(error,"registrar el pedido");
  const fields = Object.keys(error.errors);
  if (fields.some((field)=>field === "recipe" || field.startsWith("recipe."))) return "Uno de los sabores seleccionados no tiene una receta activa para este tamaño. Quita esa combinación o configura su receta en Productos.";
  if (fields.some((field)=>field === "flavors" || field.startsWith("flavors."))) return "La combinación de sabores no está disponible para este tamaño. Revisa los sabores del pedido.";
  if (fields.some((field)=>field === "modifiers" || field.startsWith("modifiers."))) return "Uno de los extras ya no está disponible para este tamaño. Vuelve a configurar el producto.";
  if (fields.includes("customer_id")) return "El cliente elegido ya no está disponible. Conservamos los datos de entrega; selecciona otro cliente o continúa sin cliente.";
  return operationError(error,"registrar el pedido");
}

class PosLoadError extends Error {
  constructor(readonly resource: "catalog" | "settings") { super(resource); }
}

async function requiredPosResource<T>(resource: "catalog" | "settings", request: Promise<T>): Promise<T> {
  try { return await request; } catch { throw new PosLoadError(resource); }
}

export function PosScreen({ token, isAdministrator, canOverrideStock }: { token: string; isAdministrator: boolean; canOverrideStock: boolean }) {
  const styles=useThemedStyles(createStyles);
  const {theme}=useTheme();
  const work = useWork();
  const owner=work.scope;
  const [verified,setVerified]=useState(false);
  const [review,setReview]=useState(false);
  const priceReviewRequired = useRef(false);
  const [priceChanges, setPriceChanges] = useState<string[]>([]);
  const [invalid,setInvalid]=useState<string[]>([]);
  const cartAddedFeedback = useCartAddedFeedback();
  const playKitchenSentSound = useKitchenSentSound();
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const [products, setProducts] = useState<Product[]>([]); const [categories, setCategories] = useState<Category[]>([]); const [combos, setCombos] = useState<Combo[]>([]); const [settings, setSettings] = useState(defaultSettings);
  const [search, setSearch] = useState(""); const [categoryId, setCategoryId] = useState<number | null>(null); const [cart, setCart] = useWorkField<CartLine[]>("pos", "cart", []); const [customerId, setCustomerId] = useWorkField<number | null>("pos", "customerId", null); const [addressId, setAddressId] = useWorkField<number | null>("pos", "addressId", null);
  const [catalogTab, setCatalogTab] = useState<"products" | "packages">("products");
  const catalogSwipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx < -55) setCatalogTab("packages");
      if (gesture.dx > 55) setCatalogTab("products");
    },
  })).current;
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const recipientInput = useRef<NativeTextInput>(null);
  const phoneInput = useRef<NativeTextInput>(null);
  const addressInput = useRef<NativeTextInput>(null);
  const [addressReview, setAddressReview] = useWorkField("pos", "addressReview", false);
  const [generatedAddress, setGeneratedAddress] = useWorkField("pos", "generatedAddress", "");
  const [salesChannel, setSalesChannel] = useWorkField("pos", "salesChannel", "local"); const [pickup, setPickup] = useWorkField("pos", "pickup", false); const [recipient, setRecipient] = useWorkField("pos", "recipient", ""); const [phone, setPhone] = useWorkField("pos", "phone", ""); const [address, setAddress] = useWorkField("pos", "address", ""); const [references, setReferences] = useWorkField("pos", "references", ""); const [mapUrl, setMapUrl] = useWorkField("pos", "mapUrl", ""); const [zone, setZone] = useWorkField("pos", "zone", "");
  const [payment, setPayment] = useWorkField("pos", "payment", ""); const [cashAmount, setCashAmount] = useWorkField("pos", "cashAmount", ""); const [collectOnDelivery, setCollectOnDelivery] = useWorkField("pos", "collectOnDelivery", false); const [scheduledAt, setScheduledAt] = useWorkField("pos", "scheduledAt", ""); const [notes, setNotes] = useWorkField("pos", "notes", ""); const [idempotencyKey, setIdempotencyKey] = useWorkField("pos", "idempotencyKey", newKey); const [pendingKitchen, setPendingKitchen] = useWorkField<PendingKitchen | null>("pos", "pendingKitchen", null); const [lastOrder, setLastOrder] = useWorkField<Order | null>("pos", "lastOrder", null); const [message, setMessage, messageKind] = useFeedback("info"); const [busy, setBusy] = useState(true);
  const [catalogWarning, setCatalogWarning] = useState("");
  const customerDirectory = usePaginatedResource<Customer>("/customers?active=1", token, "los clientes", 300);
  const customers = customerDirectory.items;
  const [selectedCustomer, setSelectedCustomer] = useWorkField<Customer | null>("pos", "selectedCustomer", null);
  const sending = useRef(false);
  const submitAction = useActionGate();
  const form = useFormErrors();

  useWorkGuard("pos-send", "la venta", false, (busy && sending.current) || submitAction.busy);
  const loadRevision=useRef(0);
  const load = useCallback(async (forceRefresh = false) => {
    const revision=++loadRevision.current;
    setVerified(false); setBusy(true); setMessage(""); setCatalogWarning("");
    if (forceRefresh) customerDirectory.reload();
    try {
      const [nextProducts, categoryResult, comboResult, nextSettings] = await Promise.all([
        requiredPosResource("catalog", cachedApi<Product[]>("/pos/catalog", token, { forceRefresh })),
        cachedApi<Category[]>("/product-categories", token, { forceRefresh })
          .then(data => ({data, warning:""}))
          .catch(() => ({data:[] as Category[], warning:"No se pudieron cargar las categorías. Puedes buscar y vender los productos disponibles; pulsa Actualizar para reintentar."})),
        cachedApi<Combo[]>("/combos", token, { forceRefresh })
          .then(data => ({data, warning:""}))
          .catch(() => ({data:[] as Combo[], warning:"No se pudieron cargar los paquetes y promociones. Los productos individuales siguen disponibles; pulsa Actualizar para reintentar."})),
        requiredPosResource("settings", cachedApi<OperationalSettings>("/operational-settings", token, { forceRefresh })),
      ]);
      if (__DEV__) {
        const serialized = JSON.stringify(nextProducts);
        const imageCharacters = nextProducts.reduce((sum, product) => sum + (product.image_data_uri?.length ?? 0), 0);
        console.info("pos.catalog", {
          approximateBytes: serialized.length,
          imageDataUriCharacters: imageCharacters,
          imagePercent: serialized.length ? Math.round(imageCharacters * 10_000 / serialized.length) / 100 : 0,
          products: nextProducts.length,
        });
      }
      if(revision!==loadRevision.current)return;
      setCatalogWarning([categoryResult.warning, comboResult.warning].filter(Boolean).join(" "));
      setProducts(nextProducts); setCategories(categoryResult.data); setCombos(comboResult.data); setSettings(nextSettings);
      const previousCart = work.get<CartLine[]>("pos", "cart", []);
      const result = reconcileCart(previousCart, nextProducts, comboResult.data, nextSettings);
      const changes = result.lines.flatMap((line, index) => previousCart[index]?.unitPrice !== line.unitPrice && Number.isFinite(previousCart[index]?.unitPrice)
        ? [`${line.name}: $${previousCart[index].unitPrice.toFixed(2)} → $${line.unitPrice.toFixed(2)} por unidad`] : []);
      if (changes.length) setPriceChanges(changes);
      setCart(result.lines); setInvalid(result.invalid); setReview(result.changed || priceReviewRequired.current);
      const lookupCustomerId=work.get<number|null>("pos","customerId",null);
      if (lookupCustomerId) {
        try {
          const current = await api<Customer>(`/pos/customers/${lookupCustomerId}`, token, {cache:"reload"});
          if(revision!==loadRevision.current)return;
          if(lookupCustomerId!==work.get<number|null>("pos","customerId",null)) return;
          if (current.active === false) { setSelectedCustomer(null);setCustomerId(null);setAddressId(null);setCatalogWarning(value=>[value,"El cliente guardado ya no está activo. Conservamos los datos de entrega y puedes continuar sin cliente."].filter(Boolean).join(" ")); }
          else {setSelectedCustomer(current); if(work.get("pos","addressId",null) && !current.addresses.some(a=>a.id===work.get("pos","addressId",null) && a.address===work.get("pos","address","") && (a.delivery_zone??"")===work.get("pos","zone",""))) setReview(true);}
        } catch (error) {
          if(revision!==loadRevision.current)return;
          const status=error&&typeof error==="object"&&"status" in error?Number(error.status):0;
          if(status===404){setSelectedCustomer(null);setCustomerId(null);setAddressId(null);setCatalogWarning(value=>[value,"El cliente guardado ya no existe. Conservamos los datos de entrega y puedes continuar sin cliente."].filter(Boolean).join(" "));}
          else setCatalogWarning(value=>[value,"No pudimos actualizar los datos del cliente. Puedes continuar con los datos de entrega capturados."].filter(Boolean).join(" "));
        }
      }
      setVerified(true);

      const active = nextSettings.payment_methods.filter((method) => method.active); if (payment && !["mixed","courtesy"].includes(payment) && !active.some((method) => method.key === payment)) setPayment("");
    } catch (error) {
      if(revision===loadRevision.current) setMessage(
        error instanceof PosLoadError && error.resource === "settings"
          ? "No pudimos cargar la configuración de cobro y entrega. Conservamos tus datos; pulsa Actualizar para reintentar."
          : "No pudimos verificar los precios y la disponibilidad del catálogo. Conservamos tus datos; pulsa Actualizar para reintentar.",
        "error",
      );
    } finally { if(revision===loadRevision.current)setBusy(false); }
  }, [token]);
  useEffect(() => { void load(true);return()=>{loadRevision.current++;}; }, [load]);

  useEffect(()=>{
    if(!products.length)return;
    const result=reconcileCart(cart,products,combos,settings);
    setInvalid(current=>[...result.invalid,...current.filter(text=>text.startsWith("El cliente"))]);
  },[cart,products,combos,settings]);
  const activeDeliveryZones = settings.delivery_zones.filter((item) => item.active);
  const selectedDeliveryZone = activeDeliveryZones.find((item) => item.name === zone);
  const deliveryFee = !pickup ? Number(settings.delivery_zones.find((item) => item.active && item.name === zone)?.fee ?? 0) : 0;
  const subtotalValue = availablePrice(() => moneySum(cart.map(line => moneyMultiply(line.unitPrice, line.quantity))));
  const totalValue = subtotalValue === null ? null : availablePrice(() => orderTotal(subtotalValue, 0, deliveryFee));
  const invalidAmount = totalValue === null;
  const subtotal = subtotalValue ?? 0;
  const total = totalValue ?? 0;
  const contactProblems = [!recipient.trim() ? "Falta el nombre de quien recibe." : "", !phone.trim() ? "Falta el teléfono de contacto." : "", !pickup && !address.trim() ? "Falta la dirección de entrega." : "", !pickup && settings.delivery_zones.length > 0 && !selectedDeliveryZone ? "Selecciona una zona de entrega disponible." : ""].filter(Boolean);
  const blockers = [...contactProblems, ...invalid, ...(invalidAmount ? ["Reduce las cantidades: el importe supera el límite permitido."] : []), ...(!cart.length ? ["Agrega productos al pedido."] : []), ...(!verified ? ["Actualiza precios y disponibilidad antes de continuar."] : []), ...(review || (!pickup && addressReview) ? ["Revisa y acepta los datos actualizados."] : []), ...(pendingKitchen ? ["Resuelve el envío pendiente a cocina."] : [])];
  const confirmDisabled = busy || blockers.length > 0;
  function focusMissingContact() {
    if(!recipient.trim())recipientInput.current?.focus();
    else if(!phone.trim())phoneInput.current?.focus();
    else if(!pickup && activeDeliveryZones.length && !selectedDeliveryZone)setZonePickerOpen(true);
    else addressInput.current?.focus();
  }
  const visibleProducts = products.filter((product) => (!categoryId || product.product_category_id === categoryId) && (!search.trim() || product.name.toLowerCase().includes(search.trim().toLowerCase()) || product.variants.some((variant) => variant.name.toLowerCase().includes(search.trim().toLowerCase()))));
  const promotions = combos.filter((combo) => combo.items.length === 1 && Number(combo.items[0].quantity) > 1);
  const packages = combos.filter((combo) => !promotions.includes(combo));
  const visiblePackages = packages.filter((combo) => !search.trim() || combo.name.toLowerCase().includes(search.trim().toLowerCase()) || combo.items.some((item) => item.variant.product.name.toLowerCase().includes(search.trim().toLowerCase())));

  async function replaceDelivery(selected: CustomerAddress | null, customer: Customer | null) {
    if (work.operation) return false;
    const next = [customer?.name ?? "", customer?.phone ?? "", selected?.address ?? "", selected?.references ?? "", selected?.map_url ?? "", selected?.delivery_zone ?? ""];
    const current = [recipient, phone, address, references, mapUrl, zone];
    if (current.some(Boolean) && current.some((value, index) => value !== next[index])) {
      if (!await confirmAction("Se sustituirán el destinatario, teléfono y dirección que capturaste. El cliente registrado puede ser distinto de quien recibe.", {title:"¿Usar estos datos de entrega?",cancelLabel:"Conservar mis datos",acceptLabel:"Sustituir datos"})) return false;
    }
    if (work.scope !== owner || work.operation) return false;
    setRecipient(next[0]); setPhone(next[1]); setAddress(next[2]); setReferences(next[3]); setMapUrl(next[4]); setZone(next[5]); setAddressId(selected?.id ?? null); setAddressReview(false); setGeneratedAddress("");
    return true;
  }
  async function chooseCustomer(customer: Customer | null) {
    if(work.operation)return;
    if(customer) {
      const selected = customer.addresses.find(item=>item.is_default) ?? customer.addresses[0];
      const replaced = await replaceDelivery(selected ?? null,customer);
      if(work.scope !== owner || work.operation)return;
      if(!replaced)setAddressId(null);
    } else setAddressId(null);
    setInvalid(current=>current.filter(text=>!text.startsWith("El cliente")));
    setSelectedCustomer(customer); setCustomerId(customer?.id ?? null);
  }
  async function chooseAddress(selected: CustomerAddress | null) { await replaceDelivery(selected, selectedCustomer); }
  function chooseZone(name: string) {
    if(work.operation)return;
    const generated = !address.trim() || (!!generatedAddress && address === generatedAddress);
    if(generated){setAddress(name);setGeneratedAddress(name);}
    else if(name !== zone)setAddressReview(true);
    setZone(name); setZonePickerOpen(false);
  }
  function addProduct(product: Product, variant: Variant, flavorIds: number[], modifierIds: number[], itemNotes: string) { if(work.operation){setMessage("Primero comprueba el pedido enviado antes de cambiar sus datos.");return;}
    modifierIds=allowedModifierIds(variant,modifierIds);
    cartAddedFeedback();
    const flavors = product.flavors.filter((flavor) => flavorIds.includes(flavor.id)); const rules = variant.modifier_rules.filter((rule) => modifierIds.includes(rule.modifier_id));
    const key = `product-${variant.id}-${[...flavorIds].sort().join(".")}-${[...modifierIds].sort().join(".")}-${itemNotes}`;
    setCart((current) => { const found = current.find((line) => line.key === key); return found ? current.map((line) => line.key === key ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { key, kind: "product", variantId: variant.id, name: `${product.name} · ${variant.name}`, unitPrice: productPrice(product,variant,flavorIds,modifierIds,settings), quantity: 1, flavorIds, flavorNames: flavors.map((flavor) => flavor.name), modifierIds, modifierNames: rules.map((rule) => modifierDisplayName(rule.modifier)), notes: itemNotes.trim() }]; });
  }
  function addCombo(combo: Combo, components: ComboComponent[], summary: string[]) { if(work.operation){setMessage("Primero comprueba el pedido enviado antes de cambiar sus datos.");return;}
    cartAddedFeedback();
    const key = `combo-${combo.id}-${JSON.stringify(components)}`; setCart((current) => { const found = current.find((line) => line.key === key); return found ? current.map((line) => line.key === key ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { key, kind: "combo", comboId: combo.id, name: combo.name, unitPrice: comboPrice(combo, components, products, settings), quantity: 1, components, summary, notes: "" }]; });
  }
  function changeQuantity(key: string, delta: number) { if(work.operation){setMessage("Primero comprueba el pedido enviado antes de cambiar sus datos.");return;} setCart((current) => current.map((line) => line.key === key ? { ...line, quantity: line.quantity + delta } : line).filter((line) => line.quantity > 0)); }
  function reset() { setAddressReview(false); setGeneratedAddress(""); priceReviewRequired.current=false; setPriceChanges([]); setReview(false); setCart([]); setSelectedCustomer(null); setCustomerId(null); setAddressId(null); setSalesChannel("local"); setPickup(false); setRecipient(""); setPhone(""); setAddress(""); setReferences(""); setMapUrl(""); setZone(""); setPayment(settings.payment_methods.find((method) => method.active)?.key ?? "cash"); setCashAmount(""); setCollectOnDelivery(false); setScheduledAt(""); setNotes(""); setIdempotencyKey(newKey()); }

  async function sendToKitchen(order: Order, allow = false): Promise<boolean> {
    try { const sent = await api<Order>(`/orders/${order.id}/send-to-kitchen`, token, { method: "POST", body: allow ? JSON.stringify({ allow_stock_shortage: true }) : undefined }); if(work.scope!==owner)return false; await work.mark(null); setPendingKitchen(null); setLastOrder(sent); playKitchenSentSound(); setMessage(`Orden #${sent.daily_number} enviada a cocina.`,"success"); return true; }
    catch (error) { if (error instanceof ApiError && error.code === "stock_shortage") { setPendingKitchen({ order, warnings: error.stockWarnings, error: "Se requiere revisar el inventario." }); setMessage(canOverrideStock ? "La orden fue creada; autoriza el faltante para enviarla a cocina." : "La orden fue creada, pero requiere autorización administrativa por falta de inventario."); return false; } setPendingKitchen({ order, warnings: [], error: operationError(error,"enviar el pedido a cocina") }); setMessage("La orden fue creada, pero su envío a cocina falló. Reintenta esta misma orden."); return false; }
  }
  async function retryKitchen() { if (!pendingKitchen || sending.current) return; const allow = pendingKitchen.warnings.length > 0; if (allow && !canOverrideStock) { setMessage("Inicia sesión con un usuario que tenga permiso para autorizar faltantes."); return; } if (allow && !await confirmAction("Se consumirá la existencia disponible y quedará registrado el faltante.",{title:"Autorizar faltante",acceptLabel:"Autorizar y enviar",cancelLabel:"No autorizar"})) return; sending.current = true; setBusy(true); try { await sendToKitchen(pendingKitchen.order, allow); } finally { sending.current = false; setBusy(false); } }

  function prepareKitchenDelivery(order: Order): boolean {
    const warnings = order.stock_warnings ?? [];
    if (!warnings.length) return false;
    setPendingKitchen({order,warnings,error:"Se requiere revisar el inventario."});
    setMessage(canOverrideStock ? "La orden fue creada; autoriza el faltante para enviarla a cocina." : "La orden fue creada, pero requiere autorización administrativa por falta de inventario.");
    return true;
  }

  const submit = (status: "draft" | "pending_payment" | "confirmed") => submitAction.run(()=>submitImpl(status));
  async function submitImpl(status: "draft" | "pending_payment" | "confirmed") {
    form.clear();
    if (sending.current || invalidAmount || !cart.length || !verified || review || (!pickup && addressReview) || invalid.length || !work.writable) {setMessage("Revisa los datos pendientes antes de enviar la venta.");return;}
    if (pickup && (!recipient.trim() || !phone.trim())) { setMessage("Para recoger en el local, captura el nombre y teléfono del cliente."); return; }
    if (!pickup && (!recipient.trim() || !phone.trim() || !address.trim())) { setMessage("Completa nombre, teléfono y colonia o junta auxiliar."); return; }
    if (!pickup && settings.delivery_zones.length > 0 && !selectedDeliveryZone) { setMessage("Selecciona una zona de entrega."); return; }
    let schedule: string | undefined; try { schedule = scheduledIso(scheduledAt); } catch { form.validate({scheduled_at:"Usa una fecha futura válida con formato AAAA-MM-DD HH:mm."}); setMessage("Corrige la fecha programada antes de enviar.","error"); return; }
    if(status==="confirmed" && !collectOnDelivery && !payment){form.validate({payments:"Selecciona cómo se pagará esta venta."});setMessage("Selecciona cómo se pagará esta venta.","warning");return;}
    const cash = moneyInput(cashAmount); if (status === "confirmed" && !collectOnDelivery && payment === "mixed" && (!Number.isFinite(cash) || cash <= 0 || cash >= total)) { form.validate({payments:"El efectivo debe ser mayor que cero y menor que el total; usa punto o coma decimal."});setMessage("En pago mixto, el efectivo debe ser mayor que cero y menor que el total.","error"); return; }
    if (status === "confirmed" && !collectOnDelivery && !await confirmAction(`¿Confirmas el pedido por $${total.toFixed(2)}${schedule ? " programado" : ""}?`,{title:"Registrar pedido",acceptLabel:payment==="courtesy"?"Registrar cortesía":"Registrar pedido y pago",cancelLabel:"Seguir revisando"})) return;
    const wasUncertain=!!work.operation;
    sending.current = true; setBusy(true); setMessage(""); setLastOrder(null);
    try {
      if (work.operation) {
        const found=await api<{order:Order|null}>(`/orders/operation?key=${encodeURIComponent(work.operation.key)}`,token,{cache:"reload"});
        if(found.order){await finishRecovered(found.order);return;}
      }
      const operationKey=work.operation?.key ?? idempotencyKey;
      await work.mark({key:operationKey});
      const payments = status !== "confirmed" || payment === "courtesy" || collectOnDelivery ? [] : payment === "mixed" ? [{ method: "cash", amount: money(cash) }, { method: "transfer", amount: orderTotal(total, cash, 0) }] : [{ method: payment, amount: total }];
      const order = await api<Order>("/orders", token, { method: "POST", headers: { "Idempotency-Key": operationKey }, body: JSON.stringify({ pricing_expectation: {items: cart.map(line => ({unit_price: line.unitPrice, total: moneyMultiply(line.unitPrice,line.quantity)})), delivery_fee: money(deliveryFee), total}, status, type: pickup ? "pickup" : "delivery", sales_channel: salesChannel, customer_id: customerId, contact_name: pickup ? recipient.trim() : undefined, contact_phone: pickup ? phone.trim() : undefined, scheduled_at: schedule, courtesy: payment === "courtesy", collect_on_delivery: pickup ? false : collectOnDelivery, notes: notes.trim() || undefined, delivery: !pickup ? { recipient: recipient.trim(), phone: phone.trim(), address: address.trim(), references: references.trim() || undefined, map_url: mapUrl.trim() || undefined, delivery_zone: zone || undefined } : undefined, items: cart.map((line) => line.kind === "product" ? { product_variant_id: line.variantId, quantity: line.quantity, flavor_ids: line.flavorIds, modifier_ids: line.modifierIds, notes: line.notes || undefined } : { combo_id: line.comboId, quantity: line.quantity, components: line.components, notes: line.notes || undefined }), payments }) });
      if(work.scope!==owner)return;
      await work.mark({key:operationKey,orderId:order.id}); await work.clearPos(); setLastOrder(order); reset(); if (order.status === "confirmed" && !order.scheduled_at && !schedule) { if (!prepareKitchenDelivery(order)) { setPendingKitchen({ order, warnings: [], error: "Envío pendiente" }); await sendToKitchen(order); } } else { await work.mark(null); setMessage(`Orden #${order.daily_number} ${status === "draft" ? "guardada como borrador" : status === "pending_payment" ? "pendiente de pago" : "programada"}.`); }
    } catch (error) {
      if(error instanceof ApiError && error.code === "price_changed") {
        if(!wasUncertain) await work.mark(null).catch(()=>{});
        setVerified(false); setReview(true); setPayment(""); priceReviewRequired.current = true;
        const current = error.payload.pricing;
        if (current && Array.isArray(current.items)) {
          setPriceChanges(current.items.slice(0, cart.length).flatMap((item, index) => item && Number.isFinite(Number(item.unit_price)) && Number.isFinite(Number(item.total)) ? [`${cart[index].name}: $${Number(item.unit_price).toFixed(2)} por unidad; renglón $${Number(item.total).toFixed(2)}`] : [])
            .concat(Number.isFinite(Number(current.delivery_fee)) && Number.isFinite(Number(current.total)) ? [`Entrega: $${Number(current.delivery_fee).toFixed(2)} · Total actual: $${Number(current.total).toFixed(2)}`] : []));
        }
        setMessage("Los precios cambiaron. Pulsa Actualizar y revisa los nuevos importes y el pago antes de enviar. No se registró otro pedido.","warning");
        return;
      }
      if(!wasUncertain && error instanceof ApiError && [400,403,422].includes(error.status)){await work.mark(null).catch(()=>{});form.fromError(error,{items:"los productos y sus opciones",flavors:"los sabores de los productos",recipe:"la receta de los sabores",modifiers:"los extras de los productos",customer_id:"el cliente seleccionado","delivery.delivery_zone":"la zona de entrega",contact_name:"el nombre",contact_phone:"el teléfono","delivery.recipient":"el destinatario","delivery.phone":"el teléfono","delivery.address":"la dirección","delivery.map_url":"el enlace del mapa",scheduled_at:"la programación",payments:"el pago"},{flavors:"items",recipe:"items",modifiers:"items"});if(Object.hasOwn(error.errors,"customer_id")){setSelectedCustomer(null);setCustomerId(null);setAddressId(null);}setMessage(orderValidationMessage(error),"error");return;} setMessage("No pudimos confirmar el resultado. Pulsa Comprobar pedido enviado antes de repetir o revisa Pedidos del día.","warning"); } finally { sending.current = false; setBusy(false); }
  }

  async function finishRecovered(order: Order) {
    if(work.scope!==owner || !work.operation)return;
    await work.mark({key:work.operation.key,orderId:order.id});
    await work.clearPos(); reset(); setLastOrder(order);
    setMessage(`La orden #${order.daily_number} ya está registrada. Revisa su estado en Pedidos del día.`);
    if(order.status === "confirmed" && !order.scheduled_at) { if (!prepareKitchenDelivery(order)) setPendingKitchen({order,warnings:[],error:"Revisa el pedido antes de enviarlo a cocina."}); }
    else await work.mark(null);
  }
  async function checkOperation() {
    if(!work.operation || !work.writable)return;
    try {const result=await api<{order:Order|null}>(`/orders/operation?key=${encodeURIComponent(work.operation.key)}`,token,{cache:"reload"});if(result.order)await finishRecovered(result.order);else setMessage("No hay confirmación todavía. Puedes reintentar el envío de esta misma venta; no se enviará automáticamente.");}
    catch {setMessage("No pudimos comprobar el pedido. Conservamos su referencia; reintenta la consulta.");}
  }
  useEffect(()=>{void checkOperation();},[]);
  async function discard() {
    if(work.operation){setMessage("Primero comprueba el pedido enviado antes de descartar la venta.");return;}
    if(await confirmAction("Se eliminarán los productos y datos de esta venta.",{title:"Descartar venta",cancelLabel:"Seguir con la venta",acceptLabel:"Descartar venta"})) {try{await work.clearPos();reset();setInvalid([]);setReview(false);}catch{setMessage("No pudimos descartar la venta. Conservamos sus datos; intenta nuevamente.");}}
  }
  if(!work.writable) return <ThemedText>La edición está bloqueada en esta pestaña. Cierra las otras pestañas de la aplicación y recarga esta página; utiliza un navegador actualizado.</ThemedText>;
  if (busy && !products.length) return <ActivityIndicator color={theme.colors.primary} style={styles.loader} />;
  const showKitchenRecovery = !!work.operation?.orderId && !!pendingKitchen;
  const hasKitchenShortage = !!pendingKitchen?.warnings.length;
  const cannotAuthorizeKitchen = hasKitchenShortage && !canOverrideStock;
  return <>
    <Modal animationType="fade" transparent visible={busy && sending.current} onRequestClose={()=>undefined}>
      <View style={styles.configBackdrop}>
        <View accessibilityViewIsModal accessibilityLabel="Procesando pedido" style={styles.loadingCard}>
          <ActivityIndicator color={theme.colors.primary}/>
          <ThemedText style={styles.title}>{work.operation?.orderId ? "Enviando a cocina" : "Registrando pedido"}</ThemedText>
          <ThemedText style={styles.muted}>Conservamos esta pantalla mientras termina la operación.</ThemedText>
        </View>
      </View>
    </Modal>
    <Modal animationType="fade" transparent visible={showKitchenRecovery} onRequestClose={()=>undefined}>
      <View style={styles.configBackdrop}>
        <View accessibilityViewIsModal accessibilityLabel="Completar envío a cocina" style={styles.recoveryCard}>
          <ThemedText style={styles.title}>Orden #{pendingKitchen?.order.daily_number} registrada</ThemedText>
          <ThemedText>{message || "Puedes completar el envío a cocina sin volver a crear la venta."}</ThemedText>
          {hasKitchenShortage && <ScrollView nestedScrollEnabled style={styles.recoveryDetails} contentContainerStyle={styles.warning}>
            <ThemedText style={styles.rowTitle}>Inventario insuficiente</ThemedText>
            {pendingKitchen?.warnings.map((warning) => <ThemedText key={warning.ingredient_id ?? warning.name}>{warning.name}: faltan {warning.shortage}</ThemedText>)}
            <ThemedText>{canOverrideStock ? "Como administrador puedes autorizar el faltante y enviar esta misma orden." : "Solicita a un administrador que autorice el faltante."}</ThemedText>
          </ScrollView>}
          {!hasKitchenShortage && <ThemedText style={styles.warning}>{pendingKitchen?.error}</ThemedText>}
          <Pressable accessibilityRole="button" style={[styles.primary, (busy || cannotAuthorizeKitchen) && styles.disabled]} disabled={busy || cannotAuthorizeKitchen} onPress={retryKitchen}><ThemedText style={styles.primaryText}>{hasKitchenShortage ? "Autorizar faltante y enviar a cocina" : "Reintentar envío a cocina"}</ThemedText></Pressable>
          <Pressable accessibilityRole="button" style={styles.outlineButton} disabled={busy} onPress={async()=>{try{await work.mark(null);setPendingKitchen(null);}catch{setMessage("No pudimos cerrar el seguimiento del pedido. Intenta nuevamente.");}}}><ThemedText style={styles.outlineText}>Continuar con otra venta</ThemedText></Pressable>
        </View>
      </View>
    </Modal>
    <View style={[styles.layout, compact && styles.layoutCompact]}>
    <View accessibilityLabel="Catálogo del punto de venta" {...catalogSwipe.panHandlers} style={[styles.catalog, compact && showMobileCart && {display:"none"}]}>
      {compact && <Pressable accessibilityRole="button" onPress={() => setShowMobileCart(true)} style={styles.mobileCartButton}><View><ThemedText style={styles.mobileCartTitle}>Ver pedido y finalizar</ThemedText><ThemedText style={styles.mobileCartDetail}>{cart.reduce((sum, line) => sum + line.quantity, 0)} producto(s)</ThemedText></View><ThemedText style={styles.mobileCartTotal}>${total.toFixed(2)} ›</ThemedText></Pressable>}
      <View style={styles.card}><View accessibilityRole="tablist" style={styles.catalogTabs}><Pressable accessibilityRole="tab" accessibilityState={{selected:catalogTab==="products"}} onPress={()=>setCatalogTab("products")} style={[styles.catalogTab,catalogTab==="products"&&styles.catalogTabActive]}><ThemedText style={[styles.catalogTabText,catalogTab==="products"&&styles.catalogTabTextActive]}>Productos</ThemedText><ThemedText style={[styles.catalogTabCount,catalogTab==="products"&&styles.catalogTabTextActive]}>{visibleProducts.length}</ThemedText></Pressable><Pressable accessibilityRole="tab" accessibilityState={{selected:catalogTab==="packages"}} onPress={()=>setCatalogTab("packages")} style={[styles.catalogTab,catalogTab==="packages"&&styles.catalogTabActive]}><ThemedText style={[styles.catalogTabText,catalogTab==="packages"&&styles.catalogTabTextActive]}>Paquetes</ThemedText><ThemedText style={[styles.catalogTabCount,catalogTab==="packages"&&styles.catalogTabTextActive]}>{visiblePackages.length}</ThemedText></Pressable></View><ThemedText style={styles.swipeHint}>Desliza horizontalmente para cambiar de sección.</ThemedText><View style={styles.inline}><TextInput editable={!work.operation} style={[styles.input, styles.flex]} value={search} onChangeText={setSearch} placeholder={catalogTab==="products"?"Buscar producto o tamaño":"Buscar paquete o componente"} /><Pressable style={styles.outlineButton} onPress={() => load(true)}><ThemedText style={styles.outlineText}>Actualizar</ThemedText></Pressable></View>{catalogTab==="products"&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}><Pressable style={[styles.choice, categoryId === null && styles.choiceActive]} onPress={() => setCategoryId(null)}><ThemedText>Todo</ThemedText></Pressable>{categories.map((category) => <Pressable key={category.id} style={[styles.choice, categoryId === category.id && styles.choiceActive]} onPress={() => setCategoryId(category.id)}><ThemedText>{category.name}</ThemedText></Pressable>)}</ScrollView>}</View>
      <Notice kind="warning" message={catalogWarning}/>
      {catalogTab==="products"&&(!visibleProducts.length ? <View style={styles.emptyState}><ThemedText style={styles.emptyIcon}>⌕</ThemedText><ThemedText style={styles.rowTitle}>No encontramos productos</ThemedText><ThemedText style={styles.muted}>Cambia la categoría o el texto de búsqueda.</ThemedText></View> : compact ? <View style={styles.productList}>{visibleProducts.map((product) => <ProductCard key={product.id} product={product} promotions={promotions.filter((promo) => promo.items[0].variant.product.id === product.id)} products={products} settings={settings} onAdd={addProduct} onAddCombo={addCombo} />)}</View> : <View style={styles.productColumns}>{[0,1].map((column) => <View key={column} style={styles.productColumn}>{visibleProducts.filter((_product,index)=>index%2===column).map((product) => <ProductCard key={product.id} product={product} promotions={promotions.filter((promo) => promo.items[0].variant.product.id === product.id)} products={products} settings={settings} onAdd={addProduct} onAddCombo={addCombo} />)}</View>)}</View>)}
      {catalogTab==="packages"&&(!visiblePackages.length?<View style={styles.emptyState}><ThemedText style={styles.emptyIcon}>⌕</ThemedText><ThemedText style={styles.rowTitle}>No encontramos paquetes</ThemedText><ThemedText style={styles.muted}>Cambia el texto de búsqueda o actualiza el catálogo.</ThemedText></View>:<View style={styles.packageSection}><View style={styles.headingRow}><View><ThemedText style={styles.title}>Paquetes</ThemedText><ThemedText style={styles.muted}>Combos listos para configurar y agregar.</ThemedText></View><ThemedText style={styles.packageCount}>{visiblePackages.length}</ThemedText></View>{compact ? <View style={styles.productList}>{visiblePackages.map((combo) => <ComboCard key={combo.id} combo={combo} products={products} settings={settings} onAdd={addCombo} catalogCard />)}</View> : <View style={styles.productColumns}>{[0,1].map((column) => <View key={column} style={styles.productColumn}>{visiblePackages.filter((_combo,index)=>index%2===column).map((combo) => <ComboCard key={combo.id} combo={combo} products={products} settings={settings} onAdd={addCombo} catalogCard />)}</View>)}</View>}</View>)}
    </View>
    {(!compact || showMobileCart) && <View style={[styles.cart, compact && styles.cartCompact]}>
      {compact && <Pressable accessibilityRole="button" onPress={() => setShowMobileCart(false)} style={styles.backToMenu}><ThemedText style={styles.outlineText}>‹ Seguir agregando productos</ThemedText></Pressable>}
      <ThemedText style={styles.title}>Pedido actual</ThemedText>
      <Notice kind="warning" message={work.notice}/>
      {!verified && <View><ThemedText>No se han verificado los datos actuales.</ThemedText><Pressable disabled={busy} onPress={()=>load(true)}><ThemedText>Actualizar precios y disponibilidad</ThemedText></Pressable></View>}
      {invalid.map(text=><ThemedText accessibilityRole="alert" key={text}>{text}</ThemedText>)}
      {priceChanges.map((change, index) => <ThemedText key={index} style={styles.notice}>{change}</ThemedText>)}
      {review && <Pressable onPress={()=>{setReview(false);priceReviewRequired.current=false;setPriceChanges([]);}}><ThemedText>Actualizamos datos o precios. Revisé la venta y quiero continuar.</ThemedText></Pressable>}
      {!!work.operation && <Pressable onPress={checkOperation}><ThemedText>Comprobar pedido enviado</ThemedText></Pressable>}
      <Pressable disabled={busy} onPress={()=>void discard()}><ThemedText>Descartar venta</ThemedText></Pressable>
      <Notice kind="error" message={form.errors.items}/>
      {cart.map((line) => <View style={styles.cartLine} key={line.key}><View style={styles.flex}><ThemedText style={styles.rowTitle}>{line.quantity} × {line.name}</ThemedText><ThemedText style={styles.muted}>{line.kind === "product" ? [...line.flavorNames, ...line.modifierNames].join(" · ") : line.summary.join(" · ")}</ThemedText><ThemedText>${(availablePrice(() => moneyMultiply(line.unitPrice, line.quantity))?.toFixed(2) ?? "Fuera de rango")}</ThemedText></View><View style={styles.actions}><Pressable style={styles.quantity} onPress={() => changeQuantity(line.key, -1)}><ThemedText>−</ThemedText></Pressable><Pressable style={styles.quantity} onPress={() => changeQuantity(line.key, 1)}><ThemedText>＋</ThemedText></Pressable></View></View>)}
      <Notice kind="error" message={form.errors.customer_id}/><ThemedText style={styles.label}>Cliente registrado (opcional)</ThemedText><ThemedText style={styles.muted}>Puede ser distinto de quien recibe. Quitar el cliente conserva los datos de entrega.</ThemedText>
      <TextInput editable={!work.operation} style={styles.input} placeholder="Buscar cliente por nombre o teléfono" value={customerDirectory.search} maxLength={100} onChangeText={customerDirectory.setSearch} onSubmitEditing={customerDirectory.reload} />
      <RemoteListStatus {...customerDirectory} count={customers.length} emptyText="No hay clientes activos registrados. Puedes continuar sin cliente." onRetry={customerDirectory.reload} />
      <Pagination {...customerDirectory} onPage={customerDirectory.setPage} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}><Pressable style={[styles.choice, customerId === null && styles.choiceActive]} onPress={() => chooseCustomer(null)}><ThemedText>Sin cliente</ThemedText></Pressable>{customers.map((customer) => <Pressable key={customer.id} style={[styles.choice, customerId === customer.id && styles.choiceActive]} onPress={() => chooseCustomer(customer)}><ThemedText>{customer.name}</ThemedText></Pressable>)}</ScrollView>
      {!!selectedCustomer?.addresses.length && <><ThemedText style={styles.label}>Dirección guardada</ThemedText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>{selectedCustomer.addresses.map((item) => <Pressable key={item.id} style={[styles.choice, addressId === item.id && styles.choiceActive]} onPress={() => chooseAddress(item)}><ThemedText>{item.label}</ThemedText></Pressable>)}</ScrollView></>}
      <ThemedText style={styles.label}>Canal del pedido</ThemedText><View style={styles.actions}>{[["local", "Local"], ["whatsapp", "WhatsApp"], ["phone", "Teléfono"], ["other", "Otro"]].map(([key, label]) => <Pressable key={key} style={[styles.choice, salesChannel === key && styles.choiceActive]} disabled={!!work.operation} onPress={() => setSalesChannel(key)}><ThemedText>{label}</ThemedText></Pressable>)}</View>
      <ThemedText style={styles.label}>¿Cómo se entrega?</ThemedText><View style={styles.actions}>{[[true,"Recoger en local"],[false,"Entrega a domicilio"]].map(([value,label])=><Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{checked:pickup===value,disabled:!!work.operation}} disabled={!!work.operation} style={[styles.choice,pickup===value&&styles.choiceActive]} onPress={()=>{if(work.operation)return;setPickup(value as boolean);setZonePickerOpen(false);setCollectOnDelivery(false);}}><ThemedText>{label}</ThemedText></Pressable>)}</View>
      {pickup && <View style={styles.section}><ThemedText style={styles.notice}>Recoger en local: el nombre y teléfono son obligatorios para avisar cuando esté listo.</ThemedText><TextInput editable={!work.operation} style={styles.input} {...form.field(pickup?"contact_name":"delivery.recipient",recipientInput)} required helperText={!recipient.trim()?"Escribe el nombre de quien recibe.":undefined} value={recipient} onChangeText={setRecipient} placeholder="Nombre de quien recoge *" /><TextInput editable={!work.operation} style={styles.input} {...form.field(pickup?"contact_phone":"delivery.phone",phoneInput)} required helperText={!phone.trim()?"Escribe un teléfono de contacto.":undefined} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Teléfono de contacto *" /></View>}
      {!pickup && <View style={styles.section}><ThemedText style={styles.notice}>Entrega a domicilio: completa los datos obligatorios.</ThemedText><TextInput editable={!work.operation} style={styles.input} {...form.field(pickup?"contact_name":"delivery.recipient",recipientInput)} required helperText={!recipient.trim()?"Escribe el nombre de quien recibe.":undefined} value={recipient} onChangeText={setRecipient} placeholder="Nombre de quien recibe *" /><TextInput editable={!work.operation} style={styles.input} {...form.field(pickup?"contact_phone":"delivery.phone",phoneInput)} required helperText={!phone.trim()?"Escribe un teléfono de contacto.":undefined} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Teléfono *" /><ThemedText style={styles.label}>Colonia o junta auxiliar (obligatoria)</ThemedText><Notice kind="error" message={form.errors["delivery.delivery_zone"]}/>{activeDeliveryZones.length > 0 ? <View style={styles.zonePicker}><Pressable accessibilityRole="button" disabled={!!work.operation} accessibilityState={{expanded:zonePickerOpen,disabled:!!work.operation}} onPress={() => {if(!work.operation)setZonePickerOpen((value) => !value);}} style={[styles.zonePickerButton, zonePickerOpen && styles.zonePickerButtonOpen]}><View style={styles.flex}><ThemedText style={selectedDeliveryZone ? styles.rowTitle : styles.muted}>{selectedDeliveryZone ? `${selectedDeliveryZone.kind === "auxiliary" ? "Junta auxiliar" : "Colonia"}: ${selectedDeliveryZone.name}` : "Selecciona una colonia o junta auxiliar"}</ThemedText>{selectedDeliveryZone && <ThemedText style={styles.muted}>{Number(selectedDeliveryZone.fee) > 0 ? `Costo extra: $${Number(selectedDeliveryZone.fee).toFixed(2)}` : "Sin costo extra"}</ThemedText>}</View><ThemedText style={styles.zonePickerChevron}>{zonePickerOpen ? "▲" : "▼"}</ThemedText></Pressable>{zonePickerOpen && <ScrollView nestedScrollEnabled style={styles.zonePickerList}>{activeDeliveryZones.map((item) => <Pressable key={item.name} disabled={!!work.operation} style={[styles.zonePickerOption, zone === item.name && styles.zonePickerOptionActive]} onPress={() => chooseZone(item.name)}><ThemedText style={styles.rowTitle}>{item.kind === "auxiliary" ? "Junta auxiliar" : "Colonia"}: {item.name}</ThemedText><ThemedText style={styles.muted}>{Number(item.fee) > 0 ? `+$${Number(item.fee).toFixed(2)}` : "Sin costo extra"}</ThemedText></Pressable>)}</ScrollView>}</View> : <TextInput editable={!work.operation} style={styles.input} {...form.field("delivery.address",addressInput)} required helperText={!address.trim()?"Escribe la dirección de entrega.":undefined} value={address} onChangeText={setAddress} placeholder="Colonia o junta auxiliar *" />}<TextInput editable={!work.operation} style={styles.input} value={references} onChangeText={setReferences} placeholder="Calle, número y referencias (opcional)" /><TextInput editable={!work.operation} style={styles.input} {...form.field("delivery.map_url")} value={mapUrl} onChangeText={setMapUrl} autoCapitalize="none" placeholder="Enlace de mapa (opcional)" /></View>}
      {!pickup && activeDeliveryZones.length > 0 && !!address && <ThemedText>Dirección conservada: {address}</ThemedText>}
      {!pickup && addressReview && <View><ThemedText>La zona cambió. Comprueba que esta dirección corresponde a la nueva zona.</ThemedText><TextInput {...form.field("delivery.address",addressInput)} required editable={!work.operation} style={styles.input} value={address} onChangeText={setAddress} placeholder="Revisar dirección de entrega"/><Pressable disabled={!!work.operation || !address.trim()} onPress={()=>setAddressReview(false)}><ThemedText>La dirección corresponde a esta zona</ThemedText></Pressable></View>}
      <TextInput editable={!work.operation} style={styles.input} {...form.field("scheduled_at")} value={scheduledAt} onChangeText={setScheduledAt} placeholder="Programar: AAAA-MM-DD HH:mm" /><TextInput editable={!work.operation} style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notas generales o de preparación" />
      <ThemedText style={styles.label}>Pago</ThemedText>{form.errors.payments&&<Notice kind="error" message={form.errors.payments}/>}<View style={styles.actions}>{settings.payment_methods.filter((method) => method.active).map((method) => <Pressable key={method.key} style={[styles.choice, payment === method.key && !collectOnDelivery && styles.choiceActive]} onPress={() => { setPayment(method.key); setCollectOnDelivery(false); }}><ThemedText>{method.label}</ThemedText></Pressable>)}{settings.payment_methods.filter((method) => method.active).length === 2 && <Pressable style={[styles.choice, payment === "mixed" && styles.choiceActive]} onPress={() => { setPayment("mixed"); setCollectOnDelivery(false); }}><ThemedText>Mixto</ThemedText></Pressable>}{isAdministrator && <Pressable style={[styles.choice, payment === "courtesy" && styles.choiceActive]} onPress={() => { setPayment("courtesy"); setCollectOnDelivery(false); }}><ThemedText>Cortesía</ThemedText></Pressable>}{!pickup && <Pressable style={[styles.choice, collectOnDelivery && styles.choiceActive]} onPress={() => {setCollectOnDelivery(!collectOnDelivery);setPayment("");}}><ThemedText>Cobrar al entregar</ThemedText></Pressable>}</View>
      {collectOnDelivery && <ThemedText>Se cobrará al entregar. No se registra un pago ahora.</ThemedText>}
      {payment === "courtesy" && <ThemedText>Cortesía: este pedido se entrega sin cobrar. No se registra un pago.</ThemedText>}
      {payment === "mixed" && !collectOnDelivery && <TextInput style={styles.input} {...form.field("payments")} required helperText="Sin separadores de miles; usa punto o coma decimal." value={cashAmount} onChangeText={setCashAmount} keyboardType="decimal-pad" placeholder="Monto en efectivo" />}
      {invalidAmount && <ThemedText style={styles.notice}>El importe supera el límite permitido. Reduce las cantidades antes de enviar.</ThemedText>}
      <ThemedText style={styles.total}>Subtotal ${subtotal.toFixed(2)}{deliveryFee ? ` + envío $${deliveryFee.toFixed(2)}` : ""}{"\n"}Total ${total.toFixed(2)}</ThemedText>
      <Notice kind={messageKind} message={message}/>
      {lastOrder && <DocumentActions token={token} order={lastOrder} />}
      {!!blockers.length && <View accessibilityRole="alert">{blockers.map((text,index)=><ThemedText key={index}>{text}</ThemedText>)}{!!contactProblems.length && <Pressable onPress={focusMissingContact}><ThemedText>Completar datos de entrega</ThemedText></Pressable>}</View>}
      <ActionButton label={scheduledAt.trim()?"Confirmar pedido programado":"Confirmar y enviar a cocina"} disabled={confirmDisabled} loading={submitAction.busy} loadingLabel="Confirmando pedido…" onPress={()=>submit("confirmed")}/>
      <View style={styles.actions}><ActionButton variant="secondary" label="Pendiente de pago" disabled={busy || invalidAmount || !verified || review || !!invalid.length || !cart.length} loading={submitAction.busy} loadingLabel="Guardando pedido…" onPress={()=>submit("pending_payment")}/><ActionButton variant="secondary" label="Borrador / cotización" disabled={busy || invalidAmount || !verified || review || !!invalid.length || !cart.length} loading={submitAction.busy} loadingLabel="Guardando pedido…" onPress={()=>submit("draft")}/></View>
    </View>}
    </View>
  </>;
}

function ProductCard({ product, promotions, products, settings, onAdd, onAddCombo }: { product: Product; promotions: Combo[]; products: Product[]; settings: OperationalSettings; onAdd: (product: Product, variant: Variant, flavorIds: number[], modifierIds: number[], notes: string) => void; onAddCombo: (combo: Combo, components: ComboComponent[], summary: string[]) => void }) {
  const styles=useThemedStyles(createStyles);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [flavors, setFlavors] = useState<Record<number, number[]>>({}); const [modifiers, setModifiers] = useState<Record<number, number[]>>({}); const [notes, setNotes] = useState<Record<number, string>>({});
  const [selectedVariantId,setSelectedVariantId]=useState(product.variants[0]?.id??0);
  const variantScrollRef=useRef<ScrollView>(null);
  const compactVariants=product.type==="pizza"&&product.variants.length>1;
  const displayedVariants=compactVariants?product.variants.filter((variant)=>variant.id===selectedVariantId):product.variants;
  const selectedVariantIndex=Math.max(0,product.variants.findIndex((variant)=>variant.id===selectedVariantId));
  const directVariant=product.variants.length===1&&!product.flavors.length&&!product.variants[0]?.modifier_rules.length?product.variants[0]:null;
  const startingPrice=Math.min(...product.variants.map((variant)=>Number(variant.price)).filter(Number.isFinite));
  function moveVariant(direction:-1|1){const nextIndex=Math.min(product.variants.length-1,Math.max(0,selectedVariantIndex+direction));setSelectedVariantId(product.variants[nextIndex].id);variantScrollRef.current?.scrollTo({x:nextIndex*120,animated:true});}
  function toggleFlavor(variant: Variant, id: number) { const max = product.type === "wings" ? Math.min(variant.max_flavors, settings.max_wing_flavors) : variant.max_flavors; setFlavors((current) => { const selected = current[variant.id] ?? []; const next = selected.includes(id) ? selected.filter((value) => value !== id) : max <= 1 ? [id] : selected.length >= max ? selected : [...selected, id]; return { ...current, [variant.id]: next }; }); }
  function toggleModifier(variantId: number, id: number) { const variant=product.variants.find((item)=>item.id===variantId);const selectedRule=variant?.modifier_rules.find((rule)=>rule.modifier_id===id);setModifiers((current)=>{const selected=current[variantId]??[];if(selected.includes(id))return {...current,[variantId]:selected.filter((value)=>value!==id)};const compatible=selectedRule?.modifier.type==="stuffed_crust"?selected.filter((value)=>variant?.modifier_rules.find((rule)=>rule.modifier_id===value)?.modifier.type!=="stuffed_crust"):selected;return {...current,[variantId]:[...compatible,id]};}); }
  const configuration = <>
    {compactVariants&&<View style={styles.variantSelector}><ThemedText style={styles.variantSelectorLabel}>Elige el tamaño</ThemedText><View style={styles.variantScroller}>{Platform.OS==="web"&&<Pressable accessibilityLabel="Tamaño anterior" disabled={selectedVariantIndex===0} onPress={()=>moveVariant(-1)} style={[styles.variantArrow,selectedVariantIndex===0&&styles.disabled]}><ThemedText style={styles.variantArrowText}>‹</ThemedText></Pressable>}<ScrollView ref={variantScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS==="web"} contentContainerStyle={styles.actions} style={styles.variantScroll}>{product.variants.map((variant)=><Pressable key={variant.id} onPress={()=>setSelectedVariantId(variant.id)} style={[styles.variantTab,selectedVariantId===variant.id&&styles.variantTabActive]}><ThemedText style={selectedVariantId===variant.id&&styles.variantTabTextActive}>{variant.name}</ThemedText><ThemedText style={[styles.variantTabPrice,selectedVariantId===variant.id&&styles.variantTabTextActive]}>${Number(variant.price).toFixed(2)}</ThemedText></Pressable>)}</ScrollView>{Platform.OS==="web"&&<Pressable accessibilityLabel="Tamaño siguiente" disabled={selectedVariantIndex===product.variants.length-1} onPress={()=>moveVariant(1)} style={[styles.variantArrow,selectedVariantIndex===product.variants.length-1&&styles.disabled]}><ThemedText style={styles.variantArrowText}>›</ThemedText></Pressable>}</View></View>}
    {displayedVariants.map((variant) => {
      const availableFlavors = Array.isArray(variant.available_flavor_ids) ? product.flavors.filter((flavor)=>variant.available_flavor_ids!.includes(flavor.id)) : product.flavors;
      const selectedFlavors = flavors[variant.id] ?? [];
      const selectedModifiers = modifiers[variant.id] ?? [];
      const stuffedCrustRules = allowsStuffedCrust(variant.name) ? variant.modifier_rules.filter((rule) => rule.modifier.type === "stuffed_crust") : [];
      const otherModifierRules = variant.modifier_rules.filter((rule) => rule.modifier.type !== "stuffed_crust");
      const flavorExtra = availablePrice(() => flavorSelectionExtra(product.type, selectedFlavors, settings)) ?? 0;
      const configuredPrice = availablePrice(() => productPrice(product, variant, selectedFlavors, selectedModifiers, settings));
      const needsFlavor = configuredPrice === null || availableFlavors.length > 0 && (variant.required_flavors ? selectedFlavors.length !== variant.required_flavors : !selectedFlavors.length);
      return <View style={[styles.variant,compactVariants&&styles.selectedVariant]} key={variant.id}>
        {!compactVariants&&<View style={styles.headingRow}><ThemedText style={styles.rowTitle}>{variant.name}</ThemedText><ThemedText style={styles.price}>${Number(variant.price).toFixed(2)}</ThemedText></View>}
        {!!availableFlavors.length && <><ThemedText style={styles.label}>{variant.required_flavors ? `Selecciona exactamente ${variant.required_flavors} ${variant.required_flavors === 1 ? "sabor" : "sabores"}` : `Selecciona ${variant.max_flavors>1?`hasta ${variant.max_flavors} sabores`:"un sabor"}`}</ThemedText><View style={styles.actions}>{availableFlavors.map((flavor) => <Pressable key={flavor.id} style={[styles.choice, selectedFlavors.includes(flavor.id) && styles.choiceActive]} onPress={() => toggleFlavor(variant, flavor.id)}><ThemedText>{flavor.name}</ThemedText></Pressable>)}</View></>}
        {selectedFlavors.length > 1 && <ThemedText>Para cambiar un sabor, quita primero uno seleccionado.</ThemedText>}
        {!!stuffedCrustRules.length && <View style={styles.extraSection}><ThemedText style={styles.label}>Elige el tipo de orilla</ThemedText><ThemedText style={styles.extraHint}>La orilla rellena lleva queso. Cada opción muestra su recargo.</ThemedText><View style={styles.actions}><Pressable style={[styles.choice, !stuffedCrustRules.some((rule) => selectedModifiers.includes(rule.modifier_id)) && styles.choiceActive]} onPress={() => setModifiers((current) => ({...current, [variant.id]: selectedModifiers.filter((id) => !stuffedCrustRules.some((rule) => rule.modifier_id === id))}))}><ThemedText>Orilla normal</ThemedText></Pressable>{stuffedCrustRules.map((rule) => <Pressable key={rule.modifier_id} style={[styles.choice, selectedModifiers.includes(rule.modifier_id) && styles.choiceActive]} onPress={() => toggleModifier(variant.id, rule.modifier_id)}><ThemedText>Rellena de queso con {rule.modifier.name.toLocaleLowerCase().includes("chipotle") ? "chipotle" : "habanero"} +${Number(rule.price_override ?? rule.modifier.price).toFixed(2)}</ThemedText></Pressable>)}</View></View>}
        {!!otherModifierRules.length && <><ThemedText style={styles.label}>Otros extras</ThemedText><View style={styles.actions}>{otherModifierRules.map((rule) => <Pressable key={rule.modifier_id} style={[styles.choice, selectedModifiers.includes(rule.modifier_id) && styles.choiceActive]} onPress={() => toggleModifier(variant.id, rule.modifier_id)}><ThemedText>{rule.modifier.name} +${Number(rule.price_override ?? rule.modifier.price).toFixed(2)}</ThemedText></Pressable>)}</View></>}
        <TextInput style={styles.input} value={notes[variant.id] ?? ""} onChangeText={(value) => setNotes((current) => ({ ...current, [variant.id]: value }))} placeholder="Notas del producto" />
        {!!flavorExtra && <ThemedText style={styles.muted}>Recargo por sabores: +${money(flavorExtra).toFixed(2)}</ThemedText>}
        {!allowsStuffedCrust(variant.name) && <ThemedText style={styles.muted}>Esta presentación usa orilla normal.</ThemedText>}
        <Pressable disabled={needsFlavor} style={[styles.primary, needsFlavor && styles.disabled]} onPress={() => {onAdd(product, variant, selectedFlavors, allowedModifierIds(variant,selectedModifiers), notes[variant.id] ?? "");setConfigurationOpen(false);}}><ThemedText style={styles.primaryText}>Agregar {variant.name} · ${configuredPrice?.toFixed(2) ?? "No disponible"}</ThemedText></Pressable>
      </View>;
    })}
  </>;
  return <View style={styles.card}>
    <View style={styles.productHeader}>{product.image_data_uri ? <Image source={{ uri: product.image_data_uri }} resizeMode="cover" style={styles.productImage} /> : <View style={styles.productImagePlaceholder}><ThemedText style={styles.productImageIcon}>🍕</ThemedText></View>}<View style={styles.productInfo}><ThemedText style={styles.title}>{product.name}</ThemedText><ThemedText style={styles.muted}>{product.category?.name ?? product.type}</ThemedText>{!!product.description && <ThemedText numberOfLines={3} style={styles.productDescription}>{product.description}</ThemedText>}<ThemedText style={styles.price}>{Number.isFinite(startingPrice)?`${product.variants.length>1?"Desde ":""}$${startingPrice.toFixed(2)}`:"Precio no disponible"}</ThemedText></View></View>
    {directVariant ? <Pressable style={styles.outlineButton} onPress={()=>onAdd(product,directVariant,[],[],"")}><ThemedText style={styles.outlineText}>Agregar {product.name}</ThemedText></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={`Configurar ${product.name}`} style={styles.primary} onPress={()=>setConfigurationOpen(true)}><ThemedText style={styles.primaryText}>Configurar</ThemedText></Pressable>}
    {promotions.map((promotion)=><View key={promotion.id} style={styles.promotion}><ThemedText style={styles.promotionLabel}>PROMOCIÓN</ThemedText><ComboCard combo={promotion} products={products} settings={settings} onAdd={onAddCombo}/></View>)}
    <Modal animationType="fade" transparent visible={configurationOpen} onRequestClose={()=>setConfigurationOpen(false)}><View style={styles.configBackdrop}><Pressable accessibilityRole="button" accessibilityLabel="Cerrar configuración" style={styles.configDismiss} onPress={()=>setConfigurationOpen(false)}/><View accessibilityViewIsModal accessibilityLabel={`Configurar ${product.name}`} style={styles.configModal}><View style={styles.configHeader}><View style={styles.flex}><ThemedText style={styles.title}>Configurar {product.name}</ThemedText><ThemedText style={styles.muted}>Elige únicamente las opciones necesarias para este producto.</ThemedText></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar configuración de producto" onPress={()=>setConfigurationOpen(false)} style={styles.configClose}><ThemedText style={styles.configCloseText}>×</ThemedText></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.configContent}>{configuration}</ScrollView></View></View></Modal>
  </View>;
}

function ComboCard({ combo, products, settings, onAdd, catalogCard = false }: { combo: Combo; products: Product[]; settings: OperationalSettings; onAdd: (combo: Combo, components: ComboComponent[], summary: string[]) => void; catalogCard?: boolean }) {
  const styles=useThemedStyles(createStyles);
  const [configurationOpen,setConfigurationOpen]=useState(false);
  const [activeUnitIndex,setActiveUnitIndex]=useState(0);
  const [flavors, setFlavors] = useState<Record<string, number[]>>({}); const [modifiers, setModifiers] = useState<Record<string, number[]>>({}); const [notes, setNotes] = useState<Record<string, string>>({});
  function choices(item: ComboItem) { const product = products.find((entry) => entry.variants.some((variant) => variant.id === item.product_variant_id)); const variant=product?.variants.find((entry)=>entry.id===item.product_variant_id); const recipeFlavors=Array.isArray(variant?.available_flavor_ids)?(product?.flavors??[]).filter((flavor)=>variant!.available_flavor_ids!.includes(flavor.id)):product?.flavors??[]; const optionFlavors = item.options.filter((option) => option.flavor).map((option) => option.flavor as Flavor).filter((flavor)=>!Array.isArray(variant?.available_flavor_ids)||variant!.available_flavor_ids!.includes(flavor.id)); const optionModifiers = item.options.filter((option) => option.modifier).map((option) => option.modifier as Modifier).filter((modifier)=>allowsStuffedCrust(variant?.name??"")||modifier.type!=="stuffed_crust"); return { availableFlavors: optionFlavors.length ? optionFlavors : recipeFlavors, availableModifiers: optionModifiers }; }
  const units:{item:ComboItem;unitIndex?:number;key:string}[]=combo.items.flatMap((item):{item:ComboItem;unitIndex?:number;key:string}[]=>{const count=Number(item.quantity);return Number.isInteger(count)&&count>1?Array.from({length:count},(_value,index)=>({item,unitIndex:index+1,key:`${item.id}-${index+1}`})):[{item,key:String(item.id)}];});
  const configuredTotal = availablePrice(() => comboPrice(combo, units.map(({item, unitIndex, key}) => ({combo_item_id: item.id, unit_index: unitIndex, flavor_ids: flavors[key] ?? [], modifier_ids: modifiers[key] ?? []})), products, settings));
  function unitIncomplete({item,key}:{item:ComboItem;key:string}) { return item.flavor_selection_count ? (flavors[key]?.length??0)!==item.flavor_selection_count : item.flavor_required&&!(flavors[key]?.length); }
  const incomplete=configuredTotal === null || units.some(unitIncomplete);
  function add(){const components=units.map(({item,unitIndex,key})=>{const product=products.find((entry)=>entry.variants.some((variant)=>variant.id===item.product_variant_id));const variant=product?.variants.find((entry)=>entry.id===item.product_variant_id);return {combo_item_id:item.id,unit_index:unitIndex,flavor_ids:flavors[key]??[],modifier_ids:variant?allowedModifierIds(variant,modifiers[key]??[]):modifiers[key]??[],notes:notes[key]?.trim()||undefined};});const summary=units.map(({item,unitIndex,key})=>{const available=choices(item);const flavorNames=available.availableFlavors.filter((flavor)=>(flavors[key]??[]).includes(flavor.id)).map((flavor)=>flavor.name);return `${item.variant.product.name} ${item.variant.name}${unitIndex?` #${unitIndex}`:""}${flavorNames.length?` (${flavorNames.join("/")})`:""}`;});onAdd(combo,components,summary);}
  const needsConfiguration=units.some(({item})=>{const available=choices(item);return available.availableFlavors.length>0||available.availableModifiers.length>0;});
  const activeUnit=units[Math.min(activeUnitIndex,units.length-1)];
  const configuration=activeUnit?(()=>{const {item,unitIndex,key}=activeUnit;const available=choices(item);const product=products.find((entry)=>entry.variants.some((variant)=>variant.id===item.product_variant_id));const variant=product?.variants.find((entry)=>entry.id===item.product_variant_id);const maxFlavors=item.flavor_selection_count??(product?.type==="wings"?Math.min(variant?.max_flavors??1,settings.max_wing_flavors):variant?.max_flavors??1);const currentIncomplete=unitIncomplete(activeUnit);return <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.comboProgress}>{units.map((unit,index)=>{const complete=!unitIncomplete(unit);return <Pressable accessibilityLabel={`Abrir componente ${index+1}`} key={unit.key} onPress={()=>setActiveUnitIndex(index)} style={[styles.comboProgressStep,index===activeUnitIndex&&styles.comboProgressStepActive,complete&&styles.comboProgressStepComplete]}><ThemedText style={[styles.comboProgressNumber,index===activeUnitIndex&&styles.primaryText]}>{complete?"✓":index+1}</ThemedText><ThemedText numberOfLines={1} style={[styles.comboProgressLabel,index===activeUnitIndex&&styles.primaryText]}>{unit.item.variant.product.name}</ThemedText></Pressable>})}</ScrollView>
    <View style={styles.comboStepHeading}><View><ThemedText style={styles.title}>{item.variant.product.name} · {item.variant.name}{unitIndex?` #${unitIndex}`:""}</ThemedText><ThemedText style={styles.muted}>Componente {activeUnitIndex+1} de {units.length}</ThemedText></View><ThemedText style={styles.comboStepStatus}>{currentIncomplete?"Por completar":"Listo"}</ThemedText></View>
    <View style={styles.comboDecisionCard}>{!!available.availableFlavors.length&&<><ThemedText style={styles.label}>{item.flavor_selection_count?`Elige exactamente ${item.flavor_selection_count} ${item.flavor_selection_count===1?"sabor":"sabores"}`:`Elige hasta ${maxFlavors} ${maxFlavors===1?"sabor":"sabores"}`}</ThemedText><View style={styles.actions}>{available.availableFlavors.map((flavor)=><Pressable key={flavor.id} style={[styles.choice,(flavors[key]??[]).includes(flavor.id)&&styles.choiceActive]} onPress={()=>setFlavors((current)=>{const selected=current[key]??[];const next=selected.includes(flavor.id)?selected.filter((id)=>id!==flavor.id):maxFlavors<=1?[flavor.id]:selected.length>=maxFlavors?selected:[...selected,flavor.id];return {...current,[key]:next};})}><ThemedText>{flavor.name}</ThemedText></Pressable>)}</View></>}{!!available.availableModifiers.length&&<><ThemedText style={styles.label}>Extras disponibles</ThemedText><View style={styles.actions}>{available.availableModifiers.map((modifier)=><Pressable key={modifier.id} style={[styles.choice,(modifiers[key]??[]).includes(modifier.id)&&styles.choiceActive]} onPress={()=>setModifiers((current)=>({...current,[key]:(current[key]??[]).includes(modifier.id)?current[key].filter((id)=>id!==modifier.id):[...(current[key]??[]),modifier.id]}))}><ThemedText>{modifier.name} +${product&&variant?availablePrice(()=>moneyMultiply(selectionPrice(product,variant,[],[modifier.id],settings),unitIndex?1:item.quantity))?.toFixed(2)??"No disponible":"No disponible"}</ThemedText></Pressable>)}</View></>}<View style={styles.comboStepMeta}>{product&&variant&&<ThemedText style={styles.muted}>Recargo actual: +${availablePrice(()=>moneyMultiply(flavorSelectionExtra(product.type,flavors[key]??[],settings),unitIndex?1:item.quantity))?.toFixed(2)??"No disponible"}</ThemedText>}<ThemedText style={styles.muted}>{(flavors[key]?.length??0)} sabor(es) seleccionado(s)</ThemedText></View><TextInput style={styles.input} value={notes[key]??""} onChangeText={(value)=>setNotes((current)=>({...current,[key]:value}))} placeholder="Notas de este componente (opcional)"/></View>
    <View style={styles.comboModalFooter}><View style={styles.comboFooterTotal}><ThemedText style={styles.muted}>Total del paquete</ThemedText><ThemedText style={styles.price}>${configuredTotal?.toFixed(2)??"No disponible"}</ThemedText></View><View style={styles.comboFooterActions}>{activeUnitIndex>0&&<Pressable style={styles.outlineButton} onPress={()=>setActiveUnitIndex((index)=>index-1)}><ThemedText style={styles.outlineText}>Anterior</ThemedText></Pressable>}{activeUnitIndex<units.length-1?<Pressable disabled={currentIncomplete} style={[styles.primary,styles.flex,currentIncomplete&&styles.disabled]} onPress={()=>setActiveUnitIndex((index)=>index+1)}><ThemedText style={styles.primaryText}>Siguiente componente</ThemedText></Pressable>:<Pressable disabled={incomplete} style={[styles.primary,styles.flex,incomplete&&styles.disabled]} onPress={()=>{add();setConfigurationOpen(false);setActiveUnitIndex(0);}}><ThemedText style={styles.primaryText}>Agregar al pedido</ThemedText></Pressable>}</View></View>
  </>})():null;
  return <View style={catalogCard ? styles.card : styles.combo}>{catalogCard && <View style={styles.productHeader}>{combo.image_data_uri ? <Image source={{uri:combo.image_data_uri}} resizeMode="cover" style={styles.productImage}/> : <View style={styles.productImagePlaceholder}><ThemedText style={styles.productImageIcon}>🍕</ThemedText></View>}<View style={styles.productInfo}><ThemedText style={styles.title}>{combo.name}</ThemedText><ThemedText style={styles.muted}>Paquete · {units.length} componente(s)</ThemedText><ThemedText style={styles.price}>Desde ${Number(combo.price).toFixed(2)}</ThemedText></View></View>}{!catalogCard && <View style={styles.headingRow}><View style={styles.flex}><ThemedText style={styles.rowTitle}>{combo.name}</ThemedText><ThemedText style={styles.muted}>{units.length} componente(s)</ThemedText></View><ThemedText style={styles.price}>Desde ${Number(combo.price).toFixed(2)}</ThemedText></View>}{needsConfiguration?<Pressable accessibilityRole="button" accessibilityLabel={`Configurar ${combo.name}`} style={catalogCard?styles.primary:styles.outlineButton} onPress={()=>{setActiveUnitIndex(0);setConfigurationOpen(true);}}><ThemedText style={catalogCard?styles.primaryText:styles.outlineText}>Configurar paquete</ThemedText></Pressable>:<Pressable style={catalogCard?styles.primary:styles.outlineButton} onPress={add}><ThemedText style={catalogCard?styles.primaryText:styles.outlineText}>Agregar paquete</ThemedText></Pressable>}<Modal animationType="fade" transparent visible={configurationOpen} onRequestClose={()=>setConfigurationOpen(false)}><View style={styles.configBackdrop}><Pressable accessibilityRole="button" accessibilityLabel="Cerrar configuración" style={styles.configDismiss} onPress={()=>setConfigurationOpen(false)}/><View accessibilityViewIsModal accessibilityLabel={`Configurar ${combo.name}`} style={[styles.configModal,styles.comboConfigModal]}><View style={styles.configHeader}><View style={styles.flex}><ThemedText style={styles.title}>Configurar {combo.name}</ThemedText><ThemedText style={styles.muted}>Avanza componente por componente.</ThemedText></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar configuración de paquete" onPress={()=>setConfigurationOpen(false)} style={styles.configClose}><ThemedText style={styles.configCloseText}>×</ThemedText></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.configContent,styles.comboConfigContent]}>{configuration}</ScrollView></View></View></Modal></View>;
}
function DocumentActions({ token, order }: { token: string; order: Order }) {
  const styles=useThemedStyles(createStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(80);
  const [printer, setPrinter] = useState<SavedPrinter | null>(null);
  useEffect(() => { getConfiguredThermalPrinter().then((saved) => { setPrinter(saved); if (saved?.paperWidth) setPaperWidth(saved.paperWidth); }).catch(() => undefined); }, []);
  async function open(type: "customer_html" | "customer_pdf" | "customer_image") { setBusy(true); setError(""); try { const doc = await api<{ download_url?: string; whatsapp_url?: string }>(`/orders/${order.id}/generate-document`, token, { method: "POST", body: JSON.stringify({ type }) }); if (!doc.download_url) throw new Error("El servidor no devolvió un documento para abrir."); await Linking.openURL(doc.download_url); } catch (reason) { setError(operationError(reason,"generar el documento")); } finally { setBusy(false); } }
  async function ticketHtml() { const doc = await api<{ print_content?: string }>(`/orders/${order.id}/generate-document`, token, { method: "POST", body: JSON.stringify({ type: "customer_html" }) }); if (!doc.print_content) throw new Error("El servidor no devolvió el contenido del ticket para imprimir."); return doc.print_content; }
  async function print() { if(isNativeAndroid() && !printer){setError("Primero configura una impresora térmica Bluetooth o Wi-Fi en Ajustes.");return;} setBusy(true); setError(""); try { await printThermalHtml(await ticketHtml(), paperWidth, printer?.url); Alert.alert("Ticket enviado", `El ticket se envió directamente a ${printer?.name ?? "la impresora"}.`); } catch (reason) { setError(operationError(reason,"imprimir el ticket")); } finally { setBusy(false); } }
  async function printWithAndroid() { setBusy(true); setError(""); try { await printThermalHtmlWithAndroid(await ticketHtml(), paperWidth); } catch (reason) { setError(operationError(reason,"abrir la impresión de Android")); } finally { setBusy(false); } }
  const nativeAndroid = isNativeAndroid();
  return <View style={styles.warning}><ThemedText style={styles.rowTitle}>Ticket de orden #{order.daily_number}</ThemedText><ThemedText style={styles.muted}>{printer ? `${printer.name} · ${paperWidth} mm` : nativeAndroid ? "Configura una impresora desde Ajustes → Impresora térmica." : `Formato de ${paperWidth} mm`}</ThemedText><Notice kind="error" message={error}/><View style={styles.actions}><Pressable disabled={busy} style={styles.primary} onPress={print}><ThemedText style={styles.primaryText}>{busy ? "Conectando..." : "Imprimir directo"}</ThemedText></Pressable>{nativeAndroid && <Pressable disabled={busy} style={styles.outlineButton} onPress={printWithAndroid}><ThemedText style={styles.outlineText}>Imprimir mediante Android</ThemedText></Pressable>}<Pressable disabled={busy} style={styles.outlineButton} onPress={() => open("customer_html")}><ThemedText style={styles.outlineText}>Vista previa</ThemedText></Pressable><Pressable disabled={busy} style={styles.outlineButton} onPress={() => open("customer_pdf")}><ThemedText style={styles.outlineText}>PDF</ThemedText></Pressable><Pressable disabled={busy} style={styles.outlineButton} onPress={() => open("customer_image")}><ThemedText style={styles.outlineText}>Imagen</ThemedText></Pressable></View></View>;
}

const createStyles=(theme:Theme)=>StyleSheet.create({
  catalogTabs: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, flexDirection: "row", gap: 5, padding: 5 }, catalogTab: { alignItems: "center", borderRadius: theme.radius.pill, flex: 1, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: theme.control.minTouch, paddingHorizontal: 14 }, catalogTabActive: { backgroundColor: theme.colors.primary, ...theme.shadows.surface }, catalogTabText: { color: theme.colors.textMuted, fontWeight: "900" }, catalogTabTextActive: { color: theme.colors.primaryText }, catalogTabCount: { color: theme.colors.textMuted, fontSize: 12 * theme.fontScale, fontWeight: "900" }, swipeHint: { color: theme.colors.textMuted, fontSize: 12 * theme.fontScale, textAlign: "center" },
  packageSection: { gap: 12, marginTop: 4 }, packageCount: { backgroundColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, color: theme.colors.primary, fontWeight: "900", minWidth: 32, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 6, textAlign: "center" },
  layout: { alignItems: "flex-start", flexDirection: "row", gap: 18 }, layoutCompact: { flexDirection: "column" }, catalog: { flex: 2, gap: 12, width: "100%" }, cart: { ...theme.shadows.surface, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.section, borderWidth: 1, flex: 1, gap: 16, minWidth: 350, padding: 20, width: "100%" }, cartCompact: { minWidth: 0 }, card: { ...theme.shadows.surface, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, gap: 12, marginBottom: 12, padding: 16 }, recoveryCard: { ...theme.shadows.surface, alignSelf: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.section, borderWidth: 1, gap: 14, maxHeight: "92%", maxWidth: 620, padding: 20, width: "100%" }, recoveryDetails: { maxHeight: 300 }, loadingCard: { ...theme.shadows.surface, alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.section, borderWidth: 1, gap: 10, maxWidth: 360, padding: 24, width: "100%" }, loader: { margin: 40 }, title: { color: theme.colors.text, fontSize: 19 * theme.fontScale, fontWeight: "900" }, rowTitle: { color: theme.colors.text, fontWeight: "800" }, label: { color: theme.colors.text, fontSize: 13 * theme.fontScale, fontWeight: "800", marginTop: 3 }, muted: { color: theme.colors.textMuted }, price: { color: theme.colors.primary, fontSize: 16 * theme.fontScale, fontWeight: "900" }, total: { backgroundColor: theme.colors.primarySurface, borderRadius: theme.radius.control, color: theme.colors.text, fontSize: 22 * theme.fontScale, fontWeight: "900", padding: 14 }, inline: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 }, flex: { flex: 1, minWidth: 150 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, headingRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 8 }, input: { color:theme.colors.text, backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, minHeight: theme.control.minTouch, paddingHorizontal: 13 }, choice: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, minHeight: theme.control.minTouch, paddingHorizontal: 12, paddingVertical: 10 }, choiceActive: { backgroundColor: theme.colors.primarySurface }, primary: { ...theme.shadows.surface, alignItems: "center", backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, justifyContent: "center", minHeight: theme.control.minTouch, padding: 12 }, primaryText: { color: theme.colors.primaryText, fontWeight: "800" }, outlineButton: { alignItems: "center", backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, borderWidth: 1, justifyContent: "center", minHeight: theme.control.minTouch, padding: 11 }, outlineText: { color: theme.colors.primary, fontWeight: "800" }, disabled: { opacity: theme.control.disabledOpacity }, variant: { borderTopColor: theme.colors.border, borderTopWidth: 1, gap: 10, paddingTop: 12 }, combo: { borderTopColor: theme.colors.border, borderTopWidth: 1, gap: 10, paddingVertical: 12 }, component: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.control, gap: 8, padding: 10 }, section: { gap: 10 }, cartLine: { alignItems: "center", borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 8, justifyContent: "space-between", paddingVertical: 12 }, quantity: { alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, justifyContent: "center", minHeight: theme.control.minTouch, minWidth: theme.control.minTouch, padding: 10 }, notice: { backgroundColor: theme.colors.warningSurface, borderRadius: theme.radius.control, color: theme.colors.warningText, padding: 11 }, warning: { backgroundColor: theme.colors.warningSurface, borderRadius: theme.radius.card, gap: 8, padding: 13 }, productHeader: { alignItems: "center", flexDirection: "row", gap: 14 }, productImage: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.control, height: 100, width: 100 }, productImagePlaceholder: { alignItems: "center", backgroundColor: theme.colors.primarySurface, borderRadius: theme.radius.control, height: 100, justifyContent: "center", width: 100 }, productImageIcon: { fontSize: 34 * theme.fontScale }, productInfo: { flex: 1, gap: 3, minWidth: 0 }, productDescription: { color: theme.colors.textMuted, fontSize: 14 * theme.fontScale, lineHeight: 19 * theme.fontScale }, productList: { gap: 12, paddingBottom: 8 }, productColumns: { alignItems: "flex-start", flexDirection: "row", gap: 12 }, productColumn: { flex: 1, minWidth: 0 }, promotion: { backgroundColor: theme.colors.warningSurface, borderColor: theme.colors.warning, borderRadius: theme.radius.control, borderWidth: 1, paddingHorizontal: 10 }, promotionLabel: { color: theme.colors.warningText, fontSize: 11 * theme.fontScale, fontWeight: "900", paddingTop: 9 }, emptyState: { alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, gap: 6, justifyContent: "center", minHeight: 180, padding: 24 }, emptyIcon: { color: theme.colors.textMuted, fontSize: 30 * theme.fontScale }, mobileCartButton: { alignItems: "center", backgroundColor: theme.colors.surfaceInverse, borderColor: theme.colors.borderInverse, borderRadius: theme.radius.card, borderWidth: 1, elevation: 10, flexDirection: "row", justifyContent: "space-between", marginBottom: 2, minHeight: 66, paddingHorizontal: 17, paddingVertical: 12, position: Platform.OS==="web" ? "sticky" as never : "relative", top: Platform.OS==="web" ? 8 : undefined, zIndex: 20 }, mobileCartTitle: { color: theme.colors.textInverse, fontSize: 16 * theme.fontScale, fontWeight: "900" }, mobileCartDetail: { color: theme.colors.textInverseMuted, fontSize: 13 * theme.fontScale, marginTop: 2 }, mobileCartTotal: { color: theme.colors.textInverse, fontSize: 18 * theme.fontScale, fontWeight: "900" }, backToMenu: { alignItems: "center", backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, borderWidth: 1, minHeight: 48, justifyContent: "center", padding: 10 }, pickupCheck: { alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: "row", gap: 11, minHeight: 58, padding: 11 }, pickupCheckActive: { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primary }, pickupCheckMark: { borderColor: theme.colors.primary, borderRadius: 5, borderWidth: 2, color: theme.colors.primary, fontWeight: "900", height: 24, textAlign: "center", width: 24 }, zonePicker: { position: "relative", zIndex: 3 }, zonePickerButton: { alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, borderTopLeftRadius: theme.radius.control, borderTopRightRadius: theme.radius.control, borderBottomLeftRadius: theme.radius.control, borderBottomRightRadius: theme.radius.control, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: theme.control.minTouch, padding: 12 }, zonePickerButtonOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: theme.colors.primary }, zonePickerChevron: { color: theme.colors.primary, fontSize: 13 * theme.fontScale, fontWeight: "900", marginLeft: 10 }, zonePickerList: { backgroundColor: theme.colors.surfaceRaised, borderBottomLeftRadius: 11, borderBottomRightRadius: 11, borderColor: theme.colors.primary, borderTopWidth: 0, borderWidth: 1, maxHeight: 230 }, zonePickerOption: { borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 52, padding: 12 }, zonePickerOptionActive: { backgroundColor: theme.colors.primarySurface },
  variantSelector: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.card, gap: 8, padding: 11 },
  variantSelectorLabel: { color: theme.colors.textMuted, fontSize: 12 * theme.fontScale, fontWeight: "800" },
  variantScroller: { alignItems: "center", flexDirection: "row", gap: 7 },
  variantScroll: { flex: 1 },
  variantArrow: { alignItems: "center", backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, borderWidth: 1, height: theme.control.minTouch, justifyContent: "center", width: theme.control.minTouch },
  variantArrowText: { color: theme.colors.primary, fontSize: 25 * theme.fontScale, fontWeight: "900", lineHeight: 27 * theme.fontScale },
  variantTab: { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, gap: 3, minWidth: 112, paddingHorizontal: 13, paddingVertical: 10 },
  variantTabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  variantTabPrice: { color: theme.colors.primary, fontSize: 12 * theme.fontScale, fontWeight: "900" },
  variantTabTextActive: { color: theme.colors.primaryText },
  selectedVariant: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, padding: 12 },
  extraSection: { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.borderStrong, borderRadius: theme.radius.control, borderWidth: 1, gap: 7, padding: 11 },
  extraHint: { color: theme.colors.textMuted, fontSize: 12 * theme.fontScale },
  configBackdrop: { alignItems: "center", backgroundColor: theme.colors.overlay, flex: 1, justifyContent: "center", padding: 16 },
  configDismiss: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  configModal: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.modal, borderWidth: 1, maxHeight: "92%", maxWidth: 820, overflow: "hidden", width: "100%", ...theme.shadows.floating },
  comboConfigModal: { maxWidth: 720 },
  configHeader: { alignItems: "center", borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 12, justifyContent: "space-between", padding: 18 },
  configClose: { alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, height: theme.control.minTouch, justifyContent: "center", width: theme.control.minTouch },
  configCloseText: { color: theme.colors.textMuted, fontSize: 28 * theme.fontScale, fontWeight: "700" },
  configContent: { gap: 12, padding: 18, paddingBottom: 24 },
  comboConfigContent: { gap: 14, paddingBottom: 18 },
  comboProgress: { gap: 8, paddingBottom: 2 },
  comboProgressStep: { alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, borderRadius: theme.radius.pill, borderWidth: 1, flexDirection: "row", gap: 7, minHeight: theme.control.minTouch, paddingHorizontal: 12 },
  comboProgressStepActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  comboProgressStepComplete: { borderColor: theme.colors.success },
  comboProgressNumber: { color: theme.colors.textMuted, fontWeight: "900" },
  comboProgressLabel: { color: theme.colors.textMuted, fontSize: 12 * theme.fontScale, fontWeight: "800", maxWidth: 120 },
  comboStepHeading: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  comboStepStatus: { backgroundColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, color: theme.colors.primary, fontSize: 12 * theme.fontScale, fontWeight: "900", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 7 },
  comboDecisionCard: { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, gap: 12, padding: 14 },
  comboStepMeta: { alignItems: "center", borderTopColor: theme.colors.border, borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", paddingTop: 10 },
  comboModalFooter: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, gap: 10, padding: 12 },
  comboFooterTotal: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  comboFooterActions: { alignItems: "stretch", flexDirection: "row", gap: 8 },
});
