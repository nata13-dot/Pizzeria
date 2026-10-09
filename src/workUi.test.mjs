import assert from 'node:assert/strict';
import test,{afterEach} from 'node:test';
import React,{useEffect,useState} from 'react';
import {JSDOM} from 'jsdom';
import {loadUi} from './testSupport/loadUi.mjs';
globalThis.__DEV__=false;
const dom=new JSDOM('<!doctype html><html><body></body></html>');globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'test',locks:{request:async(_key,_options,callback)=>callback({name:'lock'})}},configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const {WorkProvider,useWork,useWorkField,useWorkGuard}=await import(await loadUi('work/WorkProvider.tsx'));
const {PosScreen}=await import(await loadUi('features/pos/PosScreen.tsx'));
const {reconcileCart}=await import(await loadUi('work/reconcile.ts'));
afterEach(cleanup);
const product={id:1,name:'Pizza prueba',type:'pizza',flavors:[],variants:[{id:1,name:'Grande',price:100,max_flavors:1,modifier_rules:[]}]};
const settings={half_and_half_extra:10,additional_wing_flavor_extra:15,max_wing_flavors:3,delivery_zones:[],payment_methods:[{key:'cash',label:'Efectivo',active:true}]};
let store;
function Harness(){const work=useWork();store=work;const [screen,setScreen]=useState('pos');useEffect(()=>{void work.open({api:'test',user:1,branch:1});},[]);return React.createElement('div',null,React.createElement('button',{onClick:()=>setScreen(s=>s==='pos'?'inventory':'pos')},'Cambiar módulo'),work.ready?(screen==='pos'?React.createElement(PosScreen,{token:'t',isAdministrator:true,canOverrideStock:false}):React.createElement('div',null,'Inventario')):null);}
function setup(){globalThis.__workDisk=new Map();globalThis.__confirmWork=()=>false;globalThis.__p0Api=async path=>{if(path==='/pos/catalog')return [product];if(path==='/operational-settings')return settings;if(path.startsWith('/pos/customers/'))return {id:30,name:'Ana',phone:'123',active:true,addresses:[]};if(path.startsWith('/customers'))return {data:[{id:30,name:'Ana',phone:'123',addresses:[]}],current_page:1,last_page:1,total:1};return [];};}
test('POS survives actual unmount/remount with cart, customer and delivery; discard requires consent',async()=>{
 setup();const view=render(React.createElement(WorkProvider,null,React.createElement(Harness)));
 await waitFor(()=>assert.ok(view.getByText('Pedido actual')));
 await act(async()=>{store.set('pos','cart',[{key:'p',kind:'product',variantId:1,name:'Pizza prueba · Grande',unitPrice:100,quantity:2,flavorIds:[],flavorNames:[],modifierIds:[],modifierNames:[],notes:'Sin sal'}],[]);store.set('pos','customerId',30,null);store.set('pos','recipient','Ana','');store.set('pos','phone','123','');store.set('pos','address','Centro','');store.set('pos','notes','Tocar puerta','');});
 fireEvent.click(view.getByText('Cambiar módulo'));assert.ok(view.getByText('Inventario'));
 fireEvent.click(view.getByText('Cambiar módulo'));await waitFor(()=>assert.ok(view.getByText('2 × Pizza prueba · Grande')));
 assert.equal(store.get('pos','customerId',null),30);assert.equal(store.get('pos','address',''),'Centro');assert.equal(store.get('pos','notes',''),'Tocar puerta');
 fireEvent.click(view.getByText('Descartar venta'));await act(async()=>{});assert.equal(store.get('pos','cart',[]).length,1);
 globalThis.__confirmWork=()=>true;fireEvent.click(view.getByText('Descartar venta'));await waitFor(()=>assert.equal(store.get('pos','cart',[]).length,0));
});
test('reconciliation updates prices and preserves invalid rows instead of silently deleting them',()=>{
 const original={key:'p',kind:'product',variantId:1,name:'Pizza',unitPrice:90,quantity:1,flavorIds:[],flavorNames:[],modifierIds:[],modifierNames:[],notes:''};
 const next=reconcileCart([original],[product],[],settings);assert.equal(next.lines[0].unitPrice,100);assert.equal(next.changed,true);
 const unavailable=reconcileCart([original],[],[],settings);assert.equal(unavailable.lines.length,1);assert.equal(unavailable.invalid.length,1);
});
test('important local edits warn; memory drafts permit navigation and warn on logout',async()=>{
 setup();let dirty=true;function Form(){const work=useWork();store=work;useEffect(()=>{void work.open({api:'test',user:1,branch:1});},[]);useWorkGuard('form','el cliente',dirty);return null;}
 const view=render(React.createElement(WorkProvider,null,React.createElement(Form)));await waitFor(()=>assert.equal(store.ready,true));
 // scope hydration intentionally clears prior-owner guards; register after opening
 view.rerender(React.createElement(WorkProvider,null,React.createElement(Form,{key:'ready'})));await act(async()=>{});
 store.guards.set('form',{label:'el cliente',dirty:true,busy:false,memory:false});assert.equal(await store.leave(),false);
 globalThis.__confirmWork=()=>true;assert.equal(await store.leave(),true);
 store.guards.clear();store.memoryDirty.add('la receta');globalThis.__confirmWork=()=>false;assert.equal(await store.leave(),true);assert.equal(await store.leave(true),false);
});
async function fillSale(){await act(async()=>{store.set('pos','cart',[{key:'p',kind:'product',variantId:1,name:'Pizza prueba · Grande',unitPrice:100,quantity:1,flavorIds:[],flavorNames:[],modifierIds:[],modifierNames:[],notes:''}],[]);store.set('pos','pickup',true,false);store.set('pos','recipient','Ana','');store.set('pos','phone','123','');store.set('pos','payment','cash','');});}
test('confirmed sale clears durable cart and operation only after server confirms',async()=>{
 setup();globalThis.__confirmWork=()=>true;const catalog=globalThis.__p0Api;let posts=0;
 globalThis.__p0Api=async(path,token,options)=>{if(path==='/orders'){posts++;assert.ok([...globalThis.__workDisk.values()].some(raw=>JSON.parse(raw).operation?.key===options.headers['Idempotency-Key']));return {id:8,daily_number:8,status:'confirmed',total:100};}if(path.endsWith('/send-to-kitchen'))return {id:8,daily_number:8,status:'kitchen_pending',total:100};return catalog(path,token,options);};
 const view=render(React.createElement(WorkProvider,null,React.createElement(Harness)));await waitFor(()=>assert.ok(view.getByText('Pedido actual')));await fillSale();
 fireEvent.click(view.getByText('Confirmar y enviar a cocina'));await waitFor(()=>assert.equal(posts,1));await waitFor(()=>assert.equal(store.operation,null));assert.deepEqual(store.get('pos','cart',[]),[]);
 await act(async()=>{await store.flush();});assert.equal(globalThis.__workDisk.size,0);
});
test('lost response is recovered without another POST or payment, kitchen remains explicit',async()=>{
 setup();globalThis.__confirmWork=()=>true;const catalog=globalThis.__p0Api;let posts=0,kitchen=0,created=null;
 globalThis.__p0Api=async(path,token,options)=>{if(path==='/orders'){posts++;created={id:9,daily_number:9,status:'confirmed',total:100};throw new Error('connection lost');}if(path.startsWith('/orders/operation'))return {order:created};if(path.endsWith('/send-to-kitchen')){kitchen++;return {...created,status:'kitchen_pending'};}return catalog(path,token,options);};
 const view=render(React.createElement(WorkProvider,null,React.createElement(Harness)));await waitFor(()=>assert.ok(view.getByText('Pedido actual')));await fillSale();fireEvent.click(view.getByText('Confirmar y enviar a cocina'));
 await waitFor(()=>assert.ok(view.getByText(/No pudimos confirmar el resultado/)));assert.ok(store.operation.key);
 fireEvent.click(view.getByText('Cambiar módulo'));fireEvent.click(view.getByText('Cambiar módulo'));
 await waitFor(()=>assert.ok(view.getByText('La orden #9 ya fue registrada.')));assert.equal(posts,1);assert.equal(kitchen,0);assert.deepEqual(store.get('pos','cart',[]),[]);
 fireEvent.click(view.getByText('Reintentar envío a cocina'));await waitFor(()=>assert.equal(kitchen,1));await waitFor(()=>assert.equal(store.operation,null));assert.equal(posts,1);
});
test('confirmation has explicit actions, Escape cancels and focus returns to the opener',async()=>{
 const {ConfirmationDialogHost,confirmAction}=await import(await loadUi('components/ConfirmationDialog.tsx'));
 const opener=document.createElement('button');opener.textContent='Abrir';document.body.append(opener);opener.focus();
 const view=render(React.createElement(ConfirmationDialogHost));let answer;
 act(()=>{answer=confirmAction('Se eliminarán los datos.',{title:'Descartar venta',cancelLabel:'Seguir con la venta',acceptLabel:'Descartar venta'});});
 await waitFor(()=>assert.ok(document.activeElement===view.getByTestId('confirmation-cancel')));
 assert.ok(view.getByText('Seguir con la venta'));assert.ok(view.getAllByText('Descartar venta').length);
 fireEvent.keyDown(document,{key:'Escape'});assert.equal(await answer,false);await waitFor(()=>assert.ok(document.activeElement===opener));opener.remove();
});

test('price conflict retains the cart and requires explicit price and payment review',async()=>{
 setup();globalThis.__confirmWork=()=>true;const catalog=globalThis.__p0Api;let posts=0;
 const {testApiError}=await import(await loadUi('testSupport/apiErrorIdentity.ts'));
 globalThis.__p0Api=async(path,token,options)=>{
   if(path==='/orders'){posts++;const payload=JSON.parse(options.body);assert.equal(payload.pricing_expectation.total,100);throw new testApiError(409,{code:'price_changed'},'Changed');}
   return catalog(path,token,options);
 };
 const view=render(React.createElement(WorkProvider,null,React.createElement(Harness)));
 await waitFor(()=>assert.ok(view.getByText('Pedido actual')));await fillSale();
 fireEvent.click(view.getByText('Confirmar y enviar a cocina'));
 await waitFor(()=>assert.ok(view.getByText(/Los precios cambiaron/)));
 assert.equal(posts,1);assert.equal(store.operation,null);assert.equal(store.get('pos','cart',[]).length,1);assert.equal(store.get('pos','payment',''),'');
 await waitFor(()=>assert.equal(view.getByText('Confirmar y enviar a cocina').closest('button').disabled,true));
});

test('a price conflict after an uncertain response never releases its operation key',async()=>{
 setup();globalThis.__confirmWork=()=>true;const catalog=globalThis.__p0Api;let posts=0;
 const {testApiError}=await import(await loadUi('testSupport/apiErrorIdentity.ts'));
 globalThis.__p0Api=async(path,token,options)=>{
   if(path==='/orders'){posts++;if(posts===1)throw new Error('Lost response');throw new testApiError(409,{code:'price_changed'},'Changed');}
   if(path.startsWith('/orders/operation'))return {order:null};
   return catalog(path,token,options);
 };
 const view=render(React.createElement(WorkProvider,null,React.createElement(Harness)));
 await waitFor(()=>assert.ok(view.getByText('Pedido actual')));await fillSale();
 fireEvent.click(view.getByText('Confirmar y enviar a cocina'));
 await waitFor(()=>assert.ok(view.getByText(/No pudimos confirmar el resultado/)));
 const key=store.operation.key;
 fireEvent.click(view.getByText('Confirmar y enviar a cocina'));
 await waitFor(()=>assert.ok(view.getByText(/Los precios cambiaron/)));
 assert.equal(posts,2);assert.equal(store.operation.key,key);assert.equal(store.get('pos','cart',[]).length,1);
});
