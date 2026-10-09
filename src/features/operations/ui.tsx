import {ThemedText} from "../../theme/ThemedText";
import { Notice } from "../../components/Notice";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, type ApiRequestOptions } from "../../api";
export { confirmAction } from "../../components/ConfirmationDialog";
import type { NumericValue, Paginated } from "./types";
import {useTheme,useThemedStyles} from "../../theme/ThemeProvider";
import type {Theme} from "../../theme/tokens";

export async function fetchPage<T>(path: string, token: string, page = 1, options: ApiRequestOptions = {}): Promise<Paginated<T>> {
  const separator = path.includes("?") ? "&" : "?";
  return api<Paginated<T>>(`${path}${separator}page=${page}`, token, options);
}

export async function fetchAllPages<T>(path: string, token: string, options: ApiRequestOptions = {}): Promise<T[]> {
  const first = await fetchPage<T>(path, token, 1, options);
  const lastPage = Math.max(1, Number(first.last_page) || 1);
  const remaining: Paginated<T>[] = [];
  for (let page = 2; page <= lastPage; page += 1) {
    // Catalog data is occasionally needed in full, but requests stay bounded so
    // a large catalog cannot fan out into dozens of simultaneous API calls.
    if (options.signal?.aborted) throw new Error("Carga cancelada");
    remaining.push(await fetchPage<T>(path, token, page, options));
  }
  const unique = new Map<number | string, T>();
  [first, ...remaining].forEach((page) => page.data.forEach((item, index) => {
    const candidate = item as T & { id?: number | string };
    unique.set(candidate.id ?? `${page.current_page}-${index}`, item);
  }));
  return Array.from(unique.values());
}

export function appendUniqueById<T extends { id: number | string }>(current: T[], next: T[]): T[] {
  const unique = new Map<number | string, T>(current.map((item) => [item.id, item]));
  next.forEach((item) => unique.set(item.id, item));
  return Array.from(unique.values());
}

export function numberValue(value: NumericValue | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inputNumber(value: string): number {
  return Number(value.trim().replace(",", "."));
}

export function quantityText(value: NumericValue | null | undefined, maximumFractionDigits = 4): string {
  return numberValue(value).toLocaleString(undefined, { maximumFractionDigits });
}

export function moneyText(value: NumericValue | null | undefined): string {
  return numberValue(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function dateText(value?: string | null, includeTime = false): string {
  if (!value) return "Sin fecha";
  if (!includeTime) {
    const calendarDate = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    if (calendarDate) {
      const localMidnight = new Date(`${calendarDate}T00:00:00`);
      if (Number.isFinite(localMidnight.getTime())) return localMidnight.toLocaleDateString();
    }
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return includeTime ? parsed.toLocaleString() : parsed.toLocaleDateString();
}

export function localDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDateTimeValue(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${localDateValue(date)}T${hours}:${minutes}`;
}

export function Tabs({
  active,
  items,
  onChange,
}: {
  active: string;
  items: { key: string; label: string }[];
  onChange: (key: string) => void;
}) {
  const ops=useOpsStyles();
  return <View style={ops.tabs}>
    {items.map((item) => <Pressable
      accessibilityRole="button"
      key={item.key}
      onPress={() => onChange(item.key)}
      style={[ops.tab, active === item.key && ops.tabActive]}
    >
      <ThemedText style={[ops.tabText, active === item.key && ops.tabTextActive]}>{item.label}</ThemedText>
    </Pressable>)}
  </View>;
}

export function Section({ title, subtitle, children, compact = false }: { title: string; subtitle?: string; children: ReactNode; compact?: boolean }) {
  const ops=useOpsStyles();
  return <View style={[ops.section, compact && ops.sectionCompact]}>
    <View style={ops.sectionHeader}>
      <ThemedText style={ops.sectionTitle}>{title}</ThemedText>
      {!!subtitle && <ThemedText style={ops.sectionDescription}>{subtitle}</ThemedText>}
    </View>
    {children}
  </View>;
}

export function EmptyState({ text = "Todavía no hay registros." }: { text?: string }) {
  const ops=useOpsStyles();
  return <ThemedText style={ops.empty}>{text}</ThemedText>;
}

export function LoadingState({ text = "Cargando información..." }: { text?: string }) {
  const {theme}=useTheme();const ops=useOpsStyles();
  return <View style={ops.loading}>
    <ActivityIndicator color={theme.colors.primary} />
    <ThemedText style={ops.muted}>{text}</ThemedText>
  </View>;
}

export function Feedback({ error, message }: { error?: string; message?: string }) {
  return <><Notice kind="error" message={error}/><Notice kind="success" message={message}/></>;
}

export function useOpsStyles(){return useThemedStyles(createOpsStyles);}
export const createOpsStyles = (theme:Theme)=>StyleSheet.create({
  screen: { gap: 20 },
  screenMobile: { gap: 12 },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  toolbarMobile: { alignItems: "stretch", flexDirection: "column" },
  tabs: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 5 },
  tab: { alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, justifyContent: "center", minHeight: theme.control.minTouch, paddingHorizontal: 18, paddingVertical: 10 },
  tabActive: { ...theme.shadows.surface, backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.textMuted, fontWeight: "700" },
  tabTextActive: { color: theme.colors.primaryText },
  section: { ...theme.shadows.surface, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: theme.radius.section, borderWidth: 1, gap: 16, padding: 22 },
  sectionCompact: { borderRadius: theme.radius.card, gap: 13, padding: 16 },
  sectionHeader: { gap: 5, marginBottom: 2, paddingBottom: 4 },
  sectionTitle: { color: theme.colors.text, ...theme.typography.heading },
  sectionDescription: { color: theme.colors.textMuted, lineHeight: 19 * theme.fontScale },
  subtitle: { color: theme.colors.text, fontSize: 16 * theme.fontScale, fontWeight: "800" },
  card: { ...theme.shadows.surface, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, gap: 10, marginBottom: 10, padding: 17 },
  insetCard: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.control, gap: 8, padding: 14 },
  row: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  rowGrow: { flex: 1, minWidth: 180 },
  inline: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  inlineCompact: { alignItems: "stretch", flexDirection: "column", width: "100%" },
  fieldGrow: { flex: 1, minWidth: 0 },
  label: { color: theme.colors.text, fontSize: 13 * theme.fontScale, fontWeight: "800", marginTop: 2 },
  muted: { color: theme.colors.textMuted },
  strong: { color: theme.colors.text, fontSize: 16 * theme.fontScale, fontWeight: "900" },
  value: { color: theme.colors.primary, fontSize: 20 * theme.fontScale, fontWeight: "900" },
  input: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    minHeight: theme.control.minTouch,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textArea: { minHeight: 76, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderColor: "transparent", borderRadius: theme.radius.pill, borderWidth: 1, justifyContent: "center", minHeight: theme.control.minTouch, paddingHorizontal: 16, paddingVertical: 10 },
  chipActive: { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primary },
  chipDisabled: { opacity: theme.control.disabledOpacity },
  button: { ...theme.shadows.surface, alignItems: "center", backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, justifyContent: "center", minHeight: theme.control.minTouch, paddingHorizontal: 20, paddingVertical: 11 },
  buttonText: { color: theme.colors.primaryText, fontWeight: "800" },
  outlineButton: { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, borderWidth: 1, minHeight: theme.control.minTouch, paddingHorizontal: 18, paddingVertical: 11 },
  fullWidthButton: { alignItems: "center", width: "100%" },
  outlineText: { color: theme.colors.primary, fontWeight: "800" },
  dangerButton: { backgroundColor: theme.colors.dangerSurface, borderColor: theme.colors.dangerSurface, borderRadius: theme.radius.pill, borderWidth: 1, justifyContent: "center", minHeight: theme.control.minTouch, paddingHorizontal: 18, paddingVertical: 11 },
  inlineTextAction: { justifyContent: "center", minHeight: theme.control.minTouch, paddingHorizontal: 8 },
  dangerText: { color: theme.colors.danger, fontWeight: "800" },
  disabled: { opacity: theme.control.disabledOpacity },
  statusGood: { color: theme.colors.successText, fontWeight: "800" },
  statusWarning: { color: theme.colors.warningText, fontWeight: "800" },
  statusDanger: { color: theme.colors.danger, fontWeight: "800" },
  badge: { alignSelf: "flex-start", backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 6 },
  noticeBox: { backgroundColor: theme.colors.warningSurface, borderRadius: theme.radius.control, padding: 12 },
  notice: { color: theme.colors.warningText, fontWeight: "600" },
  errorBox: { backgroundColor: theme.colors.dangerSurface, borderColor: theme.colors.danger, borderRadius: theme.radius.control, borderWidth: 1, padding: 12 },
  error: { color: theme.colors.danger, fontWeight: "700" },
  loading: { alignItems: "center", gap: 9, padding: 30 },
  empty: { color: theme.colors.textMuted, padding: 24, textAlign: "center" },
  divider: { backgroundColor: theme.colors.border, height: 1, marginVertical: 3 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metricsMobile: { flexDirection: "column" },
  metric: { ...theme.shadows.surface, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, flexGrow: 1, gap: 4, minWidth: 130, padding: 16 },
  metricValue: { color: theme.colors.primary, fontSize: 22 * theme.fontScale, fontWeight: "900" },
});
