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

export function ScreenMotion({ route, children, style }: { route: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    opacity.stopAnimation(); translateY.stopAnimation(); scale.stopAnimation();
    if (reduced) { opacity.setValue(1); translateY.setValue(0); scale.setValue(1); return; }
    opacity.setValue(0); translateY.setValue(motion.screenOffset); scale.setValue(.992);
    Animated.parallel([
      Animated.timing(opacity, { duration: motion.screen, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: nativeDriver }),
      Animated.timing(translateY, { duration: motion.screen, easing: Easing.out(Easing.cubic), toValue: 0, useNativeDriver: nativeDriver }),
      Animated.spring(scale, { damping: 20, mass: .7, stiffness: 240, toValue: 1, useNativeDriver: nativeDriver }),
    ]).start();
  }, [route, reduced, opacity, translateY, scale]);
  return <Animated.View style={[style, { opacity, transform: [{ translateY }, { scale }] }]}>{children}</Animated.View>;
}

export function PressMotion({ children, active = false, style }: { children: ReactNode; active?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { scale.setValue(1); lift.setValue(0); return; }
    Animated.parallel([
      Animated.spring(scale, { damping: 16, mass: .55, stiffness: 300, toValue: active ? 1.025 : 1, useNativeDriver: nativeDriver }),
      Animated.spring(lift, { damping: 18, mass: .6, stiffness: 280, toValue: active ? -2 : 0, useNativeDriver: nativeDriver }),
    ]).start();
  }, [active, reduced, scale, lift]);
  return <Animated.View style={[style, { transform: [{ translateY: lift }, { scale }] }]}>{children}</Animated.View>;
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
