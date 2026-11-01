import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ThemedText } from "../../theme/ThemedText";
import { useThemedStyles } from "../../theme/ThemeProvider";
import type { Theme } from "../../theme/tokens";

export const money = (value: number) => `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function Card({ title, subtitle, action, children, style }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useDashboardStyles();
  return <View style={[styles.card, style]}>
    <View style={styles.cardHeader}>
      <View style={styles.cardTitleBlock}><ThemedText style={styles.cardTitle}>{title}</ThemedText>{!!subtitle && <ThemedText style={styles.muted}>{subtitle}</ThemedText>}</View>
      {action}
    </View>
    {children}
  </View>;
}

/** Headline number with an optional trend line; the trend carries an arrow and words, never color alone. */
export function Kpi({ label, value, detail, trend, onPress }: { label: string; value: string; detail?: string; trend?: { text: string; tone: "good" | "bad" | "neutral" }; onPress?: () => void }) {
  const styles = useDashboardStyles();
  const body = <>
    <ThemedText style={styles.kpiLabel}>{label}</ThemedText>
    <ThemedText style={styles.kpiValue}>{value}</ThemedText>
    {!!trend && <ThemedText style={[styles.trend, trend.tone === "good" ? styles.trendGood : trend.tone === "bad" ? styles.trendBad : styles.muted]}>{trend.text}</ThemedText>}
    {!!detail && <ThemedText style={styles.muted}>{detail}</ThemedText>}
  </>;
  return onPress
    ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}${trend ? `, ${trend.text}` : ""}. Abrir detalle`} onPress={onPress} style={({ pressed }) => [styles.kpi, pressed && styles.pressed]}>{body}</Pressable>
    : <View style={styles.kpi}>{body}</View>;
}

/** Single-series hourly bars: one hue, no legend, values on demand and as a table. */
export function HourlyChart({ data, fromHour, toHour }: { data: { hour: number; orders: number; sales: number }[]; fromHour: number; toHour: number }) {
  const styles = useDashboardStyles();
  const hours = Array.from({ length: Math.max(1, toHour - fromHour + 1) }, (_, index) => fromHour + index).map((hour) => data.find((row) => row.hour === hour) ?? { hour, orders: 0, sales: 0 });
  const max = Math.max(...hours.map((row) => row.sales), 1);
  const best = hours.reduce((top, row) => row.sales > top.sales ? row : top, hours[0]);
  const [selected, setSelected] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const shown = hours.find((row) => row.hour === selected) ?? null;
  return <View style={styles.chartWrap}>
    <View style={styles.cardHeader}>
      <ThemedText accessibilityLiveRegion="polite" style={[styles.grow, styles.muted]}>{shown ? `${hourLabel(shown.hour)} · ${shown.orders} pedido(s) · ${money(shown.sales)}` : best.sales > 0 ? `Mejor hora: ${hourLabel(best.hour)} · ${money(best.sales)}` : "Todavía no hay ventas hoy."}</ThemedText>
      <Pressable accessibilityRole="button" aria-pressed={table} onPress={() => setTable((value) => !value)} style={styles.linkButton}><ThemedText style={styles.link}>{table ? "Ver gráfica" : "Ver como tabla"}</ThemedText></Pressable>
    </View>
    {table ? <View>{hours.filter((row) => row.orders > 0).map((row) => <View key={row.hour} style={styles.tableRow}><ThemedText style={styles.grow}>{hourLabel(row.hour)}</ThemedText><ThemedText style={styles.muted}>{row.orders} pedido(s)</ThemedText><ThemedText style={styles.tableValue}>{money(row.sales)}</ThemedText></View>)}</View> : <>
      <View style={styles.chart}>
        <View style={styles.gridLine} />
        {hours.map((row) => <Pressable key={row.hour} accessibilityRole="button" accessibilityLabel={`${hourLabel(row.hour)}: ${row.orders} pedido(s), ${money(row.sales)}`} onHoverIn={() => setSelected(row.hour)} onHoverOut={() => setSelected(null)} onPress={() => setSelected((current) => current === row.hour ? null : row.hour)} style={styles.barSlot}>
          <View style={[styles.bar, { height: `${Math.max(row.sales ? 4 : 0, (row.sales / max) * 100)}%` }, selected !== null && selected !== row.hour && styles.barDimmed]} />
        </Pressable>)}
      </View>
      <View style={styles.axis}>{hours.map((row, index) => <ThemedText key={row.hour} numberOfLines={1} style={styles.axisLabel}>{index % Math.max(1, Math.ceil(hours.length / 6)) === 0 ? `${row.hour} h` : ""}</ThemedText>)}</View>
    </>}
  </View>;
}

/** Ranked magnitudes as thin horizontal bars in one hue, value always written next to the bar. */
export function BarList({ rows, empty }: { rows: { key: string; label: string; value: number; display: string; detail?: string }[]; empty: string }) {
  const styles = useDashboardStyles();
  const max = Math.max(...rows.map((row) => row.value), 1);
  if (!rows.length) return <ThemedText style={styles.muted}>{empty}</ThemedText>;
  return <View style={styles.barList}>{rows.map((row) => <View key={row.key} accessible accessibilityLabel={`${row.label}: ${row.display}${row.detail ? `, ${row.detail}` : ""}`} style={styles.barRow}>
    <View style={styles.barRowText}><ThemedText numberOfLines={1} style={[styles.grow, styles.rowTitle]}>{row.label}</ThemedText><ThemedText style={styles.tableValue}>{row.display}</ThemedText></View>
    <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(row.value ? 2 : 0, (row.value / max) * 100)}%` }]} /></View>
    {!!row.detail && <ThemedText style={styles.muted}>{row.detail}</ThemedText>}
  </View>)}</View>;
}

export function StatusPill({ tone, text }: { tone: "danger" | "warning" | "info" | "success" | "neutral"; text: string }) {
  const styles = useDashboardStyles();
  return <ThemedText style={[styles.pill, styles[`pill_${tone}`]]}>{text}</ThemedText>;
}

export function useDashboardStyles() { return useThemedStyles(createStyles); }
const createStyles = (theme: Theme) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  muted: { color: theme.colors.textMuted, ...theme.typography.body },
  rowTitle: { color: theme.colors.text, ...theme.typography.bodyStrong },
  card: { ...theme.shadows.surface, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: theme.radius.section, borderWidth: 1, gap: 14, padding: 20 },
  cardHeader: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  row: { alignItems: "stretch", flexDirection: "row", flexWrap: "wrap", gap: 16 },
  stages: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stage: { flexBasis: 92 * theme.fontScale, flexGrow: 1, padding: 12 },
  cardTitle: { color: theme.colors.text, ...theme.typography.subheading },
  cardTitleBlock: { flexBasis: 200 * theme.fontScale, flexGrow: 1, minWidth: 0 },
  kpi: { ...theme.shadows.surface, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, flexBasis: 150 * theme.fontScale, flexGrow: 1, gap: 4, minWidth: 0, padding: 16 },
  pressed: { opacity: .85 },
  kpiLabel: { color: theme.colors.textMuted, ...theme.typography.label },
  kpiValue: { color: theme.colors.text, ...theme.typography.title },
  trend: { ...theme.typography.label },
  trendGood: { color: theme.colors.successText },
  trendBad: { color: theme.colors.dangerText },
  chartWrap: { gap: 8 },
  chart: { alignItems: "flex-end", flexDirection: "row", gap: 2, height: 160, position: "relative" },
  gridLine: { backgroundColor: theme.colors.border, bottom: 0, height: 1, left: 0, position: "absolute", right: 0 },
  barSlot: { flex: 1, height: "100%", justifyContent: "flex-end", minWidth: 0 },
  bar: { backgroundColor: theme.colors.chartBar, borderTopLeftRadius: 4, borderTopRightRadius: 4, width: "100%" },
  barDimmed: { opacity: .45 },
  axis: { flexDirection: "row", gap: 2 },
  axisLabel: { color: theme.colors.textSubtle, flex: 1, fontSize: 10 * theme.fontScale, minWidth: 0, overflow: "visible" },
  linkButton: { justifyContent: "center", minHeight: theme.control.minTouch, paddingHorizontal: 6 },
  link: { color: theme.colors.primary, ...theme.typography.label },
  tableRow: { alignItems: "center", borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 12, paddingVertical: 8 },
  tableValue: { color: theme.colors.text, ...theme.typography.bodyStrong },
  barList: { gap: 12 },
  barRow: { gap: 5 },
  barRowText: { alignItems: "baseline", flexDirection: "row", gap: 10 },
  track: { backgroundColor: theme.colors.surfaceMuted, borderRadius: 4, height: 8, overflow: "hidden" },
  fill: { backgroundColor: theme.colors.chartBar, borderRadius: 4, height: "100%" },
  pill: { alignSelf: "flex-start", borderRadius: theme.radius.pill, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 3, ...theme.typography.caption },
  pill_danger: { backgroundColor: theme.colors.dangerSurface, color: theme.colors.dangerText },
  pill_warning: { backgroundColor: theme.colors.warningSurface, color: theme.colors.warningText },
  pill_info: { backgroundColor: theme.colors.infoSurface, color: theme.colors.infoText },
  pill_success: { backgroundColor: theme.colors.successSurface, color: theme.colors.successText },
  pill_neutral: { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.textMuted },
});
