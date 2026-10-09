# P1 · 7 — Simplificación funcional de Compras e Inventario

## Alcance

Se reorganizaron exclusivamente Compras e Inventario para responder qué existe, qué falta, qué cambió y cuánto ingresará con una compra. Se conservan transacciones, conversiones configurables, unidades base, costos, lotes, movimientos, memoria de formularios y las garantías de P0/P1. No se inició P2, no se cambió la navegación global y no se añadió idempotencia general para compras.

El costo capturado continúa siendo el **total del renglón**. La interfaz muestra además el costo calculado por presentación. No se modificó el contrato histórico ni se reinterpretaron importes guardados.

## Inventario

La entrada del módulo utiliza ahora tres lecturas acotadas:

- `GET /inventory/summary`: cantidades globales de disponibles, bajos/críticos, agotados y lotes próximos a caducar.
- `GET /inventory/items?search=&status=&active=&page=`: existencias paginadas de 25 registros, búsqueda por nombre/SKU, filtros y orden estable.
- `GET /inventory/items/{ingredient}`: detalle operativo con presentaciones, diez lotes y diez movimientos recientes.

La existencia utilizable excluye lotes caducados. Los estados visibles son Disponible, Existencia baja, Existencia crítica y Agotado. El faltante es únicamente `máximo(mínimo − existencia, 0)` en la unidad base; cuando el mínimo es cero se explica que no existe un objetivo configurado.

La búsqueda, filtros y página permanecen independientes del detalle. El hook remoto conserva debounce, cancelación y rechazo de respuestas fuera de orden. Los totales del resumen proceden del endpoint agregado y nunca de la página visible.

Alertas, lotes, movimientos y configuración se cargan al abrir su sección. Se mantiene el comportamiento existente de `/inventory/alerts`: recalcula y persiste alertas al leerse, por lo que ya no forma parte de la carga inicial. Lotes admiten búsqueda, ingrediente y estado; movimientos admiten búsqueda, ingrediente y tipo. Los movimientos devuelven etiquetas cotidianas y un origen seguro como Compra, Pedido, Producción o Ajuste, sin mostrar nombres de clases PHP.

El detalle explica lotes agotados, caducados, próximos a caducar o disponibles. La interfaz describe que se utiliza primero lo que caduca antes, sin presentar FEFO como concepto principal. La administración de ingredientes, presentaciones y ajustes conserva permisos y escrituras anteriores. Al editar una presentación ya no se sustituye automáticamente una unidad incompatible.

## Compras

El flujo final es:

1. Elegir proveedor o Sin proveedor y completar fecha, origen de pago y notas.
2. Buscar remotamente un insumo por nombre o SKU.
3. Cargar el insumo exacto y elegir una de sus presentaciones activas.
4. Capturar cantidad de presentaciones, costo total, lote y caducidad.
5. Revisar la conversión a unidad base y el costo calculado por presentación.
6. Agregar o actualizar el renglón; también puede quitarse.
7. Revisar proveedor, entradas al inventario y total.
8. Registrar mediante un único `POST /purchases`.

La búsqueda no descarga todo el catálogo y puede encontrar registros fuera de la primera página. El formulario y sus renglones permanecen en el `WorkProvider` existente al navegar. Cantidades y costos aceptan punto o coma decimal; vacío no equivale a cero. La suma monetaria y la división informativa reutilizan los límites y redondeo decimal de P0 · 3.

Cada presentación incluye una revisión opaca `purchase_revision`. Al entrar a revisión y nuevamente antes de escribir, el frontend consulta cada insumo por ID y comprueba que la presentación siga activa, compatible y sin cambios. Un renglón inválido permanece visible y bloquea el registro; nunca se sustituye por otra presentación o unidad.

El POST acepta `expected_presentation_revision` de forma opcional para mantener consumidores anteriores. Dentro de la transacción, después de bloquear presentaciones, ingredientes y unidades, el backend recalcula la revisión. Una diferencia responde `409 presentation_changed` antes de crear compra, renglón, lote o movimiento.

Una compra confirmada limpia primero el formulario. Si después falla la actualización del historial, se informa que la compra sí fue registrada y no se invita a repetirla. Una respuesta incierta conserva el formulario y orienta a revisar el historial. No existen reintentos automáticos de escrituras.

El historial y detalle cargan ahora la presentación relacionada, de modo que muestran su nombre real. Un fallo de historial, proveedores o búsqueda mantiene utilizables las demás secciones y sus reintentos.

## Contratos y archivos

Frontend principal:

- `src/features/operations/InventoryScreen.tsx`: resumen, listado remoto, filtros, detalle y carga diferida.
- `src/features/operations/PurchasesScreen.tsx`: búsqueda remota, conversión, edición de renglones, revisión y comprobación de presentaciones.
- `src/features/operations/types.ts`: proyecciones de inventario y revisión de presentación.
- `src/money.ts`: división decimal exacta para el costo informativo por presentación.
- `src/forms.test.mjs`, `src/money.test.mjs` y `src/remoteLoads.test.mjs`: regresiones del nuevo recorrido.

API principal:

- `InventoryController`: resumen, proyección paginada, detalle y filtros acotados.
- `IngredientController`: revisión de presentaciones en listado y detalle.
- `PurchaseController`: comprobación bajo bloqueo y respuesta de conflicto.
- `PurchasePresentationRevision`: hash estable del estado relevante de presentación, ingrediente y unidades.
- `Ingredient` y `PurchaseItem`: existencia proyectada sin consulta adicional y relación de presentación.
- `InventoryPurchaseExperienceTest`: contratos, estados, conversiones, atomicidad y conflicto.

No hay migraciones ni dependencias nuevas para P1 · 7.

## Verificación funcional

Las pruebas comprueban:

- estados Disponible/Bajo/Crítico/Agotado y faltante hacia el mínimo;
- resumen independiente de las páginas, búsqueda por SKU, filtros y detalle;
- cargas diferidas y fallo de alertas sin ocultar existencias;
- origen legible de movimientos y filtro de lotes próximos a caducar;
- búsqueda remota y selección explícita de presentación;
- coma/punto decimal, costo total y costo por presentación exacto;
- conservación del borrador, revisión cancelada y bloqueo de doble pulsación;
- conversión configurada `2 bolsas × 1 kg = 2,000 g`;
- misma cantidad en renglón, lote, movimiento y existencia;
- revisión válida y cambio concurrente con `409` y rollback total;
- regresiones completas de P0 · 1/2/3 y P1 · 4/5/6.

Resultados finales:

- Frontend `npm test`: **80 aprobadas**.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**, exportación actualizada en `Pizzeria/dist`.
- API `php artisan test --compact`: **159 aprobadas, 2 omitidas**. Las omitidas siguen requiriendo MariaDB/InnoDB dedicado y `pcntl`.
- Prueba dirigida de P1 · 7: **2 aprobadas, 37 aserciones**.
- Pint sobre PHP afectado: **aprobado**.
- `git diff --check` frontend: **aprobado**. El chequeo global de API conserva el espacio final preexistente en `railway/load_tricombos.sql:29`, fuera de P1 · 7.

## Límites

- El resumen evita transferir catálogos completos al cliente, aunque calcula estados de ingredientes activos en el servidor. Los lotes próximos a caducar respetan la ventana configurada por ingrediente.
- No existen máximos ni pronósticos de demanda; el faltante mostrado no recomienda cuántas presentaciones comprar.
- Las presentaciones no se vinculan a proveedores porque el modelo no contiene esa relación.
- Una respuesta incierta de compra no puede resolverse mediante clave idempotente; se conserva el aviso de revisar el historial antes de repetir.
- Alertas continúa siendo una lectura con escritura y puede ser costosa en catálogos grandes; ahora se ejecuta únicamente al abrir esa sección.
- Las pruebas responsive usan componentes simulados. No se verificaron físicamente Android/iOS, lector de pantalla, servidor Debian de 32 bits ni impresoras.
- No se hizo push, despliegue ni modificación de datos de producción.

## Comprobación manual recomendada

1. Buscar por SKU un insumo fuera de la primera página, cambiar filtros y volver desde su detalle; comprobar que búsqueda y página se conservan.
2. Comparar resumen con varias páginas y verificar Disponible, Bajo, Crítico y Agotado, incluido un mínimo cero.
3. Abrir Alertas, Lotes y Movimientos por separado; probar fallo y reintento sin perder Existencias.
4. Registrar dos bolsas de 1 kg para un ingrediente en gramos y comprobar el texto de 2,000 g, lote, movimiento y existencia.
5. Capturar cantidad con coma, costo total, lote y caducidad; editar el renglón sin cambiar su posición y cancelar la revisión.
6. Modificar o desactivar la presentación desde otra sesión antes de registrar. El renglón debe permanecer marcado y no debe existir compra parcial.
7. Simular éxito del POST y fallo de recarga. Debe indicarse que la compra se registró. Simular respuesta perdida y comprobar que no se repita automáticamente.
8. Navegar a otro módulo y volver; verificar proveedor, búsqueda y renglones. Repetir en móvil con teclado abierto.
9. Repetir una venta y una producción que consuman el lote comprado para confirmar que la unidad base conserva su significado.

P1 · 7 termina aquí. No se inició P2.
