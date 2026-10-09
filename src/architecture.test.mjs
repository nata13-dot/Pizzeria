import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {dirname,extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {appModules} from './navigation/modules.ts';
import {screenComposition} from './navigation/screenComposition.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('the fourteen allowed module ids have one active composition target',()=>{
 assert.deepEqual(Object.keys(screenComposition).sort(),appModules.map(item=>item.id).sort());
 assert.equal(screenComposition.pos,'pos');assert.equal(screenComposition.customers,'customers');assert.equal(screenComposition.users,'users');assert.equal(screenComposition.settings,'settings');
 assert.equal(screenComposition.kitchen,'operational');assert.equal(screenComposition.delivery,'operational');
});
test('App is composition only and confirmed legacy screens are gone',async()=>{
 const entry=await readFile(join(root,'App.tsx'),'utf8');const source=await readFile(join(root,'src/shell/PizzeriaApp.tsx'),'utf8');
 for(const symbol of ['DataScreen','function Pos(','function ProductCard(','CustomersView','UsersView','AdministrationView'])assert.doesNotMatch(source,new RegExp(symbol.replace(/[()]/g,'\\$&')));
 assert.match(entry,/PizzeriaApp/);assert.match(source,/ScreenContent/);assert.match(source,/requestModuleNavigation/);
});
test('features never import App and the composition graph cannot return to App',async()=>{
 const files=[];async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isDirectory())await walk(path);else if(['.ts','.tsx'].includes(extname(path)))files.push(path);}}await walk(join(root,'src'));files.push(join(root,'App.tsx'));
 const graph=new Map();for(const file of files){const source=await readFile(file,'utf8');const deps=[];for(const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)){const base=resolve(dirname(file),match[1]);const target=files.find(candidate=>candidate===base||candidate===`${base}.ts`||candidate===`${base}.tsx`);if(target)deps.push(target);}graph.set(file,deps);if(file.includes(`${join(root,'src','features')}`))assert.ok(!deps.includes(join(root,'App.tsx')),`${file} imports App.tsx`);}
 const app=join(root,'App.tsx');const seen=new Set();function visit(file){if(seen.has(file))return;seen.add(file);for(const dep of graph.get(file)??[]){assert.notEqual(dep,app,`${file} returns to App.tsx`);visit(dep);}}for(const dep of graph.get(app)??[])visit(dep);
});
test('operational extraction retains realtime polling cleanup and shared documents',async()=>{
 const operational=await readFile(join(root,'src/features/orders/OperationalOrdersScreen.tsx'),'utf8');const documents=await readFile(join(root,'src/features/orders/shared.tsx'),'utf8');
 for(const token of ['ordersChannel','operationalPollInterval','coalescedReloadDelay','subscription.remove()','leave()'])assert.match(operational,new RegExp(token.replace(/[()]/g,'\\$&')));
 assert.match(documents,/generate-document/);assert.match(documents,/printThermalHtml/);
});
