import {ThemedText} from "../theme/ThemedText";
import { useAudioPlayer } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {useThemedStyles} from "../theme/ThemeProvider";
import type {Theme} from "../theme/tokens";

type ConfirmationRequest = {
  message: string;
  options?: { title?: string; acceptLabel?: string; cancelLabel?: string };
  resolve: (accepted: boolean) => void;
};

let openDialog: ((request: ConfirmationRequest) => void) | null = null;

export function confirmAction(message: string, options?: ConfirmationRequest["options"]): Promise<boolean> {
  return new Promise((resolve) => {
    if (!openDialog) {
      resolve(false);
      return;
    }
    openDialog({ message, options, resolve });
  });
}

export function ConfirmationDialogHost() {
  const styles=useThemedStyles(createStyles);
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

  useEffect(() => {
    if (!request || typeof document === "undefined") return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => document.querySelector<HTMLElement>('[data-testid="confirmation-cancel"]')?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if(event.key === "Escape") {event.preventDefault();answer(false);}
      if(event.key === "Tab") {
        const buttons=Array.from(document.querySelectorAll<HTMLElement>('[data-testid="confirmation-card"] [role="button"]'));
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { clearTimeout(timer); document.removeEventListener("keydown", keydown); previous?.focus?.(); };
  }, [request]);

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
        testID="confirmation-card"
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        onPress={(event) => event.stopPropagation()}
        style={styles.card}
      >
        <View style={styles.icon}><ThemedText style={styles.iconText}>?</ThemedText></View>
        <ThemedText style={styles.title}>{request?.options?.title ?? "Confirmar acción"}</ThemedText>
        <ThemedText style={styles.message}>{request?.message}</ThemedText>
        <View style={styles.actions}>
          <Pressable testID="confirmation-cancel" accessibilityRole="button" onPress={() => answer(false)} style={[styles.button, styles.cancelButton]}>
            <ThemedText style={styles.cancelText}>{request?.options?.cancelLabel ?? "Cancelar"}</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => answer(true)} style={[styles.button, styles.acceptButton]}>
            <ThemedText style={styles.acceptText}>{request?.options?.acceptLabel ?? "Aceptar"}</ThemedText>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  </Modal>;
}

const createStyles = (theme:Theme)=>StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.modal,
    borderWidth: 1,
    ...theme.shadows.floating,
    maxWidth: 440,
    padding: 28,
    width: "100%",
  },
  icon: {
    alignItems: "center",
    backgroundColor: theme.colors.primarySurface,
    borderRadius: 34,
    height: 68,
    justifyContent: "center",
    marginBottom: 14,
    width: 68,
  },
  iconText: { color: theme.colors.primary, ...theme.typography.display },
  title: { color: theme.colors.text, ...theme.typography.heading, marginBottom: 9, textAlign: "center" },
  message: { color: theme.colors.textMuted, ...theme.typography.body, marginBottom: 24, textAlign: "center" },
  actions: { flexDirection: "row", gap: 10, width: "100%" },
  button: { alignItems: "center", borderRadius: theme.radius.pill, flex: 1, justifyContent: "center", minHeight: theme.control.minTouch, paddingHorizontal: 18 },
  cancelButton: { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.surfaceMuted, borderWidth: 1 },
  acceptButton: { backgroundColor: theme.colors.primary },
  cancelText: { color: theme.colors.text, ...theme.typography.bodyStrong },
  acceptText: { color: theme.colors.primaryText, ...theme.typography.bodyStrong },
});
