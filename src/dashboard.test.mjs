import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { loadUi } from './testSupport/loadUi.mjs';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window=dom.window; globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,renderHook,waitFor,cleanup,fireEvent}=await import('@testing-library/react');
const {DashboardScreen}=await import(await loadUi('features/dashboard/DashboardScreen.tsx'));
const {useNavigationBadges,badgeLabel}=await import(await loadUi('navigation/useNavigationBadges.ts'));
afterEach(cleanup);

const fullDashboard={date:'2026-10-29',generated_at:'2026-10-29T19:40:00Z',
  sales:{total:1200,orders:6,average_ticket:200,cancelled:1,last_week_same_time:{sales:1000,orders:5},by_hour:[{hour:13,orders:2,sales:400},{hour:14,orders:4,sales:800}]},
  payments:{cash:700,transfer:500,mixed:0,on_delivery:0,courtesy:0},order_types:{pickup:{orders:4,sales:800},delivery:{orders:2,sales:400}},
  top_products:[{name:'Pizza Grande',quantity:5,sales:1050},{name:'Refresco',quantity:3,sales:150}],
  cash_day:{open:true,closed_at:null,opening_amount:500,expected_cash:1200},
  pipeline:{pending_payment:0,kitchen_pending:2,preparing:1,ready:0,on_way:1},
  recent_orders:[{id:9,daily_number:9,status:'kitchen_pending',type:'delivery',contact_name:'Ana',total:300,created_at:'2026-10-29T19:30:00Z'}],
  inventory:{out:1,critical:0,low:2,expiring_count:1,shortages:[{id:3,name:'Queso',status:'out',current_stock:0,minimum_stock:1000,unit:'g'}],expiring:[{ingredient:'Jamón',quantity:300,unit:'g',expires_at:'2026-10-31'}]}};

test('the summary shows today, the comparison, what sold, how they paid and what is missing',async()=>{
  globalThis.__p0Api=async(path)=>{assert.equal(path,'/dashboard');return fullDashboard;};const visited=[];
  const view=render(React.createElement(DashboardScreen,{token:'t',onNavigate:(screen)=>visited.push(screen)}));
  await waitFor(()=>assert.ok(view.getByText('Ventas de hoy')));assert.ok(view.getAllByText(/\$1,?200\.00/).length>=1);
  assert.match(view.container.textContent,/▲ 20 % vs\. el .+ pasado a esta hora/);assert.ok(view.getByText('Abierta'));assert.ok(view.getByText('Mejor hora: 14:00 · $800.00'));
  fireEvent.click(view.getByRole('button',{name:'Ver como tabla'}));assert.ok(view.getByText('13:00'));assert.ok(view.getByText('4 pedido(s)'));
  assert.ok(view.getByText('5 vendidos'));assert.ok(view.getByText('Transferencia'));
  assert.ok(view.getByText('1 agotado(s)'));assert.ok(view.getByText('Agotado'));assert.ok(view.getByText('Queso'));
  fireEvent.click(view.getByRole('button',{name:'En cocina: 2. Ver pedidos'}));fireEvent.click(view.getByRole('button',{name:'Comprar lo que falta'}));
  await waitFor(()=>assert.deepEqual(visited,['orders','purchases']));
});

test('a failed refresh keeps the last good data and never shows the technical message',async()=>{
  let fail=false;globalThis.__p0Api=async()=>{if(fail)throw {status:500,message:'SQLSTATE secret'};return fullDashboard;};
  const view=render(React.createElement(DashboardScreen,{token:'t',onNavigate:()=>{}}));
  await waitFor(()=>assert.ok(view.getByText('Abierta')));fail=true;fireEvent.click(view.getByRole('button',{name:'Actualizar'}));
  await waitFor(()=>assert.match(view.container.textContent,/No pudimos cargar el resumen del día/));assert.ok(view.getByText('Abierta'));assert.doesNotMatch(view.container.textContent,/SQLSTATE/);
});

test('sections the user cannot open are simply not shown',async()=>{
  globalThis.__p0Api=async()=>({date:'2026-10-29',generated_at:'2026-10-29T19:40:00Z',pipeline:{kitchen_pending:3}});
  const view=render(React.createElement(DashboardScreen,{token:'t',onNavigate:()=>{}}));
  await waitFor(()=>assert.ok(view.getByText('Pedidos en curso')));assert.equal(view.queryByText('Ventas de hoy'),null);assert.equal(view.queryByText('Inventario'),null);
});

test('menu badges map pending work to modules and never break navigation on failure',async()=>{
  globalThis.__p0Api=async()=>({kitchen:2,delivery:1,inventory:0});
  const {result,rerender}=renderHook(({key})=>useNavigationBadges('t',key),{initialProps:{key:1}});
  await waitFor(()=>assert.deepEqual(result.current,{kitchen:2,orders:2,delivery:1,inventory:0}));
  globalThis.__p0Api=async()=>{throw new Error('offline');};rerender({key:2});
  await new Promise((resolve)=>setTimeout(resolve,20));assert.equal(result.current.kitchen,2);
  assert.equal(badgeLabel(0),'');assert.equal(badgeLabel(1),', 1 pendiente');assert.equal(badgeLabel(3),', 3 pendientes');
});
