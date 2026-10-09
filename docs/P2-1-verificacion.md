# P2 · 1 — Shell, navegación y arquitectura de información

## Alcance

Se sustituyó la lista plana del shell por una navegación agrupada y una autoridad única de transición. Se conservan los 14 módulos, sus identificadores internos, permisos, pantallas, APIs y garantías de `WorkProvider`. No se añadió router, dependencia, persistencia durable, cambio backend ni trabajo de P2 · 2.

Los nombres visibles principales son Punto de venta, Pedidos y Caja del turno. Los símbolos continúan como apoyo decorativo; el texto es la autoridad del nombre.

## Registro y arquitectura de información

`src/navigation/modules.ts` contiene el registro declarativo de módulos, etiqueta, grupo, símbolo, acceso y prioridad móvil. La estructura visible es:

```text
Inicio
└── Resumen
Ventas
├── Punto de venta
├── Pedidos
├── Caja del turno
└── Clientes
Operación
├── Cocina
├── Reparto
├── Inventario
├── Compras
└── Producción
Catálogo
└── Productos
Análisis
└── Reportes
Administración
├── Usuarios y permisos
└── Ajustes
```

El registro conserva las reglas anteriores: Resumen requiere caja, pedidos e inventario; Pedidos requiere punto de venta y consulta de pedidos; Compras y Producción requieren inventario junto con su permiso específico; Productos, Usuarios y Reportes son administrativos; Ajustes permanece disponible y protege internamente cada operación.

Los grupos vacíos no se renderizan. Administración ve como accesos compactos Resumen, Punto de venta, Pedidos e Inventario; Caja prioriza Punto de venta, Pedidos, Caja del turno y Clientes. Cocina y Reparto muestran primero su módulo y completan la barra solo con destinos realmente permitidos. No se concede acceso a Pedidos a esos roles si falta `pos.use`.

## Transición única y protección del trabajo

`requestModuleNavigation` valida el destino, cierra superficies si ya está activo, consulta `work.leave()` antes de desmontar y solo después actualiza historial, pantalla y último módulo. Sidebar, barra compacta, hoja «Más» y tarjetas del Resumen usan esta transición.

Una cancelación mantiene la pantalla y no agrega historial. Los destinos desconocidos o prohibidos se rechazan antes de consultar el guard. Cambiar al módulo actual no genera otra entrada. El cierre de sesión conserva `work.leave(true)` y limpia historial, último módulo y memoria de consulta únicamente después de autorizar la salida.

En Android, Atrás cierra primero «Más». Después extrae el primer destino distinto y todavía permitido, y lo solicita mediante el mismo controlador. Si se cancela la salida, el destino vuelve al historial. Sin destino válido se minimiza la aplicación. Se eliminó una doble consulta al guard durante esta revisión.

Las notificaciones conservan `screen` como metadato y no navegan al pulsarlas.

## Shell y accesibilidad

El contrato del shell es móvil por debajo de 600 px, tablet entre 600 y 1023 px y escritorio desde 1024 px. Los breakpoints internos de las pantallas permanecen intactos.

- Escritorio muestra sidebar desplazable con encabezados de grupo.
- Móvil y tablet muestran hasta cuatro accesos permitidos y «Más».
- «Más» indica cuando el módulo activo no está entre los accesos rápidos.
- Sidebar, barra y hoja comunican el módulo seleccionado mediante estado accesible además del color.
- Los símbolos están ocultos de tecnología asistiva.
- La hoja tiene nombre, botón de cierre explícito, foco inicial, contención de Tab/Mayús+Tab, Escape y retorno al disparador.
- El fondo que cierra la hoja está separado de la superficie de navegación, sin botones anidados en web.

No se cambiaron el tema, los tokens ni la presentación interna de los módulos.

## Restauración y ámbito

El último módulo se guarda por URL de API, usuario y sucursal. Web usa `sessionStorage`, por lo que dura la pestaña; nativo usa memoria del proceso. Al restaurar una sesión o iniciar sesión se acepta únicamente un módulo conocido y permitido; de lo contrario se usa el primer módulo permitido. Cerrar sesión elimina el ámbito aprobado.

La memoria de consulta es efímera y está separada de `WorkProvider`:

- Inventario conserva sección, búsqueda, filtro de estado, filtro activo, página y detalle.
- Clientes conserva búsqueda, página y cliente seleccionado.

Cambiar API, usuario o sucursal produce otro ámbito. Esta capa no almacena formularios, contactos, renglones, claves de operación ni borradores, y no escribe en `AsyncStorage`. El hook paginado acepta una consulta inicial y evita reiniciar a página 1 cuando recibe la misma búsqueda restaurada.

## Archivos principales

- `src/navigation/modules.ts`: registro, permisos, grupos y prioridad compacta.
- `src/navigation/controller.ts`: transición e historial de Atrás.
- `src/navigation/sessionState.ts`: último módulo y consulta efímera por ámbito.
- `src/navigation/NavigationContext.tsx`: acceso de las pantallas a su memoria de consulta.
- `src/navigation/ModuleSheet.tsx`: hoja agrupada y gestión de foco.
- `App.tsx`: composición del shell y adopción del controlador, sin extraer pantallas activas ni retirar código antiguo.
- `src/hooks/useRemoteResource.ts`: consulta paginada inicial sin carga vacía previa.
- `InventoryScreen.tsx` y `CustomersScreen.tsx`: restauración de contexto de consulta.
- `src/testSupport/loadUi.mjs`: estados accesibles y foco en el entorno DOM simulado.
- `src/navigation.test.mjs`: regresiones del registro, transición, ámbito, historial y hoja.

## Verificación

- `npm test`: **90 aprobadas**; eran 80 al cerrar P2 · 0 y se añadieron diez pruebas de navegación.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**, exportación actualizada en `Pizzeria/dist`.
- `git diff --check`: **aprobado**.
- No se modificó ni ejecutó artificialmente el backend.

Las pruebas nuevas cubren los 14 módulos sin duplicados, grupos vacíos, administrador/caja/cocina/reparto, prioridades compactas, destino prohibido, cancelación y aprobación del guard, ausencia de historial duplicado, filtrado al volver, módulo actual en la hoja, Escape, retorno de foco, ID estable, persistencia posterior a la aprobación y aislamiento por API/usuario/sucursal. La suite completa vuelve a cubrir POS móvil, borradores, operaciones inciertas, diálogos, recetas, compras, inventario y precios.

## Límites y comprobación manual

- No hay URL, deep link ni historial web. El estado interno continúa siendo la única autoridad.
- El contexto de consulta no sobrevive al cierre de pestaña/proceso y el scroll no se recuerda.
- Tablet comparte navegación compacta con móvil; el responsive interno se resolverá en P2 · 4.
- Recetas y promociones permanecen dentro de Productos.
- No se verificaron físicamente Android/iOS, lector de pantalla ni teclado móvil.

Comprobación manual recomendada:

1. Entrar como administración, caja, cocina y reparto; comparar módulos y grupos con sus permisos.
2. Intentar salir con un POS, producto, receta o compra pendiente desde sidebar, barra, hoja, Resumen y Atrás.
3. Abrir «Más» con teclado web; recorrer con Tab y Mayús+Tab, cerrar con Escape y comprobar retorno del foco.
4. En Android, abrir «Más», pulsar Atrás, navegar por tres módulos, cancelar un guard y repetir Atrás.
5. Cambiar de Inventario a otro módulo y volver; comprobar sección, filtros, página y detalle. Repetir Clientes con búsqueda y selección.
6. Recargar una pestaña y comprobar restauración del último módulo permitido. Cambiar usuario o sucursal y confirmar aislamiento.
7. Probar 599, 600, 1023 y 1024 px con texto ampliado y ambos temas; revisar barra, sidebar y hoja sin evaluar todavía los breakpoints internos.

P2 · 1 termina aquí. No se inició P2 · 2.
