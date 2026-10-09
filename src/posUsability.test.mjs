import assert from 'node:assert/strict';
import test, {afterEach} from 'node:test';
import React, {useEffect} from 'react';
import {JSDOM} from 'jsdom';
import {loadUi} from './testSupport/loadUi.mjs';
globalThis.__DEV__=false;
const dom=new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'test',locks:{request:async(_key,_options,callback)=>callback({name:'lock'})}},configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const {WorkProvider,useWork}=await import(await loadUi('work/WorkProvider.tsx'));
const {PosScreen}=await import(await loadUi('features/pos/PosScreen.tsx'));
afterEach(()=>{cleanup();globalThis.__testWidth=1200;});
const modifier={id:7,name:'Queso extra',type:'extra',price:37};
const product={id:1,name:'Alitas',type:'wings',flavors:[{id:1,name:'BBQ'},{id:2,name:'Búfalo'},{id:3,name:'Mango'}],variants:[{id:1,name:'Grande',price:100,max_flavors:2,modifier_rules:[{modifier_id:7,allowed:true,price_override:29,modifier}]}]};
const combo={id:2,name:'Paquete prueba',price:200,items:[{id:8,product_variant_id:1,quantity:2,flavor_selection_count:2,flavor_required:true,variant:{id:1,name:'Grande',product:{id:1,name:'Alitas'}},options:[{modifier}]}]};
const customer={id:30,name:'Ana',phone:'123',active:true,addresses:[{id:1,label:'Casa',address:'Calle 10',delivery_zone:'Centro',is_default:true},{id:2,label:'Trabajo',address:'Calle 20',delivery_zone:'Norte',is_default:false}]};
const settings={half_and_half_extra:10,additional_wing_flavor_extra:15,max_wing_flavors:2,delivery_zones:[{name:'Centro',fee:10,active:true},{name:'Norte',fee:20,active:true}],payment_methods:[{key:'cash',label:'Efectivo',active:true},{key:'transfer',label:'Transferencia',active:true}]};
let store,requests;
function Harness(){store=useWork();useEffect(()=>{void store.open({api:'test',user:1,branch:1});},[]);return store.ready?React.createElement(PosScreen,{token:'t',isAdministrator:true,canOverrideStock:false}):null;}
async function setup({mobile=false,packages=false}={}){
 globalThis.__testWidth=mobile?390:1200;globalThis.__workDisk=new Map();globalThis.__confirmWork=()=>true;requests=[];
 globalThis.__p0Api=async(path,_token,options)=>{requests.push({path,options});if(path==='/pos/catalog')return [product];if(path==='/operational-settings')return settings;if(path==='/combos')return packages?[combo]:[];if(path.startsWith('/pos/customers/'))return customer;if(path.startsWith('/customers'))return {data:[customer],current_page:1,last_page:1,total:1};if(path==='/orders')return {id:8,daily_number:8,status:'confirmed',total:125};if(path.endsWith('/send-to-kitchen'))return {id:8,daily_number:8,status:'kitchen_pending'};return [];};
 const view=render(React.createElement(WorkProvider,null,React.createElement(Harness)));await waitFor(()=>assert.ok(view.getByLabelText('Configurar Alitas')));return view;
}
async function fill(){await act(async()=>{store.set('pos','cart',[{key:'p',kind:'product',variantId:1,name:'Alitas · Grande',unitPrice:115,quantity:1,flavorIds:[1,2],flavorNames:['BBQ','Búfalo'],modifierIds:[],modifierNames:[],notes:''}],[]);store.set('pos','recipient','Luis','');store.set('pos','phone','555','');store.set('pos','address','Centro','');store.set('pos','zone','Centro','');});}

test('courtesy and collection on delivery are exclusive and submit no courtesy payment',async()=>{
 const view=await setup();await fill();fireEvent.click(view.getByText('Cortesía'));assert.equal(store.get('pos','payment',''),'courtesy');fireEvent.click(view.getByText('Cobrar al entregar'));assert.equal(store.get('pos','payment',''),'');assert.ok(view.getByText(/No se registra un pago ahora/));
 fireEvent.click(view.getByText('Confirmar y enviar a cocina'));await waitFor(()=>assert.ok(requests.some(r=>r.path==='/orders')));const body=JSON.parse(requests.find(r=>r.path==='/orders').options.body);assert.equal(body.courtesy,false);assert.equal(body.collect_on_delivery,true);assert.deepEqual(body.payments,[]);
});
test('changing a generated zone address updates it; uncertain operation freezes zone options',async()=>{
 const view=await setup();fireEvent.click(view.getByText('Selecciona una colonia o junta auxiliar'));fireEvent.click(view.getByText('Colonia: Centro'));assert.equal(store.get('pos','address',''),'Centro');
 fireEvent.click(view.getByText('Colonia: Centro'));fireEvent.click(view.getByText('Colonia: Norte'));assert.equal(store.get('pos','address',''),'Norte');assert.equal(store.get('pos','zone',''),'Norte');
 fireEvent.click(view.getByText('Colonia: Norte'));await act(async()=>{await store.mark({key:'uncertain'});});const option=view.getByText('Colonia: Centro').closest('button');assert.equal(option.disabled,true);fireEvent.click(option);assert.equal(store.get('pos','zone',''),'Norte');assert.equal(store.operation.key,'uncertain');
});
test('manual address is retained and must be reviewed after zone change',async()=>{
 const view=await setup();await fill();fireEvent.click(view.getByText('Colonia: Centro'));fireEvent.click(view.getByText('Colonia: Norte'));assert.equal(store.get('pos','address',''),'Centro');assert.ok(view.getByText('Dirección conservada: Centro'));assert.equal(view.getByText('Confirmar y enviar a cocina').closest('button').disabled,true);fireEvent.click(view.getByText('La dirección corresponde a esta zona'));assert.equal(view.getByText('Confirmar y enviar a cocina').closest('button').disabled,false);
});
test('customer and address replacements require confirmation; unlink keeps recipient',async()=>{
 const view=await setup();await fill();globalThis.__confirmWork=()=>false;fireEvent.click(view.getByText('Ana'));await act(async()=>{});assert.equal(store.get('pos','recipient',''),'Luis');assert.equal(store.get('pos','customerId',null),30);assert.equal(store.get('pos','addressId',null),null);
 globalThis.__confirmWork=()=>true;fireEvent.click(view.getByText('Ana'));await waitFor(()=>assert.equal(store.get('pos','address',''),'Calle 10'));assert.equal(store.get('pos','customerId',null),30);
 globalThis.__confirmWork=()=>false;fireEvent.click(view.getByText('Trabajo'));await act(async()=>{});assert.equal(store.get('pos','address',''),'Calle 10');fireEvent.click(view.getByText('Sin cliente'));assert.equal(store.get('pos','customerId',null),null);assert.equal(store.get('pos','recipient',''),'Ana');assert.equal(store.get('pos','address',''),'Calle 10');
});
test('mobile cart round trip preserves selections, extras and notes; flavor overflow never replaces earlier choices',async()=>{
 const view=await setup({mobile:true});fireEvent.click(view.getByLabelText('Configurar Alitas'));fireEvent.click(view.getByText('BBQ'));fireEvent.click(view.getByText('Búfalo'));fireEvent.click(view.getByText('Mango'));fireEvent.click(view.getByText('Queso extra +$29.00'));fireEvent.change(view.getByPlaceholderText('Notas del producto'),{target:{value:'Bien cocidas'}});
 fireEvent.click(view.getByText('Agregar Grande · $144.00'));assert.ok(view.getByText('1 producto(s)'));assert.ok(view.getByText('$144.00 ›'));const floating=view.getByText('Ver pedido y finalizar').closest('button');assert.equal(floating.style.position,'sticky');fireEvent.click(floating);fireEvent.click(view.getByText('‹ Seguir agregando productos'));const line=store.get('pos','cart',[])[0];assert.deepEqual(line.flavorIds,[1,2]);assert.deepEqual(line.modifierIds,[7]);assert.equal(line.notes,'Bien cocidas');assert.equal(line.unitPrice,144);
});
test('missing contact identifies the field, focus advances, and delivery mode keeps entered data',async()=>{
 const view=await setup();assert.ok(view.getByText('Falta el nombre de quien recibe.'));fireEvent.click(view.getByText('Completar datos de entrega'));assert.equal(document.activeElement,view.getByPlaceholderText('Nombre de quien recibe *'));
 await fill();fireEvent.click(view.getByText('Recoger en local'));assert.equal(store.get('pos','pickup',false),true);assert.equal(store.get('pos','address',''),'Centro');fireEvent.click(view.getByText('Entrega a domicilio'));assert.equal(store.get('pos','pickup',true),false);assert.equal(store.get('pos','recipient',''),'Luis');
});
test('mobile price failure can be refreshed from the cart without losing the sale',async()=>{
 const view=await setup({mobile:true});await fill();const normal=globalThis.__p0Api;globalThis.__p0Api=async(path,...args)=>{if(path==='/pos/catalog')throw Error('offline');return normal(path,...args);};fireEvent.click(view.getByText('Actualizar'));fireEvent.click(view.getByText('Ver pedido y finalizar'));await waitFor(()=>assert.ok(view.getByText(/No pudimos verificar los precios/)));globalThis.__p0Api=normal;fireEvent.click(view.getByText('Actualizar precios y disponibilidad'));await waitFor(()=>assert.ok(!view.queryByText('Actualizar precios y disponibilidad')));assert.equal(store.get('pos','cart',[]).length,1);
});
test('category failure keeps verified products available for sale',async()=>{
 const view=await setup();const normal=globalThis.__p0Api;globalThis.__p0Api=async(path,...args)=>{if(path==='/product-categories')throw Error('offline');return normal(path,...args);};fireEvent.click(view.getByText('Actualizar'));await waitFor(()=>assert.ok(view.getByText(/No se pudieron cargar las categorías/)));assert.ok(view.getByLabelText('Configurar Alitas'));assert.equal(view.queryByText(/No pudimos verificar los precios/),null);assert.equal(view.queryByText('Actualizar precios y disponibilidad'),null);
});
test('combo extras use override per unit and keep flavors and notes after mobile navigation',async()=>{
 const view=await setup({mobile:true,packages:true});fireEvent.click(view.getByLabelText('Configurar Paquete prueba'));
 for(const label of ['BBQ','Búfalo','Mango']){for(const option of view.getAllByText(label))fireEvent.click(option);}
 for(const option of view.getAllByText('Queso extra +$29.00'))fireEvent.click(option);
 fireEvent.change(view.getByPlaceholderText('Notas para la pieza #1'),{target:{value:'Separadas'}});fireEvent.click(view.getByText('Agregar paquete · $288.00'));fireEvent.click(view.getByText('Ver pedido y finalizar'));fireEvent.click(view.getByText('‹ Seguir agregando productos'));const line=store.get('pos','cart',[])[0];assert.equal(line.unitPrice,288);assert.deepEqual(line.components.map(c=>c.flavor_ids),[[1,2],[1,2]]);assert.equal(line.components[0].notes,'Separadas');
});
test('continue with another sale clears only tracking of the existing order, without another POST',async()=>{
 const view=await setup();await fill();const normal=globalThis.__p0Api;globalThis.__p0Api=async(path,...args)=>{if(path.endsWith('/send-to-kitchen'))throw Error('offline');return normal(path,...args);};fireEvent.click(view.getByText('Efectivo'));fireEvent.click(view.getByText('Confirmar y enviar a cocina'));await waitFor(()=>assert.ok(view.getByText('Continuar con otra venta')));fireEvent.click(view.getByText('Continuar con otra venta'));await waitFor(()=>assert.ok(view.getByText('Pedido actual')));assert.equal(requests.filter(r=>r.path==='/orders').length,1);assert.equal(store.operation,null);assert.equal(store.get('pos','cart',[]).length,0);
});

test('a size only offers flavors that have an active recipe',async()=>{
 product.variants[0].available_flavor_ids=[1];
 try {
  const view=await setup();fireEvent.click(view.getByLabelText('Configurar Alitas'));
  assert.ok(view.getByText('BBQ'));assert.equal(view.queryByText('Búfalo'),null);assert.equal(view.queryByText('Mango'),null);
 } finally { delete product.variants[0].available_flavor_ids; }
});

test('a deleted saved customer is unlinked once without blocking the sale',async()=>{
 const view=await setup();await act(async()=>{store.set('pos','customerId',2,null);store.set('pos','selectedCustomer',{...customer,id:2},null);store.set('pos','recipient','Ana','');store.set('pos','phone','123','');store.set('pos','address','Centro','');});
 const normal=globalThis.__p0Api;let customerRequests=0;globalThis.__p0Api=async(path,...args)=>{if(path==='/pos/customers/2'){customerRequests++;throw {status:404};}return normal(path,...args);};
 fireEvent.click(view.getByText('Actualizar'));await waitFor(()=>assert.ok(view.getByText(/cliente guardado ya no existe/i)));
 assert.equal(store.get('pos','customerId',99),null);assert.equal(store.get('pos','recipient',''),'Ana');assert.equal(customerRequests,1);
});
