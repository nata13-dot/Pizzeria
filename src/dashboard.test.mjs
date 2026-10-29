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

test('the summary keeps the other figures when one source fails and retries only that one',async()=>{
  let failSales=true;const calls=[];
  globalThis.__p0Api=async(path)=>{calls.push(path);if(path==='/reports/cash-day'){if(failSales)throw {status:403,message:'SQLSTATE secret'};return {gross_sales:1250};}if(path.startsWith('/orders'))return {total:3,data:[]};if(path==='/inventory/summary')return {critical:1,out:1,expiring:4};return {};};
  const view=render(React.createElement(DashboardScreen,{token:'t',onNavigate:()=>{}}));
  await waitFor(()=>assert.ok(view.getByText('3')));assert.ok(view.getByText('4'));assert.ok(view.getByText('2'));assert.ok(view.getByText(/No tienes permiso para consultar las ventas de hoy/));assert.doesNotMatch(view.container.textContent,/SQLSTATE/);
  assert.ok(view.getByText('En cocina'));assert.ok(view.getByText('Agotados o urgentes'));
  failSales=false;fireEvent.click(view.getByRole('button',{name:'Reintentar Ventas de hoy'}));
  await waitFor(()=>assert.ok(view.getByText('$1250.00')));
  assert.equal(calls.filter((path)=>path==='/inventory/summary').length,1);assert.equal(calls.filter((path)=>path==='/reports/cash-day').length,2);
});

test('menu badges map pending work to modules and never break navigation on failure',async()=>{
  globalThis.__p0Api=async()=>({kitchen:2,delivery:1,inventory:0});
  const {result,rerender}=renderHook(({key})=>useNavigationBadges('t',key),{initialProps:{key:1}});
  await waitFor(()=>assert.deepEqual(result.current,{kitchen:2,orders:2,delivery:1,inventory:0}));
  globalThis.__p0Api=async()=>{throw new Error('offline');};rerender({key:2});
  await new Promise((resolve)=>setTimeout(resolve,20));assert.equal(result.current.kitchen,2);
  assert.equal(badgeLabel(0),'');assert.equal(badgeLabel(1),', 1 pendiente');assert.equal(badgeLabel(3),', 3 pendientes');
});
