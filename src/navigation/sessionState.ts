import { Platform } from "react-native";
import type { Screen } from "./modules";

export type NavigationScope={api:string;user:number;branch:number};
const memory=new Map<string,string>();
export const scopeKey=(scope:NavigationScope)=>`${scope.api}\0${scope.user}\0${scope.branch}`;
const storageKey=(scope:NavigationScope)=>`pizzeria.navigation:${scopeKey(scope)}`;
export function readLastModule(scope:NavigationScope):string|null { try{return Platform.OS==="web"?globalThis.sessionStorage?.getItem(storageKey(scope))??null:memory.get(storageKey(scope))??null;}catch{return null;} }
export function writeLastModule(scope:NavigationScope,screen:Screen){try{if(Platform.OS==="web")globalThis.sessionStorage?.setItem(storageKey(scope),screen);else memory.set(storageKey(scope),screen);}catch{}}
export function clearNavigationScope(scope:NavigationScope){try{if(Platform.OS==="web")globalThis.sessionStorage?.removeItem(storageKey(scope));else memory.delete(storageKey(scope));}catch{} queryMemory.delete(scopeKey(scope));}

const queryMemory=new Map<string,Map<string,unknown>>();
export function readQueryContext<T>(scope:NavigationScope,key:string,fallback:T):T{return (queryMemory.get(scopeKey(scope))?.get(key) as T|undefined)??fallback;}
export function writeQueryContext<T>(scope:NavigationScope,key:string,value:T){const scoped=queryMemory.get(scopeKey(scope))??new Map<string,unknown>();scoped.set(key,value);queryMemory.set(scopeKey(scope),scoped);}
