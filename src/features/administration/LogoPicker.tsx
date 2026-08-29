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
    {value ? <Image resizeMode="contain" source={{ uri: value }} style={styles.preview} /> : <View style={styles.placeholder}><Text style={styles.icon}>▧</Text></View>}
    <Text style={styles.title}>{value ? changeLabel : emptyLabel}</Text>
    <Text style={styles.help}>PNG o JPEG · máximo {maximumBytes / 1024 / 1024} MB</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  dropZone: { alignItems: "center", backgroundColor: "#f8f9fa", borderColor: "#cfd4da", borderRadius: 14, borderStyle: "dashed", borderWidth: 2, gap: 8, justifyContent: "center", minHeight: 180, padding: 18 },
  help: { color: "#747b85", fontSize: 13 },
  icon: { color: "#747b85", fontSize: 30 },
  placeholder: { alignItems: "center", height: 72, justifyContent: "center" },
  preview: { height: 105, width: "80%" },
  title: { color: "#30353c", fontWeight: "900" },
});
