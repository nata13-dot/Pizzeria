# P1 · 6 — Gestión de recetas y revisión funcional

## Alcance y proceso

Se auditó el modelo, los controladores, el resolver de consumo, las pantallas y las pruebas antes de modificar código. Se presentó el mapa del dominio, los hallazgos, el flujo propuesto, los wireframes y la estrategia de pruebas. Después se implementó y se realizó la revisión funcional solicitada, limitada a recetas y sus regresiones.

Se mantienen las reglas comerciales, precios, transacciones y mecanismos anteriores de P0 y P1. No se inició P1 · 7, no se rediseñaron compras/inventario, ni se cambió la navegación global. No hay migraciones, nuevas dependencias, push ni despliegue.

## Modelo real

```text
Producto
└── Presentación / tamaño (obligatorio en el modelo, aunque solo exista uno)
    ├── Receta sin sabor seleccionado
    └── Receta de un sabor del mismo producto
        └── Renglones
            ├── Ingrediente de la sucursal
            ├── Cantidad en la unidad base del ingrediente
            └── Función: base / cobertura / salsa / empaque / otro

Receta de producción (modelo independiente)
├── Ingredientes y cantidades en sus unidades base
├── Insumo producido
├── Rendimiento y unidad compatible con ese insumo
└── Días de vida útil
    └── Producción: número de tandas → consumos y lote producido
```

No existe un producto vendible sin presentación en este modelo. No se agregaron pasos vacíos de variante opcional.

### Significado que se conserva

- Una receta sin sabor **no** sirve automáticamente para todos los sabores. Cuando se eligen sabores, `RecipeResolver` exige sus recetas activas.
- La función del ingrediente afecta las mezclas: en pizza, base/salsa/empaque se toman completos de una receta y cobertura/otro se reparten entre sabores. En otros productos se reparten las salsas; las demás funciones se toman completas de una receta. No se alteró ese cálculo ni el orden de resolución.
- Venta permite un mismo ingrediente en funciones diferentes; prohíbe repetir el par ingrediente/función. Producción prohíbe repetir el ingrediente. La interfaz respeta ambas reglas: no suma ni reemplaza cantidades silenciosamente.
- Los combos consumen las recetas de sus presentaciones seleccionadas; los modificadores tienen consumos propios. No se cambiaron esos modelos, el pricing ni la regla del Tricombo.
- Guardar una receta no mueve inventario. En la venta, el consumo se realiza al enviar el pedido a cocina. En producción, se registra al confirmar la producción.
- La conversión de rendimiento usa los factores y dimensiones existentes. No se introdujeron conversiones de presentaciones de compra.

## Flujo anterior y hallazgos

Venta empezaba en un formulario dentro de Productos, elegía automáticamente una presentación y solo hacía POST. Los ingredientes tenían búsqueda remota, pero el resumen no mostraba unidades. Cambiar el destino mantenía las cantidades sin advertencia y agregar un ingrediente repetido reemplazaba el renglón. La API ya tenía detalle, edición, desactivación y clonación; no tenía un directorio paginado de recetas.

Producción ya permitía crear y editar, tenía vista previa de consumo/rendimiento y backend transaccional. Sus recetas se descargaban completas, la edición era local, los ingredientes repetidos reemplazaban cantidades y una unidad inválida podía sustituirse automáticamente.

| Nivel | Problema demostrado | Corrección y verificación |
| --- | --- | --- |
| ALTO | «Todos los sabores» guardaba realmente una receta sin sabor. | «Sin sabor seleccionado», con explicación de que cada sabor vendido requiere su receta. Payload probado con sabor y sin sabor. |
| ALTO | Cambiar presentación/sabor podía reasignar ingredientes sin consentimiento. | Confirmación al cambiar un destino con trabajo; destino fijo en edición. Se prueba cancelar y aceptar sin perder cantidades. |
| ALTO | Solo era posible crear desde la interfaz; intentar reconstruir una receta existente daba conflicto. | Listado, detalle y edición mediante PUT al ID existente; no envía `product_variant_id` al editar. |
| ALTO | Repetir ingrediente reemplazaba la cantidad anterior silenciosamente. | Rechazo explicativo y edición de cantidad en el renglón; se permiten funciones distintas únicamente en venta. |
| ALTO | Una copia podía confundirse con una edición o con el destino original. | Copia en memoria, destino nuevo obligatorio, revisión y POST de creación; el destino ocupado, incluso inactivo, ofrece editar la existente. |
| ALTO | Cantidades guardadas podían interpretarse en otra unidad después de un cambio externo. | Se guarda la referencia de unidad en memoria y se revalida el ingrediente por ID antes de escribir. No se convierte ni sustituye silenciosamente. |
| ALTO | Cambiar de receta de producción o salir del módulo perdía el formulario local. | Memoria del proveedor existente, comparación con la versión cargada y confirmación antes de reemplazar/descartar. |
| ALTO | La confirmación de producción dejaba un intervalo anterior al bloqueo de envío. | Gate compartido que cubre también el diálogo; prueba de doble pulsación con una sola solicitud de producción. |
| MEDIO | Recetas difíciles de localizar y destinos dependientes de lo ya cargado en Productos. | Búsquedas remotas paginadas de recetas y presentaciones; no se filtran los productos recibidos por `App.tsx`. |
| MEDIO | Producción descargaba todas las recetas para sus selectores/listado. | Paginación remota y detalle de la preparación seleccionada separado de los resultados de búsqueda. |
| MEDIO | Resumen sin unidades y términos poco claros. | Cantidad/unidad en cada renglón; tandas, qué se prepara y vista previa del consumo/rendimiento. |
| MEDIO | Edición o recarga podía sustituir una unidad de rendimiento inválida. | Se conserva la unidad original y se exige seleccionar/revisar otra; prueba de regresión. |
| MEDIO | Selección de ingrediente y cantidad pendiente podían quedar fuera de lo guardado. | Guardado bloqueado con explicación hasta agregar o limpiar la captura pendiente. |
| MEDIO | Un resultado perdido o un error podía invitar a repetir una creación. | Mensaje seguro, sin reintentos automáticos; venta vuelve a comprobar el destino y ofrece la receta encontrada antes de emitir otro POST. |

No se demostró un hallazgo CRÍTICO. No se hicieron correcciones cosméticas clasificadas como BAJO.

## Flujo nuevo y wireframes

### Venta

1. Buscar receta por nombre, producto, presentación o sabor; distinguir listado vacío, búsqueda sin resultados y error.
2. Crear, editar o duplicar desde el listado.
3. Elegir producto/presentación y sabor cuando corresponda. Al editar, el destino está fijo: para otro destino se duplica.
4. Buscar ingrediente remotamente por nombre/SKU, seleccionarlo, indicar cantidad/unidad y función, y agregarlo.
5. Editar cantidades o quitar renglones en «Ingredientes de esta receta».
6. Revisar destino e ingredientes y guardar con una sola escritura.

```text
Escritorio
Recetas de venta
[Buscar receta...]                 Editor
[Crear receta]                     Destino visible
Resultados y páginas               [Buscar presentación, si es nueva]
[Editar] [Duplicar]                 [Nombre]
                                   Buscar ingrediente / cantidad / función
                                   Ingredientes de esta receta
                                   [Revisar receta]
                                   → Resumen / [Volver a editar] / [Guardar]

Móvil
Listado → Editor → Revisión
           ↓          ↓
    Ver listado conservando cambios
           ↓
    Continuar receta pendiente
```

Los pasos son secciones de edición, no un asistente obligatorio por pantalla. En móvil se muestra un panel a la vez. El mismo borrador permanece en el proveedor al cambiar de vista o módulo. No se persiste tras reiniciar, conforme al alcance de memoria de recetas de P0 · 2.

### Duplicación y desactivación

La API `/recipes/{id}/clone` sigue disponible y protegida contra destinos ocupados. La interfaz prepara una copia **sin escribir todavía** y permite ajustar sus cantidades antes del único POST `/recipes`; utiliza las mismas validaciones y protección de destino del backend. No necesita crear una copia para después corregirla mediante otra escritura.

DELETE sigue siendo desactivación lógica. El mensaje explica que la receta deja de estar disponible para nuevas selecciones que la requieran, sin cancelar pedidos ni alterar inventario por esa acción. El destino continúa ocupado por la receta inactiva; se puede abrir y reactivar al guardar. No se ofrece borrado físico.

### Producción

Se mantiene separada en Producción. El listado y la selección de preparación tienen búsqueda/paginación remotas. La selección activa se consulta por ID y no cambia al buscar o paginar. Se conserva el editor existente con cantidades editables, unidades, rendimiento, vida útil y protección de cambios.

«¿Cuántas tandas prepararás?» sustituye el término de interfaz «Multiplicador»; el contrato `multiplier` y su significado no cambian. La vista previa existente muestra consumo, faltantes y cantidad producida. El servidor vuelve a validar receta, salida, unidades, existencias y porciones al registrar. La vista previa no reserva inventario.

Producción no tiene API de clonación de recetas; no se inventó una operación de copia para este modelo.

## APIs y compatibilidad

| Ruta | Contrato / autorización |
| --- | --- |
| GET `/recipes?search=…&page=…` | Nueva; 25 por página, búsqueda por receta/producto/presentación/sabor, orden nombre+ID, administrador y sucursal. Incluye destino y conteo, sin descargar todos los renglones. |
| GET `/recipes/destinations?search=…&page=…` | Nueva; presentaciones y productos activos, 25 por página, sabores y ocupación de destinos. Sin imágenes ni renglones de receta. |
| GET `/recipes/destinations/{variant}` | Nueva; destino exacto, misma sucursal, administrador, `no-store`; permite revalidar aunque no esté en la página visible. |
| GET `/recipes/{recipe}` | Conserva contrato y añade unidad base de los ingredientes cargados. |
| POST/PUT/DELETE `/recipes…` y POST `/recipes/{id}/clone` | Mismas reglas, transacciones y bloqueo de catálogo. No se debilitaron pertenencia, unicidad de destino ni validación de componentes. |
| GET `/production-recipes?paginated=1&search=…&page=…&active=…` | Extensión opcional: 25 por página, nombre/insumo producido, orden estable. Sin `paginated=1` conserva la respuesta array para consumidores existentes. |
| GET `/production-recipes/{recipe}` | Nueva; detalle por ID de la sucursal, permiso `production.manage`, `no-store`. |
| POST/PUT `/production-recipes…` y POST `/production-batches` | Contratos y cálculos conservados. |
| GET `/ingredients` y `/ingredients/{id}` | Sin cambios; búsqueda remota, SKU, páginas y revalidación por ID de P0. |

Las consultas de búsqueda usan `usePaginatedResource`: debounce, cancelación, rechazo de respuestas obsoletas, conservación de búsqueda al paginar y reintento de lectura. Las escrituras siguen sin reintento automático.

**Despliegue futuro:** API antes del frontend; no hay migraciones para P1 · 6. No se desplegó nada durante esta tarea.

## Componentes y archivos

- Nuevo `src/features/recipes/SaleRecipes.tsx`: listado/editor/revisión de venta, tipos del borrador y validaciones propias del dominio.
- `App.tsx`: sustituye exclusivamente el editor antiguo de recetas por el componente nuevo; no es una refactorización global.
- `src/features/operations/ProductionScreen.tsx`: búsquedas/detalle, memoria del formulario, cantidades, unidades, confirmaciones y protección de acciones.
- Reutiliza `ActionButton`, `Notice`, `FloatingTextInput`, `useFormErrors`, `useActionGate`, `decimalInput`, `operationError`, `ConfirmationDialog`, `RemoteListStatus`, `Pagination`, `Feedback`, `Section`, `LoadingState`, `useWorkField` y `useWorkGuard`.
- `RecipeController.php`, `ProductionController.php`, `routes/api.php`: lecturas descritas arriba; se mantienen las escrituras existentes.
- `src/recipes.test.mjs`: 15 pruebas nuevas. `forms.test.mjs` adapta la regresión anterior al nuevo recorrido y al borrador central, conservando sus comprobaciones.
- `src/testSupport/productFormSource.mjs`: incluye el componente real al probar Productos.
- `tests/Feature/RecipeManagementTest.php`: tres pruebas de contratos, búsqueda, aislamiento, permisos, duplicados y consumo.
- Dos datos de prueba de P0 (`AtomicMutationTest`, `PriceConsistencyTest`) ahora obtienen la fecha de compra desde `BranchClock`, como la sucursal. No se cambiaron las aserciones ni código de compras.

No se añadieron otros sistemas de formularios, dinero, confirmación, conversión o dirty state.

## Revisión posterior a la implementación

Se revisaron expresamente destino equivocado, edición convertida en alta, copias sobre destinos ocupados, cantidades reemplazadas, cambio de unidad, estado pendiente, respuesta tardía, doble pulsación y resultado incierto.

La revisión añadió comprobación de unidad por ID antes del guardado, eliminó la sustitución automática de la unidad de producción y extendió el gate a su confirmación. También verificó con pruebas que una respuesta perdida de creación de venta encuentra el destino ocupado sin segundo POST, que abrir una receta bloquea otra apertura mientras se resuelve y que los resultados viejos de una búsqueda no sustituyen los nuevos.

La separación de detalle de producción y páginas mantiene su selección al buscar. Las pantallas no convierten mensajes SQL/excepciones en mensajes de usuario. Las confirmaciones canceladas no escriben ni limpian cantidades.

## Pruebas y resultados finales

- Frontend `npm test`: **78 aprobadas** (63 existentes y 15 nuevas).
- `npm run typecheck`: **aprobado**, separado del build.
- `npm run build:web`: **aprobado**, exportación en `Pizzeria/dist`.
- Backend `php artisan test --compact`: **157 aprobadas, 2 omitidas, 1419 aserciones**.
- Pint de los controladores/rutas/tests PHP afectados: **aprobado**.
- `git diff --check`: frontend y archivos API de P1 · 6 **aprobados**. El chequeo global API detecta un espacio final preexistente en `railway/load_tricombos.sql:29`, fuera de esta tarea y sin modificar.
- Sin ESLint nuevo ni dependencias adicionales.

La primera ejecución completa del backend ocurrió con días UTC/sucursal distintos y fallaron dos fechas de fixtures de compras. Cambiar globalmente la zona de ejecución no era correcto para otras pruebas; se restauró la configuración habitual y se corrigieron solo esos dos datos mediante `BranchClock`. La suite final pasa con las aserciones originales.

Las dos pruebas omitidas siguen siendo las de concurrencia MariaDB/InnoDB con pcntl. SQLite no demuestra concurrencia real entre conexiones MariaDB; no se ejecutó `migrate:fresh` sobre datos reales.

### Escenarios cubiertos

Las 15 pruebas frontend agrupan: creación sin sabor/con sabor, tamaño exacto, cantidad con punto/coma/inválida, foco de error, agregar/editar/quitar ingrediente, duplicado por función, edición PUT, copia a otro tamaño y destino ocupado, guardado correcto/error seguro, doble pulsación, navegación de módulo, cierre cancelado, flujo móvil de lista/editor/revisión, búsqueda remota con registro 105/SKU, búsqueda vacía y respuestas fuera de orden, paginación conservando filtro, unidad modificada, desactivación cancelada/aceptada, respuesta perdida sin segunda creación, apertura tardía protegida, recetas de producción en memoria, rendimiento/consumo, confirmación con una sola producción y unidad antigua inválida conservada.

Las regresiones existentes de P0 · 1/P0 · 2/P0 · 3 y P1 · 4/P1 · 5 se ejecutan completas: búsquedas, páginas, debounce, aislamiento, borradores, idempotencia de pedidos, precios, configuración atómica, combos, formularios y POS.

### Integración receta → producto → venta → inventario

La prueba backend crea una receta para Pizza Mediana/Pepperoni mediante POST, comprueba su unidad `g`, la edita mediante PUT de **1.5 a 2.5 g** y registra una venta de **dos unidades** con pago de **$200**. Al enviar a cocina, el lote pasa de **20 g a 15 g** y los movimientos suman **−5 g**. También rechaza repetir la receta, duplicar sobre el mismo destino y repetir ingrediente/función. No se cambió el significado del consumo.

## Accesibilidad, responsive y límites

- Campos con nombres persistentes y errores asociados; cantidades con teclado decimal; errores con foco mediante el componente compartido.
- Selecciones con rol de botón y estado seleccionado; acciones de quitar incluyen nombre/función. Se conservan Escape, foco y retorno de foco del diálogo compartido.
- Venta usa un solo panel en ancho móvil; no se pierde el borrador al alternar. Controles específicos con altura mínima de 44 px o botones compartidos de 46 px.
- Se probaron componentes reales con widgets/IO simulados y ancho móvil 390. No se acredita disposición física, lector de pantalla ni cumplimiento WCAG completo.
- No hay persistencia de recetas tras cerrar forzadamente/reiniciar. La memoria se aísla y limpia al cambiar sesión; el guard advierte por trabajo no recuperable.
- No se añadió idempotencia general a producción ni un sistema de revisión concurrente de recetas. Un resultado incierto exige revisar registros antes de repetir; no hay reintentos automáticos. Dos administradores todavía pueden editar sucesivamente la misma receta según las reglas existentes.
- Producción continúa cargando los insumos completos para su información operativa existente; no se rediseñó ese inventario. Sus recetas y la búsqueda de venta sí son remotas/paginadas; los ingredientes de venta no están limitados a los primeros 100.
- No se verificó Debian de 32 bits, impresoras ni dispositivos Android/iOS. Precios y reglas de inventario no se modificaron para esta tarea.

## Comprobación manual recomendada

1. Buscar receta por producto, tamaño y sabor; recorrer páginas y probar búsqueda sin resultados y fallo de red.
2. Crear receta sin sabor y otra para un sabor; comprobar que el resumen identifica claramente el destino y las unidades.
3. Buscar por SKU un ingrediente posterior al número 100. Agregar `1,5`, editar a `2.75`, repetir la misma función y comprobar que no reemplaza la cantidad.
4. Abrir una receta existente y verificar destino fijo, ingredientes actuales y un único PUT al guardar.
5. Duplicar, cancelar un cambio de destino, elegir después otro tamaño/sabor y ajustar cantidades. Intentar un destino ocupado/inactivo.
6. En móvil, pasar de editor a listado, volver, revisar, volver a editar y cambiar de módulo. Verificar cantidades y teclado.
7. Desactivar primero cancelando y después aceptando; abrir la inactiva y reactivarla. Comprobar disponibilidad en nuevas ventas.
8. En producción, buscar una receta de otra página; elegirla y cambiar búsqueda. La preparación seleccionada y la vista previa deben permanecer.
9. Editar producción, cambiar rendimiento/unidad conscientemente, navegar y regresar; confirmar cancelación al sustituir el formulario. Simular cambio externo de unidad.
10. Con red lenta, pulsar Guardar/Confirmar dos veces. Simular respuesta perdida y revisar el registro antes de repetir; en venta comprobar destino ocupado y ausencia de otro POST.
11. Repetir el recorrido receta → venta → cocina y comparar el consumo con cantidad por unidad × unidades vendidas.
12. Verificar Tab, Enter/Espacio, Escape, foco, modo oscuro, texto ampliado y controles táctiles en navegador y dispositivo reales.

P1 · 6 termina aquí. No se inició P1 · 7.
