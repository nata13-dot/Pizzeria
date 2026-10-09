# P0 · 3 — Guardados atómicos y precios coherentes

## Alcance y auditoría

Implementación local de P0 · 3. Se conservan P0 · 1 y P0 · 2; no se inicia P1. No se hizo push, despliegue ni modificación de datos de producción.

El botón de edición de producto ejecutaba una petición para el producto y varias para variantes, sabores, bajas y orillas. Un fallo intermedio dejaba parte del cambio aplicada. Además, su configuración de orilla sobrescribía precios globales y overrides con $20. Ahora el editor envía una sola operación de configuración y conserva los precios existentes.

| Operación | Antes | Implementación / garantía |
| --- | --- | --- |
| Alta de producto | Una petición; transacción existente | Se conserva; comparte bloqueo de sucursal y validaciones. |
| Edición completa | Varias escrituras HTTP independientes | Una petición PUT, revisión esperada, recibo de operación y transacción conjunta. |
| Categorías, variantes y sabores | Entidad y auditoría sin transacción en acciones individuales | Transacción breve; bloqueo de sucursal, referencias refrescadas después del bloqueo. |
| Modificadores y asignaciones | Protección desigual entre alta/edición y baja/asignación | Misma coordinación del catálogo; precios de otros productos no se sobrescriben. |
| Recetas y combos | Alta/edición ya transaccionales | Se conservan; coordinación con ventas y bajas protegidas. Pruebas de reemplazo fallido. |
| Clientes y direcciones | Varias escrituras al cambiar predeterminada | Transacción y bloqueo del cliente; reemplazo predeterminado coherente y rollback. |
| Compra | Transacción y bloqueos existentes | Se conservan. Se corrige una diferencia demostrada entre suma y costos redondeados. |
| Producción | Transacción y bloqueos existentes | Sin reescritura. Fallo posterior al consumo revierte existencias y movimientos. |
| Pedido | Transacción e idempotencia por sucursal | Cálculo decimal; expectativa opcional; discrepancia revierte pedido y pagos. |
| Confirmación y cobro contra entrega | Bloqueo del pedido y validación del saldo | Comparaciones monetarias normalizadas; se conserva la protección por estado. |
| Reportes | Consumen importes registrados | No se recalculan ventas históricas ni se migran importes. |

## Configuración de producto

Rutas nuevas, con `admin.only` y aislamiento por sucursal:

- `GET /products/{product}/configuration`: `{ product, revision }`. Incluye las relaciones necesarias para editar y comprobar dependencias. Respuesta `no-store`.
- `PUT /products/{product}/configuration`: recibe `expected_revision`, `operation_key`, `product`, `variants`, `flavors`, `removed_variant_ids` y `removed_flavor_ids`.
- `GET /products/{product}/configuration/operation?key=…`: `{ operation: null | recibo }`, restringido al usuario, producto y sucursal. Respuesta `no-store`.

Las variantes editadas llevan ID; los sabores nuevos omiten ID. Las bajas son explícitas y lógicas. Las recetas conservan su operación independiente. La configuración de orilla se deriva de `allows_stuffed_crust` y las reglas existentes; $20 se utiliza únicamente para crear una opción que todavía no existe. Guardar nombres o precios del producto no cambia precios globales ni overrides de orilla.

`ProductValidation` comparte reglas con los endpoints individuales. Se valida pertenencia de referencias, opciones activas, última variante activa, semántica de pizza y dependencias de combos/recetas. Una desactivación con el valor booleano válido `0` también pasa por las comprobaciones de dependencias.

`CatalogWrite` adquiere el mismo bloqueo de sucursal utilizado al crear pedidos y refresca los modelos enlazados antes de validarlos. Los cambios y su auditoría quedan dentro de la transacción. Se conserva la invalidación de caché y su segunda invalidación después del commit; las lecturas realizadas dentro de una transacción no se publican en caché.

La revisión es un hash opaco del contenido y relaciones, no una marca de tiempo con precisión de segundos. Una revisión obsoleta responde `409 configuration_conflict`. El editor conserva los campos y permite consultar la configuración actual antes de aceptar una nueva referencia para sus cambios.

La tabla nueva `product_configuration_operations` guarda sucursal, usuario, producto, clave, hash de petición y revisión aplicada. No duplica imágenes ni el formulario. Clave y petición iguales reconocen el resultado anterior; otra petición con la misma clave devuelve `409 operation_conflict`. El orden de las propiedades JSON no altera el hash; el orden de las listas y los tipos de sus valores sí forman parte de la petición.

Ante respuesta perdida, el editor bloquea la sustitución de sus campos y conserva el cuerpo exacto del intento. Solo una acción explícita consulta el resultado y, si aún no existe, repite ese mismo cuerpo y clave. No hay reintentos automáticos. El guard de P0 · 2 impide abandonar el editor mientras su resultado sea incierto. Un fallo de recarga posterior a un guardado confirmado se comunica como fallo de actualización de la lista.

## Dinero y concordancia

- PHP: `Money`, con `brick/math` **0.14.8**, ahora dependencia directa y sin actualización de versión. Los cálculos usan decimales y cadenas; no requieren enteros PHP de 64 bits para representar centavos.
- Frontend: `money`, `moneySum`, `moneyMultiply` y `orderTotal`; conversión decimal mediante BigInt, sin sumar importes con aritmética binaria de punto flotante.
- Política: dos decimales, mitad hacia arriba. Se normaliza precio unitario, extras multiplicados por unidades de componente e importe de renglón. El total suma renglones normalizados, aplica descuento autorizado y entrega, con mínimo cero.
- Rango monetario: `0` a `9999999999.99`, consistente con las columnas existentes. Cantidad de renglón de pedido: positiva, hasta `99999999.99` y dos decimales, conforme a su columna. No cambia la precisión del inventario ni de costos unitarios derivados.
- Pagos: se normaliza cada importe antes de persistir y comparar. La cortesía mantiene su autorización, total registrado y ausencia de pago.

`pricing.ts` centraliza el cálculo de producto y combo para tarjetas, configurador, incorporación al carrito y recuperación. Usa override cuando existe; en combos solo suma base del combo y extras de sus unidades. El configurador muestra el total seleccionado y las orillas muestran su tarifa real. Se mantiene la regla del Tricombo: los sabores de productos de tipo complemento/`other` no reciben el recargo de alitas.

`POST /orders` admite opcionalmente:

```json
{
  "pricing_expectation": {
    "items": [{ "unit_price": "100.00", "total": "200.00" }],
    "delivery_fee": "0.00",
    "total": "200.00"
  }
}
```

El orden de `items` corresponde al de los renglones enviados. El servidor calcula todos los importes desde sus datos. Una diferencia produce `409 price_changed` con `pricing` actual y rollback antes de persistir el pedido o pago. Omitir la expectativa conserva el cálculo de los consumidores anteriores; enviar `unit_price`, subtotal o total arbitrarios no fija el precio.

Un pedido previamente registrado con la misma clave se resuelve antes de revalidar el carrito, incluso si cambió el precio, se desactivó la variante o venció la programación. En el POS, el conflicto conserva el carrito, muestra importes, exige actualización/revisión y nueva selección de pago; no modifica el importe manual introducido. Un intento previamente incierto conserva su marcador aunque un reintento encuentre conflicto de precios.

Sin zonas configuradas, la entrega cuesta $0 en backend. Si existen zonas, se usa la tarifa de la zona activa; todas las zonas inactivas siguen bloqueando entregas.

### Inconsistencia adicional comprobada en compras

La prueba con dos renglones de `$0.005` mostró total `$0.01` en lugar de la suma normalizada `$0.02`. Se normaliza el costo de cada renglón antes de sumarlo y persistirlo. Se conserva la transacción existente, sus bloqueos y el cálculo de cantidades; el costo unitario derivado mantiene su precisión anterior.

## Archivos principales

Frontend:

- `App.tsx`: lectura y guardado atómico del editor, conflicto y protección del intento pendiente.
- `src/productConfiguration.ts`: comprobación y repetición explícita de la misma petición.
- `src/money.ts`, `src/pricing.ts`, `src/flavorPricing.ts`, `src/work/reconcile.ts`: cálculo compartido.
- `src/features/pos/PosScreen.tsx`, `src/api.ts`: expectativa, revisión de precios y pagos.
- `src/features/operations/PurchasesScreen.tsx`: costos normalizados.
- Pruebas: `money.test.mjs`, `productConfiguration.test.mjs`, `workUi.test.mjs` y adaptador de pruebas.

API:

- `ProductConfigurationController`, `ProductConfiguration`, `ProductValidation`, `CatalogWrite` y `ProductConfigurationOperation`.
- Controladores de producto, modificador, receta, combo, cliente, pedido, compra y actualización de ajustes; `OrderService` y `Money`.
- Migración `2026_09_26_000000_create_product_configuration_operations_table.php` y rutas de configuración.
- Pruebas: `ProductConfigurationTest`, `AtomicMutationTest`, `PriceConsistencyTest`, `CatalogCacheTest` y `MariaDbConfigurationConcurrencyTest`.

Se conserva la selección limitada de columnas del cambio preexistente de `ComboController.php`, que evita cargar imágenes en sus productos relacionados.

## Validación

Resultados ejecutados sobre el código final:

- Frontend, `npm test`: **40 aprobadas**, incluyendo regresiones de P0 · 1/P0 · 2 y seis pruebas adicionales.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**, exportación actualizada en `Pizzeria/dist`.
- API, `php artisan test --compact`: **154 aprobadas, 2 omitidas, 1368 aserciones**.
- Las omitidas son `MariaDbOrderConcurrencyTest` y `MariaDbConfigurationConcurrencyTest`: requieren MariaDB/InnoDB dedicado y `pcntl`.
- Pint sobre los archivos PHP afectados: **aprobado**.
- `git diff --check` en ambos repositorios: **aprobado**.
- Sin script de lint frontend; no se añadió ESLint.

Las pruebas de caché utilizan commits reales de SQLite, sin la transacción externa de `RefreshDatabase`: confirman que una configuración fallida no aparece en el catálogo y que el rollback por precio no emite `OrderStatusChanged`. Las pruebas con dos procesos para edición y direcciones están preparadas, pero permanecen omitidas en este entorno.

Cobertura: rollback de producto/sabor/variante/recibo/orillas y auditoría; conflictos de revisión y pertenencia; repetición sin sabores duplicados; direcciones predeterminadas; fallos tras movimiento de compra y consumo de producción; reemplazo de receta y opciones de combo; caché transaccional; dinero decimal, overrides, Tricombo y unidades de combo; precio manipulado, cortesía y entrega; respuesta perdida y conservación de operaciones inciertas. Se reejecutan las pruebas existentes de P0 · 1 y P0 · 2.

## Despliegue futuro y límites

1. Desplegar API y ejecutar la única migración nueva antes del frontend. La migración solo se ejecutó sobre bases de pruebas durante esta tarea.
2. Publicar después la exportación web de `Pizzeria/dist`.
3. Verificar los permisos de administración, edición y POS en el servidor destino.

No se verificó manualmente en Debian de 32 bits ni en dispositivos Android/iOS. La implementación monetaria evita enteros PHP de 64 bits, pero las pruebas locales no sustituyen ejecutar PHP y la aplicación en esos equipos.

Las pruebas de concurrencia real requieren una base MariaDB/InnoDB **dedicada** y `pcntl`; ejecutan `migrate:fresh`. No deben apuntarse a datos reales. SQLite comprueba rollback y contratos, pero no demuestra concurrencia entre conexiones MariaDB.

El intento del editor de producto permanece en memoria mientras está abierto; no se amplió la persistencia de formularios de P0 · 2. Tras cierre forzado se debe revisar el producto antes de repetir una alta o edición. Una operación incierta nunca se considera fallida únicamente porque su consulta todavía no la encuentre. No se añadió idempotencia general para compras, recetas o producción, ni reintentos automáticos.

Los cambios históricos de dinero, navegación, diseño general y formularios ajenos al alcance quedan intactos. No se añadió ESLint ni dependencias npm.

## Comprobación manual recomendada

1. Editar nombre, dos variantes, sabores y orilla: guardar una vez y verificar que solo se envía un PUT de configuración.
2. Interrumpir la respuesta de ese PUT; volver a pulsar Guardar cambios. Verificar consulta del resultado y ausencia de sabores duplicados.
3. Abrir el mismo producto en dos sesiones: guardar en una y después en otra. La segunda conserva sus campos y muestra conflicto; revisar la configuración actual antes de continuar.
4. Conservar una orilla global de $37 y un override de $29. Guardar el producto y comprobar ambos y otro producto que use ese modificador.
5. Agregar un Tricombo con sus dos sabores incluidos y verificar el precio base. Configurar un combo con varias unidades y extras; comparar total antes de agregar y en carrito.
6. Cambiar el precio desde otra sesión antes de confirmar la venta. Comprobar que no se registra pedido/pago, se muestran los nuevos importes y se exige revisar el pago.
7. Simular respuesta perdida después de crear pedido. Reintentar con la misma operación y comprobar una sola orden y un solo pago, aunque cambie el catálogo.
8. Cambiar y eliminar direcciones predeterminadas; comprobar que queda un reemplazo cuando hay otras direcciones.
9. Registrar una compra con costos decimales y comparar suma de renglones, total y movimientos.
10. Repetir conservación de carrito, búsqueda remota, paginación, cambio de módulos y revisión de borradores de P0 · 1/P0 · 2.
