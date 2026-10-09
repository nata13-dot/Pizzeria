import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkStore, MAX_AGE, validFields } from './work/store.ts';
const scope={api:'https://test/api',user:1,branch:1};
function fixture(){const values=new Map();const calls=[];return {values,calls,storage:{getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{calls.push(k);values.set(k,v);},removeItem:async k=>{values.delete(k);}}};}
const line={key:'line',kind:'product',variantId:1,name:'Pizza',quantity:2,flavorIds:[1],modifierIds:[],notes:'Sin sal',unitPrice:55,flavorNames:['Queso'],modifierNames:[]};
test('navigation retains cart, customer and delivery; restart recovers only allowed fields',async()=>{
 const f=fixture(),s=new WorkStore(f.storage);await s.open(scope);
 for(const [key,value] of Object.entries({cart:[line],customerId:25,addressId:4,pickup:false,recipient:'Ana',phone:'123',address:'Centro',zone:'Centro',notes:'Tocar',scheduledAt:'2099-01-01 12:00',payment:'transfer',cashAmount:'10'}))s.set('pos',key,value,null);
 s.set('recipe','items',[{ingredient_id:105}],[]);s.set('purchase','lines',[{id:2}],[]);
 assert.equal(s.get('pos','cart',[])[0].quantity,2);assert.equal(s.get('pos','customerId',null),25);
 await s.flush();const restored=new WorkStore(f.storage);await restored.open(scope);
 assert.equal(restored.get('pos','address',''),'Centro');assert.equal(restored.get('pos','cart',[])[0].unitPrice,undefined);
 assert.equal(restored.get('pos','payment',''),'');assert.equal(restored.get('recipe','items',null),null);
 assert.equal(restored.get('pos','customerId',null),25);
});
test('logout preserves only owner and branch; API environment is isolated',async()=>{
 const f=fixture(),s=new WorkStore(f.storage);await s.open(scope);s.set('pos','cart',[line],[]);await s.flush();
 for(const other of [{...scope,user:2},{...scope,branch:2},{...scope,api:'other'}]){await s.open(other);assert.deepEqual(s.get('pos','cart',[]),[]);}
 await s.open(scope);assert.equal(s.get('pos','cart',[]).length,1);
});
test('discard and success cannot be undone by an older queued write',async()=>{
 const f=fixture(),s=new WorkStore(f.storage);await s.open(scope);s.set('pos','cart',[line],[]);const first=s.flush();await s.clearPos();await first;
 const restored=new WorkStore(f.storage);await restored.open(scope);assert.deepEqual(restored.get('pos','cart',[]),[]);assert.equal(f.values.size,0);
});
test('unresolved operation survives expiry without retaining contact information on next write',async()=>{
 const f=fixture(),s=new WorkStore(f.storage);await s.open(scope);s.set('pos','cart',[line],[]);s.set('pos','phone','123','');await s.mark({key:'pos-pending'});
 const key=[...f.values.keys()][0];const value=JSON.parse(f.values.get(key));value.updatedAt=Date.now()-MAX_AGE-1;f.values.set(key,JSON.stringify(value));
 const restored=new WorkStore(f.storage);await restored.open(scope);assert.equal(restored.operation.key,'pos-pending');assert.deepEqual(restored.get('pos','cart',[]),[]);await restored.flush();assert.deepEqual(JSON.parse(f.values.get(key)).fields,{});
});
test('corrupt/old draft and malformed items do not crash or restore',async()=>{
 assert.equal(validFields({cart:[{...line,quantity:-1}]}),false);assert.equal(validFields({token:'secret'}),false);
 for(const raw of ['bad JSON',JSON.stringify({version:0}),JSON.stringify({version:1,...scope,updatedAt:Date.now(),fields:{cart:[{...line,variantId:'bad'}]}})]){
 const f=fixture(),s=new WorkStore(f.storage);await s.open(scope);s.set('pos','cart',[line],[]);await s.flush();f.values.set([...f.values.keys()][0],raw);const next=new WorkStore(f.storage);await next.open(scope);assert.equal(next.ready,true);assert.deepEqual(next.get('pos','cart',[]),[]);
 }
});
test('failed write refuses durable operation; reattempt preserves the same key',async()=>{
 const s=new WorkStore({getItem:async()=>null,setItem:async()=>{throw new Error('disk');},removeItem:async()=>{}});await s.open(scope);
 await assert.rejects(s.mark({key:'pos-pending'}));assert.equal(s.operation.key,'pos-pending');assert.equal(s.unsaved,true);
});
test('burst edits schedule one storage write; explicit flush cancels timer',async()=>{
 const f=fixture(),s=new WorkStore(f.storage);await s.open(scope);for(let i=0;i<20;i++)s.set('pos','notes',String(i),'');await s.flush();assert.equal(f.calls.length,1);
});
test('hydration failure does not enable a second sale over unknown data',async()=>{
 const s=new WorkStore({getItem:async()=>{throw new Error('disk');},setItem:async()=>{},removeItem:async()=>{}});await s.open(scope);assert.equal(s.ready,false);assert.ok(s.notice);
});
test('null selection really clears earlier defaults',async()=>{const f=fixture(),s=new WorkStore(f.storage);await s.open(scope);s.set('recipe','selected',null,5);assert.equal(s.get('recipe','selected',5),null);});
test('failed discard retains editable data and failed completion retains operation tracking',async()=>{
 const f=fixture(),s=new WorkStore(f.storage);await s.open(scope);s.set('pos','cart',[line],[]);await s.flush();
 f.storage.removeItem=async()=>{throw new Error('disk');};await assert.rejects(s.clearPos());assert.equal(s.get('pos','cart',[]).length,1);
 await s.mark({key:'pos-pending'});f.storage.setItem=async()=>{throw new Error('disk');};await assert.rejects(s.mark(null));assert.equal(s.operation.key,'pos-pending');
});
