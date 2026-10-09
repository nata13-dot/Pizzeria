import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { loadUi } from './testSupport/loadUi.mjs';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window=dom.window; globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {renderHook,render,act,waitFor,cleanup,fireEvent}=await import('@testing-library/react');
const {usePaginatedResource,useRemoteResource}=await import(await loadUi('hooks/useRemoteResource.ts'));
const {RemoteListStatus,Pagination}=await import(await loadUi('components/RemoteListStatus.tsx'));
const {InventoryScreen}=await import(await loadUi('features/operations/InventoryScreen.tsx'));
const {UsersScreen}=await import(await loadUi('features/administration/UsersScreen.tsx'));
afterEach(cleanup);
const page=(data,p=1,last=1,total=data.length)=>({data,current_page:p,last_page:last,total,from:data.length?(p-1)*25+1:null,to:data.length?(p-1)*25+data.length:null});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const pause=ms=>new Promise(r=>setTimeout(r,ms));

test('pagination preserves search and filters, reaches last page and recovers after deletion',async()=>{
 const calls=[];let removed=false;
 globalThis.__p0Api=async path=>{calls.push(path);const u=new URL(path,'https://test');const p=Number(u.searchParams.get('page'));return page([{id:p}],p,removed?2:3,60);};
 const {result}=renderHook(()=>usePaginatedResource('/customers?active=1','token','los clientes'));
 await waitFor(()=>assert.equal(result.current.loading,false));
 assert.equal(result.current.data.current_page,1);
 assert.equal(Object.hasOwn(result.current, "key"),false);
 act(()=>result.current.setSearch('Ana & Juan'));
 await waitFor(()=>assert.equal(result.current.loading,false));
 act(()=>result.current.setPage(2));
 await waitFor(()=>assert.equal(result.current.data?.current_page,2));
 assert.ok(calls.at(-1).includes('active=1&page=2&search=Ana%20%26%20Juan'));
 act(()=>result.current.setPage(3));
 await waitFor(()=>assert.equal(result.current.data?.current_page,3));
 removed=true;act(()=>result.current.reload());
 await waitFor(()=>assert.equal(result.current.data?.current_page,2));
});

test('rapid searches debounce and late responses cannot overwrite latest results',async()=>{
 const old=deferred(),calls=[];let oldSignal;
 globalThis.__p0Api=async(path,_token,options)=>{calls.push(path);if(path.includes('search=old')) {oldSignal=options.signal;return old.promise;}return page([{id:105,name:'Nuevo'}]);};
 const {result}=renderHook(()=>usePaginatedResource('/ingredients?active=1&per_page=25','t','los insumos',30));
 await waitFor(()=>assert.equal(result.current.loading,false));
 act(()=>result.current.setSearch('old'));
 await waitFor(()=>assert.ok(oldSignal));
 act(()=>result.current.setSearch('n'));act(()=>result.current.setSearch('nu'));act(()=>result.current.setSearch('nuevo'));
 await waitFor(()=>assert.equal(result.current.items[0]?.id,105));
 assert.equal(oldSignal.aborted,true);
 assert.equal(calls.some(p=>p.endsWith('search=n')||p.endsWith('search=nu')),false);
 await act(async()=>{old.resolve(page([{id:1,name:'Viejo'}]));await pause(5);});
 assert.equal(result.current.items[0].name,'Nuevo');
});

test('server failures retain previous data, sanitize errors, and retry bypasses cache',async()=>{
 let fail=false;const calls=[];
 globalThis.__p0Api=async(_path,_token,options)=>{calls.push(options);if(fail)throw Object.assign(new Error('SQLSTATE secret'),{status:500});return page([{id:1}]);};
 const {result}=renderHook(()=>usePaginatedResource('/customers','t','los clientes'));
 await waitFor(()=>assert.equal(result.current.items.length,1));
 fail=true;act(()=>result.current.reload());
 await waitFor(()=>assert.match(result.current.error,/No pudimos cargar los clientes/));
 assert.equal(result.current.items.length,1);assert.ok(!result.current.error.includes('SQLSTATE'));
 fail=false;act(()=>result.current.reload());
 await waitFor(()=>assert.equal(result.current.error,''));
 await waitFor(()=>assert.equal(result.current.loading,false));
 assert.equal(calls.at(-1).cache,'reload');
});

test('disabled resources do not fetch; session changes discard old responses',async()=>{
 const old=deferred();const calls=[];
 globalThis.__p0Api=async(path,token)=>{calls.push(token);return token==='old'?old.promise:{name:'Nueva sesión'};};
 const {result,rerender}=renderHook(({path,token})=>useRemoteResource(path,token,'el detalle'),{initialProps:{path:null,token:'old'}});
 await act(()=>pause(5));assert.equal(calls.length,0);
 rerender({path:'/customers/1',token:'old'});await waitFor(()=>assert.equal(calls.length,1));
 rerender({path:'/customers/1',token:'new'});await waitFor(()=>assert.equal(result.current.data?.name,'Nueva sesión'));
 await act(async()=>{old.resolve({name:'Sesión anterior'});await pause(5);});assert.equal(result.current.data.name,'Nueva sesión');
});

test('empty, no match, loading and error states differ; pagination buttons respect boundaries',()=>{
 let retries=0;const props={loading:false,error:'',count:0,emptyText:'No hay clientes registrados.',onRetry:()=>retries++};
 const view=render(React.createElement(RemoteListStatus,props));assert.ok(view.getByText(props.emptyText));
 view.rerender(React.createElement(RemoteListStatus,{...props,search:'Juan'}));assert.ok(view.getByText('No encontramos resultados para “Juan”.'));
 view.rerender(React.createElement(RemoteListStatus,{...props,loading:true}));assert.ok(view.getByText('Cargando información...'));
 view.rerender(React.createElement(RemoteListStatus,{...props,error:'No pudimos cargar los clientes.'}));fireEvent.click(view.getByText('Reintentar'));assert.equal(retries,1);assert.equal(view.queryByText(props.emptyText),null);
 view.rerender(React.createElement(Pagination,{data:page([{}],1,3,60),loading:false,onPage:()=>{}}));assert.equal(view.getByLabelText('Página anterior').disabled,true);
 view.rerender(React.createElement(Pagination,{data:page([{}],3,3,60),loading:false,onPage:()=>{}}));assert.equal(view.getByLabelText('Página siguiente').disabled,true);
});

test('inventory keeps stock when secondary alerts fail and retries only that source',async()=>{
 let fail=true;const calls=[];
 globalThis.__p0Api=async path=>{calls.push(path);if(path==='/inventory/alerts'){if(fail)throw new Error('SQL secret');return [];}if(path==='/inventory/summary')return {available:1,low:0,critical:0,out:0,expiring:0};if(path.startsWith('/inventory/items'))return page([{id:1,name:'Harina disponible',active:true,current_stock:5,minimum_stock:1,critical_stock:0,missing_to_minimum:0,stock_status:'available',base_unit:{name:'Kg',symbol:'kg'}}]);if(path.startsWith('/inventory/'))return page([]);return [];};
 const view=render(React.createElement(InventoryScreen,{token:'t',isAdministrator:false}));
 await waitFor(()=>assert.ok(view.getByText('Harina disponible')));
 fireEvent.click(view.getByText(/Alertas/));await waitFor(()=>assert.ok(view.getByText(/No pudimos cargar las alertas/)));
 const before=calls.length;fail=false;fireEvent.click(view.getByText('Reintentar'));
 await waitFor(()=>assert.equal(view.queryByText(/No pudimos cargar las alertas/),null));
 await waitFor(()=>assert.equal(calls.length,before+1));assert.equal(calls.at(-1),'/inventory/alerts');fireEvent.click(view.getByText(/Existencias/));await waitFor(()=>assert.ok(view.getByText('Harina disponible')));
});

test('inventory remains usable when the deployed API does not provide the optional summary',async()=>{
 globalThis.__p0Api=async path=>{if(path==='/inventory/summary')throw {status:404};if(path.startsWith('/inventory/items'))return page([{id:1,name:'Harina disponible',active:true,current_stock:5,minimum_stock:1,critical_stock:0,missing_to_minimum:0,stock_status:'available',base_unit:{name:'Kg',symbol:'kg'}}]);return [];};
 const view=render(React.createElement(InventoryScreen,{token:'t',isAdministrator:false}));
 await waitFor(()=>assert.ok(view.getByText('Harina disponible')));assert.equal(view.queryByText(/No pudimos cargar el resumen/),null);assert.equal(view.queryByText('Reintentar'),null);
});

test('inventory shows operational status, factual shortage and readable movement origin',async()=>{
 const item={id:7,name:'Queso mozzarella',active:true,current_stock:150,minimum_stock:500,critical_stock:100,missing_to_minimum:350,stock_status:'low',next_expiry:'2026-10-02',base_unit:{name:'Gramo',symbol:'g'}};
 globalThis.__p0Api=async path=>{if(path==='/inventory/summary')return {available:0,low:1,critical:0,out:0,expiring:1};if(path==='/inventory/items/7')return {...item,presentations:[{id:2,name:'Bolsa',quantity:1,base_quantity:1000,active:true,equivalent_unit:{symbol:'kg'}}],batches:[{id:3,lot_code:'L-1',available_quantity:150,expires_at:'2026-10-02'}],movements:[{id:4,quantity:150,type_label:'Compra',origin_label:'Compra #12'}]};if(path.startsWith('/inventory/items'))return page([item]);return page([]);};
 const view=render(React.createElement(InventoryScreen,{token:'t',isAdministrator:false}));await waitFor(()=>assert.ok(view.getByText('Queso mozzarella')));assert.ok(view.getAllByText('Existencia baja').length>=1);assert.ok(view.getByText(/Faltan 350 g/));fireEvent.click(view.getByText('Ver detalle'));await waitFor(()=>assert.ok(view.getByText(/Compra #12/)));assert.ok(view.getByText(/L-1/));
});

test('users remain visible and paginated if permissions fail',async()=>{
 globalThis.__p0Api=async path=>{if(path==='/permissions')throw new Error('Internal error');if(path==='/roles')return [];return page([{id:path.includes('page=2')?31:1,name:path.includes('page=2')?'Usuario siguiente':'Usuario inicial',email:'test@example.test',active:true}],path.includes('page=2')?2:1,2,31);};
 const view=render(React.createElement(UsersScreen,{token:'t',currentUserId:99}));
 await waitFor(()=>assert.ok(view.getByText('Usuario inicial')));assert.ok(view.getByText(/No pudimos cargar los permisos/));
 fireEvent.click(view.getByLabelText('Página siguiente'));await waitFor(()=>assert.ok(view.getByText('Usuario siguiente')));assert.equal(view.getByLabelText('Página siguiente').disabled,true);
});
