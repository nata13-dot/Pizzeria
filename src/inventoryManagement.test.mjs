import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { loadUi } from './testSupport/loadUi.mjs';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window=dom.window; globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__realFields=true;
const {render,waitFor,cleanup,fireEvent}=await import('@testing-library/react');
const {InventoryScreen}=await import(await loadUi('features/operations/InventoryScreen.tsx'));
afterEach(cleanup);
const page=(data)=>({data,current_page:1,last_page:1,total:data.length,from:1,to:data.length});
const grams={id:1,name:'Gramo',symbol:'g',dimension:'mass',base_factor:1,active:true};
const kilo={id:2,name:'Kilogramo',symbol:'kg',dimension:'mass',base_factor:1000,active:true};
const cheese={id:7,name:'Queso',active:true,base_unit_id:1,base_unit:grams,current_stock:150,minimum_stock:500,critical_stock:100,missing_to_minimum:350,stock_status:'low',expiry_alert_days:3,shelf_life_days:null,sku:null,ingredient_type_id:null};
function serve(writes,extra={}){
  globalThis.__p0Api=async(path,_token,options)=>{
    if(options?.method){writes.push({path,method:options.method,body:options.body?JSON.parse(options.body):null});return {id:1};}
    if(path==='/inventory/summary')return {available:0,low:1,critical:0,out:0,expiring:0};
    if(path==='/inventory/items/7')return {...cheese,presentations:extra.presentations??[],batches:[{id:3,lot_code:'L-1',available_quantity:150,expires_at:null}],movements:[]};
    if(path.startsWith('/inventory/items'))return page([cheese]);
    if(path==='/catalogs/units')return [grams,kilo];
    if(path==='/catalogs/ingredient-types')return [];
    return page([]);
  };
}

test('administrators adjust stock from the ingredient card without choosing a lot',async()=>{
  const writes=[];serve(writes);
  const view=render(React.createElement(InventoryScreen,{token:'t',isAdministrator:true}));
  fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Ajustar existencia de Queso'})));
  await waitFor(()=>assert.ok(view.getByText('Ajustar existencia de Queso')));
  fireEvent.click(view.getByRole('radio',{name:'Merma o se echó a perder'}));
  assert.equal(view.getByRole('radio',{name:'Merma o se echó a perder'}).getAttribute('aria-checked'),'true');assert.equal(view.getByRole('radio',{name:'Caducó'}).getAttribute('aria-checked'),'false');
  fireEvent.change(view.getByLabelText('2. ¿Cuánto? (g) (obligatorio)'),{target:{value:'200'}});
  fireEvent.change(view.getByLabelText('3. Explica brevemente por qué (obligatorio)'),{target:{value:'Se cayó'}});
  fireEvent.click(view.getByRole('button',{name:'Registrar salida'}));
  await waitFor(()=>assert.ok(view.getByText(/Solo hay 150 g disponibles/)));assert.equal(writes.length,0);
  fireEvent.change(view.getByLabelText('2. ¿Cuánto? (g) (obligatorio)'),{target:{value:'40,5'}});
  assert.ok(view.getByText('Después del ajuste quedarán 109.5 g.'));
  fireEvent.click(view.getByRole('button',{name:'Registrar salida'}));
  await waitFor(()=>assert.equal(writes.length,1));
  assert.deepEqual(writes[0],{path:'/inventory/adjustments',method:'POST',body:{ingredient_id:7,quantity:-40.5,reason:'waste',comment:'Se cayó'}});
  await waitFor(()=>assert.ok(view.getByText('Listo: se descontaron 40.5 g de Queso.')));
});

test('an ingredient can be edited from the stock list and keeps its base unit',async()=>{
  const writes=[];serve(writes);
  const view=render(React.createElement(InventoryScreen,{token:'t',isAdministrator:true}));
  fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Editar Queso'})));
  const name=await waitFor(()=>view.getByLabelText('Nombre del insumo (obligatorio)'));
  assert.equal(name.value,'Queso');
  fireEvent.change(view.getByLabelText('Nivel urgente (g)'),{target:{value:'600'}});
  fireEvent.click(view.getByRole('button',{name:'Guardar cambios'}));
  await waitFor(()=>assert.ok(view.getByText(/El nivel urgente debe ser menor/)));assert.equal(writes.length,0);
  fireEvent.change(view.getByLabelText('Nivel urgente (g)'),{target:{value:'50'}});
  fireEvent.change(name,{target:{value:'Queso mozzarella'}});
  fireEvent.click(view.getByRole('button',{name:'Guardar cambios'}));
  await waitFor(()=>assert.equal(writes.length,1));
  assert.equal(writes[0].path,'/ingredients/7');assert.equal(writes[0].method,'PATCH');
  assert.equal(writes[0].body.name,'Queso mozzarella');assert.equal(writes[0].body.critical_stock,50);assert.equal('base_unit_id' in writes[0].body,false);
});

test('purchase presentations are managed for the chosen ingredient with a visible conversion',async()=>{
  const writes=[];serve(writes,{presentations:[{id:2,name:'Bolsa',quantity:1,equivalent_unit_id:2,base_quantity:1000,active:true}]});
  const view=render(React.createElement(InventoryScreen,{token:'t',isAdministrator:true}));
  fireEvent.click(await waitFor(()=>view.getByText('Ver detalle')));
  fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Administrar presentaciones de compra de Queso'})));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'Desactivar Bolsa'})));
  fireEvent.change(view.getByLabelText('Nombre (obligatorio)'),{target:{value:'Caja'}});
  fireEvent.change(view.getByLabelText('¿Cuánto contiene? (obligatorio)'),{target:{value:'2'}});
  fireEvent.click(await waitFor(()=>view.getByRole('radio',{name:'Kilogramo (kg)'})));
  assert.ok(view.getByText(/^Al comprar 1 Caja se sumarán 2[.,]?000 g al inventario\.$/));
  fireEvent.click(view.getByRole('button',{name:'Agregar presentación'}));
  await waitFor(()=>assert.equal(writes.length,1));
  assert.deepEqual(writes[0],{path:'/ingredients/7/presentations',method:'POST',body:{name:'Caja',quantity:2,equivalent_unit_id:2,supplier_sku:null,active:true}});
});

test('employees without administration see stock but no management actions',async()=>{
  serve([]);
  const view=render(React.createElement(InventoryScreen,{token:'t',isAdministrator:false}));
  await waitFor(()=>assert.ok(view.getByText('Queso')));
  assert.equal(view.queryByRole('button',{name:'+ Nuevo insumo'}),null);
  assert.equal(view.queryByRole('button',{name:'Editar Queso'}),null);
  assert.equal(view.queryByRole('button',{name:'Ajustar existencia de Queso'}),null);
});
