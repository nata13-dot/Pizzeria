# Caché de aplicación y archivos

## Alcance

La carga se divide en dos capas con responsabilidades distintas. La exportación web precarga todos sus archivos estáticos mediante un Service Worker versionado por contenido. Android conserva esos mismos archivos dentro de la APK mediante Capacitor, por lo que JavaScript, estilos, emblema y sonidos no dependen de una descarga al abrir la aplicación.

Las respuestas API continúan bajo la caché del cliente. Las lecturas concurrentes se deduplican; catálogos estables se conservan en memoria y almacenamiento local; y las mutaciones invalidan los recursos relacionados. Pedidos, Cocina, Reparto, inventario operativo y otros datos variables no se sirven silenciosamente desde una copia persistente.

## Archivos estáticos

`npm run build:web` genera `dist/service-worker.js` después de la exportación. El manifiesto incluye cada archivo producido por Expo, usa un identificador derivado del contenido y elimina versiones anteriores al activarse. La navegación puede arrancar desde `index.html` almacenado y los bundles, imágenes y sonidos se resuelven primero desde Cache Storage.

El Service Worker solo intercepta rutas incluidas en su manifiesto. No almacena respuestas API, solicitudes con escritura ni recursos de otros orígenes. Una nueva exportación cambia el identificador de caché y reemplaza el conjunto completo.

El emblema utilizado por el shell se redujo de 938 KB a 42 KB. El archivo original permanece para iconos y material de alta resolución.

## Datos de aplicación

La caché automática admite hasta 16 MB en memoria y 8 MB por entrada persistente, suficiente para conservar un catálogo POS con fotografías entre cierres y reaperturas. El almacenamiento sigue aislado por sesión y sucursal, se elimina al cerrar sesión y no repone datos después de una mutación relacionada. Las respuestas de autorización nunca usan una copia anterior y `no-store`/`reload` conservan su significado.

## Verificación

- El generador incluye todos los archivos exportados y cambia de versión cuando cambia su contenido.
- Chrome registró y controló la aplicación con el Service Worker.
- Cache Storage contuvo los 14 archivos de la exportación comprobada.
- Con la red desactivada desde DevTools, una recarga volvió a montar la aplicación desde caché.
- Una prueba con un catálogo POS de más de 3 MB comprobó persistencia y recuperación después de reiniciar el cliente sin otra solicitud de red.
- Los datos operativos continúan sin persistencia y las mutaciones conservan sus pruebas de invalidación.
