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
const {ComboManager}=await import(await loadUi('features/products/ComboManager.tsx'));
afterEach(cleanup);
const pizza={id:1,name:'Pizza',type:'pizza',active:true,flavors:[{id:7,name:'Pepperoni',active:true},{id:8,name:'Hawaiana',active:true},{id:9,name:'Queso',active:true}],variants:[{id:11,name:'Mediana',price:'160.00',active:true},{id:12,name:'Grande',price:'210.00',active:true}]};
const soda={id:2,name:'Refresco',type:'beverage',active:true,flavors:[],variants:[{id:21,name:'2 litros',price:'45.00',active:true}]};
function serve(combos=[]){
  const writes=[];globalThis.__confirmWork=()=>true;
  globalThis.__p0Api=async(path,_token,options)=>{if(options?.method){writes.push({path,method:options.method,body:options.body?JSON.parse(options.body):null});return {id:5};}if(path.startsWith('/combos'))return combos;return [];};
  return writes;
}

test('a promotion asks for one flavor per piece, can limit flavors and sell only on some days',async()=>{
  const writes=serve();const view=render(React.createElement(ComboManager,{products:[pizza,soda],token:'t'}));
  fireEvent.click(await waitFor(()=>view.getByRole('button',{name:'+ Nuevo paquete o promoción'})));
  fireEvent.click(view.getByRole('button',{name:'Crear paquete'}));await waitFor(()=>assert.ok(view.getByText(/Elige el producto y su tamaño/)));assert.equal(writes.length,0);
  fireEvent.change(view.getByLabelText('Nombre (obligatorio)'),{target:{value:'2 medianas'}});fireEvent.change(view.getByLabelText('Precio del paquete (obligatorio)'),{target:{value:'299'}});
  fireEvent.click(view.getByRole('radio',{name:'Pizza'}));fireEvent.click(view.getByRole('radio',{name:'Mediana'}));fireEvent.change(view.getByLabelText('Piezas del producto 1'),{target:{value:'2'}});
  assert.ok(view.getByRole('checkbox',{name:'✓ En Caja se elige el sabor de cada pieza'}));
  assert.ok(view.getByText('Precio normal $320.00 · el cliente ahorra $21.00.'));
  fireEvent.click(view.getByRole('checkbox',{name:'Limitar a algunos sabores (opcional)'}));fireEvent.click(view.getByRole('button',{name:'Crear paquete'}));await waitFor(()=>assert.ok(view.getByText(/Elige al menos un sabor permitido/)));
  fireEvent.click(view.getByRole('checkbox',{name:'Pepperoni'}));fireEvent.click(view.getByRole('checkbox',{name:'Hawaiana'}));
  fireEvent.click(view.getByRole('checkbox',{name:'Martes'}));fireEvent.click(view.getByRole('checkbox',{name:'Jueves'}));assert.ok(view.getByText(/^Martes, Jueves\./));
  fireEvent.click(view.getByRole('button',{name:'Crear paquete'}));await waitFor(()=>assert.equal(writes.length,1));
  assert.deepEqual(writes[0],{path:'/combos',method:'POST',body:{name:'2 medianas',price:299,image_data_uri:null,available_days:[2,4],items:[{product_variant_id:11,quantity:2,flavor_required:true,flavor_selection_count:null,options:[{product_flavor_id:7},{product_flavor_id:8}]}]}});
  await waitFor(()=>assert.ok(view.getByText(/2 medianas creado/)));
});

test('editing keeps the same combo and its items, and warns when it costs more than buying separately',async()=>{
  const combo={id:4,name:'Combo familiar',price:'260.00',image_data_uri:null,active:true,available_days:null,items:[{id:40,product_variant_id:12,quantity:1,flavor_required:true,flavor_selection_count:null,active:true,options:[],variant:{id:12,name:'Grande',product:{id:1,name:'Pizza'}}},{id:41,product_variant_id:21,quantity:1,flavor_required:false,flavor_selection_count:null,active:true,options:[],variant:{id:21,name:'2 litros',product:{id:2,name:'Refresco'}}}]};
  const writes=serve([combo]);const view=render(React.createElement(ComboManager,{products:[pizza,soda],token:'t'}));
  await waitFor(()=>assert.ok(view.getByText('1 × Pizza Grande + 1 × Refresco 2 litros')));assert.ok(view.getByText('Todos los días'));
  fireEvent.click(view.getByRole('button',{name:'Editar paquete Combo familiar'}));
  assert.ok(view.getByText('Precio normal $255.00: el paquete cuesta igual o más que comprar por separado.'));
  fireEvent.change(view.getByLabelText('Precio del paquete (obligatorio)'),{target:{value:'239,50'}});fireEvent.click(view.getByRole('button',{name:'Guardar cambios'}));
  await waitFor(()=>assert.equal(writes.length,1));assert.equal(writes[0].path,'/combos/4');assert.equal(writes[0].method,'PUT');assert.equal(writes[0].body.price,239.5);
  assert.deepEqual(writes[0].body.items.map((item)=>[item.id,item.product_variant_id,item.flavor_required]),[[40,12,true],[41,21,false]]);
});

test('deactivating a combo asks first and can be undone',async()=>{
  const combo={id:4,name:'Combo',price:'99.00',image_data_uri:null,active:false,available_days:[5],items:[]};
  const writes=serve([combo]);const view=render(React.createElement(ComboManager,{products:[pizza],token:'t'}));
  await waitFor(()=>assert.ok(view.getByText('Viernes · Desactivado')));fireEvent.click(view.getByRole('button',{name:'Reactivar paquete Combo'}));
  await waitFor(()=>assert.equal(writes.length,1));assert.deepEqual(writes[0],{path:'/combos/4',method:'PATCH',body:{active:true}});
});
