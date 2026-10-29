import assert from 'node:assert/strict';
import test,{afterEach} from 'node:test';
import React,{useEffect,useState} from 'react';
import {JSDOM} from 'jsdom';
import {loadUi} from './testSupport/loadUi.mjs';
globalThis.__DEV__=false;globalThis.__realFields=true;
const dom=new JSDOM('<!doctype html><html><body></body></html>');globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'test',locks:{request:async(_key,_options,callback)=>callback({name:'lock'})}},configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,waitFor,cleanup,act,within}=await import('@testing-library/react');
const {ActionButton}=await import(await loadUi('components/ActionButton.tsx'));
const {Notice}=await import(await loadUi('components/Notice.tsx'));
const {FloatingTextInput:Field}=await import(await loadUi('components/FloatingTextInput.tsx'));
const {useFormErrors}=await import(await loadUi('forms/useFormErrors.ts'));
const {decimalInput,moneyInput,validDate,validLocalDateTime,validationFields,operationError}=await import(await loadUi('forms/validation.ts'));
const {RemoteListStatus}=await import(await loadUi('components/RemoteListStatus.tsx'));
const {WorkProvider,useWork}=await import(await loadUi('work/WorkProvider.tsx'));
const {CustomersScreen}=await import(await loadUi('features/administration/CustomersScreen.tsx'));
const {PurchasesScreen}=await import(await loadUi('features/operations/PurchasesScreen.tsx'));
afterEach(()=>{cleanup();globalThis.__testWidth=1200;});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const flush=()=>act(async()=>{});
let store;
function Harness({Screen=CustomersScreen}){store=useWork();useEffect(()=>{void store.open({api:'test',user:1,branch:1});},[]);return store.ready?React.createElement(Screen,{token:'t',isAdministrator:false}):null;}
function setupCustomers(handler){globalThis.__workDisk=new Map();globalThis.__confirmWork=()=>false;globalThis.__p0Api=async(path,_token,options)=>{if(options?.method)return handler(path,options);return {data:[],current_page:1,last_page:1,total:0};};}
async function showCustomers(handler){setupCustomers(handler);const view=render(React.createElement(WorkProvider,null,React.createElement(Harness)));await waitFor(()=>assert.ok(view.getByRole('button',{name:'Registrar cliente'})));return view;}
test('action loading locks repeated presses synchronously; disabled never executes',async()=>{
 const pending=deferred();let calls=0;const view=render(React.createElement(ActionButton,{label:'Guardar cliente',onPress:()=>{calls++;return pending.promise;}}));const button=view.getByRole('button');act(()=>{fireEvent.click(button);fireEvent.click(button);fireEvent.click(button);});assert.equal(calls,1);assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-busy'),'true');assert.ok(view.getByText('Guardando…'));
 await act(async()=>pending.resolve());view.rerender(React.createElement(ActionButton,{label:'Guardar cliente',disabled:true,onPress:()=>{calls++;}}));fireEvent.click(view.getByRole('button'));assert.equal(calls,1);
});
test('field label remains, error is associated, required is explicit, first invalid field receives focus',async()=>{
 function Form(){const form=useFormErrors();const [name,setName]=useState('');return React.createElement('div',null,React.createElement(Field,{label:'Nombre',required:true,value:name,onChangeText:setName,style:{flexBasis:220,flexGrow:1,minHeight:50},...form.field('name')}),React.createElement(Field,{label:'Teléfono',...form.field('phone')}),React.createElement(ActionButton,{label:'Guardar',onPress:()=>{form.validate({name:'Ingresa el nombre.',phone:'Ingresa un teléfono.'});}}));}
 const view=render(React.createElement(Form));fireEvent.click(view.getByRole('button'));await flush();const input=view.getByLabelText('Nombre (obligatorio)');assert.equal(document.activeElement,input);assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(input.getAttribute('aria-required'),'true');const error=document.getElementById(input.getAttribute('aria-describedby'));assert.match(error.textContent,/Ingresa el nombre/);fireEvent.change(input,{target:{value:'Ana'}});assert.ok(view.getByText('Nombre (obligatorio)'));
 assert.equal(input.style.flexBasis,'');assert.equal(input.parentElement.style.flexBasis,'220px');
});
test('feedback types differ in text and announcement semantics',()=>{
 const view=render(React.createElement('div',null,React.createElement(Notice,{kind:'success',message:'Cliente guardado.'}),React.createElement(Notice,{kind:'error',message:'No pudimos guardar el cliente.'}),React.createElement(Notice,{kind:'warning',message:'Revisa el precio.'}),React.createElement(Notice,{kind:'info',message:'Datos disponibles.'})));
 assert.match(view.getByRole('alert').textContent,/No pudimos guardar/);assert.equal(view.getByText('Cliente guardado.').parentElement.getAttribute('aria-live'),'polite');assert.ok(view.getByText('! Revisa antes de continuar'));assert.ok(view.getByText('ⓘ Información'));
});
test('list empty, search empty, loading and retry remain different; retry calls only its section',async()=>{
 let retries=0,other=0;const props={loading:false,error:'',count:0,emptyText:'No hay clientes registrados.',onRetry:()=>{retries++;}};
 const screen=(changes={})=>React.createElement('div',null,React.createElement('div',{'data-testid':'customers-status'},React.createElement(RemoteListStatus,{...props,...changes})),React.createElement(RemoteListStatus,{...props,error:'No pudimos cargar inventario.',onRetry:()=>{other++;}}));
 const view=render(screen());const status=within(view.getByTestId('customers-status'));assert.ok(status.getByText(props.emptyText));view.rerender(screen({search:'Ana'}));assert.ok(status.getByText('No encontramos resultados para “Ana”.'));view.rerender(screen({error:'No pudimos cargar los clientes.'}));fireEvent.click(status.getByRole('button',{name:'Reintentar'}));await flush();assert.equal(retries,1);assert.equal(other,0);view.rerender(screen({loading:true}));assert.ok(status.getByText('Cargando información...'));assert.equal(status.queryByRole('button'),null);
});

test('decimal input is strict and money keeps existing decimal rounding and range',()=>{
 for(const value of ['1,25','1.25',' 1,25 '])assert.equal(decimalInput(value),1.25);
 for(const value of ['', ' ', '12abc','1.234,56','1,234.56','1e3','0x10','Infinity'])assert.ok(Number.isNaN(decimalInput(value)),value);
 assert.equal(decimalInput('-0,25'),-.25);assert.equal(moneyInput('0,005'),.01);assert.ok(Number.isNaN(moneyInput('-0.001')));assert.ok(Number.isNaN(moneyInput('10000000000')));assert.ok(Number.isNaN(moneyInput('')));
 assert.equal(validLocalDateTime('2028-02-29T23:59'),true);assert.equal(validLocalDateTime('2028-02-29T24:00'),false);
 assert.equal(validDate('2028-02-29'),true);for(const value of ['2026-02-29','2026-02-31','28/09/2026','2026-13-01'])assert.equal(validDate(value),false);
});
test('technical backend errors are never copied; known fields get safe messages',()=>{
 const error={status:422,errors:{email:['SQLSTATE: exception /api/customers password=secret']},message:'SQLSTATE stack trace'};
 assert.deepEqual(Object.keys(validationFields(error,{email:'el correo'})),['email']);assert.doesNotMatch(JSON.stringify(validationFields(error,{email:'el correo'})),/SQLSTATE|secret|stack/);assert.doesNotMatch(operationError(error,'guardar el cliente'),/SQLSTATE|exception|api\//);assert.match(operationError({status:500},'guardar el cliente',true),/confirmar el resultado/);
});
test('customer validation focuses known errors, preserves dirty state, saves once and reports success',async()=>{
 let writes=0;const pending=deferred();const view=await showCustomers(()=>{writes++;return pending.promise;});fireEvent.click(view.getByRole('button',{name:'Registrar cliente'}));await flush();assert.equal(writes,0);const name=view.getByLabelText('Nombre completo (obligatorio)');assert.equal(document.activeElement,name);fireEvent.change(name,{target:{value:'Ana'}});fireEvent.change(view.getByLabelText('Teléfono (obligatorio)'),{target:{value:'123'}});await flush();assert.equal(await store.leave(),false);
 const button=view.getByRole('button',{name:'Registrar cliente'});act(()=>{fireEvent.click(button);fireEvent.click(button);});assert.equal(writes,1);assert.ok(view.getByText('Guardando…'));assert.equal(name.readOnly,true);await act(async()=>pending.resolve({id:1}));await waitFor(()=>assert.ok(view.getByText('Cliente registrado.')));assert.equal(await store.leave(),true);
});
test('backend field errors stay near customer field and technical details do not appear',async()=>{
 const view=await showCustomers(()=>{throw {status:422,errors:{phone:['SQLSTATE private']},message:'secret exception'};});fireEvent.change(view.getByLabelText('Nombre completo (obligatorio)'),{target:{value:'Ana'}});fireEvent.change(view.getByLabelText('Teléfono (obligatorio)'),{target:{value:'123'}});fireEvent.click(view.getByRole('button',{name:'Registrar cliente'}));await waitFor(()=>assert.ok(view.getByText(/Revisa el teléfono;/)));const input=view.getByLabelText('Teléfono (obligatorio)');assert.equal(document.activeElement,input);assert.equal(input.value,'123');assert.doesNotMatch(view.container.textContent,/SQLSTATE|secret exception/);
});
test('destructive confirmation cancel sends no mutation and preserves customer edits',async()=>{
 let writes=0;const customer={id:1,name:'Ana',phone:'123',active:true,addresses:[],points_balance:0};setupCustomers(()=>{writes++;});let prompt;globalThis.__confirmWork=(message,options)=>{prompt={message,options};return false;};globalThis.__p0Api=async(path,_token,options)=>{if(options?.method){writes++;return customer;}if(path==='/customers/1')return customer;return {data:[customer],current_page:1,last_page:1,total:1};};
 const view=render(React.createElement(WorkProvider,null,React.createElement(Harness)));await waitFor(()=>assert.ok(view.getByText('Ana')));fireEvent.click(view.getByText('Ana'));await waitFor(()=>assert.ok(view.getByRole('button',{name:'Desactivar cliente'})));fireEvent.click(view.getByRole('button',{name:'Desactivar cliente'}));await flush();assert.equal(writes,0);assert.equal(prompt.options.title,'Desactivar cliente');assert.equal(prompt.options.cancelLabel,'Conservar estado');assert.match(prompt.message,/nuevas ventas/);
});
test('purchase fields accept comma decimals, reject invalid dates, preserve memory draft and guard confirmation',async()=>{
 globalThis.__workDisk=new Map();const writes=[];let confirmation=deferred();globalThis.__confirmWork=()=>confirmation.promise;let fail=true;
 const ingredient={id:1,name:'Harina',active:true,base_unit:{symbol:'kg'},presentations:[{id:2,ingredient_id:1,name:'Bolsa',active:true,quantity:1,base_quantity:1,purchase_revision:'a'.repeat(64),equivalent_unit:{symbol:'kg'}}]};
 globalThis.__p0Api=async(path,_token,options)=>{if(options?.method){writes.push(options);if(fail){fail=false;throw new Error('network lost');}return {id:3,total:.01,items:[]};}if(path==='/ingredients/1')return ingredient;if(path.startsWith('/ingredients'))return {data:[ingredient],current_page:1,last_page:1,total:1,from:1,to:1};if(path==='/catalogs/suppliers')return [];return {data:[],current_page:1,last_page:1,total:0,from:null,to:null};};
 const view=render(React.createElement(WorkProvider,null,React.createElement(Harness,{Screen:PurchasesScreen})));fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Agregar Harina'})));
 const quantity=await waitFor(()=>view.getByLabelText('¿Cuántas Bolsa? (obligatorio)'));fireEvent.click(view.getByRole('radio',{name:'Escribo el total del renglón'}));fireEvent.change(view.getByLabelText('Total pagado (obligatorio)'),{target:{value:'0,005'}});fireEvent.change(quantity,{target:{value:'1,5'}});
 fireEvent.click(view.getByRole('button',{name:'Agregar a la compra'}));await flush();const line=store.get('purchase','lines',[])[0];assert.equal(line.total_cost,.01);assert.equal(line.presentations_quantity,1.5);
 fireEvent.click(view.getByRole('button',{name:'Cambiar proveedor, fecha o forma de pago'}));const date=view.getByLabelText('Fecha (AAAA-MM-DD) (obligatorio)');fireEvent.change(date,{target:{value:'2026-02-31'}});fireEvent.click(view.getByRole('button',{name:'Revisar compra'}));await flush();
 assert.equal(date.getAttribute('aria-invalid'),'true');assert.equal(view.queryByRole('button',{name:'Registrar compra y aumentar inventario'}),null);fireEvent.change(date,{target:{value:'2026-02-28'}});fireEvent.click(view.getByRole('radio',{name:'Dueño'}));assert.equal(await store.leave(),true);
 fireEvent.click(view.getByRole('button',{name:'Revisar compra'}));const button=await waitFor(()=>view.getByRole('button',{name:'Registrar compra y aumentar inventario'}));act(()=>{fireEvent.click(button);fireEvent.click(button);});assert.equal(writes.length,0);
 await act(async()=>confirmation.resolve(false));assert.equal(writes.length,0);assert.equal(store.get('purchase','lines',[]).length,1);globalThis.__confirmWork=()=>true;
 fireEvent.click(view.getByRole('button',{name:'Registrar compra y aumentar inventario'}));await waitFor(()=>assert.match(view.container.textContent,/no se duplicará/));assert.equal(store.get('purchase','lines',[]).length,1);
 fireEvent.click(view.getByRole('button',{name:'Registrar compra y aumentar inventario'}));await waitFor(()=>assert.ok(view.getByText(/Compra #3 registrada/)));assert.equal(writes.length,2);
 const key=writes[0].headers['Idempotency-Key'];assert.match(key,/^purchase-/);assert.equal(writes[1].headers['Idempotency-Key'],key);const body=JSON.parse(writes[1].body);assert.equal(body.purchased_at,'2026-02-28');assert.equal(body.payment_source,'owner');assert.equal(body.items[0].total_cost,.01);assert.equal(store.get('purchase','operationKey','x'),'');
});
const {ProductsView}=await import(await loadUi('features/products/ProductsView.tsx'));
const productRecord={id:1,name:'Pizza',type:'pizza',description:'',flavors:[],variants:[{id:1,name:'Grande',price:'100.00',max_flavors:1,allows_half_and_half:false,allows_stuffed_crust:false,modifier_rules:[]}]};
const {ProductWizard}=await import(await loadUi('features/products/ProductWizard.tsx'));
const {SaleRecipes}=await import(await loadUi('features/recipes/SaleRecipes.tsx'));
function ProductsHarness({Component=ProductsView}){store=useWork();useEffect(()=>{void store.open({api:'test',user:1,branch:1});},[]);return store.ready?React.createElement(Component,{data:[productRecord],token:'t',canConfigure:true,onSaved:async()=>{},onCreated:async()=>{},onOpenRecipes:()=>{}}):null;}
async function showProducts(handler,Component=ProductsView,ready='Editar producto Pizza'){globalThis.__workDisk=new Map();globalThis.__confirmWork=()=>true;globalThis.__p0Api=async(path,_token,options)=>{if(options?.method)return handler(path,options);if(path==='/products/1/configuration')return {product:productRecord,revision:'revision-1'};if(path.startsWith('/recipes/destinations')){const d={id:1,name:'Grande',active:true,product:{...productRecord,active:true},recipes:[]};return path.startsWith('/recipes/destinations/1')?d:{data:[d],current_page:1,last_page:1,total:1};}if(path.startsWith('/recipes'))return {data:[],current_page:1,last_page:1,total:0};if(path==='/ingredients/105')return {id:105,name:'Harina',active:true,base_unit_id:1};return {data:[{id:105,name:'Harina',active:true,base_unit_id:1,base_unit:{symbol:'kg'}}],current_page:1,last_page:1,total:1};};const view=render(React.createElement(WorkProvider,null,React.createElement(ProductsHarness,{Component})));await waitFor(()=>assert.ok(view.getByRole('button',{name:ready})));return view;}
test('product form validates fields, parses monetary input and issues a single write',async()=>{
 const writes=[];const pending=deferred();const view=await showProducts((path,options)=>{writes.push({path,body:JSON.parse(options.body)});return pending.promise;},ProductWizard,'Siguiente →');
 fireEvent.click(view.getByRole('button',{name:'Siguiente →'}));await flush();assert.equal(writes.length,0);assert.equal(document.activeElement,view.getByLabelText('Nombre del producto (obligatorio)'));
 fireEvent.change(view.getByLabelText('Nombre del producto (obligatorio)'),{target:{value:'Nueva pizza'}});fireEvent.click(view.getByRole('button',{name:'Siguiente →'}));await flush();
 fireEvent.change(view.getByLabelText('Tamaño o presentación (obligatorio)'),{target:{value:'Individual'}});fireEvent.change(view.getByLabelText('Precio de Individual'),{target:{value:'10,005'}});
 fireEvent.click(view.getByRole('button',{name:'Siguiente →'}));await flush();fireEvent.click(view.getByRole('button',{name:'Revisar →'}));await flush();
 const button=view.getByRole('button',{name:'Guardar producto'});act(()=>{fireEvent.click(button);fireEvent.click(button);});assert.equal(writes.length,1);assert.equal(writes[0].body.variants[0].price,10.01);assert.equal(writes[0].body.variants[0].name,'Individual');assert.deepEqual(writes[0].body.flavors,[]);
 await act(async()=>pending.resolve({id:2}));await waitFor(()=>assert.ok(view.getByRole('button',{name:'Crear su receta'})));
});
test('product editor retains atomic configuration operation and safe field errors',async()=>{
 const writes=[];const view=await showProducts((path,options)=>{writes.push({path,body:JSON.parse(options.body)});throw {status:422,errors:{'variants.0.price':['SQLSTATE private']}};});
 // The real ApiError class is required to distinguish definitive rejection from uncertainty.
 const {testApiError}=await import(await loadUi('testSupport/apiErrorIdentity.ts'));const reads=globalThis.__p0Api;
 globalThis.__p0Api=async(path,token,options)=>{if(options?.method){writes.push({path,body:JSON.parse(options.body)});throw new testApiError(422,{errors:{'variants.0.price':['SQLSTATE private']}},'SQLSTATE');}return reads(path,token,options);};
 fireEvent.click(view.getByRole('button',{name:'Editar producto Pizza'}));await waitFor(()=>assert.ok(view.getByRole('button',{name:'Guardar cambios'})));const prices=view.getAllByLabelText('Precio (obligatorio)');fireEvent.change(prices[0],{target:{value:'29,50'}});fireEvent.click(view.getByRole('button',{name:'Guardar cambios'}));await waitFor(()=>assert.equal(writes.length,1));await waitFor(()=>assert.ok(view.getByText(/Revisa el precio;/)));assert.equal(writes[0].path,'/products/1/configuration');assert.equal(writes[0].body.expected_revision,'revision-1');assert.equal(writes[0].body.variants[0].price,29.5);assert.ok(writes[0].body.operation_key);assert.equal(document.activeElement,prices[0]);assert.doesNotMatch(view.container.textContent,/SQLSTATE/);
});
test('recipe quantity uses shared decimals, memory work survives and saving revalidates ingredients',async()=>{
 const writes=[];const view=await showProducts((path,options)=>{writes.push({path,body:JSON.parse(options.body)});return {data:[]};},SaleRecipes,'Crear receta');fireEvent.click(view.getByRole('button',{name:'Crear receta'}));
 const product=await waitFor(()=>{const radio=view.getAllByRole('radio',{name:'Pizza'}).find(element=>element.getAttribute('aria-checked')==='false');assert.ok(radio);return radio;},{timeout:4000});fireEvent.click(product);
 fireEvent.click(await waitFor(()=>view.getByRole('checkbox',{name:'Grande'})));fireEvent.click(view.getByRole('button',{name:'Siguiente →'}));await flush();
 fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Agregar Harina'})));await flush();const quantity=view.getByLabelText('Cantidad de Harina');
 fireEvent.change(quantity,{target:{value:'mal'}});fireEvent.click(view.getByRole('button',{name:'Revisar →'}));await flush();assert.equal(quantity.getAttribute('aria-invalid'),'true');assert.equal(writes.length,0);
 fireEvent.change(quantity,{target:{value:'0,25'}});assert.equal(await store.leave(),true);fireEvent.click(view.getByRole('button',{name:'Revisar →'}));await flush();
 assert.equal(view.getByLabelText('Nombre de la receta (obligatorio)').value,'Pizza');fireEvent.click(view.getByRole('button',{name:'Guardar receta'}));
 await waitFor(()=>assert.ok(view.getByText('Receta guardada para Grande.')));assert.equal(writes.length,1);assert.equal(writes[0].path,'/recipes/batch');assert.equal(writes[0].body.recipes[0].items[0].quantity,.25);assert.equal(writes[0].body.recipes[0].product_variant_id,1);
});
const {PosScreen}=await import(await loadUi('features/pos/PosScreen.tsx'));
test('POS confirmation gate prevents competing submit actions while preserving P0 operation tracking',async()=>{
 globalThis.__workDisk=new Map();const confirmation=deferred();globalThis.__confirmWork=()=>confirmation.promise;let writes=0;
 globalThis.__p0Api=async(path,_token,options)=>{if(path==='/pos/catalog')return [productRecord];if(path==='/operational-settings')return {half_and_half_extra:10,additional_wing_flavor_extra:15,max_wing_flavors:2,delivery_zones:[],payment_methods:[{key:'cash',label:'Efectivo',active:true}]};if(path.startsWith('/customers'))return {data:[],current_page:1,last_page:1,total:0};if(path==='/orders'){writes++;assert.ok(store.operation?.key);return {id:22,daily_number:22,status:'confirmed',total:100};}if(path.endsWith('/send-to-kitchen'))return {id:22,daily_number:22,status:'kitchen_pending',total:100};return [];};
 const view=render(React.createElement(WorkProvider,null,React.createElement(Harness,{Screen:PosScreen})));await waitFor(()=>assert.ok(view.getByText('Agregar Pizza')));await act(async()=>{store.set('pos','cart',[{key:'p',kind:'product',variantId:1,name:'Pizza · Grande',unitPrice:100,quantity:1,flavorIds:[],flavorNames:[],modifierIds:[],modifierNames:[],notes:''}],[]);store.set('pos','pickup',true,false);store.set('pos','recipient','Ana','');store.set('pos','phone','123','');store.set('pos','payment','cash','');});
 const confirm=view.getByRole('button',{name:'Confirmar y enviar a cocina'});const draft=view.getByRole('button',{name:'Borrador / cotización'});act(()=>{fireEvent.click(confirm);fireEvent.click(confirm);fireEvent.click(draft);});assert.equal(writes,0);await act(async()=>confirmation.resolve(true));await waitFor(()=>assert.equal(writes,1));await waitFor(()=>assert.ok(!store.operation));assert.equal(store.get('pos','cart',[]).length,0);
});
