import assert from 'node:assert/strict';
import test, {afterEach} from 'node:test';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {JSDOM} from 'jsdom';
import {loadUi} from './testSupport/loadUi.mjs';

const dom=new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',{url:'http://localhost'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.Event=dom.window.Event;globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__DEV__=false;globalThis.__testWidth=390;globalThis.__realFields=true;
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'test'},configurable:true});
window.matchMedia=()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}});

const {render,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
const {ThemeProvider}=await import(await loadUi('theme/ThemeProvider.tsx'));
const {Login}=await import(await loadUi('shell/Login.tsx'));

afterEach(()=>{cleanup();document.getElementById('pizzeria-login-form')?.remove();});

test('login exposes password-manager fields and Enter advances then submits once',async()=>{
  const calls=[];let authenticated=null;
  globalThis.__p0Api=async(path,_token,options)=>{calls.push({path,options});return {token:'t',user:{id:1,name:'Admin',branch_id:1,permissions:['*'],role:{name:'Administrador',slug:'admin'}}};};
  const view=render(React.createElement(ThemeProvider,null,React.createElement(Login,{onLogin:(session,remember)=>{authenticated={session,remember};}})));
  const username=view.getByLabelText('Correo o usuario');const password=view.getByLabelText('Contraseña');
  const form=document.getElementById('pizzeria-login-form');
  assert.equal(form?.getAttribute('autocomplete'),'on');assert.equal(username.getAttribute('autocomplete'),'username');assert.equal(password.getAttribute('autocomplete'),'current-password');assert.equal(username.getAttribute('name'),'username');assert.equal(password.getAttribute('name'),'password');
  fireEvent.change(username,{target:{value:'admin'}});fireEvent.keyDown(username,{key:'Enter',code:'Enter'});assert.equal(document.activeElement,password);
  fireEvent.change(password,{target:{value:'secreto'}});fireEvent.keyDown(password,{key:'Enter',code:'Enter'});
  await waitFor(()=>assert.equal(calls.length,1));assert.equal(calls[0].path,'/login');assert.deepEqual(JSON.parse(calls[0].options.body),{login:'admin',password:'secreto',device_name:'web'});assert.equal(authenticated?.remember,true);
});

test('login keeps keyboard resize contracts on React Native and Android',async()=>{
  const source=await readFile(new URL('./shell/Login.tsx',import.meta.url),'utf8');
  const manifest=await readFile(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
  assert.match(source,/KeyboardAvoidingView/);assert.match(source,/keyboardShouldPersistTaps="handled"/);assert.match(source,/automaticallyAdjustKeyboardInsets/);assert.match(manifest,/android:windowSoftInputMode="adjustResize"/);
});
