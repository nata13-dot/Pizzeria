import {ThemedText} from "../../theme/ThemedText";
import { useEffect, useRef, useState } from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import { api, ApiError } from "../../api";
import { cachedApi } from "../../apiCache";
import { ActionButton } from "../../components/ActionButton";
import { confirmAction } from "../../components/ConfirmationDialog";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { Notice, useFeedback } from "../../components/Notice";
import { Pagination, RemoteListStatus } from "../../components/RemoteListStatus";
import { LogoPicker } from "../administration/LogoPicker";
import { SaleRecipes } from "../recipes/SaleRecipes";
import { variantErrors } from "../../forms/catalogValidation";
import { useActionGate } from "../../forms/useActionGate";
import { useFormErrors } from "../../forms/useFormErrors";
import { decimalInput, moneyInput, operationError, required } from "../../forms/validation";
import { usePaginatedResource } from "../../hooks/useRemoteResource";
import { useResponsiveLayout } from "../../layout/responsive";
import { resolveProductSave, type ConfigurationAttempt } from "../../productConfiguration";
import { allowsStuffedCrust } from "../../productRules";
import { useAppStyles } from "../../styles/appStyles";
import { useWork, useWorkField, useWorkGuard } from "../../work/WorkProvider";
import { Empty } from "../orders/shared";
function createOrderIdempotencyKey(): string {
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}
export function ComboManager({ data, token }: { data: any[]; token: string }) {
  const s=useAppStyles();
  const variants = data.flatMap((product:any)=>(product.variants??[]).map((variant:any)=>({...variant,product})));
  const [kind,setKind]=useState<"package"|"promotion">("package"); const [name,setName]=useState(""); const [price,setPrice]=useState(""); const [selectedVariantId,setSelectedVariantId]=useState<number|null>(null); const [quantity,setQuantity]=useState("1"); const [items,setItems]=useState<any[]>([]); const [combos,setCombos]=useState<any[]>([]); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const load=()=>api<any[]>("/combos",token).then(setCombos).catch((error)=>setMessage((error as Error).message));
  useEffect(()=>{load();},[token]);
  useEffect(()=>{if(!selectedVariantId&&variants[0])setSelectedVariantId(variants[0].id);},[data]);
  function addItem(){const variant=variants.find((entry:any)=>entry.id===selectedVariantId);const parsed=Number(quantity);if(!variant||parsed<=0)return;const next={product_variant_id:variant.id,quantity:parsed,flavor_required:Boolean(variant.product.flavors?.length),options:[],label:`${variant.product.name} · ${variant.name}`};setItems((current)=>kind==="promotion"?[next]:[...current,next]);setQuantity(kind==="promotion"?"2":"1");}
  async function save(){if(!name.trim()||Number(price)<0||!items.length)return;setBusy(true);setMessage("");try{const payloadItems=items.flatMap(({label:_label,...item})=>kind==="package"&&Number.isInteger(Number(item.quantity))&&Number(item.quantity)>1?Array.from({length:Number(item.quantity)},()=>({...item,quantity:1})):item);await api("/combos",token,{method:"POST",body:JSON.stringify({name:name.trim(),price:Number(price),items:payloadItems})});setName("");setPrice("");setItems([]);setMessage(kind==="promotion"?"Promoción creada.":"Paquete creado.");await load();}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  async function remove(combo:any){if(!(await confirmAction(`¿Eliminar ${combo.name}?`)))return;setBusy(true);setMessage("");try{await api(`/combos/${combo.id}`,token,{method:"DELETE"});setMessage("Paquete o promoción eliminado.");await load();}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  return <View style={s.formCard}><ThemedText style={s.sectionTitle}>Paquetes y promociones</ThemedText><ThemedText style={s.formIntro}>Combina pizza, conos, alitas u otros productos. En Caja se podrá elegir el sabor de cada componente que tenga sabores.</ThemedText><View style={s.types}><Pressable onPress={()=>{setKind("package");setItems([]);setQuantity("1");}} style={[s.type,kind==="package"&&s.typeActive]}><ThemedText>Paquete de productos</ThemedText></Pressable><Pressable onPress={()=>{setKind("promotion");setItems([]);setQuantity("2");}} style={[s.type,kind==="promotion"&&s.typeActive]}><ThemedText>Promoción por piezas</ThemedText></Pressable></View><View style={s.inlineFields}><TextInput style={[s.input,s.flexField]} placeholder={kind==="promotion"?"Ej. 2 pizzas medianas":"Nombre del paquete"} value={name} onChangeText={setName}/><TextInput style={[s.input,s.flexField]} placeholder="Precio total" value={price} onChangeText={setPrice} keyboardType="decimal-pad"/></View><ThemedText style={s.label}>{kind==="promotion"?"Producto de la promoción":"Agregar producto al paquete"}</ThemedText><View style={s.types}>{variants.map((variant:any)=><Pressable key={variant.id} onPress={()=>setSelectedVariantId(variant.id)} style={[s.type,selectedVariantId===variant.id&&s.typeActive]}><ThemedText>{variant.product.name} · {variant.name}</ThemedText></Pressable>)}</View><View style={s.inlineFields}><TextInput style={[s.input,s.flexField]} placeholder="Cantidad" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad"/><Pressable disabled={!selectedVariantId||Number(quantity)<=0} onPress={addItem} style={[s.secondaryButton,(!selectedVariantId||Number(quantity)<=0)&&s.disabled]}><ThemedText style={s.secondaryText}>{kind==="promotion"?"Asignar promoción":"Agregar al paquete"}</ThemedText></Pressable></View>{items.map((item,index)=><View key={`${item.product_variant_id}-${index}`} style={s.recipeRow}><View style={s.rowText}><ThemedText style={s.label}>{item.quantity} × {item.label}</ThemedText><ThemedText style={s.muted}>{item.flavor_required?"El cliente elegirá el sabor en Caja":"Sin selección de sabor"}</ThemedText></View><Pressable style={s.inlineTextAction} onPress={()=>setItems((current)=>current.filter((_row,rowIndex)=>rowIndex!==index))}><ThemedText style={s.remove}>Quitar</ThemedText></Pressable></View>)}<Pressable disabled={busy||!name.trim()||!price||!items.length} onPress={save} style={[s.primary,(busy||!name.trim()||!price||!items.length)&&s.disabled]}><ThemedText style={s.primaryText}>{busy?"Guardando...":kind==="promotion"?"Crear promoción":"Crear paquete"}</ThemedText></Pressable>{!!message&&<ThemedText style={s.notice}>{message}</ThemedText>}{!!combos.length&&<View style={s.formStep}><ThemedText style={s.label}>Paquetes y promociones activos</ThemedText>{combos.map((combo:any)=><View key={combo.id} style={s.recipeRow}><View style={s.rowText}><ThemedText style={s.productName}>{combo.name}</ThemedText><ThemedText style={s.muted}>${Number(combo.price).toFixed(2)} · {combo.items.length===1&&Number(combo.items[0].quantity)>1?"Promoción":"Paquete"}</ThemedText></View><Pressable style={s.inlineTextAction} disabled={busy} onPress={()=>remove(combo)}><ThemedText style={s.remove}>Eliminar</ThemedText></Pressable></View>)}</View>}</View>;
}
export function ProductsView({ data, token, onSaved, canConfigure }: { data: any[]; token: string; onSaved: () => void; canConfigure: boolean }) {
  const s=useAppStyles();
  const { mobile, compact } = useResponsiveLayout();
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [productImage, setProductImage] = useState(""); const [type, setType] = useState("pizza"); const [variantName, setVariantName] = useState(""); const [price, setPrice] = useState(""); const [maxFlavors, setMaxFlavors] = useState("1"); const [half, setHalf] = useState(false); const [flavorNames, setFlavorNames] = useState("");
  const variants = data.flatMap((product) => (product.variants ?? []).map((variant: any) => ({ ...variant, product })));
  const [editingProductId, setEditingProductId] = useState<number | null>(null); const [editDraft, rawSetEditDraft] = useState<any>(null); const [message, setMessage, messageKind] = useFeedback(); const [busy, setBusy] = useState(false);
  const productForm = useFormErrors();
  const editForm = useFormErrors();
  const action = useActionGate();
  useWorkGuard("product-new", "el producto nuevo", !!(name.trim()||description.trim()||productImage||variantName.trim()||price||flavorNames.trim()), busy || action.busy);
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
  const saveProduct = () => action.run(saveProductImpl);
  async function saveProductImpl() {
    if(!productForm.validate({name:required(name,"el nombre del producto"),...variantErrors({name:variantName,price,max_flavors:maxFlavors,allows_half_and_half:half},"variants.0.")}))return; if(configurationAttempt.current || configurationSending.current)return; setBusy(true); setMessage(""); try { await api("/products", token, { method:"POST", body:JSON.stringify({ name:name.trim(), description:description.trim() || null, image_data_uri:productImage || null, type, variants:[{name:variantName.trim(),price:moneyInput(price),max_flavors:decimalInput(maxFlavors),allows_half_and_half:half}], flavors:flavorNames.split(",").map((flavor)=>flavor.trim()).filter(Boolean).map((flavor)=>({name:flavor})) }) }); setName("");setDescription("");setProductImage("");setVariantName("");setPrice("");setFlavorNames("");setMessage("Producto y variante registrados.");try{await onSaved();}catch{setMessage("El producto se guardó. No pudimos actualizar la lista; vuelve a cargarla.","warning");} } catch(error){productForm.fromError(error,{name:"el nombre",description:"la descripción",type:"el tipo de producto",flavors:"los sabores",image_data_uri:"la imagen","variants.0.name":"el tamaño","variants.0.price":"el precio","variants.0.max_flavors":"el número de sabores"});setMessage(operationError(error,"registrar el producto",true),"error");}finally{setBusy(false);} }
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
  return (
    <View style={s.productWorkspace}>
      {canConfigure && <View style={[s.formCard, mobile && s.formCardMobile]}>
        <ThemedText style={s.sectionTitle}>Crear producto y variante</ThemedText>
        <ThemedText style={s.formIntro}>Completa la información que verá Caja y configura la primera presentación del producto.</ThemedText>
        <View style={s.formStep}>
          <View style={s.stepHeading}><ThemedText style={s.stepNumber}>1</ThemedText><ThemedText style={s.productName}>Información del producto</ThemedText></View>
          <TextInput editable={!busy && !action.busy} style={s.input} placeholder="Nombre del producto" required {...productForm.field("name")} value={name} onChangeText={setName}/>
          <TextInput editable={!busy && !action.busy} style={[s.input,s.multilineInput]} multiline maxLength={500} placeholder="Descripción corta para mostrar en Caja" {...productForm.field("description")} value={description} onChangeText={setDescription}/>
          <Notice kind="error" message={productForm.errors.type}/>
          <View style={s.types}>{[["pizza","Pizza"],["wings","Alitas"],["fries","Papas"],["nuggets","Nuggets"],["cone","Cono"],["beverage","Bebida"],["extra","Extra"],["other","Otro"]].map(([key,label])=><Pressable accessibilityRole="radio" accessibilityState={{checked:type===key}} key={key} onPress={()=>setType(key)} style={[s.type,type===key&&s.typeActive]}><ThemedText>{label}</ThemedText></Pressable>)}</View>
        </View>
        <View style={s.formStep}>
          <View style={s.stepHeading}><ThemedText style={s.stepNumber}>2</ThemedText><ThemedText style={s.productName}>Imagen del producto</ThemedText></View>
          <LogoPicker value={productImage} onChange={setProductImage} onError={()=>setMessage("No pudimos cargar la imagen. Revisa el archivo e intenta nuevamente.","error")} emptyLabel="Seleccionar o arrastrar foto del producto" changeLabel="Cambiar foto del producto" />
          <Notice kind="error" message={productForm.errors.image_data_uri}/>
          {!!productImage&&<Pressable onPress={()=>setProductImage("")} style={s.secondaryButton}><ThemedText style={s.secondaryText}>Quitar imagen</ThemedText></Pressable>}
        </View>
        <View style={s.formStep}>
          <View style={s.stepHeading}><ThemedText style={s.stepNumber}>3</ThemedText><ThemedText style={s.productName}>Variante inicial</ThemedText></View>
          <View style={s.inlineFields}><TextInput editable={!busy && !action.busy} style={[s.input,s.flexField]} placeholder="Variante/tamaño" required {...productForm.field("variants.0.name")} value={variantName} onChangeText={setVariantName}/><TextInput editable={!busy && !action.busy} style={[s.input,s.flexField]} placeholder="Precio" required {...productForm.field("variants.0.price")} helperText="Sin separadores de miles; usa punto o coma decimal." value={price} onChangeText={setPrice} keyboardType="decimal-pad"/><TextInput editable={!busy && !action.busy} style={[s.input,s.flexField]} placeholder="Máx. sabores" required {...productForm.field("variants.0.max_flavors")} value={maxFlavors} onChangeText={setMaxFlavors} keyboardType="number-pad"/></View>
          <TextInput editable={!busy && !action.busy} style={s.input} placeholder="Sabores separados por coma" {...productForm.field("flavors")} value={flavorNames} onChangeText={setFlavorNames}/>
          {type==="pizza"&&<Pressable accessibilityRole="checkbox" accessibilityState={{checked:half}} onPress={()=>setHalf((value)=>{const next=!value;if(next&&Number(maxFlavors)<2)setMaxFlavors("2");return next;})} style={[s.type,half&&s.typeActive]}><ThemedText>{half?"Mitad y mitad habilitada":"Habilitar mitad y mitad"}</ThemedText></Pressable>}
        </View>
        <View style={s.productPreview}>
          <View style={s.stepHeading}><ThemedText style={s.previewIcon}>◉</ThemedText><ThemedText style={s.productName}>Vista previa</ThemedText></View>
          {productImage?<Image source={{uri:productImage}} resizeMode="cover" style={s.productPreviewImage}/>:<View style={s.productPreviewPlaceholder}><ThemedText style={s.previewIcon}>🍕</ThemedText></View>}
          <View style={s.rowText}><ThemedText style={s.productName}>{name.trim()||"Nombre del producto"}</ThemedText><ThemedText style={s.muted}>{description.trim()||"La descripción aparecerá aquí."}</ThemedText><ThemedText style={s.stock}>{variantName.trim()||"Presentación"} · {price.trim()?`$${price}`:"Precio pendiente"}</ThemedText></View>
        </View>
        <ActionButton label="Guardar producto" loading={busy || action.busy} onPress={saveProduct}/>
      </View>}
      {canConfigure&&<ComboManager data={data} token={token}/>}
      {canConfigure&&<SaleRecipes token={token}/>}
      <Notice kind={messageKind} message={message}/>
      <FlatList
      data={data}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <View style={[s.row, compact && s.catalogRowCompact]}>
          {item.image_data_uri?<Image source={{uri:item.image_data_uri}} resizeMode="cover" style={s.catalogImage}/>:<View style={s.catalogImagePlaceholder}><ThemedText>🍕</ThemedText></View>}
          <View style={s.rowText}>
            <ThemedText style={s.productName}>{item.name}</ThemedText>
            <ThemedText style={s.muted}>{item.category?.name ?? "Sin categoría"} · {item.type}</ThemedText>
            <ThemedText numberOfLines={2} style={s.muted}>{item.description || "Sin descripción corta"}</ThemedText>
            {canConfigure&&<View style={s.reportActions}><Pressable style={s.inlineTextAction} disabled={busy} onPress={async()=>{if(await work.leave())editProduct(item);}}><ThemedText style={s.editLink}>Editar producto</ThemedText></Pressable><ActionButton variant="destructive" label="Desactivar producto" loading={busy || action.busy} loadingLabel="Procesando…" onPress={()=>deleteProduct(item)}/></View>}
            {editingProductId===item.id&&editDraft&&<View style={s.inlineEditor}>
              {configurationPending && <ThemedText style={s.notice}>Guardado pendiente de comprobar. Los campos están bloqueados hasta resolver el intento.</ThemedText>}
              {configurationConflict && <Pressable disabled={busy || configurationPending} onPress={reviewProductConfiguration} style={s.secondaryButton}><ThemedText style={s.secondaryText}>Revisar configuración actual</ThemedText></Pressable>}
              <TextInput editable={!busy && !configurationPending} style={s.input} placeholder="Nombre del producto" required {...editForm.field("product.name")} value={editDraft.name} onChangeText={(value)=>setEditDraft((current:any)=>({...current,name:value}))}/>
              <TextInput editable={!busy && !configurationPending} style={[s.input,s.multilineInput]} multiline maxLength={5000} placeholder="Descripción corta" {...editForm.field("product.description")} value={editDraft.description} onChangeText={(value)=>setEditDraft((current:any)=>({...current,description:value}))}/>
              <LogoPicker value={editDraft.image_data_uri} onChange={(value)=>setEditDraft((current:any)=>({...current,image_data_uri:value}))} onError={()=>setMessage("No pudimos cargar la imagen. Revisa el archivo e intenta nuevamente.","error")} emptyLabel="Seleccionar o arrastrar foto" changeLabel="Cambiar foto" />
              <Notice kind="error" message={editForm.errors["product.image_data_uri"]}/><Notice kind="error" message={editForm.errors["product.type"]}/><Notice kind="error" message={editForm.errors.variants}/><ThemedText style={s.label}>Tipo de producto</ThemedText>
              <View style={s.types}>{[["pizza","Pizza"],["wings","Alitas"],["fries","Papas"],["nuggets","Nuggets"],["cone","Cono"],["beverage","Bebida"],["extra","Extra"],["other","Otro"]].map(([key,label])=><Pressable key={key} onPress={()=>setEditDraft((current:any)=>({...current,type:key,variants:key==="pizza"?current.variants:current.variants.map((variant:any)=>({...variant,allows_half_and_half:false,allows_stuffed_crust:false}))}))} style={[s.type,editDraft.type===key&&s.typeActive]}><ThemedText>{label}</ThemedText></Pressable>)}</View>
              {!!editDraft.variants.length&&<ThemedText style={s.label}>Variantes / tamaños</ThemedText>}
              {editDraft.variants.map((variant:any,index:number)=><View key={variant.id} style={s.formStep}><View style={s.stepHeading}><ThemedText style={s.label}>{variant.name||"Variante sin nombre"}</ThemedText><Pressable disabled={busy || configurationPending} onPress={()=>removeEditVariant(variant)} style={s.dangerButton}><ThemedText style={s.dangerText}>Eliminar variante</ThemedText></Pressable></View><TextInput editable={!busy && !configurationPending} style={s.input} placeholder="Variante/tamaño" required {...editForm.field(`variants.${index}.name`)} value={variant.name} onChangeText={(value)=>updateEditVariant(variant.id,{name:value})}/><View style={s.inlineFields}><TextInput editable={!busy && !configurationPending} style={[s.input,s.flexField]} placeholder="Precio" required {...editForm.field(`variants.${index}.price`)} helperText="Sin separadores de miles; usa punto o coma decimal." value={variant.price} onChangeText={(value)=>updateEditVariant(variant.id,{price:value})} keyboardType="decimal-pad"/><TextInput editable={!busy && !configurationPending} style={[s.input,s.flexField]} placeholder="Máx. sabores" required {...editForm.field(`variants.${index}.max_flavors`)} value={variant.max_flavors} onChangeText={(value)=>updateEditVariant(variant.id,{max_flavors:value})} keyboardType="number-pad"/></View>{editDraft.type==="pizza"&&<View style={s.types}><Pressable onPress={()=>updateEditVariant(variant.id,{allows_half_and_half:!variant.allows_half_and_half})} style={[s.type,variant.allows_half_and_half&&s.typeActive]}><ThemedText>{variant.allows_half_and_half?"Mitad y mitad habilitada":"Habilitar mitad y mitad"}</ThemedText></Pressable>{allowsStuffedCrust(variant.name)?<Pressable onPress={()=>updateEditVariant(variant.id,{allows_stuffed_crust:!variant.allows_stuffed_crust})} style={[s.type,variant.allows_stuffed_crust&&s.typeActive]}><ThemedText>{variant.allows_stuffed_crust?"Orilla rellena habilitada (+$20)":"Habilitar orilla rellena (+$20)"}</ThemedText></Pressable>:<ThemedText style={s.muted}>Cuadrada y Napolitana usan únicamente orilla normal.</ThemedText>}</View>}</View>)}
              <View style={s.stepHeading}><ThemedText style={s.label}>Sabores</ThemedText><Pressable disabled={busy || configurationPending} onPress={addEditFlavor} style={s.secondaryButton}><ThemedText style={s.secondaryText}>+ Agregar sabor</ThemedText></Pressable></View>
              {!editDraft.flavors.length&&<ThemedText style={s.muted}>Este producto todavía no tiene sabores.</ThemedText>}
              {editDraft.flavors.map((flavor:any,index:number)=><View key={flavor.id} style={s.flavorEditRow}><TextInput editable={!busy && !configurationPending} style={[s.input,s.flexField]} placeholder="Nombre del sabor" required {...editForm.field(`flavors.${index}.name`)} value={flavor.name} onChangeText={(value)=>updateEditFlavor(flavor.id,value)}/><Pressable disabled={busy || configurationPending} onPress={()=>removeEditFlavor(flavor)} style={s.dangerButton}><ThemedText style={s.dangerText}>Quitar</ThemedText></Pressable></View>)}
              <View style={s.reportActions}><ActionButton label="Guardar cambios" loading={busy || action.busy} disabled={configurationConflict} disabledReason="Revisa la configuración actual antes de volver a guardar." onPress={saveProductChanges}/>{!!editDraft.image_data_uri&&<Pressable disabled={busy} onPress={()=>setEditDraft((current:any)=>({...current,image_data_uri:""}))} style={s.secondaryButton}><ThemedText style={s.secondaryText}>Quitar imagen</ThemedText></Pressable>}<Pressable disabled={busy} onPress={async()=>{if(await work.leave()){setEditingProductId(null);setEditDraft(null);}}} style={s.secondaryButton}><ThemedText style={s.secondaryText}>Cancelar</ThemedText></Pressable></View>
            </View>}
          </View>
          <ThemedText style={s.stock}>{item.variants?.length ?? 0}</ThemedText>
        </View>
      )}
      ListEmptyComponent={<Empty />}
      />
    </View>
  );
}
