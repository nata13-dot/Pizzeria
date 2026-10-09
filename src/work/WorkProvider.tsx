import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type SetStateAction, type Dispatch } from 'react';
import { AppState, Platform } from 'react-native';
import { confirmAction } from '../components/ConfirmationDialog';
import { WorkStore, type Scope } from './store';

type Guard = { dirty: boolean; busy: boolean; label: string; memory: boolean };
class Workspace extends WorkStore {
  private releaseLock: (()=>void) | undefined;
  private lockGeneration=0;
  async open(scope:Scope|null) {
    const generation=++this.lockGeneration;
    await this.flush().catch(()=>{});
    if(generation!==this.lockGeneration)return;
    this.releaseLock?.();this.releaseLock=undefined;
    this.guards.clear();this.memoryDirty.clear();
    if(Platform.OS==='web' && scope){
      this.writable=false;
      if(typeof navigator!=='undefined' && navigator.locks){
        void navigator.locks.request(`pizzeria-work:${scope.api}:${scope.user}:${scope.branch}`,{ifAvailable:true},async lock=>{
          if(generation!==this.lockGeneration)return;
          this.writable=!!lock;this.emit();
          if(lock)await new Promise<void>(resolve=>{this.releaseLock=resolve;});
        }).catch(()=>{if(generation===this.lockGeneration){this.writable=false;this.notice='No pudimos habilitar la edición segura en este navegador. Reabre la aplicación en una sola pestaña.';this.emit();}});
      } else this.notice='Este navegador no permite coordinar ventas entre pestañas. Usa un navegador compatible para editar.';
    } else this.writable=true;
    await super.open(scope);
  }
  dispose(){this.lockGeneration++;this.releaseLock?.();this.releaseLock=undefined;}
  guards = new Map<string, Guard>();
  memoryDirty = new Set<string>();
  async leave(closing=false) {
    const guards=[...this.guards.values()];
    if(guards.some(g=>g.busy)) {await confirmAction('Espera a que termine el guardado antes de salir.', {title:'Guardado en curso',acceptLabel:'Entendido',cancelLabel:'Seguir aquí'});return false;}
    const lost=guards.filter(g=>g.dirty && (!g.memory || closing)).map(g=>g.label);
    if(closing) lost.push(...this.memoryDirty);
    if(lost.length && !await confirmAction(`Se perderán los cambios sin guardar de: ${[...new Set(lost)].join(', ')}.`,{title:'Salir sin guardar',acceptLabel:'Descartar cambios y salir',cancelLabel:'Seguir editando'})) return false;
    try {await this.flush();return true;} catch {await confirmAction("No pudimos conservar la venta. No cierres la aplicación; intenta nuevamente.",{title:"No pudimos guardar tu trabajo",acceptLabel:"Entendido",cancelLabel:"Seguir aquí"});return false;}
  }
}
const Context=createContext<Workspace|null>(null);
export function WorkProvider({children}:{children:ReactNode}) {
  const [store]=useState(()=>new Workspace(AsyncStorage));
  useEffect(()=>{
    const flush=()=>{void store.flush().catch(()=>{});};
    const sub=AppState.addEventListener('change',state=>{if(state!=='active')flush();});
    const before=(event:BeforeUnloadEvent)=>{if(store.unsaved || store.memoryDirty.size || [...store.guards.values()].some(g=>g.dirty||g.busy)){event.preventDefault();event.returnValue='';}flush();};
    if(Platform.OS==='web') window.addEventListener('beforeunload',before);
    return()=>{sub.remove();if(Platform.OS==='web')window.removeEventListener('beforeunload',before);void store.flush().catch(()=>{}).finally(()=>store.dispose());};
  },[store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useWork(){const store=useContext(Context);if(!store)throw new Error('WorkProvider requerido');useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot);return store;}
export function useWorkField<T>(section:string,field:string,initial:T|(()=>T)): [T,Dispatch<SetStateAction<T>>] {
  const store=useContext(Context);
  const [fallback,setFallback]=useState(initial);
  const original=useRef(fallback);
  useSyncExternalStore(store?.subscribe ?? (()=>()=>{}),store?.snapshot ?? (()=>0),store?.snapshot ?? (()=>0));
  const scope=store?.scope;
  return store ? [store.get(section,field,original.current),(next)=>{if(store.scope===scope)store.set(section,field,next,original.current);}] : [fallback,setFallback];
}
export function useWorkGuard(key:string,label:string,dirty:boolean,busy=false,memory=false){
  const store=useContext(Context);
  useEffect(()=>{if(!store)return;store.guards.set(key,{label,dirty,busy,memory});if(memory){if(dirty)store.memoryDirty.add(label);else store.memoryDirty.delete(label);}return()=>{store.guards.delete(key);};},[store,key,label,dirty,busy,memory]);
}
