# Notificaciones de pedidos

La app ya muestra una notificación del sistema cuando recibe un evento de pedido: nuevo pedido para cocina, pedido listo para entrega o reparto y salida a reparto.

Para recibirlas mientras la APK está abierta, configura Reverb por HTTPS/WSS al compilar:

```env
EXPO_PUBLIC_REVERB_HOST=reverb.tudominio.com
EXPO_PUBLIC_REVERB_PORT=443
EXPO_PUBLIC_REVERB_KEY=tu-clave-publica
```

Las notificaciones cuando la aplicación está cerrada requieren push remoto. La APK usa Capacitor, por lo que hay que crear el proyecto Firebase de Android y agregar el archivo descargado como `android/app/google-services.json`. No se debe versionar ese archivo. Después configura el proveedor de FCM del servidor con sus credenciales privadas; no se incluyen credenciales de terceros en el repositorio.

El API registra los dispositivos y ya genera avisos persistentes y push de Expo para tokens Expo válidos. La credencial FCM es la única configuración externa pendiente para entrega remota en segundo plano con la APK Capacitor.
