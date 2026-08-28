# Pizzería POS — Frontend

## Desarrollo local

1. Copia `.env.example` a `.env` y cambia la IP por la de la computadora que ejecuta Laravel.
2. Instala dependencias con `npm ci`.
3. Inicia web y Expo Go con `npm start`.

Para navegador local puede usarse:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api
EXPO_PUBLIC_REVERB_HOST=127.0.0.1
EXPO_PUBLIC_REVERB_PORT=8080
```

En un teléfono físico, `127.0.0.1` apunta al propio teléfono. Usa una IP de la red local, por ejemplo `192.168.1.100`, y permite los puertos 8000, 8080 y 8081 en el firewall.

## Verificación

```bash
npm run typecheck
npx expo-doctor
npx expo export --platform web
```

La sesión se guarda en SecureStore en Android/iOS y en el almacenamiento local del navegador en web. Al iniciar, el token se valida contra `GET /api/me`; una respuesta 401 elimina la sesión automáticamente.
