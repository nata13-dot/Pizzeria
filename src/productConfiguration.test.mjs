import assert from 'node:assert/strict';
import test from 'node:test';
import {loadUi} from './testSupport/loadUi.mjs';
const {resolveProductSave}=await import(await loadUi('productConfiguration.ts'));
const attempt=Object.freeze({productId:4,key:'product-save-test',body:JSON.stringify({operation_key:'product-save-test',flavors:[{name:'Nuevo'}]})});

test('lost product save response is checked before replay and never duplicates an acknowledged save',async()=>{
 let writes=0,reads=0;
 globalThis.__p0Api=async(path,token,options)=>{
   if(options.method==='PUT'){writes++;throw new Error('Response lost');}
   reads++;assert.equal(options.cache,'reload');return {operation:{id:5}};
 };
 await assert.rejects(()=>resolveProductSave(attempt,'t',false));
 assert.equal(writes,1);assert.equal(reads,0);
 assert.equal(await resolveProductSave(attempt,'t',true),true);
 assert.equal(writes,1);assert.equal(reads,1);
});
test('an in-transit product save retains the exact body and key on explicit retry',async()=>{
 const calls=[];
 globalThis.__p0Api=async(path,token,options)=>{calls.push({path,...options});return options.method==='PUT'?{saved:true}:{operation:null};};
 assert.equal(await resolveProductSave(attempt,'t',true),false);
 assert.equal(calls.length,2);assert.ok(calls[0].path.endsWith('key=product-save-test'));
 assert.equal(calls[1].method,'PUT');assert.equal(calls[1].body,attempt.body);
});
