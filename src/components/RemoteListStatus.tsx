import {ThemedText} from "../theme/ThemedText";
import {ActionButton} from "./ActionButton";
import {Notice} from "./Notice";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Page } from "../loadState";
import {useTheme,useThemedStyles} from "../theme/ThemeProvider";
import type {Theme} from "../theme/tokens";

type StatusProps = { loading: boolean; error: string; count: number; emptyText: string; search?: string; onRetry: () => void };
export function RemoteListStatus({ loading, error, count, emptyText, search = "", onRetry }: StatusProps) {
  const {theme}=useTheme();const styles=useThemedStyles(createStyles);
  if (loading) return <View style={styles.row} accessibilityLiveRegion="polite"><ActivityIndicator color={theme.colors.primary} /><ThemedText style={styles.text}>Cargando información...</ThemedText></View>;
  if (error) return <View style={styles.block}><Notice kind="error" message={error}/>{count > 0 && <ThemedText>Se conserva la información anterior; puede estar desactualizada.</ThemedText>}<ActionButton variant="secondary" label="Reintentar" loadingLabel="Cargando…" onPress={onRetry}/></View>;
  if (!count) return <ThemedText accessibilityLiveRegion="polite" style={styles.block}>{search.trim() ? `No encontramos resultados para “${search.trim()}”.` : emptyText}</ThemedText>;
  return null;
}

export function Pagination({ data, loading, onPage }: { data: Pick<Page<unknown>, "current_page" | "last_page" | "total" | "from" | "to"> | null; loading: boolean; onPage: (page: number) => void }) {
  const styles=useThemedStyles(createStyles);
  if (!data) return null;
  return <View style={styles.block}>
    <ThemedText style={styles.text} accessibilityLiveRegion="polite">{data.from ?? 0}–{data.to ?? 0} de {data.total} registros · Página {data.current_page} de {data.last_page}</ThemedText>
    {data.last_page > 1 && <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Página anterior" disabled={loading || data.current_page <= 1} style={[styles.button, (loading || data.current_page <= 1) && styles.disabled]} onPress={() => onPage(data.current_page - 1)}><ThemedText>Anterior</ThemedText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Página siguiente" disabled={loading || data.current_page >= data.last_page} style={[styles.button, (loading || data.current_page >= data.last_page) && styles.disabled]} onPress={() => onPage(data.current_page + 1)}><ThemedText>Siguiente</ThemedText></Pressable>
    </View>}
  </View>;
}
const createStyles = (theme:Theme)=>StyleSheet.create({
  block: { gap: 8, marginVertical: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  text:{...theme.typography.body,color:theme.colors.text},
  button: { borderWidth: 1, borderColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, paddingHorizontal: 18, minHeight: theme.control.minTouch, justifyContent: "center", alignSelf: "flex-start",backgroundColor:theme.colors.primarySurface },
  disabled: { opacity: theme.control.disabledOpacity },
});
