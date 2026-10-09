import {ThemedText} from "../../theme/ThemedText";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { cachedApi } from "../../apiCache";
import { useAppStyles } from "../../styles/appStyles";
import { ProductsView } from "./ProductsView";
import {useTheme} from "../../theme/ThemeProvider";

export function ProductsScreen({token,isAdministrator}:{token:string;isAdministrator:boolean}){
  const s=useAppStyles();
  const {theme}=useTheme();
  const [data,setData]=useState<any[]>([]);const [error,setError]=useState("");const [busy,setBusy]=useState(true);const requestId=useRef(0);const inFlight=useRef<Promise<void>|null>(null);const inFlightToken=useRef("");const tokenRef=useRef(token);tokenRef.current=token;
  async function load(showSpinner=true):Promise<void>{if(inFlight.current){const pending=inFlight.current;const pendingToken=inFlightToken.current;await pending;return pendingToken===token?undefined:load(showSpinner);}const operation=(async()=>{const current=++requestId.current;const requestToken=token;if(showSpinner)setBusy(true);setError("");try{const response:any=await cachedApi("/products",token,{forceRefresh:!showSpinner});if(current===requestId.current&&requestToken===tokenRef.current)setData(response.data??(Array.isArray(response)?response:[response]));}catch(caught){if(current===requestId.current&&requestToken===tokenRef.current)setError((caught as Error).message);}finally{if(current===requestId.current&&requestToken===tokenRef.current)setBusy(false);}})();inFlight.current=operation;inFlightToken.current=token;try{await operation;}finally{if(inFlight.current===operation)inFlight.current=null;}}
  useEffect(()=>{void load();return()=>{requestId.current+=1;}},[token]);
  if(busy)return <ActivityIndicator color={theme.colors.primary} style={{margin:40}}/>;
  if(error&&!data.length)return <View style={s.warningBox}><ThemedText style={s.error}>{error}</ThemedText><Pressable style={s.secondaryButton} onPress={()=>load()}><ThemedText style={s.secondaryText}>Reintentar</ThemedText></Pressable></View>;
  return <View>{!!error&&<ThemedText style={s.error}>{error}</ThemedText>}<ProductsView data={data} token={token} onSaved={load} canConfigure={isAdministrator}/></View>;
}
