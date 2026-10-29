import { ActionButton } from "../../components/ActionButton";
import {ThemedText} from "../../theme/ThemedText";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from "react-native";
import { api } from "../../api";
import type { Screen } from "../../navigation/modules";
import { useAppStyles } from "../../styles/appStyles";
import {useTheme} from "../../theme/ThemeProvider";
import { IconBadge, type IconTone } from "../../components/IconBadge";
export function DashboardScreen({token,onNavigate}:{token:string;onNavigate:(screen:Screen)=>void}) {
  const s=useAppStyles();
  const {theme}=useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 780;
  type CashDashboard = { gross_sales?: number };
  type OrderDashboard = { total?: number; data?: unknown[] };
  type AlertDashboard = { type: string };
  const [values,setValues]=useState<number[] | null>(null);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;setError("");Promise.all([api<CashDashboard>("/reports/cash-day",token),api<OrderDashboard>("/orders?status=kitchen_pending",token),api<AlertDashboard[]>("/inventory/alerts",token)]).then(([cash,orders,alerts])=>{if(active)setValues([cash.gross_sales??0,orders.total??orders.data?.length??0,alerts.filter((alert)=>alert.type.includes("stock")).length,alerts.filter((alert)=>["expiring","expired"].includes(alert.type)).length])}).catch((loadError)=>{if(active){setValues(null);setError((loadError as Error).message)}});return()=>{active=false}},[token,revision]);
  if(error)return <View style={s.warningBox}><ThemedText style={s.error}>No se pudo cargar el resumen: {error}</ThemedText><ActionButton label="Reintentar" variant="secondary" onPress={()=>setRevision((value)=>value+1)} /></View>;
  if(!values)return <ActivityIndicator color={theme.colors.primary} style={{margin:40}}/>;
  return (
    <View style={[s.metrics, compact && s.metricsCompact]}>
      {([{label:"Ventas de hoy",icon:"$",tone:"success",screen:"cash" as Screen},{label:"Pedidos activos",icon:"≡",tone:"info",screen:"orders" as Screen},{label:"Stock bajo",icon:"!",tone:"warning",screen:"inventory" as Screen},{label:"Por caducar",icon:"⌛",tone:"danger",screen:"inventory" as Screen}] satisfies {label:string;icon:string;tone:IconTone;screen:Screen}[]).map(
        (item,i) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${item.label}`} onPress={() => onNavigate(item.screen)} style={({pressed}) => [s.metric, compact && s.metricCompact, pressed && s.metricPressed]} key={item.label}>
            <IconBadge glyph={item.icon} tone={item.tone}/>
            <View><ThemedText style={[s.number, compact && s.numberCompact]}>{i===0?'$':''}{values[i]}</ThemedText>
            <ThemedText style={s.metricLabel}>{item.label}</ThemedText></View>
            <ThemedText style={s.metricLink}>Ver detalle →</ThemedText>
          </Pressable>
        ),
      )}
    </View>
  );
}
