import { useWindowDimensions } from "react-native";

export const MOBILE_MAX_WIDTH = 599;
export const TABLET_MAX_WIDTH = 1023;

export type ResponsiveSize = "mobile" | "tablet" | "desktop";

export function responsiveSize(width: number): ResponsiveSize {
  if (width <= MOBILE_MAX_WIDTH) return "mobile";
  if (width <= TABLET_MAX_WIDTH) return "tablet";
  return "desktop";
}

export function useResponsiveLayout() {
  const { width, height, scale, fontScale } = useWindowDimensions();
  const size = responsiveSize(width);
  return {
    width,
    height,
    scale,
    fontScale,
    size,
    mobile: size === "mobile",
    tablet: size === "tablet",
    desktop: size === "desktop",
    compact: size !== "desktop",
  } as const;
}
