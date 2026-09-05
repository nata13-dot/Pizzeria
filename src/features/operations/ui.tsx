import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../api";
export { confirmAction } from "../../components/ConfirmationDialog";
import type { NumericValue, Paginated } from "./types";

export async function fetchPage<T>(path: string, token: string, page = 1): Promise<Paginated<T>> {
  const separator = path.includes("?") ? "&" : "?";
  return api<Paginated<T>>(`${path}${separator}page=${page}`, token);
}

export async function fetchAllPages<T>(path: string, token: string): Promise<T[]> {
  const first = await fetchPage<T>(path, token);
  const lastPage = Math.max(1, Number(first.last_page) || 1);
  const remaining: Paginated<T>[] = [];
  for (let page = 2; page <= lastPage; page += 1) {
    // Catalog data is occasionally needed in full, but requests stay bounded so
    // a large catalog cannot fan out into dozens of simultaneous API calls.
    remaining.push(await fetchPage<T>(path, token, page));
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
  return <View style={ops.tabs}>
    {items.map((item) => <Pressable
      accessibilityRole="button"
      key={item.key}
      onPress={() => onChange(item.key)}
      style={[ops.tab, active === item.key && ops.tabActive]}
    >
      <Text style={[ops.tabText, active === item.key && ops.tabTextActive]}>{item.label}</Text>
    </Pressable>)}
  </View>;
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <View style={ops.section}>
    <View style={ops.sectionHeader}>
      <Text style={ops.sectionTitle}>{title}</Text>
      {!!subtitle && <Text style={ops.sectionDescription}>{subtitle}</Text>}
    </View>
    {children}
  </View>;
}

export function EmptyState({ text = "Todavía no hay registros." }: { text?: string }) {
  return <Text style={ops.empty}>{text}</Text>;
}

export function LoadingState({ text = "Cargando información..." }: { text?: string }) {
  return <View style={ops.loading}>
    <ActivityIndicator color="#d94f36" />
    <Text style={ops.muted}>{text}</Text>
  </View>;
}

export function Feedback({ error, message }: { error?: string; message?: string }) {
  return <>
    {!!error && <View style={ops.errorBox}><Text style={ops.error}>{error}</Text></View>}
    {!!message && <View style={ops.noticeBox}><Text style={ops.notice}>{message}</Text></View>}
  </>;
}

export const ops = StyleSheet.create({
  screen: { gap: 18 },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  tabs: { backgroundColor: "#f4f6f8", borderRadius: 14, flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 5 },
  tab: { alignItems: "center", backgroundColor: "#eceff2", borderRadius: 10, justifyContent: "center", minHeight: 44, paddingHorizontal: 14, paddingVertical: 10 },
  tabActive: { backgroundColor: "#d94f36" },
  tabText: { color: "#515861", fontWeight: "700" },
  tabTextActive: { color: "white" },
  section: { backgroundColor: "white", borderColor: "#e7e9ec", borderRadius: 20, borderWidth: 1, gap: 14, padding: 20 },
  sectionHeader: { borderBottomColor: "#e7e9ec", borderBottomWidth: 1, gap: 4, marginBottom: 2, paddingBottom: 12 },
  sectionTitle: { color: "#20242a", fontSize: 20, fontWeight: "900" },
  sectionDescription: { color: "#747b85", lineHeight: 19 },
  subtitle: { color: "#20242a", fontSize: 16, fontWeight: "800" },
  card: { backgroundColor: "white", borderColor: "#e7e9ec", borderRadius: 16, borderWidth: 1, gap: 9, marginBottom: 10, padding: 16 },
  insetCard: { backgroundColor: "#f4f6f8", borderColor: "#e7e9ec", borderRadius: 12, borderWidth: 1, gap: 7, padding: 13 },
  row: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  rowGrow: { flex: 1, minWidth: 180 },
  inline: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  inlineCompact: { alignItems: "stretch", flexDirection: "column", width: "100%" },
  fieldGrow: { flex: 1, minWidth: 0 },
  label: { color: "#30353c", fontSize: 13, fontWeight: "800", marginTop: 2 },
  muted: { color: "#747b85" },
  strong: { color: "#20242a", fontSize: 16, fontWeight: "900" },
  value: { color: "#d94f36", fontSize: 20, fontWeight: "900" },
  input: {
    backgroundColor: "white",
    borderColor: "#d9dde2",
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textArea: { minHeight: 76, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { alignItems: "center", backgroundColor: "#eef0f3", borderRadius: 10, justifyContent: "center", minHeight: 42, paddingHorizontal: 12, paddingVertical: 9 },
  chipActive: { backgroundColor: "#ffe4de" },
  chipDisabled: { opacity: 0.45 },
  button: { alignItems: "center", backgroundColor: "#d94f36", borderRadius: 11, justifyContent: "center", minHeight: 47, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { color: "white", fontWeight: "800" },
  outlineButton: { borderColor: "#d94f36", borderRadius: 10, borderWidth: 1, minHeight: 45, paddingHorizontal: 13, paddingVertical: 10 },
  outlineText: { color: "#d94f36", fontWeight: "800" },
  dangerButton: { borderColor: "#a82e20", borderRadius: 10, borderWidth: 1, minHeight: 43, paddingHorizontal: 13, paddingVertical: 10 },
  dangerText: { color: "#a82e20", fontWeight: "800" },
  disabled: { opacity: 0.45 },
  statusGood: { color: "#287347", fontWeight: "800" },
  statusWarning: { color: "#9a5b19", fontWeight: "800" },
  statusDanger: { color: "#a82e20", fontWeight: "800" },
  badge: { alignSelf: "flex-start", backgroundColor: "#efe3d6", borderRadius: 7, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  noticeBox: { backgroundColor: "#fff1cc", borderRadius: 9, padding: 11 },
  notice: { color: "#5f4918", fontWeight: "600" },
  errorBox: { backgroundColor: "#fbe3dd", borderColor: "#e4a496", borderRadius: 9, borderWidth: 1, padding: 11 },
  error: { color: "#a82e20", fontWeight: "700" },
  loading: { alignItems: "center", gap: 9, padding: 30 },
  empty: { color: "#796b61", padding: 24, textAlign: "center" },
  divider: { backgroundColor: "#e7e9ec", height: 1, marginVertical: 3 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { backgroundColor: "white", borderColor: "#e7e9ec", borderRadius: 14, borderWidth: 1, flexGrow: 1, gap: 3, minWidth: 130, padding: 14 },
  metricValue: { color: "#d94f36", fontSize: 22, fontWeight: "900" },
});
