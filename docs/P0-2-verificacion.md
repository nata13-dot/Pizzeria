# P0 · 2 — Conservación y recuperación del trabajo

## Arquitectura implementada

Un `WorkProvider` situado sobre las pantallas autenticadas conserva el estado editable del POS, de recetas de venta y de compras. Las pantallas continúan desmontándose al navegar; no se mantienen módulos ocultos ni consultas de fondo para conservar formularios.

`useWorkField` proporciona los campos desde una única fuente en memoria. El almacenamiento de borradores está concentrado en `WorkStore`: AsyncStorage, versión 1, ámbito API/usuario/sucursal, fecha de modificación y lista explícita de campos permitidos. Las escrituras del POS se agrupan durante 500 ms y se serializan; al salir, cerrar sesión o pasar a segundo plano se solicita una escritura inmediata. No se persisten recetas ni compras.

La lectura debe terminar antes de editar. Si el almacenamiento no puede leerse, se solicita reintentar antes de iniciar otra venta. Un fallo al escribir conserva el trabajo en memoria y avisa. Un fallo al descartar restaura los campos en memoria; un fallo al eliminar el seguimiento de una operación conserva su referencia.

En web se utiliza Web Locks para que solo una pestaña edite el POS de un mismo ámbito. Otra pestaña queda bloqueada para editar; debe cerrarse la anterior y recargarse la página. Sin Web Locks no se habilita la edición del POS. React Native utiliza el estado del proceso y AsyncStorage.

## Archivos

| Archivos modificados | Cambio de P0 · 2 |
| --- | --- |
| `App.tsx` | Proveedor, apertura por propietario, protección de navegación/logout/retroceso Android, receta en memoria y protección de producto nuevo/en edición. |
| `src/features/pos/PosScreen.tsx` | Campos centralizados, recuperación, revalidación, descarte confirmado y seguimiento seguro del pedido antes/después del POST. |
| `src/features/operations/PurchasesScreen.tsx` | Conservación de campos y renglones en memoria; protección al cerrar y comprobación de presentaciones/proveedor antes de guardar. |
| `src/features/administration/CustomersScreen.tsx` | Detección de cambios en alta/edición y protección al cambiar de módulo o cliente. |
| `src/components/ConfirmationDialog.tsx` | Opciones compatibles de título y acciones; foco inicial, Escape, ciclo de Tab y retorno de foco en web. |
| `src/testSupport/loadUi.mjs` | Simulación de almacenamiento y widgets nativos para ejecutar los componentes reales con React DOM. |
| API: `OrderController.php`, `CustomerController.php`, `routes/api.php` | Consultas de recuperación acotadas, autenticadas y sin escritura. |

Archivos nuevos:

- `src/work/store.ts`: almacenamiento, validación, ámbito, caducidad y seguimiento de operaciones.
- `src/work/WorkProvider.tsx`: integración React, campos compartidos, protección de salida y exclusión entre pestañas.
- `src/work/reconcile.ts`: comprobación de renglones y reconstrucción de precios con catálogo/configuración actuales.
- `src/workStore.test.mjs` y `src/workUi.test.mjs`: pruebas de almacenamiento, navegación, recuperación y diálogo.
- API: `tests/Feature/WorkRecoveryTest.php`.
- Este informe.

Los cambios previos de P0 · 1 permanecen. El cambio preexistente de `ComboController.php` no fue modificado por esta tarea. No se añadieron dependencias para P0 · 2 ni migraciones.

## Datos persistidos y excluidos

**Recuperables durante 24 horas desde la última modificación:** productos/combos y sus identificadores, cantidades, sabores, modificadores, componentes, notas, referencia del cliente y dirección, entrega/recogida, canal, contacto/dirección manuales, zona y programación. Los nombres de renglones sirven para identificar opciones que dejaron de existir.

**Solo en memoria:** preferencia e importe introducido de pago, selección completa del cliente obtenida del servidor, referencias de presentación de la interfaz; campos de recetas y compras.

**No persistidos en el borrador:** token, datos bancarios, comprobantes, imágenes, autorizaciones de faltantes, cortesía, estado de pago confirmado, precios locales como autoridad ni objetos completos de respuesta del servidor. Al reiniciar se debe seleccionar nuevamente el pago.

Un marcador mínimo con clave de idempotencia y, cuando existe, ID de pedido se conserva hasta resolver una operación. No contiene datos de contacto ni pagos y no caduca con el carrito: borrar una operación incierta permitiría iniciar por error otra venta.

La caducidad se comprueba al leer el borrador. La limpieza es diferida hasta volver a abrir ese ámbito; no existe un servicio que borre almacenamiento de dispositivos cerrados exactamente al cumplirse 24 horas. AsyncStorage no cifra estos datos.

## Usuario, sucursal y revalidación

La clave incluye URL de API, usuario y sucursal. Al cerrar sesión se conserva el POS para su dueño; al entrar otro usuario o sucursal se vacía la memoria anterior. La pantalla comprueba el propietario antes de renderizar, y los setters antiguos no pueden modificar el ámbito nuevo.

Al entrar al POS o pulsar Actualizar se consultan catálogo, combos, configuración y el cliente seleccionado. La búsqueda paginada de clientes de P0 · 1 se mantiene independiente; no se recarga todo el catálogo por cada selección de cliente.

Se reconstruyen precios y opciones de los renglones. Un producto, variante, sabor o componente incompatible permanece visible, identificado para quitarlo y seleccionarlo nuevamente; no se sustituye silenciosamente. Los cambios de precio/dirección requieren revisión. Cliente inactivo, programación vencida o verificación fallida impiden continuar sin corregir/reintentar. La dirección manual no se sobrescribe automáticamente.

El backend conserva la autoridad final sobre precios, recetas, inventario, pagos y reglas comerciales. No se debilitaron sus validaciones ni transacciones.

## Pedidos y APIs de recuperación

- `GET /orders/operation?key=…`: permiso `pos.use`, filtro por creador y sucursal. Devuelve `{ order: null }` o datos mínimos del pedido existente (`id`, número, estado, total, programación). No registra pedidos ni pagos; respuesta `no-store`.
- `GET /pos/customers/{customer}`: permiso `pos.use`, misma sucursal, únicamente ID, nombre, teléfono, activo y direcciones. No expone historial ni movimientos de puntos; respuesta `no-store`.

Antes del POST se exige guardar la clave de operación. Si el almacenamiento falla no se envía. Una respuesta incierta conserva la clave; al recuperar se consulta el servidor, sin ejecutar automáticamente otro POST ni cobrar. Un reintento explícito conserva esa misma clave. Las respuestas definitivas de validación de un primer intento liberan su marcador; una operación previamente incierta no se libera por una validación posterior.

Cuando se confirma la creación, se limpia el carrito. Si queda pendiente cocina se trabaja sobre el pedido ya creado, mediante acción explícita; también se puede continuar desde Pedidos del día. Descartar una venta local no cancela un pedido del servidor. Se impide descartar o cambiar sus productos mientras hay una operación incierta.

**Orden de despliegue:** API primero, frontend después. No se ejecutaron cambios en el servidor Debian ni publicación remota.

## Formularios protegidos

- **Recetas de venta:** variante/sabor, nombre, insumos, cantidades, componente y edición pendiente permanecen al navegar. Al guardar se consultan los insumos y se mantiene la validación backend.
- **Compras:** proveedor, fecha, origen del pago, notas, renglones, costos, lotes, caducidades y captura pendiente permanecen al navegar. Se comprueba que las presentaciones estén disponibles.
- **Productos y clientes:** cambios importantes requieren confirmación antes de abandonar/sustituir el formulario. No se persisten imágenes ni formularios administrativos.
- Los guardados en curso impiden abandonar el flujo. No se efectúan reintentos automáticos de compras, productos o recetas.
- En web se registra `beforeunload` solo cuando hay trabajo no recuperable o escrituras pendientes; el navegador controla su texto.

## Validación

- `npm test`: **34 aprobadas**, incluidas las regresiones de P0 · 1 y 16 pruebas nuevas de P0 · 2.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**, exportación actualizada en `Pizzeria/dist`.
- API, `php artisan test --compact`: **132 aprobadas, 1 omitida**, 1224 aserciones. La omitida exige una base dedicada MariaDB/InnoDB y pcntl.
- Pint sobre los controladores/rutas/pruebas PHP afectados: **aprobado**.
- `git diff --check` en ambos repositorios: **aprobado**.
- Lint frontend continúa sin estar configurado; no se añadió ESLint.

Cobertura nueva:

- Desmontar/remontar POS conservando carrito, cliente y entrega.
- Recuperación desde almacenamiento y exclusión de pagos/precios y formularios de memoria.
- Aislamiento por usuario, sucursal y API; datos nulos, corrupción, formato antiguo y caducidad.
- Escrituras agrupadas, borrado frente a escrituras anteriores, lectura/escritura fallidas y fallo al descartar.
- Actualización de precios y conservación de renglones inválidos.
- Descarte únicamente tras consentimiento; advertencias para formularios y cierre de sesión.
- Confirmación de venta con marcador escrito antes del POST y limpieza posterior.
- Respuesta perdida: recuperación del pedido existente sin segundo POST ni pago; cocina explícita.
- Acciones del diálogo, Escape y retorno de foco.
- API: consulta sin efectos de escritura, reintento con una sola orden/un solo pago, aislamiento y permisos.

## Riesgos y pendientes fuera del alcance

- La navegación y el diálogo se probaron con React DOM y widgets/IO simulados. Falta validación manual en navegador real y dispositivo Android/iOS; no se midió memoria en el servidor Debian.
- Un cierre forzado puede perder las últimas pulsaciones anteriores a la escritura de 500 ms. Los formularios solo en memoria no sobreviven a una terminación del proceso o expiración de sesión.
- Una operación incierta sin datos recuperables conserva su referencia y puede requerir revisar Pedidos del día con un administrador. No se descarta automáticamente ante una consulta sin resultados: la petición original puede seguir en tránsito.
- No hay sincronización entre dispositivos ni edición concurrente de un mismo borrador. El bloqueo web requiere Web Locks.
- Los guardados parciales preexistentes de productos y la idempotencia de otros formularios no se rediseñaron. Si el resultado de una compra es incierto se indica revisar el historial antes de repetir.
- Recetas de producción, proveedores y otros formularios administrativos quedan pendientes. Solo las recetas de venta y formularios nombrados arriba se incluyeron.
- Cambios locales y exportación web; sin commit, push ni despliegue en esta tarea. P0 · 3 no fue iniciado.

## Prueba manual recomendada

1. Agregar un producto con sabores/extras, cliente y entrega. Ir a Inventario y Clientes y volver: comprobar todos los datos.
2. Recargar y volver a entrar con el mismo usuario: revisar el aviso, precios actuales y nueva selección del pago.
3. Cerrar sesión con venta pendiente y entrar con otro usuario: no debe aparecer. Volver al dueño antes de 24 horas y recuperar.
4. Cambiar precio o desactivar un producto/cliente desde otra sesión; volver al POS y comprobar revisión/bloqueo, sin sustitución silenciosa.
5. Descartar y elegir primero seguir: conserva la venta. Confirmar descarte: no vuelve después de recargar.
6. Registrar una venta y comprobar que el carrito queda limpio. Simular respuesta perdida y comprobar el pedido antes de reintentar: no debe existir otra orden ni otro pago.
7. Preparar una receta y una compra; navegar y volver. Al cerrar sesión/recargar comprobar advertencia por trabajo que solo está en memoria.
8. Modificar un producto o cliente y cambiar de módulo/registro: comprobar acciones explícitas y conservación si se cancela la salida.
9. Usar teclado en el diálogo: Tab, Mayús+Tab, Escape y retorno del foco.
10. Abrir el POS en dos pestañas: una sola debe permitir editar. Cerrar la primera y recargar la segunda.
11. Repetir búsquedas remotas y paginación de P0 · 1, incluyendo cliente fuera de primera página e insumo posterior al número 100.
