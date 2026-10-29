import {ThemedText} from "../../theme/ThemedText";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View, useWindowDimensions } from "react-native";
import { api } from "../../api";
import { loadErrorMessage } from "../../loadState";
import type { Screen } from "../../navigation/modules";
import { useAppStyles } from "../../styles/appStyles";
import {useTheme} from "../../theme/ThemeProvider";
import { IconBadge, type IconTone } from "../../components/IconBadge";

type Metric = { key: string; label: string; icon: string; tone: IconTone; screen: Screen; source: string; read: (data: never) => number; money?: boolean };
type CashDashboard = { gross_sales?: number };
type OrderDashboard = { total?: number; data?: unknown[] };
type InventorySummary = { critical?: number; out?: number; expiring?: number };
type Value = { value?: number; error?: string; loading: boolean };

const metrics: Metric[] = [
  { key: "sales", label: "Ventas de hoy", icon: "$", tone: "success", screen: "cash", source: "/reports/cash-day", read: ((data: CashDashboard) => data.gross_sales ?? 0) as Metric["read"], money: true },
  { key: "kitchen", label: "En cocina", icon: "≡", tone: "info", screen: "orders", source: "/orders?status=kitchen_pending", read: ((data: OrderDashboard) => data.total ?? data.data?.length ?? 0) as Metric["read"] },
  { key: "stock", label: "Agotados o urgentes", icon: "!", tone: "warning", screen: "inventory", source: "/inventory/summary", read: ((data: InventorySummary) => (data.critical ?? 0) + (data.out ?? 0)) as Metric["read"] },
  { key: "expiring", label: "Por caducar", icon: "⌛", tone: "danger", screen: "inventory", source: "/inventory/summary", read: ((data: InventorySummary) => data.expiring ?? 0) as Metric["read"] },
];
const sectionNames: Record<string, string> = { sales: "las ventas de hoy", kitchen: "los pedidos en cocina", stock: "el inventario", expiring: "las caducidades" };

/** Each figure loads on its own, so one failing source never hides the others. */
export function DashboardScreen({token,onNavigate}:{token:string;onNavigate:(screen:Screen)=>void}) {
  const s=useAppStyles();
  const {theme}=useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 780;
  const [values,setValues]=useState<Record<string, Value>>({});
  const live=useRef(true);

  function loadSource(source:string){
    const owned=metrics.filter((metric)=>metric.source===source);
    const set=(next:(metric:Metric)=>Value)=>{if(live.current)setValues((current)=>({...current,...Object.fromEntries(owned.map((metric)=>[metric.key,next(metric)]))}));};
    set(()=>({loading:true}));
    api<never>(source,token,{cache:"reload"}).then((data)=>set((metric)=>({value:metric.read(data),loading:false}))).catch((error)=>set((metric)=>({loading:false,error:loadErrorMessage(sectionNames[metric.key],error)})));
  }
  useEffect(()=>{
    live.current=true;
    [...new Set(metrics.map((metric)=>metric.source))].forEach(loadSource);
    return()=>{live.current=false};
  },[token]);

  return (
    <View style={[s.metrics, compact && s.metricsCompact]}>
      {metrics.map((metric) => {
        const state = values[metric.key] ?? { loading: true };
        return <Pressable accessibilityRole="button" accessibilityLabel={state.error ? `Reintentar ${metric.label}` : `Abrir ${metric.label}`} onPress={() => state.error ? loadSource(metric.source) : onNavigate(metric.screen)} style={({pressed}) => [s.metric, compact && s.metricCompact, pressed && s.metricPressed]} key={metric.key}>
          <IconBadge glyph={metric.icon} tone={metric.tone}/>
          <View style={{flex:1,minWidth:0}}>
            {state.loading ? <ActivityIndicator color={theme.colors.primary}/> : state.error ? <ThemedText style={s.muted}>{state.error}</ThemedText> : <ThemedText style={[s.number, compact && s.numberCompact]}>{metric.money?"$":""}{metric.money?Number(state.value).toFixed(2):state.value}</ThemedText>}
            <ThemedText style={s.metricLabel}>{metric.label}</ThemedText>
          </View>
          <ThemedText style={s.metricLink}>{state.error ? "Reintentar" : "Ver detalle →"}</ThemedText>
        </Pressable>;
      })}
    </View>
  );
}
