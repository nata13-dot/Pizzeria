import {ThemedText} from "../../theme/ThemedText";
import { useRef, useState } from "react";
import { FlatList, Image, Pressable, View } from "react-native";
import { api, ApiError } from "../../api";
import { ActionButton } from "../../components/ActionButton";
import { confirmAction } from "../../components/ConfirmationDialog";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { Notice, useFeedback } from "../../components/Notice";
import { LogoPicker } from "../administration/LogoPicker";
import { variantErrors } from "../../forms/catalogValidation";
import { useActionGate } from "../../forms/useActionGate";
import { useFormErrors } from "../../forms/useFormErrors";
import { decimalInput, moneyInput, operationError, required } from "../../forms/validation";
import { useResponsiveLayout } from "../../layout/responsive";
import { resolveProductSave, type ConfigurationAttempt } from "../../productConfiguration";
import { allowsStuffedCrust } from "../../productRules";
import { useAppStyles } from "../../styles/appStyles";
import { useWork, useWorkGuard } from "../../work/WorkProvider";
import { Empty } from "../orders/shared";
import { productTypeLabel, productTypes } from "./productTypes";
function createOrderIdempotencyKey(): string {
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}
export function ProductsView({ data, token, onSaved, canConfigure }: { data: any[]; token: string; onSaved: () => void; canConfigure: boolean }) {
  const s=useAppStyles();
  const { mobile, compact } = useResponsiveLayout();
  const [search, setSearch] = useState(""); const [status, setStatus] = useState<"active"|"inactive"|"all">("active");
  const [editingProductId, setEditingProductId] = useState<number | null>(null); const [editDraft, rawSetEditDraft] = useState<any>(null); const [message, setMessage, messageKind] = useFeedback(); const [busy, setBusy] = useState(false);
  const editForm = useFormErrors();
  const action = useActionGate();
  const [editBaseline,setEditBaseline]=useState("");
  const [configurationRevision, setConfigurationRevision] = useState("");
  const [configurationPending, setConfigurationPending] = useState(false);
  const [configurationConflict, setConfigurationConflict] = useState(false);
  const configurationAttempt = useRef<ConfigurationAttempt | null>(null);
  const configurationSending = useRef(false);
  function setEditDraft(value: React.SetStateAction<any>) {
    if (!configurationAttempt.current && !configurationSending.current) rawSetEditDraft(value);
  }

  const work=useWork();
  useWorkGuard("product-edit", "el producto en edición", !!editDraft && JSON.stringify(editDraft)!==editBaseline, busy || configurationPending || action.busy);
  async function editProduct(product: {id: number}) {
    if (configurationAttempt.current || configurationSending.current) return;
    configurationSending.current = true; setBusy(true);
    try {
      const current = await api<{product: typeof editDraft; revision: string}>(`/products/${product.id}/configuration`, token, {cache: "reload"});
      const record = current.product;
      const draft = {...record, name: record.name ?? "", description: record.description ?? "", image_data_uri: record.image_data_uri ?? "",
        variants: record.variants.map((variant: any) => ({...variant, price: String(variant.price), max_flavors: String(variant.max_flavors ?? 1)})),
        flavors: record.flavors.map((flavor: any) => ({...flavor})), removedFlavorIds: [], removedVariantIds: []};
      setEditingProductId(record.id); rawSetEditDraft(draft); setEditBaseline(JSON.stringify(draft));
      setConfigurationRevision(current.revision); setConfigurationConflict(false); setMessage("");
    } catch { setMessage("No pudimos cargar la configuración del producto. Reintenta abrirlo.","error"); }
    finally { configurationSending.current = false; setBusy(false); }
  }

  function updateEditVariant(id:number, changes:any){setEditDraft((current:any)=>({...current,variants:current.variants.map((variant:any)=>{if(variant.id!==id)return variant;const next={...variant,...changes};return allowsStuffedCrust(next.name)?next:{...next,allows_stuffed_crust:false};})}));}
  async function removeEditVariant(variant:any){if(!(await confirmAction(`${variant.name} se quitará cuando guardes los cambios del producto.`,{title:"Quitar tamaño",acceptLabel:"Quitar tamaño",cancelLabel:"Conservar tamaño"})))return;setEditDraft((current:any)=>({...current,variants:current.variants.filter((item:any)=>item.id!==variant.id),removedVariantIds:[...current.removedVariantIds,variant.id]}));}
  function updateEditFlavor(id:number|string, value:string){setEditDraft((current:any)=>({...current,flavors:current.flavors.map((flavor:any)=>flavor.id===id?{...flavor,name:value}:flavor)}));}
  function addEditFlavor(){setEditDraft((current:any)=>({...current,flavors:[...current.flavors,{id:`new-${Date.now()}-${current.flavors.length}`,name:""}]}));}
  function removeEditFlavor(flavor:any){setEditDraft((current:any)=>({...current,flavors:current.flavors.filter((item:any)=>item.id!==flavor.id),removedFlavorIds:typeof flavor.id==="number"?[...current.removedFlavorIds,flavor.id]:current.removedFlavorIds}));}
  async function reviewProductConfiguration() {
    if (!editingProductId || configurationAttempt.current || configurationSending.current || busy) return;
    configurationSending.current = true; setBusy(true);
    try {
      const current = await api<{product: typeof editDraft; revision: string}>(`/products/${editingProductId}/configuration`, token, {cache: "reload"});
      const product = current.product;
      const summary = `${product.name}\n${product.variants.map((v: {name: string; price: string; active: boolean}) => `${v.name}: $${v.price}${v.active ? "" : " (inactiva)"}`).join("\n")}\nSabores: ${product.flavors.map((f: {name: string}) => f.name).join(", ")}`;
      if (await confirmAction(`${summary}\n\nConservaremos tus campos. Al guardar aplicarás tus cambios sobre esta versión. Revisa nombres, precios y opciones antes de continuar.`, {title: "Configuración actual del producto", acceptLabel: "Revisar mis cambios", cancelLabel: "Seguir revisando"})) {
        setConfigurationRevision(current.revision); setConfigurationConflict(false);
        setMessage("Conservamos tus cambios. Revísalos y pulsa Guardar cambios cuando estén correctos.");
      }
    } catch { setMessage("No pudimos consultar la configuración actual. Conservamos tus cambios; reintenta la consulta."); }
    finally { configurationSending.current = false; setBusy(false); }
  }
  async function saveProductChanges() {
    if (!editingProductId || !editDraft || configurationSending.current || configurationConflict) return;
    if(!configurationAttempt.current && !editForm.validate({"product.name":required(editDraft.name,"el nombre"),...Object.assign({},...editDraft.variants.map((variant:{name:string;price:string;max_flavors:string;allows_half_and_half:boolean},index:number)=>variantErrors(variant,`variants.${index}.`))),...Object.fromEntries(editDraft.flavors.map((flavor:{name:string},index:number)=>[`flavors.${index}.name`,required(flavor.name,"el nombre del sabor")]))}))return;
    configurationSending.current = true; setBusy(true); setMessage("");
    const wasUncertain = !!configurationAttempt.current;
    try {
      if (!configurationAttempt.current) {
        const key = createOrderIdempotencyKey();
        configurationAttempt.current = {productId: editingProductId, key, body: JSON.stringify({
          expected_revision: configurationRevision, operation_key: key,
          product: {name: editDraft.name.trim(), description: editDraft.description.trim() || null, image_data_uri: editDraft.image_data_uri || null, type: editDraft.type},
          variants: editDraft.variants.map((variant: any) => ({id: variant.id, name: variant.name.trim(), price: moneyInput(variant.price), max_flavors: decimalInput(variant.max_flavors), allows_half_and_half: Boolean(variant.allows_half_and_half), allows_stuffed_crust: allowsStuffedCrust(variant.name) && Boolean(variant.allows_stuffed_crust)})),
          flavors: editDraft.flavors.map((flavor: any) => ({...(typeof flavor.id === "number" ? {id: flavor.id} : {}), name: flavor.name.trim()})),
          removed_variant_ids: editDraft.removedVariantIds, removed_flavor_ids: editDraft.removedFlavorIds,
        })};
      }
      setConfigurationPending(true);
      const attempt = configurationAttempt.current;
      const found = await resolveProductSave(attempt, token, wasUncertain);
      configurationAttempt.current = null; setConfigurationPending(false);
      setEditingProductId(null); rawSetEditDraft(null);
      setMessage(found ? "El producto ya se había guardado correctamente." : "Producto actualizado correctamente.");
      try { await onSaved(); } catch { setMessage("El producto se guardó. No pudimos actualizar la lista; vuelve a cargarla.","warning"); }
    } catch (error) {
      if (!wasUncertain && error instanceof ApiError && [400, 403, 404, 409, 422].includes(error.status)) {
        configurationAttempt.current = null; setConfigurationPending(false);
        setConfigurationConflict(error.code === "configuration_conflict");
        editForm.fromError(error,{"product.name":"el nombre","product.description":"la descripción","product.type":"el tipo de producto","product.image_data_uri":"la imagen",variants:"los tamaños y sus dependencias",...Object.fromEntries(editDraft.variants.flatMap((_variant:unknown,index:number)=>[[`variants.${index}.name`,"el tamaño"],[`variants.${index}.price`,"el precio"],[`variants.${index}.max_flavors`,"el número de sabores"]])),...Object.fromEntries(editDraft.flavors.map((_flavor:unknown,index:number)=>[`flavors.${index}.name`,"el sabor"]))});
        setMessage(error.code === "configuration_conflict" ? "Otro usuario cambió el producto. Conservamos tus campos. Revisa la configuración actual antes de continuar." : "No se guardaron los cambios. Revisa los campos y las opciones del producto.","error");
      } else {
        setMessage("No pudimos confirmar el guardado. Conservamos el intento. Pulsa Guardar cambios para comprobarlo y reintentar la misma operación.","warning");
      }
    } finally { configurationSending.current = false; setBusy(false); }
  }
  const deleteProduct = (product:{id:number;name:string}) => action.run(()=>deleteProductImpl(product));
  async function deleteProductImpl(product:{id:number;name:string}){if(configurationAttempt.current || configurationSending.current)return;if(!(await confirmAction(`${product.name} dejará de aparecer disponible para nuevas ventas.`,{title:"Desactivar producto",acceptLabel:"Desactivar producto",cancelLabel:"Conservar producto"})))return;setBusy(true);setMessage("");try{await api(`/products/${product.id}`,token,{method:"DELETE"});if(editingProductId===product.id){setEditingProductId(null);setEditDraft(null);}setMessage("Producto desactivado.");try{await onSaved();}catch{setMessage("El producto se desactivó. No pudimos actualizar la lista; vuelve a cargarla.","warning");}}catch(error){setMessage(operationError(error,"desactivar el producto",true),"error");}finally{setBusy(false);}}
  const reactivateProduct = (product:{id:number;name:string}) => action.run(async()=>{setBusy(true);setMessage("");try{await api(`/products/${product.id}`,token,{method:"PATCH",body:JSON.stringify({active:true})});setMessage(`${product.name} está disponible de nuevo en Caja.`);try{await onSaved();}catch{setMessage("El producto se reactivó. No pudimos actualizar la lista; vuelve a cargarla.","warning");}}catch(error){setMessage(operationError(error,"reactivar el producto",true),"error");}finally{setBusy(false);}});
  const term=search.trim().toLocaleLowerCase();
  const visible=editingProductId!==null?data.filter((item)=>item.id===editingProductId):data.filter((item)=>(status==="all"||(status==="active")===(item.active!==false))&&(!term||String(item.name).toLocaleLowerCase().includes(term)));
  return (
    <View style={s.productWorkspace}>
      <Notice kind={messageKind} message={message}/>
      {editingProductId===null?<View style={s.inlineFields}>
        <TextInput style={[s.input,s.flexField]} label="Buscar producto" value={search} onChangeText={setSearch}/>
        {canConfigure&&<View style={s.types}>{([["active","Activos"],["inactive","Desactivados"],["all","Todos"]] as const).map(([key,label])=><Pressable key={key} accessibilityRole="radio" aria-checked={status===key} onPress={()=>setStatus(key)} style={[s.type,status===key&&s.typeActive]}><ThemedText>{label}</ThemedText></Pressable>)}</View>}
      </View>:<Pressable accessibilityRole="button" disabled={busy} onPress={async()=>{if(await work.leave()){setEditingProductId(null);setEditDraft(null);}}} style={s.inlineTextAction}><ThemedText style={s.editLink}>← Volver al catálogo</ThemedText></Pressable>}
      <FlatList
      data={visible}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <View style={[s.row, compact && s.catalogRowCompact]}>
          {item.image_data_uri?<Image source={{uri:item.image_data_uri}} resizeMode="cover" style={s.catalogImage}/>:<View style={s.catalogImagePlaceholder}><ThemedText>🍕</ThemedText></View>}
          <View style={s.rowText}>
            <ThemedText style={s.productName}>{item.name}</ThemedText>
            <ThemedText style={s.muted}>{productTypeLabel(item.type)}{item.category?.name ? ` · ${item.category.name}` : ""}{item.active===false ? " · Desactivado" : ""}</ThemedText>
            <ThemedText style={s.muted}>{(item.variants ?? []).map((variant:any)=>`${variant.name} $${Number(variant.price).toFixed(2)}`).join(" · ") || "Sin tamaños"}{item.flavors?.length ? ` · ${item.flavors.length} sabor(es)` : ""}</ThemedText>
            <ThemedText numberOfLines={2} style={s.muted}>{item.description || "Sin descripción corta"}</ThemedText>
            {canConfigure&&editingProductId!==item.id&&<View style={s.reportActions}><ActionButton variant="secondary" label="Editar" accessibilityLabel={`Editar producto ${item.name}`} disabled={busy} onPress={async()=>{if(await work.leave())await editProduct(item);}}/>{item.active===false?<ActionButton variant="secondary" label="Reactivar" accessibilityLabel={`Reactivar producto ${item.name}`} disabled={busy || action.busy} onPress={()=>reactivateProduct(item)}/>:<ActionButton variant="destructive" label="Desactivar" accessibilityLabel={`Desactivar producto ${item.name}`} disabled={busy || action.busy} onPress={()=>deleteProduct(item)}/>}</View>}
            {editingProductId===item.id&&editDraft&&<View style={s.inlineEditor}>
              {configurationPending && <ThemedText style={s.notice}>Guardado pendiente de comprobar. Los campos están bloqueados hasta resolver el intento.</ThemedText>}
              {configurationConflict && <ActionButton label="Revisar configuración actual" variant="secondary" disabled={busy || configurationPending} onPress={reviewProductConfiguration} />}
              <TextInput editable={!busy && !configurationPending} style={s.input} placeholder="Nombre del producto" required {...editForm.field("product.name")} value={editDraft.name} onChangeText={(value)=>setEditDraft((current:any)=>({...current,name:value}))}/>
              <TextInput editable={!busy && !configurationPending} style={[s.input,s.multilineInput]} multiline maxLength={5000} placeholder="Descripción corta" {...editForm.field("product.description")} value={editDraft.description} onChangeText={(value)=>setEditDraft((current:any)=>({...current,description:value}))}/>
              <LogoPicker value={editDraft.image_data_uri} onChange={(value)=>setEditDraft((current:any)=>({...current,image_data_uri:value}))} onError={()=>setMessage("No pudimos cargar la imagen. Revisa el archivo e intenta nuevamente.","error")} emptyLabel="Seleccionar o arrastrar foto" changeLabel="Cambiar foto" />
              <Notice kind="error" message={editForm.errors["product.image_data_uri"]}/><Notice kind="error" message={editForm.errors["product.type"]}/><Notice kind="error" message={editForm.errors.variants}/><ThemedText style={s.label}>Tipo de producto</ThemedText>
              <View style={s.types}>{productTypes.map(([key,label])=><Pressable key={key} accessibilityRole="radio" aria-checked={editDraft.type===key} onPress={()=>setEditDraft((current:any)=>({...current,type:key,variants:key==="pizza"?current.variants:current.variants.map((variant:any)=>({...variant,allows_half_and_half:false,allows_stuffed_crust:false}))}))} style={[s.type,editDraft.type===key&&s.typeActive]}><ThemedText>{label}</ThemedText></Pressable>)}</View>
              {!!editDraft.variants.length&&<ThemedText style={s.label}>Variantes / tamaños</ThemedText>}
              {editDraft.variants.map((variant:any,index:number)=><View key={variant.id} style={s.formStep}><View style={s.stepHeading}><ThemedText style={s.label}>{variant.name||"Variante sin nombre"}</ThemedText><ActionButton label="Eliminar variante" variant="destructive" disabled={busy || configurationPending} onPress={()=>removeEditVariant(variant)} /></View><TextInput editable={!busy && !configurationPending} style={s.input} placeholder="Variante/tamaño" required {...editForm.field(`variants.${index}.name`)} value={variant.name} onChangeText={(value)=>updateEditVariant(variant.id,{name:value})}/><View style={s.inlineFields}><TextInput editable={!busy && !configurationPending} style={[s.input,s.flexField]} placeholder="Precio" required {...editForm.field(`variants.${index}.price`)} helperText="Sin separadores de miles; usa punto o coma decimal." value={variant.price} onChangeText={(value)=>updateEditVariant(variant.id,{price:value})} keyboardType="decimal-pad"/><TextInput editable={!busy && !configurationPending} style={[s.input,s.flexField]} placeholder="Máx. sabores" required {...editForm.field(`variants.${index}.max_flavors`)} value={variant.max_flavors} onChangeText={(value)=>updateEditVariant(variant.id,{max_flavors:value})} keyboardType="number-pad"/></View>{editDraft.type==="pizza"&&<View style={s.types}><Pressable accessibilityRole="button" aria-pressed={!!(variant.allows_half_and_half)} onPress={()=>updateEditVariant(variant.id,{allows_half_and_half:!variant.allows_half_and_half})} style={[s.type,variant.allows_half_and_half&&s.typeActive]}><ThemedText>{variant.allows_half_and_half?"Mitad y mitad habilitada":"Habilitar mitad y mitad"}</ThemedText></Pressable>{allowsStuffedCrust(variant.name)?<Pressable accessibilityRole="button" aria-pressed={!!(variant.allows_stuffed_crust)} onPress={()=>updateEditVariant(variant.id,{allows_stuffed_crust:!variant.allows_stuffed_crust})} style={[s.type,variant.allows_stuffed_crust&&s.typeActive]}><ThemedText>{variant.allows_stuffed_crust?"Orilla rellena habilitada (+$20)":"Habilitar orilla rellena (+$20)"}</ThemedText></Pressable>:<ThemedText style={s.muted}>Cuadrada y Napolitana usan únicamente orilla normal.</ThemedText>}</View>}</View>)}
              <View style={s.stepHeading}><ThemedText style={s.label}>Sabores</ThemedText><ActionButton label="+ Agregar sabor" variant="secondary" disabled={busy || configurationPending} onPress={addEditFlavor} /></View>
              {!editDraft.flavors.length&&<ThemedText style={s.muted}>Este producto todavía no tiene sabores.</ThemedText>}
              {editDraft.flavors.map((flavor:any,index:number)=><View key={flavor.id} style={s.flavorEditRow}><TextInput editable={!busy && !configurationPending} style={[s.input,s.flexField]} placeholder="Nombre del sabor" required {...editForm.field(`flavors.${index}.name`)} value={flavor.name} onChangeText={(value)=>updateEditFlavor(flavor.id,value)}/><ActionButton label="Quitar" variant="destructive" disabled={busy || configurationPending} onPress={()=>removeEditFlavor(flavor)} /></View>)}
              <View style={s.reportActions}><ActionButton label="Guardar cambios" loading={busy || action.busy} disabled={configurationConflict} disabledReason="Revisa la configuración actual antes de volver a guardar." onPress={saveProductChanges}/>{!!editDraft.image_data_uri&&<ActionButton label="Quitar imagen" variant="secondary" disabled={busy} onPress={()=>setEditDraft((current:any)=>({...current,image_data_uri:""}))} />}<ActionButton label="Cancelar" variant="secondary" disabled={busy} onPress={async()=>{if(await work.leave()){setEditingProductId(null);setEditDraft(null);}}} /></View>
            </View>}
          </View>
        </View>
      )}
      ListEmptyComponent={<Empty text={term ? `No encontramos productos con “${search.trim()}”.` : status==="inactive" ? "No hay productos desactivados." : "Todavía no hay productos. Créalos en “Nuevo producto”."} />}
      />
    </View>
  );
}
