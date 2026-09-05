import Echo from "laravel-echo";
import PusherModule from "pusher-js";
import { API_URL } from "./api";

// pusher-js 8 exposes a named constructor in its web bundle while its type
// declarations and React Native bundle still describe a default export.
const PusherClient = (PusherModule as unknown as { Pusher?: typeof PusherModule }).Pusher ?? PusherModule;

export type OrderStatusEvent = {
  id: number;
  daily_number: number;
  status: string;
  type: string;
  scheduled_at?: string | null;
};

export function ordersChannel(token: string, branchId: number, onChange: (event: OrderStatusEvent) => void): () => void {
  try {
    const host = process.env.EXPO_PUBLIC_REVERB_HOST;
    const key = process.env.EXPO_PUBLIC_REVERB_KEY;
    const port = Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? 443);
    if (!host || !key || !Number.isInteger(port) || port < 1 || port > 65535 || /(^|\.)localhost$/i.test(host) || host === "127.0.0.1") {
      throw new Error("Realtime no está configurado con un servidor seguro.");
    }
    const echo = new Echo({
      broadcaster: "reverb",
      Pusher: PusherClient,
      key,
      wsHost: host,
      wssPort: port,
      forceTLS: true,
      enabledTransports: ["wss"],
      authEndpoint: `${API_URL}/broadcasting/auth`,
      auth: { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    });
    echo.private(`branch.${branchId}.orders`).listen("OrderStatusChanged", onChange);
    return () => {
      echo.leave(`branch.${branchId}.orders`);
      echo.disconnect();
    };
  } catch (error) {
    console.warn("Actualización en tiempo real no disponible; se mantiene la recarga periódica.", error);
    return () => {};
  }
}
