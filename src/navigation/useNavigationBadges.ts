import { useEffect, useState } from "react";
import { api } from "../api";
import type { Screen } from "./modules";

export type NavigationBadges = Partial<Record<Screen, number>>;
type BadgeResponse = { kitchen?: number; delivery?: number; inventory?: number };

/** Pending work per module; refreshed on navigation, on realtime order events and every minute. */
export function useNavigationBadges(token: string | null, refreshKey: unknown): NavigationBadges {
  const [badges, setBadges] = useState<NavigationBadges>({});
  useEffect(() => {
    if (!token) { setBadges({}); return; }
    let active = true;
    const load = () => api<BadgeResponse>("/navigation/badges", token, { cache: "reload" })
      .then((counts) => { if (active && counts && typeof counts === "object") setBadges({ kitchen: counts.kitchen, orders: counts.kitchen, delivery: counts.delivery, inventory: counts.inventory }); })
      .catch(() => {}); // Counts are a convenience: a failure must never block navigation.
    void load();
    const timer = setInterval(load, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [token, refreshKey]);
  return badges;
}

export const badgeLabel = (count: number | undefined) => count ? `, ${count} pendiente${count === 1 ? "" : "s"}` : "";
