import {ThemedText} from "../theme/ThemedText";
import { useState, useId, type Ref } from "react";
import {
  StyleSheet,
  Text,
  TextInput as NativeTextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import {useTheme,useThemedStyles} from "../theme/ThemeProvider";
import type {Theme} from "../theme/tokens";

type FloatingTextInputProps = TextInputProps & {
  inputRef?: Ref<NativeTextInput>;
  required?: boolean;
  error?: string;
  label?: string;
  helperText?: string;
};

const layoutKeys: (keyof ViewStyle)[] = [
  "alignSelf", "flex", "flexBasis", "flexGrow", "flexShrink",
  "margin", "marginBottom", "marginEnd", "marginHorizontal", "marginLeft",
  "marginRight", "marginStart", "marginTop", "marginVertical", "maxWidth",
  "minWidth", "width",
];

/** Text input whose purpose remains visible after the user starts typing. */
export function FloatingTextInput({
  inputRef,
  required = false,
  error,
  label,
  helperText,
  placeholder,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...props
}: FloatingTextInputProps) {
  const {theme}=useTheme();const styles=useThemedStyles(createStyles);
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const [focused, setFocused] = useState(false);
  const flattenedValue = StyleSheet.flatten(style) ?? {};
  const flattened = (Array.isArray(flattenedValue)
    ? Object.assign({}, ...flattenedValue.filter(Boolean))
    : flattenedValue) as ViewStyle;
  const layoutStyle: ViewStyle = {};
  const inputStyle = { ...flattened } as Record<string, unknown>;
  layoutKeys.forEach((key) => {
    const value = flattened[key as keyof typeof flattened];
    if (value !== undefined) (layoutStyle as Record<string, unknown>)[key] = value;
    delete inputStyle[key];
  });
  const rawLabel = label ?? placeholder;
  const fieldLabel = required && rawLabel ? `${rawLabel.replace(/\s*\*$/, "")} (obligatorio)` : rawLabel;

  return <View style={[styles.container, layoutStyle]}>
    {!!fieldLabel && <ThemedText pointerEvents="none" numberOfLines={1} style={[styles.label, focused && styles.labelFocused]}>{fieldLabel}</ThemedText>}
    <NativeTextInput
      ref={inputRef}
      {...props}
      aria-invalid={!!error}
      aria-describedby={error ? errorId : helperText ? helpId : undefined}
      aria-required={required}
      accessibilityHint={error || helperText || props.accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? fieldLabel}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      placeholder={fieldLabel ? undefined : placeholder}
      placeholderTextColor={theme.colors.textSubtle}
      style={[styles.input,inputStyle, fieldLabel && styles.inputWithLabel, focused && styles.focus, !!error && styles.error]}
    />
    {!!helperText && <ThemedText nativeID={helpId} style={styles.helper}>{helperText}</ThemedText>}
    {!!error && <ThemedText nativeID={errorId} accessibilityRole="alert" style={[styles.helper,styles.errorText]}>Error: {error}</ThemedText>}
  </View>;
}

const createStyles = (theme:Theme)=>StyleSheet.create({
  container: { minWidth: 0, position: "relative" },
  label: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    left: 11,
    maxWidth: "88%",
    paddingHorizontal: 4,
    position: "absolute",
    top: -7,
    zIndex: 2,
  },
  labelFocused: { color: theme.colors.primary },
  input:{backgroundColor:theme.colors.surfaceMuted,borderColor:theme.colors.surfaceMuted,borderRadius:theme.radius.control,borderWidth:1,color:theme.colors.text,minHeight:theme.control.minTouch,paddingHorizontal:16,paddingVertical:12},
  focus:{borderColor:theme.colors.focus,borderWidth:2},
  error:{borderColor:theme.colors.danger,borderWidth:2},
  errorText:{color:theme.colors.dangerText},
  inputWithLabel: { paddingTop: 15 },
  helper: { color: theme.colors.textMuted, ...theme.typography.caption, marginTop: 5, paddingHorizontal: 3 },
});
