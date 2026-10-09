import assert from 'node:assert/strict';
import test,{afterEach} from 'node:test';
import React,{useEffect,useState} from 'react';
import {JSDOM} from 'jsdom';
import {loadUi} from './testSupport/loadUi.mjs';
const dom=new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',{url:'http://localhost'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(globalThis,'navigator',{value:{userAgent:'test'},configurable:true});
let mediaListeners=0,systemDark=false,mediaChange=null;window.matchMedia=()=>({get matches(){return systemDark;},addEventListener:(_type,listener)=>{mediaListeners++;mediaChange=listener;},removeEventListener:(_type,listener)=>{mediaListeners--;if(mediaChange===listener)mediaChange=null;}});
const {render,fireEvent,cleanup,act}=await import('@testing-library/react');
const {createTheme,lightColors,darkColors,contrastRatio,statusBarStyle}=await import(await loadUi('theme/tokens.ts'));
const {ThemeProvider,ThemeToggle}=await import(await loadUi('theme/ThemeProvider.tsx'));
const {ThemedText}=await import(await loadUi('theme/ThemedText.tsx'));
const {ActionButton}=await import(await loadUi('components/ActionButton.tsx'));
const {FloatingTextInput}=await import(await loadUi('components/FloatingTextInput.tsx'));
const {Notice}=await import(await loadUi('components/Notice.tsx'));
const {ScreenMotion}=await import(await loadUi('motion/Motion.tsx'));
afterEach(()=>{cleanup();localStorage.clear();mediaListeners=0;mediaChange=null;systemDark=false;});

test('light and dark themes expose the same semantic contract and font scale',()=>{
 assert.deepEqual(Object.keys(lightColors).sort(),Object.keys(darkColors).sort());
 assert.deepEqual(Object.keys(createTheme('light').typography).sort(),Object.keys(createTheme('dark').typography).sort());
 assert.ok(Math.abs(createTheme('light','small').typography.body.fontSize-11.2)<1e-9);assert.ok(Math.abs(createTheme('light','large').typography.body.fontSize-16.8)<1e-9);
});
test('brand palette keeps the logo charcoal, white and red hierarchy',()=>{
 assert.equal(lightColors.text,'#171717');assert.equal(lightColors.surface,'#FFFFFF');assert.equal(lightColors.primary,'#E3262E');
 assert.equal(darkColors.background,'#090909');assert.equal(darkColors.text,'#F7F7F5');assert.equal(darkColors.primary,'#FF5A4F');
});
test('expressive shape and touch tokens stay consistent in both themes',()=>{
 for(const mode of ['light','dark']){const theme=createTheme(mode);assert.equal(theme.control.minTouch,48);assert.equal(theme.radius.control,14);assert.equal(theme.radius.card,20);assert.equal(theme.radius.section,24);assert.equal(theme.radius.modal,28);assert.ok(theme.radius.pill>theme.radius.modal);assert.ok(Number(theme.typography.title.lineHeight)>Number(theme.typography.title.fontSize));}
});
test('semantic text pairs meet normal-text contrast in both themes',()=>{
 assert.equal(contrastRatio('#000000','#FFFFFF'),21);assert.equal(contrastRatio('#777777','#777777'),1);assert.ok(Math.abs(contrastRatio('#777777','#FFFFFF')-4.478089453577214)<1e-12);
 for(const mode of ['light','dark']){const c=createTheme(mode).colors;for(const [fg,bg] of [[c.text,c.background],[c.text,c.surface],[c.textMuted,c.surface],[c.textSubtle,c.surfaceRaised],[c.textInverse,c.surfaceInverse],[c.textInverseMuted,c.surfaceInverse],[c.primaryText,c.primary],[c.dangerText,c.dangerSurface],[c.warningText,c.warningSurface],[c.successText,c.successSurface],[c.infoText,c.infoSurface],[c.primaryText,c.danger],[c.primaryText,c.warning],[c.primaryText,c.success]])assert.ok(contrastRatio(fg,bg)>=4.5,`${mode} ${fg}/${bg}`);}
});
test('provider restores and toggles the existing web preference with one system listener',()=>{
 localStorage.setItem('pizzeria-color-theme','dark');const view=render(React.createElement(ThemeProvider,null,React.createElement(ThemeToggle)));assert.equal(document.documentElement.style.colorScheme,'dark');assert.equal(mediaListeners,1);fireEvent.click(view.getByRole('button',{name:'Activar modo claro'}));assert.equal(localStorage.getItem('pizzeria-color-theme'),'light');assert.equal(document.documentElement.style.colorScheme,'light');assert.equal(mediaListeners,1);systemDark=true;act(()=>mediaChange?.({matches:true}));assert.equal(document.documentElement.style.colorScheme,'light');cleanup();assert.equal(mediaListeners,0);
});
test('system theme applies only without an explicit preference and the native status bar contract follows the resolved mode',()=>{
 const view=render(React.createElement(ThemeProvider,null,React.createElement(ThemeToggle)));assert.equal(document.documentElement.style.colorScheme,'light');systemDark=true;act(()=>mediaChange?.({matches:true}));assert.equal(document.documentElement.style.colorScheme,'dark');assert.equal(statusBarStyle('dark'),'light');assert.equal(statusBarStyle('light'),'dark');assert.equal(view.getByRole('button').getAttribute('aria-label'),'Activar modo claro');
});
test('theme changes preserve mounted state and do not request data',()=>{
 let mounts=0,requests=0;const previousFetch=globalThis.fetch;globalThis.fetch=async()=>{requests++;throw new Error('unexpected request');};function Stateful(){const [value,setValue]=useState(0);useEffect(()=>{mounts++;},[]);return React.createElement('button',{onClick:()=>setValue(current=>current+1)},`Estado ${value}`);}const view=render(React.createElement(ThemeProvider,null,React.createElement(ThemeToggle),React.createElement(Stateful)));fireEvent.click(view.getByRole('button',{name:'Estado 0'}));fireEvent.click(view.getByRole('button',{name:'Activar modo oscuro'}));assert.ok(view.getByRole('button',{name:'Estado 1'}));assert.equal(mounts,1);assert.equal(requests,0);globalThis.fetch=previousFetch;
});
test('screen motion preserves mounted state while the route changes',()=>{
 let mounts=0;function Stateful(){const [value,setValue]=useState(0);useEffect(()=>{mounts++;},[]);return React.createElement('button',{onClick:()=>setValue(current=>current+1)},`Contenido ${value}`);}const view=render(React.createElement(ScreenMotion,{route:'dashboard'},React.createElement(Stateful)));fireEvent.click(view.getByRole('button',{name:'Contenido 0'}));view.rerender(React.createElement(ScreenMotion,{route:'orders'},React.createElement(Stateful)));assert.ok(view.getByRole('button',{name:'Contenido 1'}));assert.equal(mounts,1);
});
test('browser motion rules cover controls and reduced-motion preference',()=>{
 render(React.createElement(ThemeProvider,null,React.createElement(ActionButton,{label:'Continuar',onPress:()=>{}})));const css=document.getElementById('pizzeria-theme-browser-rules')?.textContent??'';assert.match(css,/role="tab"/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/scale:\.97/);
});
test('large themed glyphs do not inherit the body line height',()=>{
 const view=render(React.createElement(ThemeProvider,null,React.createElement(ThemedText,{style:{fontSize:60}},'🍕')));const glyph=view.getByText('🍕');assert.equal(glyph.style.fontSize,'60px');assert.equal(glyph.style.lineHeight,'');
});
test('shared controls resolve semantic light and dark presentation',()=>{
 let view=render(React.createElement(ThemeProvider,null,React.createElement(ActionButton,{label:'Guardar',onPress:()=>{}}),React.createElement(FloatingTextInput,{label:'Nombre',error:'Requerido'}),React.createElement(Notice,{kind:'warning',message:'Revisa'})));const save=view.getByRole('button',{name:'Guardar'});assert.equal(save.style.backgroundColor,'rgb(227, 38, 46)');fireEvent.focus(save);assert.equal(save.style.borderColor,'rgb(255, 255, 255)');assert.equal(view.getByRole('alert').textContent.includes('Error: Requerido'),true);cleanup();localStorage.setItem('pizzeria-color-theme','dark');view=render(React.createElement(ThemeProvider,null,React.createElement(ActionButton,{label:'Guardar',onPress:()=>{}}),React.createElement(Notice,{kind:'error',message:'Falló'})));assert.equal(view.getByRole('button',{name:'Guardar'}).style.backgroundColor,'rgb(255, 90, 79)');assert.equal(view.getByRole('alert').style.backgroundColor,'rgb(72, 31, 33)');assert.equal(view.getByRole('alert').querySelectorAll('span')[0].style.color,'rgb(255, 185, 180)');
});
test('theme implementation has no DOM recoloring traversal',async()=>{
 const source=await (await import('node:fs/promises')).readFile(new URL('./theme/ThemeProvider.tsx',import.meta.url),'utf8');for(const forbidden of ['MutationObserver','getComputedStyle','querySelectorAll','data-pizzeria-bg','data-pizzeria-fg'])assert.doesNotMatch(source,new RegExp(forbidden));
});
