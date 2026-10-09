import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { readQueryContext, writeQueryContext, type NavigationScope } from "./sessionState";

const ScopeContext=createContext<NavigationScope|null>(null);
export function NavigationScopeProvider({scope,children}:{scope:NavigationScope;children:ReactNode}){const value=useMemo(()=>scope,[scope.api,scope.user,scope.branch]);return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;}
export function useNavigationField<T>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>]{
  const scope=useContext(ScopeContext);
  const identity=scope?`${scope.api}\0${scope.user}\0${scope.branch}`:"local";
  const [state,setState]=useState(()=>scope?readQueryContext(scope,key,initial):initial);
  useEffect(()=>setState(scope?readQueryContext(scope,key,initial):initial),[identity,key]);
  const set:Dispatch<SetStateAction<T>>=(next)=>setState(current=>{const value=typeof next==="function"?(next as (value:T)=>T)(current):next;if(scope)writeQueryContext(scope,key,value);return value;});
  return [state,set];
}
