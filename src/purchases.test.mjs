import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { loadUi } from './testSupport/loadUi.mjs';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window=dom.window; globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__realFields=true;
const {render,waitFor,cleanup,fireEvent,act}=await import('@testing-library/react');
const {PurchasesScreen}=await import(await loadUi('features/operations/PurchasesScreen.tsx'));
afterEach(cleanup);
const page=(data)=>({data,current_page:1,last_page:1,total:data.length,from:1,to:data.length});
const grams={id:1,name:'Gramo',symbol:'g',dimension:'mass',base_factor:1,active:true};
const kilo={id:2,name:'Kilogramo',symbol:'kg',dimension:'mass',base_factor:1000,active:true};
const bag={id:5,ingredient_id:7,name:'Bolsa 1 kg',active:true,quantity:1,base_quantity:1000,equivalent_unit_id:2,equivalent_unit:kilo,purchase_revision:'b'.repeat(64),last_unit_cost:45};
const cheese={id:7,name:'Queso',active:true,base_unit_id:1,base_unit:grams,presentations:[bag]};
function serve(extra={}){
  const writes=[];
  globalThis.__confirmWork=()=>true;
  globalThis.__p0Api=async(path,_token,options)=>{
    if(options?.method){writes.push({path,headers:options.headers,body:JSON.parse(options.body)});const handled=extra.write?.(path);if(handled)return handled;return {id:9,total:0,items:[]};}
    if(path==='/purchases/suggestions')return {data:[
      {ingredient:{id:7,name:'Queso',base_unit_id:1,base_unit:grams,current_stock:200,minimum_stock:3000,missing_to_minimum:2800,stock_status:'low'},presentations:[bag],suggested_presentation_id:5,suggested_quantity:3},
      {ingredient:{id:8,name:'Sal',base_unit_id:1,base_unit:grams,current_stock:0,minimum_stock:500,missing_to_minimum:500,stock_status:'out'},presentations:[],suggested_presentation_id:null,suggested_quantity:null},
    ]};
    if(extra.read){const handled=extra.read(path);if(handled)return handled;}
    if(path==='/ingredients/7')return cheese;
    if(path==='/catalogs/units')return [grams,kilo];
    if(path==='/catalogs/suppliers')return [];
    if(path.startsWith('/ingredients'))return page([cheese]);
    return page([]);
  };
  return writes;
}

test('"Comprar lo que falta" fills the ticket with suggested amounts and asks only for prices',async()=>{
  serve();const view=render(React.createElement(PurchasesScreen,{token:'t',isAdministrator:true}));
  fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Comprar lo que falta'})));
  const amount=await waitFor(()=>view.getByLabelText('Cantidad de Bolsa 1 kg de Queso'));assert.equal(amount.value,'3');
  assert.ok(view.getByRole('button',{name:'Indicar cómo compras Sal'}));assert.ok(view.getByText(/Última compra: \$45.00/));
  fireEvent.click(view.getByRole('button',{name:'Agregar 1 a la compra'}));await waitFor(()=>assert.ok(view.getByText(/Escribe el precio de cada una/)));
  fireEvent.change(view.getByLabelText('Precio por Bolsa 1 kg de Queso'),{target:{value:'45,5'}});fireEvent.click(view.getByRole('button',{name:'Agregar 1 a la compra'}));
  await waitFor(()=>assert.equal(view.getAllByText('$136.50').length,2));assert.match(view.container.textContent,/3 × Bolsa 1 kg → 3[.,]?000 g/);
});

test('an ingredient without a purchase presentation gets one inside the purchase',async()=>{
  let created=false;const salt={id:8,name:'Sal',active:true,base_unit_id:1,base_unit:grams,presentations:[]};
  const writes=serve({read:(path)=>path==='/ingredients/8'?(created?{...salt,presentations:[{...bag,id:6,ingredient_id:8,name:'Costal',last_unit_cost:null}]}:salt):null,write:(path)=>{if(path==='/ingredients/8/presentations'){created=true;return {id:6};}}});
  const view=render(React.createElement(PurchasesScreen,{token:'t',isAdministrator:true}));
  fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Comprar lo que falta'})));fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Indicar cómo compras Sal'})));
  fireEvent.change(await waitFor(()=>view.getByLabelText('¿Cómo lo compras? (obligatorio)')),{target:{value:'Costal'}});fireEvent.change(view.getByLabelText('¿Cuánto contiene? (obligatorio)'),{target:{value:'1'}});
  fireEvent.click(await waitFor(()=>view.getByRole('radio',{name:'Kilogramo (kg)'})));fireEvent.click(view.getByRole('button',{name:'Guardar y continuar con la compra'}));
  await waitFor(()=>assert.ok(view.getByLabelText('¿Cuántas Costal? (obligatorio)')));
  assert.deepEqual(writes[0],{path:'/ingredients/8/presentations',headers:undefined,body:{name:'Costal',quantity:1,equivalent_unit_id:2,supplier_sku:null,active:true}});
});

test('paying from a closed cash day explains how to fix it instead of a generic error',async()=>{
  serve({write:()=>{throw {status:422,errors:{payment_source:['Debes abrir la caja']}};}});
  const view=render(React.createElement(PurchasesScreen,{token:'t',isAdministrator:true}));
  fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Agregar Queso'})));fireEvent.change(await waitFor(()=>view.getByLabelText('Precio por Bolsa 1 kg (obligatorio)')),{target:{value:'45'}});
  fireEvent.click(view.getByRole('button',{name:'Agregar a la compra'}));fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Revisar compra'})));
  fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'Registrar compra y aumentar inventario'})));
  await waitFor(()=>assert.match(view.container.textContent,/la caja del .* debe estar abierta/));assert.ok(view.getByRole('radio',{name:'Dueño'}));
});
