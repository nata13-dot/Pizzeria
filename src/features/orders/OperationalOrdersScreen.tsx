import { ActionButton } from "../../components/ActionButton";
import {ThemedText} from "../../theme/ThemedText";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { api } from "../../api";
import { cachedApi } from "../../apiCache";
import { ordersChannel } from "../../realtime";
import { coalescedReloadDelay, operationalPollInterval } from "../../refreshPolicy";
import { useAppStyles } from "../../styles/appStyles";
import { DeliveryBoard } from "../delivery/DeliveryBoard";
import { KitchenBoard } from "../kitchen/KitchenBoard";
import type { Order, OrderStatus } from "./types";
import {useTheme} from "../../theme/ThemeProvider";

export function OperationalOrdersScreen({mode,token,branchId}:{mode:"kitchen"|"delivery";token:string;branchId:number}) {
  const s=useAppStyles();
  const {theme}=useTheme();
  const [data,setData]=useState<Order[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(true);
  const requestId=useRef(0);
  const inFlight=useRef<Promise<void>|null>(null);
  const inFlightSource=useRef("");
  const lastLoadAt=useRef(0);
  const endpoint=mode==="kitchen"?"/kitchen/orders":"/delivery/orders";
  const source=`${mode}\0${endpoint}\0${token}`;
  const sourceRef=useRef(source);sourceRef.current=source;
  async function load(showSpinner=true):Promise<void>{
    if(inFlight.current){const pending=inFlight.current;const pendingSource=inFlightSource.current;await pending;return pendingSource===source?undefined:load(showSpinner);}
    const operation=(async()=>{const current=++requestId.current;const requestSource=source;if(showSpinner)setBusy(true);setError("");try{const response:any=await cachedApi(endpoint,token,{forceRefresh:!showSpinner,ttlMs:8_000});if(current===requestId.current&&requestSource===sourceRef.current)setData(response.data??(Array.isArray(response)?response:[response]));}catch(caught){if(current===requestId.current&&requestSource===sourceRef.current)setError((caught as Error).message);}finally{if(current===requestId.current&&requestSource===sourceRef.current)setBusy(false);}})();
    inFlightSource.current=source;
    inFlight.current=operation;try{await operation;lastLoadAt.current=Date.now();}finally{if(inFlight.current===operation)inFlight.current=null;}
  }
  useEffect(()=>{void load();return()=>{requestId.current+=1;}},[mode,token]);
  useEffect(()=>{let connected=false;let background=AppState.currentState!=="active";let poll:ReturnType<typeof setTimeout>;let coalesce:ReturnType<typeof setTimeout>|undefined;const schedule=()=>{clearTimeout(poll);poll=setTimeout(async()=>{if(!background)await load(false);schedule();},operationalPollInterval(connected,!background));};const reload=()=>{clearTimeout(coalesce);coalesce=setTimeout(()=>{if(!background)void load(false);},coalescedReloadDelay(lastLoadAt.current));};const leave=ordersChannel(token,branchId,reload,value=>{connected=value;schedule();});const subscription=AppState.addEventListener("change",state=>{background=state!=="active";if(!background)reload();schedule();});schedule();return()=>{clearTimeout(poll);clearTimeout(coalesce);subscription.remove();leave();};},[mode,token,branchId]);
  async function action(order:Order,status:OrderStatus){setError("");try{await api(`/orders/${order.id}/status`,token,{method:"POST",body:JSON.stringify({status})});await load(false);return true;}catch(caught){setError((caught as Error).message);return false;}}
  if(busy)return <ActivityIndicator color={theme.colors.primary} style={{margin:40}}/>;
  if(error&&!data.length)return <View style={s.warningBox}><ThemedText style={s.error}>{error}</ThemedText><ActionButton label="Reintentar" variant="secondary" onPress={()=>load()} /></View>;
  return <View>{!!error&&<ThemedText style={s.error}>{error}</ThemedText>}{mode==="kitchen"?<KitchenBoard orders={data} token={token} onAction={action}/>:<DeliveryBoard orders={data} token={token} onAction={action} onReload={()=>load(false)}/>}</View>;
}
