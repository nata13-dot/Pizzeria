import { useAudioPlayer } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type ConfirmationRequest = {
  message: string;
  resolve: (accepted: boolean) => void;
};

let openDialog: ((request: ConfirmationRequest) => void) | null = null;

export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!openDialog) {
      resolve(false);
      return;
    }
    openDialog({ message, resolve });
  });
}

export function ConfirmationDialogHost() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const activeResolve = useRef<ConfirmationRequest["resolve"] | null>(null);
  const player = useAudioPlayer(require("../../assets/modal_open.mp3"));

  useEffect(() => {
    openDialog = (next) => {
      activeResolve.current?.(false);
      activeResolve.current = next.resolve;
      setRequest(next);
      void player.seekTo(0)
        .then(() => player.play())
        .catch(() => {
          // A browser may block audio before its first user interaction. The
          // dialog remains fully functional when that happens.
        });
    };
    return () => {
      if (openDialog) openDialog = null;
      activeResolve.current?.(false);
      activeResolve.current = null;
    };
  }, [player]);

  function answer(accepted: boolean) {
    const resolve = activeResolve.current;
    activeResolve.current = null;
    setRequest(null);
    resolve?.(accepted);
  }

  return <Modal
    animationType="fade"
    onRequestClose={() => answer(false)}
    transparent
    visible={Boolean(request)}
  >
    <Pressable
      accessibilityLabel="Cerrar confirmación"
      accessibilityRole="button"
      onPress={() => answer(false)}
      style={styles.backdrop}
    >
      <Pressable
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        onPress={(event) => event.stopPropagation()}
        style={styles.card}
      >
        <View style={styles.icon}><Text style={styles.iconText}>?</Text></View>
        <Text style={styles.title}>Confirmar acción</Text>
        <Text style={styles.message}>{request?.message}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => answer(false)} style={[styles.button, styles.cancelButton]}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => answer(true)} style={[styles.button, styles.acceptButton]}>
            <Text style={styles.acceptText}>Aceptar</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(30, 24, 20, 0.58)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    alignItems: "center",
    backgroundColor: "#fffdfa",
    borderColor: "#eee4da",
    borderRadius: 22,
    borderWidth: 1,
    elevation: 12,
    maxWidth: 440,
    padding: 26,
    shadowColor: "#1d1713",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    width: "100%",
  },
  icon: {
    alignItems: "center",
    backgroundColor: "#fbe7e1",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginBottom: 14,
    width: 56,
  },
  iconText: { color: "#cf4b32", fontSize: 30, fontWeight: "900" },
  title: { color: "#29231f", fontSize: 21, fontWeight: "900", marginBottom: 9, textAlign: "center" },
  message: { color: "#615750", fontSize: 15, lineHeight: 22, marginBottom: 24, textAlign: "center" },
  actions: { flexDirection: "row", gap: 10, width: "100%" },
  button: { alignItems: "center", borderRadius: 11, flex: 1, justifyContent: "center", minHeight: 46, paddingHorizontal: 14 },
  cancelButton: { backgroundColor: "#fffdfa", borderColor: "#d7c9c0", borderWidth: 1 },
  acceptButton: { backgroundColor: "#cf4b32" },
  cancelText: { color: "#615750", fontSize: 14, fontWeight: "800" },
  acceptText: { color: "white", fontSize: 14, fontWeight: "900" },
});
