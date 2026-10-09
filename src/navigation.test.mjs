import assert from 'node:assert/strict';
import test,{afterEach} from 'node:test';
import React,{useState} from 'react';
import {JSDOM} from 'jsdom';
import {loadUi} from './testSupport/loadUi.mjs';
import {appModules,groupedModules,mobileModules,modulesForUser,firstAllowed} from './navigation/modules.ts';
import {requestModuleNavigation,takeBackTarget} from './navigation/controller.ts';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.sessionStorage=dom.window.sessionStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'test'},configurable:true});
const {render,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
const {ModuleSheet}=await import(await loadUi('navigation/ModuleSheet.tsx'));
const {clearNavigationScope,readLastModule,readQueryContext,writeLastModule,writeQueryContext}=await import(await loadUi('navigation/sessionState.ts'));
afterEach(cleanup);
const user=(slug,permissions=[])=>({role:{slug},permissions});

test('registry contains the fourteen modules once and groups never include empty sections',()=>{
 assert.equal(appModules.length,14);assert.equal(new Set(appModules.map(item=>item.id)).size,14);
 const groups=groupedModules(modulesForUser(user('cocina',['orders.view','kitchen.use','documents.generate'])));
 assert.deepEqual(groups.map(group=>group.label),['Operación','Administración']);assert.deepEqual(groups.flatMap(group=>group.modules.map(item=>item.id)),['kitchen','settings']);
});
test('administrator, cashier, kitchen and delivery visibility preserves existing permissions',()=>{
 assert.equal(modulesForUser(user('administrador',['*'])).length,14);
 assert.deepEqual(modulesForUser(user('cajero',['pos.use','orders.view','inventory.view','customers.manage','cash.manage','documents.generate'])).map(item=>item.id),['dashboard','pos','orders','cash','customers','inventory','settings']);
 assert.deepEqual(modulesForUser(user('cocina',['orders.view','kitchen.use'])).map(item=>item.id),['kitchen','settings']);
 assert.deepEqual(modulesForUser(user('repartidor',['orders.view','delivery.use'])).map(item=>item.id),['delivery','settings']);
});
test('mobile priority is deterministic and only contains allowed modules',()=>{
 const admin=user('administrador',['*']);assert.deepEqual(mobileModules(admin,modulesForUser(admin)).map(item=>item.id),['dashboard','pos','orders','inventory']);
 const cashier=user('cajero',['pos.use','orders.view','inventory.view','customers.manage','cash.manage']);assert.deepEqual(mobileModules(cashier,modulesForUser(cashier)).map(item=>item.id),['pos','orders','cash','customers']);
 const kitchen=user('cocina',['orders.view','kitchen.use']);assert.deepEqual(mobileModules(kitchen,modulesForUser(kitchen)).map(item=>item.id),['kitchen','settings']);
 const delivery=user('repartidor',['orders.view','delivery.use']);assert.deepEqual(mobileModules(delivery,modulesForUser(delivery)).map(item=>item.id),['delivery','settings']);
 assert.equal(firstAllowed(kitchen),'kitchen');
});
test('single transition rejects forbidden targets and never leaves or commits them',async()=>{
 let leaves=0,commits=0;const history=[];const result=await requestModuleNavigation({target:'users',allowed:['pos','settings'],current:'pos',history,leave:async()=>{leaves++;return true;},commit:()=>commits++,close:()=>{},persist:()=>{}});
 assert.equal(result,false);assert.equal(leaves,0);assert.equal(commits,0);assert.deepEqual(history,[]);
});
test('cancelled leave preserves module and approved transition records it once',async()=>{
 let current='pos',allowed=false;const history=[];const request=()=>requestModuleNavigation({target:'orders',allowed:['pos','orders'],current,history,leave:async()=>allowed,commit:value=>current=value,close:()=>{},persist:()=>{}});
 assert.equal(await request(),false);assert.equal(current,'pos');assert.deepEqual(history,[]);allowed=true;assert.equal(await request(),true);assert.equal(current,'orders');assert.deepEqual(history,['pos']);
 assert.equal(await requestModuleNavigation({target:'orders',allowed:['pos','orders'],current,history,leave:async()=>{throw Error('must not leave current')},commit:()=>{},close:()=>{},persist:()=>{}}),true);assert.deepEqual(history,['pos']);
});
test('back history skips duplicates, forbidden and unknown destinations',()=>{
 const history=['pos','users','orders','orders'];assert.equal(takeBackTarget(history,['pos','orders'],'orders'),'pos');assert.equal(takeBackTarget(history,['pos','orders'],'pos'),null);
});
test('grouped module sheet exposes current item and closes with Escape returning focus',async()=>{
 const admin=user('administrador',['*']);const groups=groupedModules(modulesForUser(admin));let navigated=null;
 function Harness(){const [open,setOpen]=useState(false);return React.createElement('div',null,React.createElement('button',{onClick:()=>setOpen(true)},'Más'),React.createElement(ModuleSheet,{open,groups,current:'pos',userName:'Ana',roleName:'Administración',onNavigate:value=>{navigated=value;},onLogout:()=>{},onClose:()=>setOpen(false)}));}
 const view=render(React.createElement(Harness));const trigger=view.getByRole('button',{name:'Más'});trigger.focus();fireEvent.click(trigger);const current=await waitFor(()=>view.getByRole('menuitem',{name:'Punto de venta, módulo actual'}));assert.equal(current.getAttribute('aria-selected'),'true');await waitFor(()=>assert.equal(document.activeElement,view.getByRole('button',{name:'Cerrar todos los módulos'})));fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>assert.equal(view.queryByRole('menu'),null));assert.equal(document.activeElement,trigger);assert.equal(navigated,null);
});
test('module sheet navigation reports the stable module id',async()=>{
 const allowed=modulesForUser(user('cajero',['pos.use','orders.view','inventory.view','cash.manage','customers.manage']));let target=null;const view=render(React.createElement(ModuleSheet,{open:true,groups:groupedModules(allowed),current:'dashboard',userName:'Caja',roleName:'Caja',onNavigate:value=>target=value,onLogout:()=>{},onClose:()=>{}}));fireEvent.click(view.getByRole('menuitem',{name:'Inventario'}));assert.equal(target,'inventory');
});
test('last module and query context remain isolated by api user and branch',()=>{
 const first={api:'https://one.test',user:7,branch:2};const anotherUser={...first,user:8};const anotherBranch={...first,branch:3};
 writeLastModule(first,'inventory');writeQueryContext(first,'inventory',{search:'harina',page:4});
 assert.equal(readLastModule(first),'inventory');assert.equal(readLastModule(anotherUser),null);assert.equal(readLastModule(anotherBranch),null);
 assert.deepEqual(readQueryContext(first,'inventory',{}),{search:'harina',page:4});assert.deepEqual(readQueryContext(anotherUser,'inventory',{search:'',page:1}),{search:'',page:1});
 clearNavigationScope(first);assert.equal(readLastModule(first),null);assert.deepEqual(readQueryContext(first,'inventory',{search:'',page:1}),{search:'',page:1});
});
test('approved navigation persists only the destination and closes temporary surfaces',async()=>{
 let persisted=null,closed=0,committed=0;const history=[];
 assert.equal(await requestModuleNavigation({target:'inventory',allowed:['pos','inventory'],current:'pos',history,leave:async()=>true,commit:target=>{committed++;assert.equal(target,'inventory');},close:()=>closed++,persist:target=>persisted=target}),true);
 assert.equal(committed,1);assert.equal(closed,1);assert.equal(persisted,'inventory');assert.deepEqual(history,['pos']);
});
