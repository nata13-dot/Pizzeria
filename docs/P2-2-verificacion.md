# P2 · 2 — Límites frontend y retiro seguro de código antiguo

## Alcance y proceso

Se separaron las responsabilidades que todavía pertenecían a `App.tsx`, se retiraron únicamente las implementaciones antiguas confirmadas y se mantuvo el shell de P2 · 1 como autoridad de navegación. No se cambiaron permisos, contratos API, payloads, reglas comerciales, precios, breakpoints, tema, base de datos ni backend. No se inició P2 · 3.

Antes de modificar React Native se revisó la referencia versionada de Expo SDK 57. La implementación se hizo por cortes: inventario y referencias, composición, retiro antiguo, pedidos/documentos, cocina/reparto, reportes, dashboard, productos y finalmente shell.

## Inventario original de `App.tsx`

| Bloque | Estado anterior | Estado/efectos y dependencias | Riesgo |
| --- | --- | --- | --- |
| Bootstrap y boundary | Activo | Tema, `WorkProvider`, diálogo global y boundary | Medio |
| Sesión/login | Activo | restauración, `/me`, preferencias, expiración y logout | Alto |
| Shell/navegación | Activo | registro P2 · 1, historial Android, guards, ámbito y hoja | Alto |
| Dashboard | Activo | `Promise.all` de caja, pedidos y alertas | Medio |
| Pedidos | Activo | páginas del día, cobro, cancelación, cocina, historial, realtime/polling y sonidos | Alto |
| Cocina | Activo | tablero, temporizadores, gestos, estados e impresión | Alto |
| Reparto | Activo | estado, contacto, mapa, cobro e impresión | Alto |
| Productos/combos | Activo | configuración atómica, operación incierta, imágenes, combos y recetas | Muy alto |
| Reportes | Activo | consultas por familia, periodo y generación diaria | Medio |
| Documentos | Activo/compartido | generación, impresora térmica y compartir | Alto |
| POS/Clientes/Usuarios/Ajustes antiguos | Inalcanzables | ramas históricas dentro de `DataScreen` | Medio al retirar |
| Helpers/tipos/estilos | Mezclados | pedidos, productos, POS antiguo, shell y presentación | Medio |

El archivo tenía **2,406 líneas**, ocho pantallas/componentes activos de dominio embebidos —Dashboard, Pedidos, Cocina, Reparto, Reportes, Productos, Combos y el cargador `DataScreen`— y cuatro implementaciones de pantalla antiguas con sus auxiliares.

## Grafo y clasificación de referencias

La composición previa montaba directamente POS, Caja, Clientes, Usuarios, Ajustes, Inventario, Compras y Producción. Solo Productos, Reportes, Cocina y Reparto alcanzaban todavía `DataScreen`.

| Clase | Resultado |
| --- | --- |
| A · Activo | shell, Dashboard, Pedidos, Cocina, Reparto, Reportes, Productos, Combos, documentos, realtime y polling |
| B · Obsoleto confirmado | ramas antiguas POS/Clientes/Usuarios/Ajustes; `Pos`, `ProductCard` antiguo, `CustomerDocumentActions`, `CustomersView`, `UsersView` y `AdministrationView` |
| C · Solo pruebas antiguas | adaptador AST que reconstruía `ProductsView` desde `App.tsx`; fue sustituido por importación del módulo real |
| D · Compartido | tipos/contenido de pedido, impresión, `stockWarningDescription` y la generación de clave usada por Productos |
| E · Incierto | ninguna pieza incierta fue eliminada; los estilos activos se conservaron antes de filtrar propiedades sin referencias |

`createOrderIdempotencyKey` parecía pertenecer al POS antiguo, pero Productos la utilizaba como `operation_key`. Se conservó con el editor atómico. La búsqueda final confirma que ninguna feature importa `App.tsx`.

## Arquitectura resultante

```text
App.tsx
└── proveedores raíz y composición (8 líneas)
    └── shell/PizzeriaApp
        ├── sesión, login, notificaciones y logout
        ├── navegación P2 · 1 y Android Atrás
        └── navigation/ScreenContent
            ├── pantallas P0/P1 ya extraídas
            ├── Dashboard
            ├── Pedidos
            ├── Cocina / Reparto
            ├── Reportes
            └── Productos / Combos / Recetas
```

`screenComposition` enumera los 14 IDs y su destino de composición. El shell sigue siendo el único propietario de `screen` y la única ruta de cambio continúa siendo `requestModuleNavigation`. No se introdujo router ni otro estado global.

Los estilos literales se movieron fuera del entrypoint a una hoja compartida transitoria y se eliminaron 41 propiedades sin referencias, principalmente del POS y la hoja móvil antiguos. No se introdujeron tokens ni cambios visuales; la división semántica de estilos queda para P2 · 3.

## `DataScreen` y código retirado

`DataScreen` dejó de existir. Sus cuatro responsabilidades activas quedaron así:

- Productos tiene un cargador propio de `/products` con la misma caché, protección frente a respuestas anteriores y recarga explícita.
- Cocina y Reparto comparten una única infraestructura operativa para carga, acción, realtime, polling, segundo plano y limpieza.
- Reportes se monta directamente.

Se eliminaron las ramas y componentes antiguos confirmados, sus tipos de POS y sus estilos exclusivos. No se eliminó ninguna prueba funcional: la prueba de Productos dejó de extraer código por AST y ahora monta `ProductsView` real, incluidos ComboManager y SaleRecipes. El soporte especial `productFormSource.mjs` fue retirado.

## Dominios extraídos

### Pedidos, Cocina y Reparto

Los tipos de pedido tienen una sola definición. Pedidos conserva la carga de todas las páginas del día, descarte de respuestas antiguas, actualización a medianoche, locks por pedido, confirmaciones, autorización de faltantes, cobro, cancelación, envío a cocina, realtime, polling y sonido.

Cocina conserva columnas/pestañas, gesto móvil, temporizadores, estados, impresión y transiciones. Reparto conserva destinatario, teléfono, WhatsApp, mapa, saldo, cobro contra entrega, documentos y estados. La infraestructura operativa mantiene caché de ocho segundos, coalescencia, pausa en segundo plano, canal realtime, polling de respaldo y limpieza de timers/listeners.

Los documentos se comparten desde Pedidos: contenido, ancho de papel, impresión y enlace para compartir no se duplicaron.

### Reportes y Dashboard

Reportes ya no pasa por una lectura preliminar de `DataScreen`. La prueba demuestra un único `/reports/cash-day` al montar. Las demás consultas, periodos, etiquetas y generación diaria permanecen iguales.

Dashboard se extrajo sin modificar `Promise.all` ni `/inventory/alerts`. El acoplamiento de sus fuentes sigue documentado como deuda funcional; cambiar sus estados parciales queda fuera de P2 · 2.

### Productos, Combos y Recetas

Productos se extrajo al final y conserva:

- alta y desactivación;
- configuración atómica por un solo PUT;
- revisión, cuerpo congelado y `operation_key`;
- conflicto y resultado incierto;
- variantes, sabores, imagen y orilla;
- combos/promociones;
- `SaleRecipes` como componente ya extraído;
- guards de alta/edición y recarga posterior diferenciada.

No se modificó ningún payload. Las regresiones reales siguen comprobando precio decimal, validación, edición atómica, foco de error y receta con revalidación de ingredientes.

### POS y tipos compartidos

Los tipos que `pricing.ts` y la reconciliación importaban desde `PosScreen` pasaron a `features/pos/types.ts`. `PosScreen` los reexporta para compatibilidad. Esto elimina el retorno de helpers hacia el componente sin duplicar definiciones ni modificar cálculo alguno.

## Pruebas adaptadas y nuevas

- Composición completa de los 14 IDs y destinos estables.
- Entry point sin pantallas antiguas y shell usando `ScreenContent`/`requestModuleNavigation`.
- Features sin imports hacia `App.tsx` y sin retorno del grafo de composición al entrypoint.
- Presencia única de realtime, polling, limpieza e impresión compartida.
- Reportes con una sola consulta inicial.
- Cocina con transición e impresión.
- Reparto con transición, contacto y documentos.
- Productos real en las pruebas de formularios, guardado atómico y recetas.
- Suite completa de P0 · 1/2/3, P1 · 4/5/6/7 y P2 · 1.

Resultados finales:

- `npm test`: **99 aprobadas** después de la revisión dirigida.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**, exportación actualizada en `Pizzeria/dist`.
- `git diff --check`: **aprobado**.
- No se modificó ni ejecutó artificialmente el backend.

## Métricas antes/después

| Métrica | Antes | Después |
| --- | ---: | ---: |
| `App.tsx` | 2,406 líneas | 8 líneas |
| Shell/sesión/login/boundary | mezclados con dominios | límite propio de aproximadamente 313 líneas |
| Pantallas activas embebidas | 8 más `DataScreen` | 0 en el entrypoint |
| Pantallas antiguas | POS, Clientes, Usuarios y Ajustes | retiradas |
| Adaptador AST de Productos | dependía de símbolos de `App.tsx` | retirado; prueba el módulo real |
| Estilos globales | 210 propiedades aproximadas | 169 activas en hoja transitoria compartida |

La reducción de líneas es una consecuencia. El criterio de aprobación es que sesión, navegación, pedidos, documentos y productos tienen propietarios definidos y las regresiones conservan su comportamiento.

## Riesgos restantes y comprobación manual

- La hoja `appStyles` continúa compartida y conserva colores literales; P2 · 3 decidirá tokens y propiedad visual por componente.
- Dashboard mantiene cargas acopladas y la lectura costosa de alertas.
- Los errores técnicos antiguos en Dashboard, Reportes y pantallas operativas no se rediseñaron.
- Las pruebas DOM no sustituyen realtime real, impresora, Android Atrás ni gestos físicos.
- No se verificaron Android/iOS, impresora térmica ni servidor Debian durante esta fase.

Comprobación manual recomendada:

1. Entrar a los 14 módulos con administración y repetir permisos de caja, cocina y reparto.
2. Ejecutar cobro, cancelación, envío a cocina y entrega; observar realtime y polling al suspender/reactivar.
3. Recorrer Cocina en escritorio y móvil, incluidos swipe, temporizador e impresión.
4. Recorrer Reparto con llamada, WhatsApp, mapa, cobro y documento.
5. Generar cada reporte y confirmar que no aparece una carga previa ajena.
6. Crear y editar un producto, simular conflicto y respuesta perdida, y comprobar una sola configuración atómica.
7. Crear combo y receta desde Productos; navegar y volver comprobando guards y memoria.
8. Repetir navegación P2 · 1, logout y Android Atrás con trabajo pendiente.

## Revisión dirigida posterior

Se revisó exclusivamente la extracción de P2 · 2. No se encontraron regresiones funcionales o estructurales críticas, altas ni medias. No se modificaron pantallas, navegación, estilos visuales, tema, tokens, APIs ni backend.

### Hallazgos y evidencia

- **Composición — sin defecto:** los 14 IDs del registro tienen un único destino en `screenComposition`. POS, Clientes, Usuarios y Ajustes montan exclusivamente sus pantallas actuales. `requestModuleNavigation` sigue siendo la única transición después de la inicialización de sesión; Dashboard, sidebar, barra compacta y hoja delegan en ella.
- **Código retirado — sin referencia activa:** no existen `DataScreen`, el POS antiguo, `CustomersView`, `UsersView`, `AdministrationView` ni `productFormSource.mjs`. El `ProductCard` que permanece pertenece al `PosScreen` activo y no es la implementación retirada. No se eliminaron símbolos inciertos.
- **Equivalencia de extracción — sin diferencia:** se compararon mediante AST los cuerpos anteriores y actuales de Dashboard, Pedidos, Cocina, Reparto, Reportes, Productos y Combos. Los cuerpos son equivalentes; solo cambiaron archivo, exportación o nombre de pantalla.
- **Productos — sin defecto:** el intento de configuración conserva una sola `operation_key`, `expected_revision` y el cuerpo serializado dentro de `configurationAttempt`. Una respuesta incierta consulta el resultado y un reintento explícito reutiliza el mismo cuerpo; no reconstruye el payload desde el formulario. Se mantienen variantes, sabores, orilla rellena, imágenes, Combos/Tricombo, Recetas de venta y guards.
- **Pedidos y operación — sin defecto:** Pedidos conserva carga de todas las páginas, contador de solicitud, fuente de carga, cambio de día, locks, cobro, cancelación, cocina, historial, sonido, realtime y polling. Cocina y Reparto comparten un solo `OperationalOrdersScreen`; cada montaje crea una carga, un canal, un listener de estado y un timer de polling, y libera canal, listener y timers al desmontar.
- **Documentos — sin divergencia:** `DocumentButton`, generación, impresión y compartir tienen una sola implementación bajo `features/orders/shared.tsx`. Cocina y Reparto la consumen. Pedidos comparte desde el mismo módulo el contenido y los helpers que ya utilizaba; `OrdersDayScreen` no ofrecía impresión antes de la extracción y no se añadió una acción nueva durante esta revisión.
- **Reportes y Dashboard — sin defecto:** Reportes monta directamente y hace una sola consulta inicial. Dashboard conserva intencionalmente `Promise.all` y `/inventory/alerts`; esa deuda no se modificó.
- **Tipos y ciclos — sin defecto:** `features/pos/types.ts` es la definición de los tipos compartidos. `PosScreen` solo los reexporta para compatibilidad y `pricing`/reconciliación usan imports de tipo. El grafo de imports en tiempo de ejecución no contiene ciclos y ninguna feature retorna a `App.tsx`.
- **Estilos — sin defecto:** las 169 propiedades de `appStyles` conservan referencias activas. No hay acceso dinámico que reactive alguna de las 41 propiedades retiradas ni estilos huérfanos demostrables relacionados con las pantallas antiguas.
- **P2 · 1 — sin regresión:** la suite revalidó permisos, grupos, módulo activo, guard de salida, logout, Atrás, historial, ámbito API/usuario/sucursal, hoja, foco y memoria de consulta de Inventario/Clientes.

### Corrección de cobertura y pruebas añadidas

Se clasificó como **bajo** un hueco de cobertura: realtime/polling se comprobaba parcialmente mediante búsqueda de texto fuente. No había un fallo funcional reproducible. Se amplió el adaptador de IO de pruebas para observar el canal y `AppState`, y se añadieron dos regresiones sobre componentes reales:

1. `OperationalOrdersScreen` demuestra una sola carga y una sola suscripción, y comprueba la limpieza del canal y del listener al desmontar.
2. `OrdersDayScreen` demuestra que solicita exactamente una vez cada página necesaria y combina sus pedidos.

No se retiró ninguna prueba anterior. El antiguo adaptador AST de Productos cubría el formulario extraído desde `App.tsx`; las pruebas actuales lo sustituyen montando `ProductsView` real, incluidos ComboManager y SaleRecipes, por lo que protegen el componente ejecutado por la aplicación.

### Comandos ejecutados

- Pruebas dirigidas de arquitectura, extracción y navegación: **19 aprobadas**.
- `npm test`: **99 aprobadas**.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**; `Pizzeria/dist` actualizado.
- `git diff --check`: **aprobado**.

La primera ejecución de typecheck coincidió con `build:web` reemplazando bundles de `dist` y TypeScript informó archivos generados que acababan de desaparecer. Al terminar la exportación, el mismo typecheck se ejecutó de nuevo y aprobó sin cambios de código.

### Riesgos que permanecen

- El entorno DOM simulado no prueba una conexión realtime, suspensión nativa, gestos físicos ni impresora real.
- El comportamiento visual y los colores literales permanecen sin cambios; su migración queda fuera de esta revisión.
- Dashboard mantiene sus cargas acopladas y la lectura de alertas por decisión explícita del alcance.
- No se ejecutó ni modificó el backend porque no se encontró una regresión de P2 · 2 que lo justificara.

P2 · 2 termina aquí. No se inició P2 · 3.
