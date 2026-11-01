import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "../theme/ThemedText";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider";
import type { Theme } from "../theme/tokens";
import { clampFontScale, FONT_SCALE_OPTIONS, MAX_FONT_SCALE, MIN_FONT_SCALE, percent, type FontPreference } from "../theme/fontScale";

/** Text size for this device; every change applies to the whole app instantly. */
export function FontScaleControl() {
  const styles = useThemedStyles(createStyles);
  const { fontPreference, deviceFontScale, fontScale, setFontPreference } = useTheme();
  const smaller = [...FONT_SCALE_OPTIONS].reverse().find((option) => option < fontScale - 0.001);
  const larger = FONT_SCALE_OPTIONS.find((option) => option > fontScale + 0.001);
  const deviceOutside = clampFontScale(deviceFontScale) !== Number(deviceFontScale.toFixed(3));
  const option = (key: FontPreference, label: string, sample: number, hint?: string) => {
    const selected = fontPreference === key;
    return <Pressable key={String(key)} accessibilityRole="radio" aria-checked={selected} accessibilityLabel={hint ? `${label}, ${hint}` : label} onPress={() => setFontPreference(key)} style={[styles.option, selected && styles.optionActive]}>
      <ThemedText accessible={false} style={[styles.sample, { fontSize: 18 * sample, lineHeight: 24 * sample }, selected && styles.activeText]}>Aa</ThemedText>
      <ThemedText style={[styles.optionLabel, selected && styles.activeText]}>{label}</ThemedText>
      {!!hint && <ThemedText style={styles.hint}>{hint}</ThemedText>}
    </Pressable>;
  };

  return <View style={styles.wrap}>
    <View style={styles.header}>
      <View style={styles.grow}>
        <ThemedText style={styles.title}>Tamaño de letra de este dispositivo</ThemedText>
        <ThemedText style={styles.muted}>Se aplica al instante en toda la app y se guarda solo en este equipo.</ThemedText>
      </View>
      <View accessibilityRole="toolbar" style={styles.steps}>
        <Pressable accessibilityRole="button" accessibilityLabel="Reducir letra" aria-disabled={!smaller} disabled={!smaller} onPress={() => smaller && setFontPreference(smaller)} style={[styles.step, !smaller && styles.disabled]}><ThemedText style={styles.stepText}>A−</ThemedText></Pressable>
        <ThemedText accessibilityLiveRegion="polite" style={styles.current}>{percent(fontScale)}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Aumentar letra" aria-disabled={!larger} disabled={!larger} onPress={() => larger && setFontPreference(larger)} style={[styles.step, !larger && styles.disabled]}><ThemedText style={styles.stepText}>A+</ThemedText></Pressable>
      </View>
    </View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Tamaño de letra" style={styles.options}>
      {option("auto", "Automático", clampFontScale(deviceFontScale), `como el dispositivo (${percent(clampFontScale(deviceFontScale))})`)}
      {FONT_SCALE_OPTIONS.map((scale) => option(scale, percent(scale), scale, scale === 1 ? "normal" : undefined))}
    </View>
    {fontPreference === "auto" && deviceOutside && <ThemedText style={styles.muted}>Tu dispositivo pide {percent(deviceFontScale)}; la app usa {percent(clampFontScale(deviceFontScale))} para que todas las pantallas sigan siendo usables (entre {percent(MIN_FONT_SCALE)} y {percent(MAX_FONT_SCALE)}).</ThemedText>}
    <View style={styles.preview}>
      <ThemedText style={styles.previewTitle}>Así se ve el texto</ThemedText>
      <ThemedText>Pedido #12 · Pizza Grande Pepperoni · $210.00</ThemedText>
      <ThemedText style={styles.muted}>Textos secundarios, avisos y etiquetas cambian en la misma proporción.</ThemedText>
    </View>
  </View>;
}

const createStyles = (theme: Theme) => StyleSheet.create({
  wrap: { gap: 14 },
  header: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12 },
  grow: { flex: 1, gap: 4, minWidth: 220 },
  title: { color: theme.colors.text, ...theme.typography.subheading },
  muted: { color: theme.colors.textMuted, ...theme.typography.body },
  steps: { alignItems: "center", flexDirection: "row", gap: 8 },
  step: { alignItems: "center", backgroundColor: theme.colors.primarySurface, borderRadius: theme.radius.pill, justifyContent: "center", minHeight: theme.control.minTouch, minWidth: theme.control.minTouch, paddingHorizontal: 12 },
  stepText: { color: theme.colors.primary, ...theme.typography.bodyStrong },
  disabled: { opacity: theme.control.disabledOpacity },
  current: { color: theme.colors.text, ...theme.typography.bodyStrong, minWidth: 56, textAlign: "center" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderColor: "transparent", borderRadius: theme.radius.card, borderWidth: 1, flexBasis: 96, flexGrow: 1, gap: 2, justifyContent: "center", minHeight: 86, padding: 10 },
  optionActive: { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primary },
  sample: { color: theme.colors.text, fontWeight: "900" },
  optionLabel: { color: theme.colors.text, ...theme.typography.label },
  activeText: { color: theme.colors.primary },
  hint: { color: theme.colors.textMuted, ...theme.typography.caption, textAlign: "center" },
  preview: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.card, gap: 6, padding: 16 },
  previewTitle: { color: theme.colors.text, ...theme.typography.bodyStrong },
});
