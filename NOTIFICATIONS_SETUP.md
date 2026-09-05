# Notificaciones de pedidos

La app muestra una notificación del sistema cuando recibe un evento de pedido: nuevo pedido para cocina, pedido listo para entrega o reparto y salida a reparto. El canal `orders_kitchen_bell` usa el sonido `campanilla.wav` incluido en la APK.

Para recibirlas mientras la APK está abierta, configura Reverb por HTTPS/WSS al compilar:

```env
EXPO_PUBLIC_REVERB_HOST=reverb.tudominio.com
EXPO_PUBLIC_REVERB_PORT=443
EXPO_PUBLIC_REVERB_KEY=tu-clave-publica
```

Las notificaciones cuando la aplicación está cerrada requieren push remoto. La APK usa Capacitor, por lo que hay que crear el proyecto Firebase de Android y agregar el archivo descargado como `android/app/google-services.json`. No se debe versionar ese archivo.

En Firebase crea una cuenta de servicio con acceso a Firebase Cloud Messaging. Guarda su JSON completo (o el JSON codificado en base64) en Railway:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={...}
```

El archivo `google-services.json` de la APK y la cuenta de servicio del API deben pertenecer al mismo proyecto Firebase. El API envía mediante FCM HTTP v1 y conserva soporte para tokens Expo.

Después de configurar las credenciales hay que reconstruir e instalar la APK. En Android, el sonido de un canal existente es inmutable; por eso esta versión usa un identificador de canal nuevo.
