import { type ReactNode, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, type StyleProp, type ViewStyle } from "react-native";
import { motion } from "./tokens";

const nativeDriver = Platform.OS !== "web";

function testEnvironment() {
  return Boolean((globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT);
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(testEnvironment());
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduced);
    return () => { mounted = false; subscription?.remove?.(); };
  }, []);
  return reduced;
}

/** Short fade and lift on route change; no scale so text never blurs or bounces. */
export function ScreenMotion({ route, children, style }: { route: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    opacity.stopAnimation(); translateY.stopAnimation();
    if (reduced) { opacity.setValue(1); translateY.setValue(0); return; }
    opacity.setValue(0); translateY.setValue(motion.screenOffset);
    const timing = { duration: motion.screen, easing: Easing.out(Easing.cubic), toValue: 0, useNativeDriver: nativeDriver };
    Animated.parallel([Animated.timing(opacity, { ...timing, toValue: 1 }), Animated.timing(translateY, timing)]).start();
  }, [route, reduced, opacity, translateY]);
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

export function usePressMotion() {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue: number) => {
    if (reduced) { scale.setValue(1); return; }
    Animated.spring(scale, { damping: 18, mass: .45, stiffness: 420, toValue, useNativeDriver: nativeDriver }).start();
  };
  return { animatedStyle: { transform: [{ scale }] }, pressIn: () => animate(motion.pressedScale), pressOut: () => animate(1) };
}
