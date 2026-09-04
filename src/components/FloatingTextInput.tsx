import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput as NativeTextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";

type FloatingTextInputProps = TextInputProps & {
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
  label,
  helperText,
  placeholder,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...props
}: FloatingTextInputProps) {
  const [focused, setFocused] = useState(false);
  const flattened = StyleSheet.flatten(style) ?? {};
  const layoutStyle: ViewStyle = {};
  layoutKeys.forEach((key) => {
    const value = flattened[key as keyof typeof flattened];
    if (value !== undefined) (layoutStyle as Record<string, unknown>)[key] = value;
  });
  const fieldLabel = label ?? placeholder;

  return <View style={[styles.container, layoutStyle]}>
    {!!fieldLabel && <Text pointerEvents="none" numberOfLines={1} style={[styles.label, focused && styles.labelFocused]}>{fieldLabel}</Text>}
    <NativeTextInput
      {...props}
      accessibilityLabel={accessibilityLabel ?? fieldLabel}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      placeholder={fieldLabel ? undefined : placeholder}
      placeholderTextColor="#8a919b"
      style={[style, fieldLabel && styles.inputWithLabel]}
    />
    {!!helperText && <Text style={styles.helper}>{helperText}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { minWidth: 0, position: "relative" },
  label: {
    backgroundColor: "white",
    color: "#747b85",
    fontSize: 11,
    fontWeight: "700",
    left: 11,
    maxWidth: "88%",
    paddingHorizontal: 4,
    position: "absolute",
    top: -7,
    zIndex: 2,
  },
  labelFocused: { color: "#d94f36" },
  inputWithLabel: { paddingTop: 15 },
  helper: { color: "#747b85", fontSize: 11, lineHeight: 16, marginTop: 5, paddingHorizontal: 3 },
});
