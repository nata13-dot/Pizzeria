import type { Screen } from "./modules";
export type NavigationRequest={target:Screen;allowed:Screen[];current:Screen;history:Screen[];leave:()=>Promise<boolean>;commit:(screen:Screen)=>void;close:()=>void;persist:(screen:Screen)=>void;recordHistory?:boolean};
export async function requestModuleNavigation(request:NavigationRequest):Promise<boolean>{
  if(!request.allowed.includes(request.target))return false;
  if(request.target===request.current){request.close();return true;}
  if(!await request.leave())return false;
  if(request.recordHistory!==false&&request.history.at(-1)!==request.current)request.history.push(request.current);
  request.commit(request.target);request.close();request.persist(request.target);return true;
}
export function takeBackTarget(history:Screen[],allowed:Screen[],current:Screen):Screen|null{
  while(history.length){const candidate=history.pop();if(candidate&&candidate!==current&&allowed.includes(candidate))return candidate;}return null;
}
