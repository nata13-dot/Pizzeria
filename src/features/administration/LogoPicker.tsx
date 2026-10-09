import {ThemedText} from "../../theme/ThemedText";
import {useThemedStyles} from "../../theme/ThemeProvider";
import type {Theme} from "../../theme/tokens";
import * as ImagePicker from "expo-image-picker";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

type LogoPickerProps = {
  value: string;
  onChange: (dataUri: string) => void;
  onError: (message: string) => void;
  emptyLabel?: string;
  changeLabel?: string;
  maximumBytes?: number;
};

export function LogoPicker({ value, onChange, onError, emptyLabel = "Seleccionar imagen", changeLabel = "Cambiar imagen", maximumBytes = 5 * 1024 * 1024 }: LogoPickerProps) {
  const styles=useThemedStyles(createStyles);
  async function pick() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ["images"],
        quality: 0.75,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) throw new Error("No fue posible leer la imagen seleccionada.");
      const decodedBytes = Math.ceil(asset.base64.length * 3 / 4);
      if (decodedBytes > maximumBytes) throw new Error(`La imagen resultante supera el máximo permitido de ${maximumBytes / 1024 / 1024} MB. Recórtala o reduce su resolución.`);
      onError("");
      onChange(`data:image/jpeg;base64,${asset.base64}`);
    } catch (error) {
      onError((error as Error).message || "No fue posible seleccionar la imagen.");
    }
  }

  return <Pressable accessibilityRole="button" onPress={pick} style={styles.dropZone}>
    {value ? <Image resizeMode="contain" source={{ uri: value }} style={styles.preview} /> : <View style={styles.placeholder}><ThemedText style={styles.icon}>▧</ThemedText></View>}
    <ThemedText style={styles.title}>{value ? changeLabel : emptyLabel}</ThemedText>
    <ThemedText style={styles.help}>PNG o JPEG · máximo {maximumBytes / 1024 / 1024} MB</ThemedText>
  </Pressable>;
}

const createStyles=(theme:Theme)=>StyleSheet.create({
  dropZone: { alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.borderStrong, borderRadius: theme.radius.card, borderStyle: "dashed", borderWidth: 2, gap: 5, justifyContent: "center", minHeight: 112, padding: 10 },
  help: { color: theme.colors.textMuted, fontSize: 13 * theme.fontScale },
  icon: { color: theme.colors.textMuted, fontSize: 22 * theme.fontScale },
  placeholder: { alignItems: "center", height: 30, justifyContent: "center" },
  preview: { height: 58, width: "80%" },
  title: { color: theme.colors.text, fontWeight: "900" },
});
