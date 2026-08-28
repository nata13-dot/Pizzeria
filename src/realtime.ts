import Echo from "laravel-echo";
import PusherModule from "pusher-js";
import { API_URL } from "./api";

// pusher-js 8 exposes a named constructor in its web bundle while its type
// declarations and React Native bundle still describe a default export.
const PusherClient = (PusherModule as unknown as { Pusher?: typeof PusherModule }).Pusher ?? PusherModule;

export function ordersChannel(token: string, branchId: number, onChange: () => void): () => void {
  try {
    const host = process.env.EXPO_PUBLIC_REVERB_HOST ?? "127.0.0.1";
    const port = Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? 8080);
    const echo = new Echo({
      broadcaster: "reverb",
      Pusher: PusherClient,
      key: process.env.EXPO_PUBLIC_REVERB_KEY ?? "pizzeria-local-key",
      wsHost: host,
      wsPort: port,
      wssPort: port,
      forceTLS: false,
      enabledTransports: ["ws", "wss"],
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
