import assert from 'node:assert/strict';
import test,{afterEach} from 'node:test';
import React,{useEffect,useState} from 'react';
import {JSDOM} from 'jsdom';
import {loadUi} from './testSupport/loadUi.mjs';
globalThis.__DEV__=false;globalThis.__realFields=true;
const dom=new JSDOM('<html><body></body></html>');globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'test',locks:{request:async(_k,_o,cb)=>cb({})}},configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const {WorkProvider,useWork}=await import(await loadUi('work/WorkProvider.tsx'));
const {SaleRecipes}=await import(await loadUi('features/recipes/SaleRecipes.tsx'));
const {ProductionScreen}=await import(await loadUi('features/operations/ProductionScreen.tsx'));
let store, destinations, recipes, ingredients, writes, reads;
const page=data=>({data,current_page:1,last_page:1,total:data.length});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=()=>act(async()=>{});
afterEach(()=>{cleanup();globalThis.__testWidth=1200;});
function Harness({production=false}){store=useWork();const [visible,setVisible]=useState(true);useEffect(()=>{void store.open({api:'test',user:1,branch:1});},[]);return store.ready?React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setVisible(v=>!v)},'Navegar'),visible?React.createElement(production?ProductionScreen:SaleRecipes,{token:'t',isAdministrator:true}):null):null;}
function setup(){
 globalThis.__workDisk=new Map();globalThis.__confirmWork=()=>true;writes=[];reads=[];
 const product={id:1,name:'Pizza',type:'pizza',active:true,flavors:[{id:7,name:'Pepperoni',active:true},{id:8,name:'Jamón',active:true}]};
 destinations=[{id:1,name:'Mediana',active:true,product,recipes:[]},{id:2,name:'Grande',active:true,product,recipes:[]}];
 const grams={id:1,name:'Gramo',symbol:'g',dimension:'mass',base_factor:1,active:true};
 ingredients=[{id:105,name:'Harina',active:true,base_unit_id:1,base_unit:grams,current_stock:1000},{id:106,name:'Agua',active:true,base_unit_id:1,base_unit:grams,current_stock:1000}];recipes=[];
 globalThis.__p0Api=async(path,token,options)=>{
   if(options?.method){const body=options.body?JSON.parse(options.body):null;writes.push({path,method:options.method,body});return path==='/recipes/batch'?{data:[]}:{id:10,name:body?.name??'',active:true};}
   reads.push(path);const url=new URL('http://test'+path);const q=url.searchParams.get('search')??'';const productId=url.searchParams.get('product_id');
   if(url.pathname==='/recipes/destinations')return page(destinations.filter(d=>`${d.product.name} ${d.name}`.includes(q)&&(!productId||String(d.product.id)===productId)));
   if(url.pathname.startsWith('/recipes/destinations/'))return structuredClone(destinations.find(d=>d.id===Number(url.pathname.split('/').at(-1))));
   if(url.pathname==='/recipes')return page(recipes.filter(r=>r.name.includes(q)));
   if(url.pathname.startsWith('/recipes/'))return recipes.find(r=>r.id===Number(url.pathname.split('/').at(-1)));
   if(url.pathname==='/ingredients')return page(ingredients.filter(i=>i.name.includes(q)||i.sku?.includes(q)));
   if(url.pathname.startsWith('/ingredients/'))return ingredients.find(i=>i.id===Number(url.pathname.split('/').at(-1)));
   if(url.pathname==='/catalogs/units')return [ingredients[0].base_unit];
   return page([]);
 };
}
async function mount(production=false){const v=render(React.createElement(WorkProvider,null,React.createElement(Harness,{production})));await waitFor(()=>assert.ok(v.getAllByText(production?'Registrar producción':'Recetas de venta').length));return v;}
const button=(v,name)=>v.getByRole('button',{name});
async function start(v,{sizes=['Mediana'],target=null}={}){
 await waitFor(()=>assert.equal(button(v,'Crear receta').disabled,false));fireEvent.click(button(v,'Crear receta'));
 fireEvent.click(await waitFor(()=>v.getByRole('radio',{name:'Pizza'})));
 for(const size of sizes)fireEvent.click(await waitFor(()=>v.getByRole('checkbox',{name:size})));
 fireEvent.click(button(v,'Siguiente →'));await flush();
 if(target){fireEvent.click(await waitFor(()=>v.getByRole('radio',{name:target})));fireEvent.click(button(v,'Siguiente →'));await flush();}
}
async function addHarina(v){fireEvent.click(await waitFor(()=>button(v,'Agregar Harina')));await flush();}
async function review(v){fireEvent.click(button(v,'Revisar →'));await flush();}
const draft=()=>store.get('recipe','wizard',{});
function existing(){const r={id:10,name:'Actual',active:true,product_flavor_id:7,applies_to_flavors:false,base_only:false,variant:destinations[0],flavor:destinations[0].product.flavors[0],items:[{ingredient_id:105,ingredient:ingredients[0],quantity:'2.0000',component:'base'}]};recipes.push(r);destinations[0].recipes.push({id:10,product_flavor_id:7,name:r.name,active:true});return r;}

test('sale recipe keeps the exact size, flavor and decimals; repeated save presses send one write',async()=>{
 setup();const v=await mount();await start(v,{target:'Pepperoni'});await addHarina(v);fireEvent.change(v.getByLabelText('Cantidad de Harina'),{target:{value:'1,5'}});await review(v);
 assert.equal(v.getByLabelText('Nombre de la receta (obligatorio)').value,'Pizza · Pepperoni');
 const pending=deferred();const api=globalThis.__p0Api;globalThis.__p0Api=(p,t,o)=>o?.method?(writes.push({path:p,body:JSON.parse(o.body)}),pending.promise):api(p,t,o);
 const save=button(v,'Guardar receta');act(()=>{fireEvent.click(save);fireEvent.click(save);});await waitFor(()=>assert.equal(writes.length,1));
 const [recipe]=writes[0].body.recipes;assert.equal(writes[0].path,'/recipes/batch');assert.equal(recipe.product_variant_id,1);assert.equal(recipe.product_flavor_id,7);assert.equal(recipe.id,null);assert.equal(recipe.applies_to_flavors,false);assert.equal(recipe.items[0].quantity,1.5);
 assert.ok(reads.includes('/ingredients/105'));assert.ok(reads.includes('/recipes/destinations/1'));
 await act(async()=>pending.resolve({data:[]}));await waitFor(()=>assert.ok(v.getByText('Receta de Pepperoni guardada para Mediana.')));assert.equal(draft().rows.length,0);assert.equal(draft().open,false);
});

test('a base for all flavors is saved for several sizes in one request',async()=>{
 setup();const v=await mount();await start(v,{sizes:['Mediana','Grande'],target:'Base para todos los sabores'});await addHarina(v);
 fireEvent.change(v.getByLabelText('Cantidad de Harina en Mediana'),{target:{value:'200'}});fireEvent.click(button(v,'Usar la cantidad de Mediana en todos los tamaños para Harina'));
 assert.equal(v.getByLabelText('Cantidad de Harina en Grande').value,'200');fireEvent.change(v.getByLabelText('Cantidad de Harina en Grande'),{target:{value:'300'}});
 await review(v);assert.equal(v.getAllByText('Receta nueva').length,2);fireEvent.click(button(v,'Guardar 2 recetas'));await waitFor(()=>assert.equal(writes.length,1));
 const body=writes[0].body.recipes;assert.deepEqual(body.map(r=>[r.product_variant_id,r.product_flavor_id,r.applies_to_flavors,r.items[0].quantity,r.items[0].component]),[[1,null,true,200,'base'],[2,null,true,300,'base']]);
});

test('invalid quantities focus the field and every size needs an ingredient before review',async()=>{
 setup();const v=await mount();await start(v,{sizes:['Mediana','Grande'],target:'Pepperoni'});await addHarina(v);
 const medium=v.getByLabelText('Cantidad de Harina en Mediana');fireEvent.change(medium,{target:{value:'mal'}});await review(v);assert.equal(document.activeElement,medium);assert.ok(button(v,'Revisar →'));
 fireEvent.change(medium,{target:{value:'2'}});await review(v);assert.ok(v.getByText('Escribe al menos una cantidad para Grande.'));assert.equal(writes.length,0);
 fireEvent.click(button(v,'Quitar Harina'));assert.equal(draft().rows.length,0);await review(v);assert.ok(v.getByText('Agrega al menos un ingrediente.'));
});

test('a flavor can use only the base when every chosen size has one',async()=>{
 setup();destinations[0].recipes.push({id:20,product_flavor_id:null,applies_to_flavors:true,base_only:false,active:true,name:'Base'});const v=await mount();
 await start(v);fireEvent.click(await waitFor(()=>v.getByRole('radio',{name:'Jamón'})));fireEvent.click(v.getByRole('checkbox',{name:'Este sabor no agrega ingredientes (usa solo la base)'}));
 fireEvent.click(button(v,'Revisar →'));await flush();assert.ok(v.getByText('Usa solo la base de este tamaño.'));fireEvent.click(button(v,'Guardar receta'));await waitFor(()=>assert.equal(writes.length,1));
 const [recipe]=writes[0].body.recipes;assert.equal(recipe.product_flavor_id,8);assert.equal(recipe.base_only,true);assert.deepEqual(recipe.items,[]);
});

test('editing opens the saved quantities and updates the same recipe',async()=>{
 setup();existing();const v=await mount();fireEvent.click(await waitFor(()=>button(v,'Editar receta Actual')));
 const quantity=await waitFor(()=>v.getByLabelText('Cantidad de Harina'));assert.equal(quantity.value,'2');fireEvent.change(quantity,{target:{value:'2,5'}});await review(v);assert.ok(v.getByText('Se actualiza'));
 fireEvent.click(button(v,'Guardar receta'));await waitFor(()=>assert.equal(writes.length,1));const [recipe]=writes[0].body.recipes;assert.equal(recipe.id,10);assert.equal(recipe.product_variant_id,1);assert.equal(recipe.product_flavor_id,7);assert.equal(recipe.items[0].quantity,2.5);
});

test('choosing a size and flavor that already has a recipe loads it, or keeps typed quantities when asked',async()=>{
 setup();existing();const v=await mount();await start(v,{target:'Pepperoni'});assert.equal((await waitFor(()=>v.getByLabelText('Cantidad de Harina'))).value,'2');assert.equal(draft().recipeIds['1'],10);
 fireEvent.click(button(v,'← Atrás'));fireEvent.click(v.getByRole('radio',{name:'Jamón'}));fireEvent.click(button(v,'Siguiente →'));await flush();
 assert.equal(draft().recipeIds['1'],null);fireEvent.change(v.getByLabelText('Cantidad de Harina'),{target:{value:'5'}});
 fireEvent.click(button(v,'← Atrás'));fireEvent.click(v.getByRole('radio',{name:'Pepperoni'}));globalThis.__confirmWork=()=>false;fireEvent.click(button(v,'Siguiente →'));await flush();
 assert.equal(v.getByLabelText('Cantidad de Harina').value,'5');globalThis.__confirmWork=()=>true;await review(v);fireEvent.click(button(v,'Guardar receta'));await waitFor(()=>assert.equal(writes.length,1));
 assert.equal(writes[0].body.recipes[0].id,10);assert.equal(writes[0].body.recipes[0].items[0].quantity,5);
});

test('a lost save response is detected on retry and never creates a second recipe',async()=>{
 setup();const v=await mount();await start(v,{target:'Pepperoni'});await addHarina(v);fireEvent.change(v.getByLabelText('Cantidad de Harina'),{target:{value:'1,5'}});await review(v);const api=globalThis.__p0Api;
 globalThis.__p0Api=async(p,t,o)=>{if(o?.method){writes.push({path:p});existing();throw new Error('network private');}return api(p,t,o);};
 fireEvent.click(button(v,'Guardar receta'));await waitFor(()=>assert.match(v.container.textContent,/No pudimos confirmar/));assert.doesNotMatch(v.container.textContent,/private/);
 fireEvent.click(button(v,'Guardar receta'));await waitFor(()=>assert.ok(button(v,'Cargar la receta guardada')));assert.equal(writes.length,1);assert.equal(draft().rows.length,1);
});

test('failed save shows a safe error and keeps the form; a changed ingredient unit blocks the write',async()=>{
 setup();const v=await mount();await start(v,{target:'Pepperoni'});await addHarina(v);fireEvent.change(v.getByLabelText('Cantidad de Harina'),{target:{value:'1'}});await review(v);const api=globalThis.__p0Api;
 globalThis.__p0Api=async(p,t,o)=>{if(o?.method)throw {status:422,errors:{'recipes.0.items':['SQLSTATE secret']},message:'SQLSTATE'};return api(p,t,o);};
 fireEvent.click(button(v,'Guardar receta'));await waitFor(()=>assert.match(v.container.textContent,/No pudimos guardar la receta/));assert.doesNotMatch(v.container.textContent,/SQLSTATE|secret/);assert.equal(draft().rows.length,1);
 globalThis.__p0Api=api;ingredients[0]={...ingredients[0],base_unit_id:99};fireEvent.click(button(v,'Guardar receta'));await waitFor(()=>assert.match(v.container.textContent,/cambió su disponibilidad o unidad/));assert.equal(writes.length,0);
});

test('deactivation from the list asks first and only sends a deactivation',async()=>{
 setup();existing();const v=await mount();await waitFor(()=>assert.ok(button(v,'Desactivar receta Actual')));
 globalThis.__confirmWork=()=>false;fireEvent.click(button(v,'Desactivar receta Actual'));await flush();assert.equal(writes.length,0);
 globalThis.__confirmWork=()=>true;fireEvent.click(button(v,'Desactivar receta Actual'));await waitFor(()=>assert.equal(writes.length,1));assert.equal(writes[0].method,'DELETE');assert.equal(writes[0].path,'/recipes/10');
});

test('mobile draft survives module navigation and the list offers to continue it',async()=>{
 setup();globalThis.__testWidth=390;const v=await mount();await start(v,{target:'Jamón'});await addHarina(v);fireEvent.change(v.getByLabelText('Cantidad de Harina'),{target:{value:'3,5'}});
 fireEvent.click(button(v,'Navegar'));fireEvent.click(button(v,'Navegar'));await waitFor(()=>assert.equal(v.getByLabelText('Cantidad de Harina').value,'3,5'));
 fireEvent.click(button(v,'← Volver al listado'));await flush();fireEvent.click(await waitFor(()=>button(v,'Continuar receta pendiente')));assert.equal(v.getByLabelText('Cantidad de Harina').value,'3,5');
 globalThis.__confirmWork=()=>false;assert.equal(await store.leave(true),false);assert.equal(draft().target,8);
});

test('remote ingredient search finds late SKU, handles empty and rejects out of order replies',async()=>{
 setup();const api=globalThis.__p0Api;const older=deferred();let oldStarted=false;globalThis.__p0Api=async(p,t,o)=>{if(p.includes('/ingredients?')&&p.includes('search=viejo')){oldStarted=true;return older.promise;}if(p.includes('/ingredients?')&&p.includes('search=SKU105'))return page(ingredients.slice(0,1));return api(p,t,o);};
 const v=await mount();await start(v,{target:'Pepperoni'});const search=v.getByLabelText('Buscar ingrediente');fireEvent.change(search,{target:{value:'viejo'}});await waitFor(()=>assert.equal(oldStarted,true));
 fireEvent.change(search,{target:{value:'SKU105'}});await waitFor(()=>assert.ok(button(v,'Agregar Harina')));await act(async()=>older.resolve(page([{...ingredients[0],id:1,name:'Viejo'}])));assert.equal(v.queryByRole('button',{name:'Agregar Viejo'}),null);
 fireEvent.change(search,{target:{value:'no-existe'}});await waitFor(()=>assert.match(v.container.textContent,/No encontramos resultados/));assert.ok(reads.some(p=>p.includes('search=no-existe')));
});

test('opening a recipe blocks other actions until it finishes loading',async()=>{
 setup();existing();const pending=deferred();const api=globalThis.__p0Api;globalThis.__p0Api=(p,t,o)=>p==='/recipes/10'?pending.promise:api(p,t,o);const v=await mount();
 fireEvent.click(await waitFor(()=>button(v,'Editar receta Actual')));assert.equal(button(v,'Crear receta').disabled,true);fireEvent.click(button(v,'Crear receta'));
 await act(async()=>pending.resolve(recipes[0]));await waitFor(()=>assert.equal(draft().recipeIds['1'],10));assert.equal(draft().sizes[0].id,1);assert.equal(writes.length,0);
});

test('recipe lookup pagination stays remote and keeps the search term',async()=>{
 setup();const api=globalThis.__p0Api;globalThis.__p0Api=async(p,t,o)=>{if(p.startsWith('/recipes?')){reads.push(p);const u=new URL('http://test'+p);const n=Number(u.searchParams.get('page'));return {...page([]),current_page:n,last_page:2,total:30};}return api(p,t,o);};const v=await mount();const search=v.getByLabelText('Buscar receta, producto, tamaño o sabor');fireEvent.change(search,{target:{value:'Pepperoni'}});await waitFor(()=>assert.ok(v.getByRole('button',{name:'Página siguiente'})));await waitFor(()=>assert.equal(v.getByRole('button',{name:'Página siguiente'}).disabled,false));fireEvent.click(v.getByRole('button',{name:'Página siguiente'}));await waitFor(()=>assert.ok(reads.includes('/recipes?page=2&search=Pepperoni')));assert.equal(search.value,'Pepperoni');
});

test('production recipe wizard keeps output, yield preview and memory across navigation',async()=>{
 setup();const v=await mount(true);fireEvent.click(v.getByText('Recetas'));fireEvent.click(await waitFor(()=>button(v,'Nueva receta de producción')));
 fireEvent.click(await waitFor(()=>button(v,'Elegir Harina')));await flush();fireEvent.click(button(v,'Siguiente →'));await flush();
 fireEvent.change(v.getByLabelText('Cantidad que produce una tanda (obligatorio)'),{target:{value:'10,5'}});fireEvent.click(await waitFor(()=>v.getByRole('radio',{name:'Gramo (g)'})));
 assert.match(v.container.textContent,/Una tanda suma 10.5 g de Harina/);fireEvent.click(button(v,'Siguiente →'));await flush();
 assert.equal((await waitFor(()=>button(v,'Harina ya está elegido'))).disabled,true);fireEvent.click(await waitFor(()=>button(v,'Agregar Agua')));fireEvent.change(v.getByLabelText('Cantidad de Agua (g) (obligatorio)'),{target:{value:'2,5'}});
 fireEvent.click(button(v,'Navegar'));fireEvent.click(button(v,'Navegar'));await waitFor(()=>assert.ok(v.getByText('Recetas')));fireEvent.click(v.getByText('Recetas'));
 assert.equal((await waitFor(()=>v.getByLabelText('Cantidad de Agua (g) (obligatorio)'))).value,'2,5');fireEvent.click(button(v,'Revisar →'));await flush();
 assert.equal(v.getByLabelText('Nombre de la receta (obligatorio)').value,'Preparación de Harina');fireEvent.click(button(v,'Guardar receta'));await waitFor(()=>assert.equal(writes.length,1));
 assert.equal(writes[0].path,'/production-recipes');assert.equal(writes[0].body.output_ingredient_id,105);assert.equal(writes[0].body.yield_quantity,10.5);assert.equal(writes[0].body.items[0].ingredient_id,106);assert.equal(writes[0].body.items[0].quantity,2.5);
});

test('production consumption preview and confirmation gate keep one batch request',async()=>{
 setup();const pending=deferred();globalThis.__confirmWork=()=>pending.promise;const api=globalThis.__p0Api;const recipe={id:8,name:'Masa preparada',active:true,output_ingredient_id:105,output_ingredient:ingredients[0],yield_quantity:'10',yield_unit_id:1,yield_unit:ingredients[0].base_unit,shelf_life_days:1,items:[{ingredient_id:105,ingredient:ingredients[0],quantity:'2'}]};
 globalThis.__p0Api=async(p,t,o)=>{if(p.startsWith('/production-recipes?'))return page([recipe]);if(p==='/production-recipes/8')return recipe;if(p==='/production-batches'&&o?.method){writes.push({path:p,body:JSON.parse(o.body)});return {id:20,outputs:[]};}return api(p,t,o);};const v=await mount(true);await waitFor(()=>assert.ok(v.getByText('Masa preparada')));fireEvent.click(v.getByText('Masa preparada'));await waitFor(()=>assert.ok(v.getByLabelText('¿Cuántas tandas prepararás?')));fireEvent.change(v.getByLabelText('¿Cuántas tandas prepararás?'),{target:{value:'1,5'}});assert.match(v.container.textContent,/3 g/);assert.ok(v.getByText('15'));const confirm=button(v,'Confirmar consumo y producción');act(()=>{fireEvent.click(confirm);fireEvent.click(confirm);});assert.equal(writes.length,0);await act(async()=>pending.resolve(true));await waitFor(()=>assert.equal(writes.length,1));assert.equal(writes[0].body.production_recipe_id,8);assert.equal(writes[0].body.multiplier,1.5);
});

test('production editing keeps the recipe ID and never substitutes a missing yield unit',async()=>{
 setup();const api=globalThis.__p0Api;const recipe={id:8,name:'Masa preparada',active:true,output_ingredient_id:105,output_ingredient:ingredients[0],yield_quantity:'10',yield_unit_id:99,yield_unit:{id:99,symbol:'kg',dimension:'mass',base_factor:1000,active:false},shelf_life_days:1,items:[{ingredient_id:106,ingredient:ingredients[1],quantity:'2'}]};globalThis.__p0Api=async(p,t,o)=>!o?.method && p.startsWith('/production-recipes?')?page([recipe]):!o?.method && p==='/production-recipes/8'?recipe:api(p,t,o);
 const v=await mount(true);fireEvent.click(v.getByText('Recetas'));fireEvent.click(await waitFor(()=>button(v,'Editar Masa preparada')));await flush();
 assert.equal(store.get('productionRecipe','wizard',{}).yieldUnitId,99);fireEvent.change(v.getByLabelText('Cantidad de Agua (g) (obligatorio)'),{target:{value:'4,5'}});fireEvent.click(button(v,'Revisar →'));await flush();
 fireEvent.click(button(v,'Guardar cambios'));await flush();assert.equal(writes.length,0);await waitFor(()=>assert.match(v.container.textContent,/unidad anterior ya no está disponible/));
 fireEvent.click(v.getByRole('radio',{name:'Gramo (g)'}));fireEvent.click(button(v,'Siguiente →'));await flush();fireEvent.click(button(v,'Revisar →'));await flush();fireEvent.click(button(v,'Guardar cambios'));
 await waitFor(()=>assert.equal(writes.length,1));assert.equal(writes[0].path,'/production-recipes/8');assert.equal(writes[0].method,'PUT');assert.equal(writes[0].body.yield_unit_id,1);assert.equal(writes[0].body.items[0].quantity,4.5);
});
