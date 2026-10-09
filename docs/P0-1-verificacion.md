# P0 · 1 — Implementación y revisión funcional

Alcance: cargas independientes, paginación, búsquedas remotas y estados de carga de inventario, clientes, usuarios, selector de clientes del POS y selector de insumos para recetas. No se implementó P0 · 2.

## Hallazgos verificados y solución

| Archivos | Problema y solución | Riesgo / verificación |
| --- | --- | --- |
| `src/features/operations/InventoryScreen.tsx` | Seis fuentes se aplicaban juntas: un fallo impedía mostrar el resto. Cargas y reintentos independientes; se conserva información anterior identificada como posiblemente desactualizada. Lotes/movimientos muestran cantidad cargada y total; el selector de lotes permite cargar más. | Medio: concurrencia y formularios dependientes. Prueba de fallo de alertas conservando stock y reintento de esa única fuente. |
| `src/features/administration/CustomersScreen.tsx` | Directorio limitado a primera página. Búsqueda remota con debounce, paginación y detalle/reglas de puntos independientes. | Medio: búsquedas y detalle asincrónicos. Pruebas de cancelación, páginas y sucursal. |
| `src/features/administration/UsersScreen.tsx` | Primera página sin navegación y consultas dependientes innecesariamente. Paginación; roles/permisos fallidos no bloquean directorio. | Bajo: misma API. Prueba de navegación con permisos fallidos. |
| `src/features/pos/PosScreen.tsx` | Selector de clientes limitado a 25. Búsqueda remota por nombre/teléfono y páginas conservando cliente seleccionado y sus direcciones. | Medio: selección separada del resultado de búsqueda; sin cambios al cobro. |
| `App.tsx` | Insumos buscados localmente entre primeros 100 y mostrados parcialmente. Búsqueda remota por nombre/SKU y paginación; selección explícita conservada entre búsquedas. | Medio: solo selector de receta; API prueba registro 105. |
| `src/hooks/useRemoteResource.ts`, `src/loadState.ts` | Lógica compartida de debounce, cancelación, exclusión de respuestas obsoletas, reintento sin caché y mensajes seguros. Se recupera última página válida tras eliminación. | Medio: probado con respuestas fuera de orden, cambios de sesión, filtros y reintentos. |
| `src/components/RemoteListStatus.tsx` | Diferencia carga, vacío, búsqueda sin resultados y error; muestra totales y límites de navegación. | Bajo: pruebas de estados y botones extremos. |
| `src/features/operations/ui.tsx`, `types.ts` | Helpers admiten cancelación/recarga y total del paginador. Conservan consumidores anteriores; carga completa de insumos sigue secuencial. | Bajo: typecheck y suites existentes. |
| API `IngredientController.php` | Agrega búsqueda opcional por nombre/SKU, filtro activo y validación de página/tamaño (1–100). Mantiene estructura Laravel, relaciones y aislamiento de sucursal. | Medio: pruebas de contrato, búsqueda y autorización. |
| API `CustomerController.php`, `UserController.php` | Orden estable con ID para evitar ambigüedad entre páginas. | Bajo: prueba de páginas no superpuestas. |
| `src/remoteLoads.test.mjs`, `src/testSupport/loadUi.mjs`, `package.json`, `package-lock.json` | Pruebas React con transporte y widgets nativos simulados; nuevas dependencias exclusivamente de desarrollo. | No sustituyen pruebas visuales en dispositivos. |
| API `tests/Feature/PaginatedLookupTest.php` | Tres pruebas nuevas de directorios, búsqueda más allá de primera página y de 100 insumos, filtros, sucursal y límites. | SQLite de pruebas; MariaDB concurrente requiere entorno dedicado. |

## APIs

Se reutilizan `GET /customers` (page, search, active; 25 por página), `GET /users` (page; 30), `GET /customers/{id}`, `/roles`, `/permissions`, `/loyalty-rules`, `/inventory/batches`, `/inventory/movements`, `/inventory/alerts`, `/catalogs/units` y `/catalogs/ingredient-types`.

`GET /ingredients` añade `search` (máximo 100 caracteres, nombre o SKU), `active`, validación `page >= 1` y `per_page` entre 1 y 100; conserva valor predeterminado 25 y metadatos Laravel. Los consumidores revisados usan tamaños compatibles. Backend y frontend deben desplegarse juntos (API primero).

## Bugs corregidos durante la revisión

- El hook devolvía su identificador interno como `key`. Al propagar sus propiedades a dos componentes, React recibía claves duplicadas y podía reconciliar incorrectamente los elementos. Ahora solo expone datos, carga, error y recarga; prueba de regresión.
- La búsqueda de insumos `0` se trataba como falsa y no filtraba. Ahora distingue explícitamente texto vacío; prueba de regresión de API.

## Validación ejecutada

- Frontend: `npm test`: 18 pruebas aprobadas, incluidas 7 nuevas.
- `npm run typecheck`: aprobado.
- `npm run build:web`: aprobado; exportación en `Pizzeria/dist`.
- Frontend no tiene script de lint. `git diff --check`: aprobado.
- API: suite completa, 130 aprobadas, 1 omitida, 1201 aserciones antes del último caso de búsqueda `0`.
- Después de ese ajuste: `PaginatedLookupTest`, 3 aprobadas, 47 aserciones.
- Pint: aprobado para los tres controladores modificados por esta tarea y el nuevo archivo de pruebas.
- El test omitido requiere una base dedicada MariaDB/InnoDB (y pcntl); no se validó concurrencia real en producción.
- Las pruebas automatizadas comprueban primera/siguiente/última página, filtros, límites, ausencia de resultados, búsqueda fuera de primera página, fallos, reintentos, debounce y respuestas fuera de orden.

## Límites y pendientes fuera del alcance

- Inventario sigue cargando todos los insumos secuencialmente para sus cálculos y selectores actuales; catálogos muy grandes pueden requerir otra estrategia en una tarea posterior.
- Paginación por desplazamiento puede cambiar si otros usuarios insertan/eliminan registros simultáneamente; orden estable no equivale a una instantánea.
- No se verificó la instalación Debian ni sus datos reales. Estos cambios no corrigen infraestructura, CORS ni fallos SQL de producción.
- Persistencia de borradores, rediseño, errores de guardado de otros flujos y agrupaciones de consultas ajenas a estos selectores quedan pendientes.
- No se modificó el cambio preexistente en `ComboController.php`.
- La instalación de dependencias informó vulnerabilidades del árbol npm; su actualización general queda fuera de esta tarea.
- Cambios y exportación locales; no se realizó publicación ni push en esta tarea.

## Prueba manual sugerida

1. Con más de 25 clientes y 30 usuarios, recorrer primera, siguiente y última página; comprobar totales y botones deshabilitados.
2. Buscar en Clientes y POS un nombre/teléfono de la última página. Escribir rápidamente y confirmar que solo quedan los resultados del último texto.
3. Seleccionar cliente en POS, cambiar búsqueda/página y verificar que conserva cliente/dirección; comprobar también «Sin cliente».
4. En recetas buscar por nombre/SKU un insumo posterior al número 100, seleccionarlo, cambiar búsqueda y agregarlo con su cantidad.
5. Buscar texto inexistente y diferenciar el mensaje de un directorio realmente vacío.
6. Bloquear `/inventory/alerts` en las herramientas del navegador: stock debe seguir visible y mostrar error de alertas. Desbloquear y reintentar; verificar que solo repite esa consulta.
7. Repetir con `/permissions` y verificar que se puede navegar usuarios. Simular red lenta al cambiar de página/búsqueda.
8. Confirmar en móvil que los controles de página y búsqueda sean accesibles. Las pruebas DOM no validan disposición visual nativa.
