# P2 · 0 — Auditoría global de UX/UI, navegación, frontend y accesibilidad

## 1. Resumen ejecutivo

P0 y P1 dejaron estables los flujos de mayor riesgo: cargas paginadas, conservación del trabajo, atomicidad, precios, POS, formularios, recetas, compras e inventario. P2 puede trabajar sobre la experiencia global, pero debe tratar la navegación, el tema y la estructura de frontend como dependencias del trabajo visual.

La aplicación tiene **14 módulos principales** visibles según permisos. Aunque el encargo estimaba 15 pantallas, `allScreens` contiene 14; Recetas de venta es actualmente un submódulo de Productos. En escritorio se presentan en una lista plana; un administrador ve todos a la vez. En móvil existen hasta cuatro accesos rápidos más «Más», cuyo contenido vuelve a ser la lista completa. El estado activo es visible, pero no existe agrupación por tarea ni una ruta o jerarquía secundaria compartida.

La base visual es reconocible —fondos cálidos, acento terracota, tarjetas y controles redondeados—, aunque sigue distribuida entre `App.tsx`, `ops` y estilos locales. P1 · 5 creó buenos componentes compartidos, pero la adopción es parcial. La migración visual debe preservar diferencias operativas intencionales, como el tablero de cocina y el carrito del POS.

El tema oscuro sigue clasificando elementos mediante `getComputedStyle`, recorre todo el árbol DOM y vuelve a ejecutarse mediante `MutationObserver`. Este mecanismo también aplica el escalado tipográfico. Es una deuda de arquitectura y rendimiento: depende de reconocer colores literales y puede no cubrir componentes o colores nuevos.

Los breakpoints actuales son 780, 900 y 980 px. Resuelven necesidades locales, pero una misma tablet puede recibir navegación compacta y contenido de escritorio, o viceversa. No existe un contrato común para escritorio, tablet y móvil.

`App.tsx` conserva 2,435 líneas y mezcla shell, sesión, permisos, navegación, dashboard, pedidos, cocina, reparto, productos, reportes, impresión y código reemplazado. Las implementaciones antiguas de POS, Clientes, Usuarios y Ajustes siguen presentes, aunque la navegación actual renderiza las pantallas extraídas. Deben retirarse solo después de añadir pruebas de composición del shell y verificar referencias de pruebas.

No se identificó un hallazgo crítico mediante auditoría estática. Los riesgos altos son la navegación plana, el tema basado en inspección DOM, la falta de una estrategia responsive común, la concentración de responsabilidades en `App.tsx` y la accesibilidad incompleta de controles locales.

## 2. Mapa actual de la aplicación

```text
Aplicación autenticada
├── Resumen
│   ├── Ventas de hoy → Corte de caja
│   ├── Pedidos activos → Pedidos del día
│   ├── Existencia baja → Inventario
│   └── Lotes por caducar → Inventario
├── Caja / POS
├── Corte de caja
├── Pedidos del día
├── Inventario
│   ├── Existencias y detalle
│   ├── Lotes
│   ├── Alertas
│   ├── Movimientos
│   └── Configuración y ajustes (administración)
├── Compras
├── Producción
│   ├── Recetas de producción
│   └── Registro de tandas
├── Productos
│   ├── Productos, tamaños y sabores
│   ├── Recetas de venta
│   └── Paquetes/promociones
├── Cocina
├── Reparto
├── Clientes
├── Usuarios
│   └── Roles y permisos
├── Reportes
└── Ajustes
    ├── Perfil del negocio
    ├── operación y entrega
    ├── impresión y documentos
    ├── notificaciones y sonidos
    ├── tamaño de texto
    └── respaldos/configuración administrativa
```

### Módulos, usuarios y accesos

| Módulo | Propósito y acciones principales | Usuario/frecuencia esperada | Dependencias | Permiso y acceso actual |
| --- | --- | --- | --- | --- |
| Resumen | Ver ventas, pedidos, existencias bajas y caducidades; abrir el detalle | Administración y caja; frecuente al iniciar | Caja, pedidos, inventario y alertas | Solo aparece si coinciden `cash.manage`, `orders.view` e `inventory.view`; administrador siempre |
| Caja / POS | Crear pedido, entrega, cliente, cobro y envío a cocina | Caja; continua | Catálogo, clientes, configuración, precios, inventario y pedidos | `pos.use`; menú principal |
| Corte de caja | Abrir caja, movimientos, revisión y cierre | Caja/administración; inicio y final de turno | Pedidos, compras pagadas desde caja y reportes | `cash.manage` |
| Pedidos del día | Consultar, filtrar, cobrar, cancelar, enviar y revisar historial | Caja/administración; frecuente | POS, cocina, reparto, pagos e impresión | Frontend exige `pos.use` + `orders.view`; API usa permisos por acción |
| Inventario | Consultar existencia/faltante, lotes, alertas, movimientos y ajustes | Caja consulta; administración configura | Compras, ventas, producción, recetas y unidades | `inventory.view`; escritura administrativa con `admin.only` |
| Compras | Registrar y revisar entradas | Administración/encargado; periódica | Proveedores, presentaciones, caja e inventario | `inventory.view` + `purchases.manage` en frontend; API `purchases.manage` |
| Producción | Administrar preparaciones y registrar tandas | Cocina/producción/administración; diaria o periódica | Recetas de producción, lotes, unidades e inventario | `inventory.view` + `production.manage`; algunas escrituras de receta son administrativas |
| Productos | Crear/editar producto, tamaños, sabores, imágenes, recetas y promociones | Administración; ocasional | Precios, combos, modificadores, recetas y POS | Solo administrador (`*`/`admin.only`) |
| Cocina | Ver cola, preparar, marcar estados e imprimir comanda | Cocina; continua | Pedidos, recetas, inventario y tiempo real | `kitchen.use` |
| Reparto | Ver pedidos listos/en camino, contacto, mapa, cobro y documento | Repartidor; continua durante reparto | Pedidos, entrega, pagos y documentos | `delivery.use` |
| Clientes | Buscar, crear/editar, direcciones, historial, puntos y reglas | Caja/administración; frecuente | POS, pedidos y fidelidad | `customers.manage`; reglas/ajustes sensibles requieren administración |
| Usuarios | Crear/editar usuarios, roles y permisos | Administración; poco frecuente | Autenticación y permisos | Solo administrador |
| Reportes | Consultar ventas, productos, inventario, compras, clientes, utilidad y tiempos | Administración; periódica | Todos los dominios registrados | Solo administrador |
| Ajustes | Configurar negocio, operación, entrega, impresión, avisos y preferencias | Administración; poco frecuente; ajustes personales para otros roles | Perfil, POS, documentos, dispositivo y preferencias | Visible siempre; API limita cada sección según permiso |

La frecuencia es una inferencia de la tarea del rol, no una medición de uso.

## 3. Arquitectura de información actual

La arquitectura actual es una lista de módulos del mismo nivel en este orden: Resumen, Caja/POS, Corte de caja, Pedidos, Inventario, Compras, Producción, Productos, Cocina, Reparto, Clientes, Usuarios, Reportes y Ajustes. El orden mezcla secuencia de venta, operación en tiempo real, administración y consulta analítica.

Los permisos reducen la lista para operadores especializados, por lo que Cocina y Reparto suelen ver pocas opciones. El problema se concentra en administración y roles amplios: tareas frecuentes y configuraciones excepcionales compiten en la misma superficie.

### Estructura principal propuesta

```text
Inicio
Ventas
├── Punto de venta
├── Pedidos
├── Caja
└── Clientes
Operación
├── Cocina
├── Reparto
├── Inventario
├── Compras
└── Producción
Catálogo
├── Productos
├── Recetas
└── Paquetes y promociones
Análisis
└── Reportes
Administración
├── Usuarios y permisos
└── Ajustes
```

Esta estructura no convierte automáticamente Recetas o Promociones en rutas nuevas. Primero puede agrupar accesos y mantener sus componentes dentro de Productos. La separación futura solo debe hacerse si mejora el regreso y preserva el borrador de recetas. Los grupos deben ocultarse si el usuario no contiene módulos permitidos.

## 4. Auditoría de navegación

### Estado actual verificado

- Escritorio: barra lateral fija de 252 px y una lista desplazable con todos los módulos permitidos.
- Menos de 780 px: encabezado, barra inferior con hasta cuatro módulos según una prioridad fija y acceso «Más».
- «Más»: hoja modal con todos los módulos, usuario, rol y cierre de sesión.
- Estado activo: fondo y color en barra lateral, barra inferior y hoja móvil.
- Regreso Android: cierra primero la hoja; después consulta `work.leave()`, usa una pila de módulos y finalmente minimiza la aplicación.
- Navegación interna: no hay URL/rutas del navegador por módulo; recargar vuelve al primer módulo permitido.
- El shell desmonta la pantalla anterior. P0 conserva únicamente el trabajo declarado en `WorkProvider`.

### Problemas

- La lista plana carece de relación visible entre POS, Pedidos, Cocina y Reparto, o entre Inventario, Compras y Producción.
- La prioridad móvil es global. Un administrador obtiene Resumen/POS/Pedidos/Cocina aunque su trabajo habitual pueda ser inventario o productos; no existe preferencia por rol o acceso reciente.
- «Caja / POS» y «Corte de caja» comparten la palabra caja para tareas diferentes.
- Los símbolos de texto (`▣`, `▦`, `♙`, `♟`, `◆`) no forman un sistema iconográfico inequívoco y varios dependen del tipo de letra.
- En web no existe historial del navegador, deep link ni restauración del módulo activo. El historial interno solo atiende el botón físico de Android.
- Entrar desde Resumen a Inventario no selecciona automáticamente el contexto de bajo stock o caducidad correspondiente.
- Los módulos conservan búsqueda/página mientras siguen montados, pero al cambiar de módulo suelen desmontarse. Los borradores protegidos sobreviven donde P0 lo definió; filtros de consulta normalmente no.
- No hay un patrón global de lista → detalle → volver. Inventario muestra detalle en el mismo módulo; Clientes mantiene una selección local; Pedidos expande contenido; cada módulo decide por separado.

## 5. Auditoría de consistencia visual

### Base compartida existente

- `ActionButton`: acción primaria/secundaria/destructiva, progreso, bloqueo y foco.
- `FloatingTextInput`: label persistente, error asociado, obligatorio y referencia de foco.
- `Notice`/`Feedback`: tipos semánticos y anuncios.
- `ConfirmationDialog`: confirmación, teclado y retorno de foco.
- `RemoteListStatus` y `Pagination`: carga, error, vacío, búsqueda vacía y páginas.
- `Section`, `Tabs`, `EmptyState`, `LoadingState` y estilos `ops`: base de módulos operativos.

### Adopción

POS, Recetas, Compras, Producción, Inventario, Clientes, Usuarios y formularios de Productos usan una parte relevante de la base compartida. Caja, Ajustes, Cocina, Reparto, Pedidos, Reportes, navegación y varias áreas de Productos mantienen botones, avisos, filas y tarjetas locales.

### Clasificación

| Tipo | Evidencia | Decisión futura |
| --- | --- | --- |
| Inconsistencia funcional | Botones locales no comparten gate, progreso, motivo de bloqueo, foco o anuncio | Migrar acciones de escritura y transiciones de estado; conservar contratos de dominio |
| Inconsistencia funcional | Errores crudos aún pueden aparecer en dashboard, shell, pedidos, cocina, reparto, impresión y reportes | Aplicar mensajes seguros y estados compartidos por sección |
| Diferencia intencional | Cocina usa columnas/tarjetas de alta densidad y temporizadores | Mantener patrón de tablero; aplicar tokens y accesibilidad sin convertirlo en formulario genérico |
| Diferencia intencional | POS mantiene carrito persistente visual y configuradores de producto | Conservar jerarquía de venta y total; unificar solo primitivas |
| Diferencia intencional | Ticket de impresión utiliza apariencia propia y tipografía monoespaciada | Excluir del estilo general salvo contraste y tamaño |
| Deuda cosmética | Acentos `#cf4b32`, `#d94f36` y variantes cercanas; bordes/radios y superficies repetidos | Sustituir gradualmente por tokens semánticos |
| Deuda cosmética | Tarjetas con radios entre 10 y 20 px y fondos `white`, `#fffdfa`, `#f7f2e9`, `#f6f7f9` | Reducir a niveles de superficie definidos, sin uniformar componentes que necesitan jerarquía distinta |

### Tokens mínimos recomendados

```text
color.canvas, color.surface, color.surfaceInset
color.text, color.textMuted, color.border
color.primary, color.primaryContrast
color.success, color.warning, color.danger, color.info
space.1/2/3/4/6
radius.control, radius.card, radius.modal
type.caption, type.body, type.label, type.section, type.page
control.minTouch, layout.contentMax
```

No se recomienda crear un paquete externo ni una taxonomía extensa. Los tokens deben ser objetos TypeScript utilizables por React Native y web.

## 6. Tema claro y oscuro

`SystemTheme` crea una hoja de estilo web y recorre `#root` y todos sus descendientes. Para cada elemento consulta estilos calculados, registra su tamaño de fuente y clasifica colores de fondo, texto y borde mediante tablas de valores RGB. Después genera selectores `data-pizzeria-*`. Un `MutationObserver` sobre atributos, hijos y subárbol vuelve a ejecutar el proceso.

### Costos y riesgos verificados

- Cada mutación relevante puede provocar un recorrido completo y múltiples `getComputedStyle`, que fuerzan trabajo de estilo/layout en el navegador.
- El observador también ve atributos que el propio clasificador modifica; aunque el resultado se estabilice, el diseño depende de ciclos de mutación.
- Un color nuevo o ligeramente distinto no recibe tema hasta añadirse a la tabla RGB.
- Los estados semánticos pueden terminar con el mismo tratamiento si comparten un color reconocido.
- El escalado de fuente depende del mismo recorrido, no de estilos tipográficos declarativos.
- Solo funciona en web. En React Native, `ThemeToggle` no aplica un contexto de tema equivalente.
- `ThemeToggle` usa estilos literales propios y no forma parte de una paleta compartida.

### Migración propuesta

Introducir tokens de color con variantes clara/oscura y un contexto/hook pequeño. Migrar primero shell y componentes compartidos; después módulos por grupos. Mantener temporalmente el clasificador como compatibilidad para zonas no migradas y eliminarlo únicamente cuando un inventario automatizado no encuentre colores dependientes. El tamaño de texto debe pasar a una escala tipográfica declarativa separada del tema.

## 7. Responsive global

### Breakpoints actuales

| Umbral | Uso |
| --- | --- |
| `< 780` | Shell, login, resumen, pedidos y cocina; activa navegación inferior/hoja móvil |
| `< 900` | POS y Recetas de venta; cambia paneles y flujo móvil |
| `< 980` | Inventario, Compras y Producción; convierte diseños operativos a una columna/panel |
| `Platform.OS` | Cambia filas/columnas, padding, impresión y navegación; no equivale a tamaño de pantalla |

### Estrategia recomendada

- **Móvil:** hasta 599 px, un panel principal, acciones sin ancho fijo y navegación inferior.
- **Tablet:** 600–1023 px, shell compacto pero posibilidad de dos paneles cuando cada uno conserve un ancho útil.
- **Escritorio:** desde 1024 px, barra lateral y composiciones multipanel.
- Centralizar helpers `isMobile`, `isTablet`, `isDesktop`; permitir excepciones justificadas del POS/tablero sin literales repetidos.
- Diseñar por ancho disponible del contenido, no por `Platform.OS`.

Estos valores son una propuesta de contrato para P2, no una modificación actual.

### Riesgos por módulo

| Módulo | Escritorio/tablet/móvil | Severidad |
| --- | --- | --- |
| Shell | Tablet de 800–979 px usa barra lateral de escritorio mientras módulos operativos ya son compactos; a 780–899 el shell es escritorio pero POS/Recetas son móviles | Alto |
| POS | Tiene flujo móvil probado; filtros horizontales y selector de zonas necesitan verificación con teclado/texto ampliado | Medio |
| Pedidos | Mucha información y acciones en tarjetas; filtro/acciones pueden envolver de forma impredecible | Alto |
| Cocina | Escritorio usa columnas; móvil usa pestañas horizontales. Requiere prueba con muchos pedidos, texto grande y orientación | Alto |
| Reparto | Tarjetas con teléfono, mapa, cobro e impresión; falta prueba táctil y con texto grande | Medio |
| Inventario | Nuevo listado/detalle usa breakpoint 980 y tarjetas; contexto está conservado en el módulo | Medio |
| Compras | Flujo largo y revisión funcionan en columna, pero teclado puede ocultar total/acción final | Medio |
| Producción | Formularios y vista previa densos; riesgo de acciones alejadas del campo que cambia | Medio |
| Productos | Editor grande en `App.tsx`, imágenes, variantes, sabores, recetas y promociones en una vista extensa | Alto |
| Clientes/Usuarios/Ajustes | Flex-wrap evita desbordamiento básico, pero permisos, sliders y formularios densos no tienen recorrido móvil específico | Alto |
| Reportes | Representación genérica en tarjetas reduce tablas anchas, pero puede producir páginas muy largas y sin jerarquía responsive | Medio |
| Diálogos | `maxWidth: 440` y contención razonable; falta verificar altura, teclado y texto 200 % | Medio |

## 8. Accesibilidad

### Verificado por código

- `FloatingTextInput` asocia label, error, ayuda, obligatorio e invalidez.
- `ActionButton` expone rol, estado disabled/busy, label y foco visible.
- `Notice` diferencia alerta de región informativa.
- `ConfirmationDialog` gestiona foco inicial, Tab/Mayús+Tab, Escape y retorno de foco en web.
- `RemoteListStatus` y paginación incluyen nombres y estados de botón.
- Algunas selecciones de POS, Recetas, Producción y Compras usan roles y estados seleccionados.
- Los objetivos compartidos principales miden 44–46 px o más.

### Problemas estáticos

- Existen numerosos `Pressable` locales sin rol, estado seleccionado o nombre explícito. El texto visible puede nombrarlos, pero los chips seleccionables no siempre comunican selección.
- Navegación lateral, inferior y hoja móvil no expone un concepto de navegación ni `selected/current` de forma consistente.
- El modal móvil de módulos no implementa ciclo de foco, foco inicial ni retorno explícito como `ConfirmationDialog`.
- El botón de cierre «×» depende principalmente de su glifo y no tiene nombre accesible explícito.
- La jerarquía usa componentes `Text`; en web no existe un esquema consistente de encabezados semánticos.
- Varias pantallas distinguen selección, éxito o estado mediante color/fondo sin un texto o estado accesible equivalente.
- `FloatingTextInput` trunca el label flotante a una línea; texto ampliado o traducciones largas pueden ocultar información.
- Errores del `AppErrorBoundary` muestran `error.message`, que puede ser técnico y no está anunciado con el componente seguro.
- Iconos de navegación son caracteres decorativos sin ocultarse de lectores de pantalla.
- Sliders personalizados de tamaño de fuente requieren comprobar rol, valor actual y operación con teclado.

### Requiere prueba manual

- Orden real del lector de pantalla, nombres calculados y anuncios en Web, Android e iOS.
- Contraste de todos los estados en ambos temas.
- Zoom/reflow al 200 % y 400 %.
- Navegación completa solo con teclado, incluida hoja móvil simulada, selects propios y tableros.
- Teclado virtual, foco visible y acciones finales en formularios largos.
- Tamaño táctil efectivo de chips y acciones locales.

No se afirma cumplimiento WCAG.

## 9. Arquitectura frontend

La aplicación no usa un router. `PizzeriaApp` conserva sesión y un `Screen` discriminado; una cadena condicional decide qué componente montar. Esta solución mantiene el control de `work.leave()`, pero concentra permisos, navegación, historial y composición en un solo archivo.

Estado global real:

- sesión y preferencias persistidas;
- `WorkProvider` para borradores, ámbito y operaciones inciertas;
- caché API acotada;
- canales/polling de pedidos;
- estado de pantalla local en el shell.

La extracción por dominio avanzó: POS, Caja, Clientes, Usuarios, Ajustes, Inventario, Compras, Producción y Recetas tienen archivos propios. Productos, Pedidos, Cocina, Reparto, Reportes, shell y dashboard siguen en `App.tsx`.

No conviene introducir otra autoridad global de estado. La arquitectura objetivo debe conservar `WorkProvider` y extraer:

1. definición declarativa de módulos/permisos;
2. shell y navegación;
3. pantallas activas restantes;
4. tipos y etiquetas de pedidos/reportes;
5. estilos/tokens compartidos.

## 10. Estado actual de `App.tsx`

- Tamaño: aproximadamente **2,435 líneas**.
- Responsabilidades: arranque, sesión, errores globales, permisos, navegación, historial Android, notificaciones, tema/tamaño de fuente, login, dashboard, carga genérica, realtime/polling, pedidos, cocina, reparto, clientes/usuarios/ajustes antiguos, reportes, productos, impresión y POS antiguo.
- Componentes activos importantes todavía embebidos: `Dashboard`, `DataScreen`, `OrdersDayScreen`, `KitchenBoard`, `DeliveryBoard`, `Reports`, `ProductsView`, `ComboManager`, documentos y contenido de pedidos.
- Dependencias: API/cache, Capacitor, React Native, realtime, push, impresión, sonidos, formularios, trabajo y casi todas las features.
- Estilos: un único `StyleSheet` grande sirve tanto al shell como a varias pantallas activas y antiguas.

El tamaño no es por sí mismo el problema. El riesgo está en que una modificación de navegación o tokens toca el mismo archivo que transiciones de pedidos, productos atómicos e impresión.

## 11. Código antiguo

| Clasificación | Elementos | Evidencia/acción futura |
| --- | --- | --- |
| Seguro de retirar después de prueba de composición | Rama `screen === "pos"` de `DataScreen` y componentes `Pos`/`ProductCard` antiguos | `PizzeriaApp` renderiza `PosScreen` antes de llegar a `DataScreen`; no hay llamada activa con `pos` |
| Seguro de retirar después de prueba de composición | Ramas y componentes `CustomersView`, `UsersView`, `AdministrationView` | El shell renderiza `CustomersScreen`, `UsersScreen` y `SettingsScreen` directamente |
| Probablemente obsoleto | Tipos y estilos usados únicamente por las pantallas antiguas anteriores | Confirmar con análisis de referencias al separar el `StyleSheet` |
| Aún utilizado | `ProductsView`, `ComboManager`, recetas integradas, `Reports`, Cocina, Reparto y Pedidos | Son destinos actuales de `DataScreen` o del shell |
| Aún utilizado | Helpers de documentos, impresión y contenido de pedidos | Compartidos por pedidos operativos |
| Requiere investigación | `DataScreen` como cargador genérico | Cocina/Reparto/Productos todavía dependen de él; Reportes provoca una lectura inicial que su componente vuelve a resolver por separado |
| Requiere investigación | Estilos `s` sin referencias obvias | La eliminación debe ocurrir después de extraer pantallas y usar búsqueda/TypeScript; los nombres compartidos impiden atribución segura ahora |

Las pruebas cargan partes reales de `App.tsx` mediante soporte AST. Retirar símbolos puede requerir adaptar el adaptador sin debilitar las pruebas de Productos.

## 12. Rendimiento

### Evidencia sustentada

- Tema y tamaño de texto: recorrido completo del DOM y estilos calculados ante mutaciones.
- Dashboard: `Promise.all` acopla caja, pedidos y `/inventory/alerts`; un fallo oculta todas las métricas. Además, leer alertas recalcula y escribe alertas, aunque P1 · 7 ya evitó ese costo al abrir Inventario.
- `DataScreen`: abstrae fuentes muy distintas y mantiene lógica realtime/polling dentro del mismo componente.
- Cocina y Reparto combinan canal realtime con polling adaptativo. Ya existe coalescencia y pausa en segundo plano; no se considera un problema por sí solo.
- POS muestra el catálogo cargado por `/pos/catalog` y mantiene configuradores montados en el cambio catálogo/carrito móvil para no perder datos. Es una decisión funcional comprobada, no un componente oculto accidental.
- Productos sigue recibiendo un catálogo y concentra editor, recetas y promociones; requiere medir tamaño real antes de cambiar su estrategia.
- Inventario, Compras, Clientes, Usuarios y Recetas usan paginación/búsqueda remota en los recorridos corregidos; no deben volver a cargas completas.
- Imágenes de producto se cargan en POS cuando existen. P0 ya limitó columnas/imágenes en relaciones de combos; no se encontró una regresión demostrable adicional.

No se propone memoización general ni virtualización sin perfil de datos/render.

## 13. Estado y conservación de contexto

| Contexto | Estado actual | Evaluación |
| --- | --- | --- |
| Módulo actual | Estado React; se pierde al recargar/iniciar sesión | Medio: una recarga devuelve al primer módulo permitido |
| Historial de módulo | Pila en memoria usada por botón Android | No equivale a historial web ni breadcrumb |
| POS | Borrador persistido 24 horas y aislado por API/usuario/sucursal | Garantía a conservar |
| Recetas y Compras | Memoria de `WorkProvider`, guard de salida; no sobreviven cierre forzado | Garantía y límite documentados |
| Productos/Clientes | Guard de cambios importantes | Garantía a conservar |
| Inventario lista → detalle | Mismo componente; búsqueda, filtro y página permanecen mientras no se cambia de módulo | Adecuado dentro del módulo; al desmontar se pierde consulta |
| Clientes lista → cliente | Selección y consulta local; búsqueda/página permanecen mientras está montado | Adecuado dentro del módulo; falta patrón de regreso explícito en móvil |
| Producción/Recetas | Selección se separa de resultados remotos y no cambia al paginar | Garantía a conservar |
| Scroll | Scroll principal pertenece al shell; no se almacena por módulo | Volver a un módulo comienza normalmente arriba |

P2 debe distinguir trabajo editable de contexto de consulta. Se recomienda guardar por módulo, solo durante la sesión, búsqueda/filtro/página/selección y posición cuando el regreso frecuente lo justifique. No debe incorporarse al borrador durable de P0.

## 14. Lenguaje

### Inconsistencias encontradas

- «Caja / POS» mezcla nombre cotidiano y sigla; «Corte de caja» puede confundirse con la misma caja.
- Código y algunos mensajes conservan “stock”; Inventario nuevo usa “existencia”.
- SKU es necesario para operación, pero debe acompañarse de “código” la primera vez.
- «Override», «backend», «payload», «cache» y nombres de estado aparecen principalmente en código; no deben llegar a mensajes nuevos.
- Pedidos usa «Recoger», «Para recoger» y «Recoger en local» según contexto.
- La entidad comercial se llama unas veces orden y otras pedido. La interfaz debe usar “pedido”; “orden” queda como término interno/API.
- Botones similares alternan «Guardar», «Registrar», «Confirmar» y «Actualizar». Deben expresar el resultado: Guardar cambios, Registrar compra, Confirmar producción, Actualizar información.
- Mensajes antiguos concatenan el texto de excepciones; los flujos P1 usan mensajes seguros.

### Convenciones propuestas

- Usar **Punto de venta** en navegación; POS solo como ayuda secundaria si el personal ya lo reconoce.
- Usar **Caja del turno** para apertura/cierre y movimientos.
- Usar **existencia**, **código/SKU**, **presentación**, **pedido** y **entrega a domicilio**.
- Título de acción = resultado concreto; confirmación destructiva = consecuencia concreta.
- Error = qué ocurrió + ubicación + acción posible, sin detalles técnicos.
- Mantener nombres registrados por el negocio —productos, tamaños, unidades— sin reinterpretarlos.

## 15. Evaluación de tareas completas

Los pasos son aproximados a partir de acciones visibles; no son tiempos medidos.

| Tarea | Recorrido y pasos aproximados | Problemas y riesgo |
| --- | --- | --- |
| A. Venta → cocina | Punto de venta: elegir productos/configurar → carrito → entrega/cliente → pago → confirmar → envío a cocina; 6–9 decisiones según pedido | Flujo P1 claro; navegación llama “Caja / POS”; en móvil alterna catálogo/carrito; riesgo medio por densidad y teclado, garantías funcionales altas |
| B. Consultar pedido | Pedidos del día → grupo/filtro → pedido → historial/acciones; 3–4 pasos | Muchas acciones en una tarjeta, sin deep link desde notificación web verificable en el shell; riesgo medio |
| C. Compra → inventario | Compras → datos → buscar/presentación → renglones → revisión → registrar → Inventario → buscar/detalle; 8–10 pasos y un cambio de módulo | Conversión/revisión ya claras; no hay enlace directo desde compra confirmada al insumo o compra; riesgo medio |
| D. Crear/editar receta | Productos → Recetas → buscar/crear → destino → ingredientes → revisión → guardar; 6–8 pasos | Recetas está conceptualmente dentro de Productos, pero no se refleja en navegación; borrador protegido; riesgo medio de localización |
| E. Registrar producción | Producción → preparación → tandas/vista previa → confirmar; 4–5 pasos | Pantalla combina administración de receta y ejecución; densidad alta en móvil; riesgo medio |
| F. Consultar bajas | Inventario → filtro Bajo/Crítico/Agotado → detalle; 2–3 pasos | Flujo P1 directo; tarjeta de Resumen abre Inventario sin aplicar filtro; riesgo bajo/medio |
| G. Crear producto | Productos → datos → variante/precio → sabores/imagen → guardar; luego receta/promoción si aplica; 5–9 pasos | Pantalla extensa y varias responsabilidades; cambio entre producto y receta no se representa jerárquicamente; riesgo alto en móvil |
| H. Crear cliente | Clientes → formulario → guardar; dirección opcional en detalle; 2–4 pasos | Flujo compartido y validación clara; lista/editor y reglas compiten en misma pantalla según permiso; riesgo medio |
| I. Abrir/cerrar caja | Caja del turno → abrir; durante turno movimientos; revisar → cerrar; 2 pasos para abrir, 3–5 para cerrar | Nombre compite con POS y aún mantiene controles/mensajes locales de P1 pendiente; impacto financiero, riesgo alto |
| J. Administrar usuario | Usuarios → crear/seleccionar → rol/permisos → guardar; 3–6 pasos | Matriz de permisos densa, chips sin semántica consistente y prioridad móvil no relevante; riesgo alto de UX/accesibilidad |

## 16. Matriz de hallazgos

| ID | Área/categoría | Problema y evidencia | Impacto | Severidad | Alcance/propuesta | Dependencias |
| --- | --- | --- | --- | --- | --- | --- |
| P2-001 | Navegación · UX | Hasta 14 módulos en una lista plana en `allScreens`/barra lateral | Localización lenta y tareas administrativas compiten con operación | Alto | Agrupar por Ventas, Operación, Catálogo, Análisis y Administración | Definición declarativa de módulos |
| P2-002 | Navegación · UX | Prioridad móvil fija, no derivada del rol/tarea | Accesos cotidianos pueden quedar bajo «Más» | Medio | Prioridad por grupo y permisos; evitar personalización en primera fase | P2-001 |
| P2-003 | Navegación · Accessibility | Barra y hoja móvil carecen de semántica selected/current uniforme y manejo completo de foco | Orientación y teclado/lector deficientes | Alto | Crear shell accesible y patrón de navegación | P2-001, componentes compartidos |
| P2-004 | Estado · UX | Módulo, filtros y scroll de consulta se pierden al desmontar/recargar | Repetición de búsqueda y pérdida de contexto | Medio | Memoria de sesión por módulo, separada de borradores | Shell nuevo, hooks existentes |
| P2-005 | Arquitectura | `App.tsx` mezcla shell y dominios en 2,435 líneas | Alto radio de cambio y difícil retiro de deuda | Alto | Extraer registro, shell y pantallas activas por etapas | Pruebas de composición |
| P2-006 | Tech debt | POS/Clientes/Usuarios/Ajustes antiguos permanecen en ramas no alcanzadas | Duplicación y riesgo de modificar código incorrecto | Alto | Retirar tras probar rutas actuales y adaptar soporte AST | P2-005 |
| P2-007 | Tema · Performance | `MutationObserver` + recorrido DOM + `getComputedStyle` en `SystemTheme` | Costo por mutación y cobertura frágil | Alto | Tokens semánticos/contexto; compatibilidad temporal | Tokens y migración por módulos |
| P2-008 | Tema · UI | Tema depende de una lista de colores RGB literales | Nuevos componentes pueden quedar ilegibles | Alto | Paletas explícitas clara/oscura | P2-007 |
| P2-009 | Responsive | Breakpoints 780/900/980 generan estados híbridos | Tablet recibe shell y pantalla con estrategias diferentes | Alto | Contrato 600/1024 con excepciones documentadas | Shell/tokens |
| P2-010 | UI | Tres familias de estilos y muchos valores casi iguales | Apariencia inconsistente y tema costoso | Medio | Tokens mínimos y migración incremental | P2-007 |
| P2-011 | Formularios · UX | Caja, Ajustes y partes operativas conservan botones/avisos locales | Progreso, error y bloqueo no siempre uniformes | Alto | Migrar acciones con riesgo; no sustituir chips/navegación indiscriminadamente | P1 · 5, pruebas por transición |
| P2-012 | Accessibility | Gran número de `Pressable` locales sin rol/estado explícito | Selección y propósito ambiguos para tecnología asistiva | Alto | Matriz de control y migración por patrones | Tokens/componentes |
| P2-013 | Accessibility | Jerarquía visual no se traduce a encabezados web consistentes | Navegación por encabezados deficiente | Medio | Componente de texto/heading semántico multiplataforma | Base tipográfica |
| P2-014 | Accessibility | Modal móvil no replica gestión de foco del diálogo compartido | Foco puede escapar o no regresar | Alto | Hoja accesible con foco, Escape y retorno | Shell nuevo |
| P2-015 | Errores · UX | Shell/dashboard/pedidos/documentos aún muestran `Error.message` | Posibles términos técnicos sin acción | Alto | Adaptador seguro y estados por sección | P1 · 5 |
| P2-016 | Dashboard · Performance | `Promise.all` y lectura costosa `/inventory/alerts` acoplan cuatro métricas | Un fallo oculta todo y abrir Inicio escribe/recalcula alertas | Alto | Fuentes independientes y `inventory/summary` sin recalcular alertas | API existente P1 · 7 |
| P2-017 | Productos · Responsive | Producto, receta y promociones comparten una pantalla extensa en `App.tsx` | Difícil localización y recorrido móvil largo | Alto | Secciones/rutas internas preservando borradores | P2-001, P2-005 |
| P2-018 | Caja · UX/UI | Controles financieros aún usan patrones locales; P1 la dejó pendiente | Error de captura/estado con impacto financiero | Alto | Fase dirigida con pruebas de apertura/movimiento/cierre | Componentes P1 · 5 |
| P2-019 | Usuarios · UX/Accessibility | Roles/permisos densos y selección no siempre semántica | Configuración errónea o difícil con teclado | Alto | Vista jerárquica y controles seleccionables accesibles | IA Administración, componentes |
| P2-020 | Cocina · Responsive | Columnas y pestañas requieren prueba con carga/texto/orientación | Pedidos o acciones pueden quedar fuera de vista | Medio | Validación real y ajustes específicos; conservar tablero | Tokens/responsive |
| P2-021 | Reportes · UX | Render genérico muestra hasta cinco propiedades sin jerarquía específica | Lectura y comparación difíciles | Medio | Plantillas por familia de reporte, después de IA | Extracción App.tsx |
| P2-022 | Lenguaje · UX | Caja/POS/Corte, orden/pedido y stock/existencia varían | Curva de aprendizaje | Medio | Glosario y etiquetas compartidas | P2-001 |
| P2-023 | Navegación · Architecture | Sin rutas/deep links ni historial web | Recarga/notificación no restaura contexto | Medio | Evaluar router ligero o estado URL web sin duplicar navegación nativa | Shell y guards P0 |
| P2-024 | Texto ampliado · Accessibility | Escala se aplica inspeccionando tamaños existentes; labels flotantes truncan | Reflow impredecible | Alto | Escala tipográfica declarativa y prueba 200/400 % | P2-007, tipografía |

## 17. Dependencias

```text
Registro declarativo de módulos y pruebas del shell
├── nueva arquitectura de información
├── navegación accesible
└── conservación de contexto de consulta

Extracción/retirada segura de código antiguo
└── reduce duplicidad antes de migrar estilos de pantallas activas

Tokens semánticos + contexto de tema/tipografía
├── tema oscuro explícito
├── responsive coherente
└── accesibilidad visual y texto ampliado

Responsive por patrones
└── validación final de teclado, lector y dispositivos
```

Las garantías P0/P1 son dependencias obligatorias. Ninguna fase puede sustituir `WorkProvider`, reiniciar claves inciertas, recalcular precios en frontend, volver a catálogos completos o separar escrituras atómicas.

## 18. Propuesta de fases P2

### P2 · 1 — Shell, navegación y arquitectura de información

**Objetivo:** que cada rol entienda dónde está y encuentre su tarea frecuente.

**Alcance:** registro declarativo de módulos/permisos, grupos propuestos, navegación escritorio/móvil, estado activo, hoja accesible, regreso y memoria de contexto de consulta. Mantener los componentes de dominio.

**Dependencias:** pruebas de pantallas permitidas, `work.leave()`, botón Android y notificaciones.

**Riesgo:** alto; un error puede ocultar módulos o permitir abandonar trabajo.

**Módulos:** shell completo, Resumen y entradas a todos los módulos.

**Terminación:** cada permiso produce el mismo acceso funcional; navegación agrupada, teclado/foco y regreso probados; borradores/operaciones inciertas bloquean salida igual que antes.

**Pruebas:** roles administrador/caja/cocina/reparto; escritorio/tablet/móvil; botón atrás; cierre de sesión; deep link solo si se adopta; regresiones P0/P1.

### P2 · 2 — Límites frontend y retiro de código antiguo

**Objetivo:** reducir el radio de cambio antes de una migración visual global.

**Alcance:** extraer shell, Pedidos, Cocina, Reparto, Productos y Reportes; retirar únicamente ramas antiguas verificadas; separar estilos y tipos. Sin cambiar UX ni API.

**Dependencias:** P2 · 1 define el contrato del shell; adaptar pruebas AST de Productos.

**Riesgo:** medio/alto por transiciones de pedidos, impresión y configuración atómica.

**Módulos:** `App.tsx` y pantallas todavía embebidas.

**Terminación:** `App.tsx` queda como composición/arranque; no hay ramas inalcanzables confirmadas; comportamiento y payloads permanecen.

**Pruebas:** suite completa, typecheck/build, snapshots estructurales solo si aportan valor, recorridos de pedidos/productos/reportes e impresión simulada.

### P2 · 3 — Tokens, tema y tipografía semántica

**Objetivo:** tema claro/oscuro predecible y una base visual pequeña.

**Alcance:** tokens mínimos, contexto claro/oscuro, escala tipográfica declarativa y migración de shell/componentes compartidos; después pantallas activas por grupos. Retirar el clasificador DOM al finalizar.

**Dependencias:** P2 · 2 elimina estilos antiguos para no migrarlos; inventario de colores de este informe.

**Riesgo:** alto por contraste, estados y diferencias web/nativo.

**Módulos:** global, conservando tableros/tickets como variantes intencionales.

**Terminación:** ningún componente activo depende de clasificación RGB; cambio de tema no recorre DOM; escala de texto funciona sin mutar cada elemento.

**Pruebas:** claro/oscuro, estados semánticos, formularios, modales, impresión, capturas en tres tamaños y contraste manual/instrumentado.

### P2 · 4 — Responsive por patrones y módulos críticos

**Objetivo:** recorrido completo usable en móvil, tablet y escritorio.

**Alcance:** helpers de breakpoint, shell, lista/detalle, formularios/revisión, tablero, carrito y acciones persistentes. Prioridad: Productos, Caja, Usuarios, Pedidos, Cocina; después módulos ya adaptados en P1.

**Dependencias:** tokens y pantallas activas extraídas.

**Riesgo:** medio/alto por montaje/desmontaje y pérdida de estado.

**Módulos:** todos, por patrón compartido.

**Terminación:** sin scroll horizontal accidental; acciones y mensajes permanecen visibles; alternar paneles no pierde datos; texto ampliado no oculta decisiones.

**Pruebas:** anchos 360/390/600/768/1024/1440, orientación, teclado virtual, datos largos/vacíos/error/carga y borradores P0.

### P2 · 5 — Accesibilidad y lenguaje operativo

**Objetivo:** completar teclado, tecnología asistiva, foco, estados y vocabulario coherente.

**Alcance:** auditoría control por control, navegación, encabezados, chips/radios, sliders, tableros, avisos y glosario. Corregir Caja y Usuarios con pruebas dirigidas.

**Dependencias:** shell, tokens y responsive estables. La accesibilidad básica debe incorporarse también en cada fase anterior.

**Riesgo:** medio; cambios de rol/teclado pueden alterar interacción.

**Módulos:** todos, con prioridad POS, Caja, Cocina, Reparto, Usuarios y Ajustes.

**Terminación:** recorridos A–J realizables con teclado en web; nombres/estados comprensibles; foco predecible; pruebas manuales documentadas. No afirmar WCAG sin evaluación formal.

**Pruebas:** Tab/Mayús+Tab/Enter/Espacio/Escape, lector de pantalla en web y al menos un dispositivo móvil, zoom 200/400 %, contraste y tamaños táctiles.

## 19. Riesgos de P2

- Cambiar navegación puede saltarse `work.leave()` o perder una operación incierta.
- Persistir contexto de consulta junto con borradores mezclaría datos de usuario/sucursal; deben ser capas separadas.
- Extraer Productos puede romper el cuerpo congelado, revisión y recuperación de guardado atómico.
- Desmontar el catálogo móvil del POS volvería a perder configuraciones no agregadas.
- Migrar tema de una sola vez puede dejar zonas ilegibles; requiere convivencia temporal controlada.
- Sustituir todos los controles por un componente común puede borrar diferencias necesarias del tablero, tickets o chips.
- Un router web puede competir con botón Android y navegación nativa; debe existir una sola autoridad de transición.
- Cambiar breakpoints puede desmontar paneles al rotar/redimensionar; el estado debe vivir por encima de la presentación.
- Retirar código antiguo sin considerar el cargador AST de pruebas puede reducir cobertura sin advertencia.
- Ningún cambio visual debe volver a cargar catálogos completos ni agrupar fuentes independientes.

## 20. Pruebas manuales necesarias

1. Ejecutar las tareas A–J con administrador y con cada rol limitado; anotar puntos de duda y módulos bajo «Más».
2. Repetir en 360, 390, 600, 768, 1024 y 1440 px, además de orientación horizontal de tablet.
3. Probar claro/oscuro en cada módulo con éxito, advertencia, error, carga, vacío, selección y disabled.
4. Usar zoom/texto 200 % y 400 %; comprobar reflow, labels, barra inferior, modales, total y acciones finales.
5. Completar POS, Compra, Producto, Cliente, Usuario y Producción con teclado virtual abierto.
6. Recorrer toda la aplicación solo con teclado web; comprobar foco visible, hoja móvil, diálogos, selects, tablas/tableros y retorno de foco.
7. Probar lector de pantalla en web y al menos Android o iOS: navegación, encabezados, campos, errores, selección, progreso y avisos.
8. Cargar Cocina/Pedidos/Reparto con nombres, direcciones y listas largas; verificar actualización realtime/polling sin pérdida de foco.
9. Abrir Inventario → detalle → volver y Clientes → cliente → volver; verificar búsqueda, página, selección y scroll esperados.
10. Cambiar módulo con POS, receta, compra, producto y cliente incompletos; comprobar guards, aislamiento y recuperación.
11. Simular respuesta perdida y conflicto de precio/configuración/presentación durante cambios responsive o de navegación.
12. Verificar impresión/ticket, tonos, subida de logo, enlaces de teléfono/mapa/WhatsApp y botón atrás en dispositivos compatibles.

## Línea base

Al cerrar P2 · 0 se ejecutaron `npm test` (**80 aprobadas**) y `npm run typecheck` (**aprobado**). La última línea base ya documentada conserva exportación web aprobada y **159 pruebas backend aprobadas con 2 omitidas** por requerir MariaDB/InnoDB dedicado y `pcntl`; el backend no se modificó durante esta auditoría. P2 · 0 no cambió código ni pruebas.

P2 · 0 termina con este informe. No se implementó P2 · 1 ni ninguna otra fase.
