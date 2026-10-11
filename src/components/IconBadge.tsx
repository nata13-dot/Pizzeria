import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ThemedText } from "../theme/ThemedText";
import { useThemedStyles } from "../theme/ThemeProvider";
import type { Theme } from "../theme/tokens";

export type IconTone = "primary" | "warning" | "success" | "info" | "danger" | "neutral";
export type IconBadgeSize = "small" | "medium" | "large";

export function IconBadge({
  glyph,
  tone = "primary",
  size = "medium",
  selected = false,
  style,
}: {
  glyph: string;
  tone?: IconTone;
  size?: IconBadgeSize;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      accessible={false}
      style={[
        styles.badge,
        styles[size],
        styles[`${tone}Surface`],
        selected && styles.selected,
        style,
      ]}
    >
      <ThemedText
        accessible={false}
        style={[
          styles.glyph,
          styles[`${size}Glyph`],
          styles[`${tone}Glyph`],
          selected && styles.selectedGlyph,
        ]}
      >
        {glyph}
      </ThemedText>
    </View>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  badge: {
    alignItems: "center",
    borderRadius: 14,
    justifyContent: "center",
  },
  small: { borderRadius: 10, height: 30, width: 30 },
  medium: { height: 40, width: 40 },
  large: { borderRadius: 17, height: 52, width: 52 },
  glyph: { fontWeight: "900", textAlign: "center" },
  smallGlyph: { fontSize: 15 * theme.fontScale, lineHeight: 18 * theme.fontScale },
  mediumGlyph: { fontSize: 19 * theme.fontScale, lineHeight: 23 * theme.fontScale },
  largeGlyph: { fontSize: 25 * theme.fontScale, lineHeight: 29 * theme.fontScale },
  primarySurface: { backgroundColor: theme.colors.primarySurface },
  warningSurface: { backgroundColor: theme.colors.warningSurface },
  successSurface: { backgroundColor: theme.colors.successSurface },
  infoSurface: { backgroundColor: theme.colors.infoSurface },
  dangerSurface: { backgroundColor: theme.colors.dangerSurface },
  neutralSurface: { backgroundColor: theme.colors.surfaceMuted },
  primaryGlyph: { color: theme.colors.primary },
  warningGlyph: { color: theme.colors.warningText },
  successGlyph: { color: theme.colors.successText },
  infoGlyph: { color: theme.colors.infoText },
  dangerGlyph: { color: theme.colors.dangerText },
  neutralGlyph: { color: theme.colors.textMuted },
  selected: {
    ...theme.shadows.surface,
    backgroundColor: theme.colors.primary,
  },
  selectedGlyph: { color: theme.colors.primaryText },
});
