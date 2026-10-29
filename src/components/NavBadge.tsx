import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ThemedText } from "../theme/ThemedText";
import { useThemedStyles } from "../theme/ThemeProvider";
import type { Theme } from "../theme/tokens";

/** Small count shown next to a menu entry; hidden when there is nothing pending. */
export function NavBadge({ count, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(createStyles);
  if (!count) return null;
  return <View accessible={false} style={[styles.badge, style]}><ThemedText style={styles.text}>{count > 99 ? "99+" : count}</ThemedText></View>;
}

const createStyles = (theme: Theme) => StyleSheet.create({
  badge: { alignItems: "center", backgroundColor: theme.colors.danger, borderRadius: theme.radius.pill, justifyContent: "center", minWidth: 22, paddingHorizontal: 6, paddingVertical: 1 },
  text: { ...theme.typography.caption, color: theme.colors.textInverse, fontWeight: "900" },
});
