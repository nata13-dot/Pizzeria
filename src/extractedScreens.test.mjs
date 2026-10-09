import assert from 'node:assert/strict';
import test,{afterEach} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
import {loadUi} from './testSupport/loadUi.mjs';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(globalThis,'navigator',{value:{userAgent:'test'},configurable:true});
const {render,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
const {ReportsScreen}=await import(await loadUi('features/reports/ReportsScreen.tsx'));
const {KitchenBoard}=await import(await loadUi('features/kitchen/KitchenBoard.tsx'));
const {DeliveryBoard}=await import(await loadUi('features/delivery/DeliveryBoard.tsx'));
const {OperationalOrdersScreen}=await import(await loadUi('features/orders/OperationalOrdersScreen.tsx'));
const {OrdersDayScreen}=await import(await loadUi('features/orders/OrdersDayScreen.tsx'));
afterEach(()=>{cleanup();delete globalThis.__confirmWork;delete globalThis.__ordersChannel;delete globalThis.__appStateListener;delete globalThis.__testWidth;});
const order=(status,type='pickup')=>({id:4,daily_number:12,status,type,total:'100.00',items:[{id:1,name:'Pizza',quantity:1}],histories:[]});
test('reports mounts directly and performs only its own initial query',async()=>{
 const calls=[];globalThis.__p0Api=async path=>{calls.push(path);return {gross_sales:100};};const view=render(React.createElement(ReportsScreen,{token:'t'}));await waitFor(()=>assert.equal(calls.length,1));assert.deepEqual(calls,['/reports/cash-day']);assert.ok(view.getByText('Reporte de Caja'));
});
test('kitchen board preserves its state transition and shared printing action',async()=>{
 globalThis.__confirmWork=()=>true;let transition=null;const view=render(React.createElement(KitchenBoard,{orders:[order('kitchen_pending')],token:'t',onAction:async(_order,status)=>{transition=status;return true;}}));fireEvent.click(view.getByText(/INICIAR PREPARACIÓN/));await waitFor(()=>assert.equal(transition,'preparing'));assert.ok(view.getByText(/Imprimir comanda/));
});
test('delivery board preserves operational transition, contact and document controls',async()=>{
 globalThis.__confirmWork=()=>true;let transition=null;const delivery={...order('ready','delivery'),delivery:{recipient:'Ana',phone:'5551234',address:'Centro'},collection_required:false,amount_due:'0'};const view=render(React.createElement(DeliveryBoard,{orders:[delivery],token:'t',onAction:async(_order,status)=>{transition=status;return true;},onReload:()=>{}}));fireEvent.click(view.getByText('Marcar en camino'));await waitFor(()=>assert.equal(transition,'on_way'));assert.ok(view.getByText('☎ Llamar'));assert.ok(view.getByText('Imprimir reparto'));
});
test('delivery reflows between mobile tabs and desktop columns without losing the selected lane',()=>{
 globalThis.__testWidth=599;
 const ready={...order('ready','delivery'),id:1,delivery:{recipient:'Ana',address:'Centro'},collection_required:false,amount_due:'0'};
 const onWay={...order('on_way','delivery'),id:2,daily_number:13,delivery:{recipient:'Luis',address:'Norte'},collection_required:false,amount_due:'0'};
 const props={orders:[ready,onWay],token:'t',onAction:async()=>true,onReload:()=>{}};
 const view=render(React.createElement(DeliveryBoard,props));
 assert.ok(view.getByText('Ana'));
 assert.equal(view.queryByText('Luis'),null);
 fireEvent.click(view.getByText(/En camino \(1\)/));
 assert.ok(view.getByText('Luis'));
 globalThis.__testWidth=1024;
 view.rerender(React.createElement(DeliveryBoard,props));
 assert.ok(view.getByText('Ana'));
 assert.ok(view.getByText('Luis'));
});
test('operational screen owns one load and one realtime subscription, then cleans listeners',async()=>{
 const calls=[];let subscribed=0,left=0,appListeners=0,appRemoved=0;
 globalThis.__p0Api=async path=>{calls.push(path);return [];};
 globalThis.__ordersChannel=()=>{subscribed++;return()=>{left++;};};
 globalThis.__appStateListener=()=>{appListeners++;return{remove:()=>{appRemoved++;}};};
 const view=render(React.createElement(OperationalOrdersScreen,{mode:'kitchen',token:'t',branchId:2}));
 await waitFor(()=>assert.deepEqual(calls,['/kitchen/orders']));
 assert.equal(subscribed,1);assert.equal(appListeners,1);
 view.unmount();assert.equal(left,1);assert.equal(appRemoved,1);
});
test('orders screen loads every page once through the extracted component',async()=>{
 const calls=[];globalThis.__ordersChannel=()=>()=>{};globalThis.__p0Api=async path=>{calls.push(path);if(path.endsWith('page=1'))return{data:[order('confirmed')],last_page:2};return{data:[{...order('ready'),id:5,daily_number:13}],last_page:2};};
 const view=render(React.createElement(OrdersDayScreen,{token:'t',branchId:2,isAdministrator:true}));
 await waitFor(()=>assert.ok(view.getByText(/2 pedido\(s\)/)));
 assert.equal(calls.filter(path=>path.includes('/orders?date=')).length,2);
 assert.equal(calls.filter(path=>path.endsWith('page=1')).length,1);assert.equal(calls.filter(path=>path.endsWith('page=2')).length,1);
});
