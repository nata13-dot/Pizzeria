# P2 · 4 — Responsive y adaptación de interfaz

## Alcance

Se migraron Producción, recetas de producción y de venta, Productos, Cocina, Reparto, Clientes, Usuarios y Reportes al contrato común de tres tamaños: móvil hasta 599 px, tablet entre 600 y 1023 px y escritorio desde 1024 px. Los 16 mockups se usaron como referencia de jerarquía, densidad, tarjetas, columnas, formularios y prioridad de acciones; no se trataron como contratos funcionales ni como objetivos pixel-perfect.

Se conservaron navegación, permisos, `WorkProvider`, guards, borradores, contratos API, cálculos y precios, configuración atómica de Producto, `revision`, `operation_key`, payload congelado, realtime, polling, documentos e impresión. No se modificó el backend, no se añadieron dependencias y no se inició P2 · 5.

## Contrato responsive

`src/layout/responsive.ts` es la autoridad de tamaños y expone tanto la clasificación pura como `useResponsiveLayout()`. Los límites se comprueban expresamente en 599, 600, 1023 y 1024 px. El hook solo deriva composición desde `useWindowDimensions`; no registra listeners propios, no ejecuta peticiones y no cambia la identidad de las pantallas.

Los formularios usan campos flexibles que pasan de varias columnas a una columna según el espacio disponible. Se retiraron los cortes locales de 780, 900 y 980 px de las pantallas migradas. Controles y acciones principales mantienen al menos 44 px de altura, los campos ya no dependen de una altura fija para texto ampliado y el contenido puede envolver sin producir overflow horizontal de página.

## Pantallas migradas

### Producción y recetas

Producción usa la misma navegación interna Registrar producción / Recetas / Lotes. En escritorio conserva filas y resúmenes amplios; tablet y móvil apilan campos, métricas, porciones, insumos y acciones. En móvil las secciones reducen densidad y la actualización ocupa el ancho disponible. La selección, faltantes, caducidad, consumos, paginación y confirmación de producción no cambiaron.

El editor de recetas conserva salida, rendimiento, vida útil, insumos, estado activo y edición. Recetas de venta usa el mismo contrato: escritorio puede mostrar directorio y editor en paralelo; tablet y móvil alternan listado/editor/revisión sin perder cantidades ni dirty state.

### Productos

La creación se organiza en Información, Imagen, Variante inicial y Vista previa. La vista previa se construye exclusivamente con el borrador local: nombre, descripción, imagen, presentación y precio capturados. Móvil apila las secciones y tablet permite que los campos se distribuyan cuando existe espacio.

Listado, edición atómica, variantes, sabores, mitad y mitad, orilla rellena, imágenes, combos, Tricombo y recetas de venta conservan sus acciones reales. El cambio de composición no reconstruye el intento de configuración ni modifica el payload.

### Cocina

Escritorio muestra las tres columnas operativas. Tablet y móvil muestran una etapa a la vez mediante pestañas; el gesto nativo existente continúa cambiando de etapa. Las tarjetas conservan temporizador, servicio, cliente, productos, modificadores, notas, transición e impresión. Las acciones alcanzan el tamaño táctil mínimo y los nombres pueden envolver con texto ampliado.

### Reparto

Escritorio organiza Listos, En camino y Programados en columnas. Tablet y móvil usan pestañas por etapa y tarjetas de ancho completo. Llamada, WhatsApp, mapa, cobro, transición y documento continúan conectados a su implementación existente. Cambiar de ancho conserva la etapa seleccionada y no crea otra carga o suscripción.

### Clientes

Búsqueda, creación, directorio, selección, edición, direcciones, historial, puntos y reglas se adaptan mediante filas flexibles. En anchos reducidos los campos y acciones se apilan sin imponer mínimos incompatibles. Se conserva el contexto de búsqueda, página y cliente seleccionado, además del guard de trabajo.

### Usuarios

Alta, directorio, edición y permisos por rol usan formularios y tarjetas flexibles. La rejilla de permisos crece en escritorio y se convierte en una columna legible cuando falta espacio. Roles, estados, protecciones sobre la cuenta actual y payloads de permisos no cambiaron.

### Reportes

Las familias de reporte usan una banda desplazable interna, sin ensanchar la página. Periodo y acciones se apilan en móvil; las métricas y colecciones devueltas por cada endpoint se distribuyen mediante tarjetas flexibles. La consulta inicial continúa siendo una sola petición del reporte activo y cambiar el ancho no vuelve a consultar.

## Diferencias deliberadas frente a los mockups

- No se agregaron datos de ejemplo, fotografías de muestra, cifras estáticas ni estados simulados.
- Producción no muestra contadores globales, costos o categorías que no estén completos en las respuestas actuales.
- Recetas de producción no incorpora categoría, descripción, duplicación o costo por unidad porque no forman parte del contrato actual.
- Cocina no incorpora búsqueda, filtros por sucursal/tiempo ni selector de vista porque no existen como funcionalidad activa.
- Reparto no incorpora asignación de repartidor, ETA, promedios, métricas de demora ni edición de programación porque no existe soporte actual para esas acciones.
- Clientes no incorpora filtros de frecuencia, chat, exportación ni una nueva configuración promocional. Se mantienen historial y puntos reales existentes.
- Usuarios no incorpora exportación, último acceso ni campos de alta que el backend actual no acepta.
- Reportes no inventa gráficas, tendencias o porcentajes. Presenta los valores y colecciones reales; el envío diario por WhatsApp sí permanece porque ya tiene endpoint y URL real.
- La barra lateral y la navegación inferior siguen perteneciendo al shell de P2 · 1; no se copiaron las etiquetas o accesos distintos de los mockups.

## Pruebas

Se añadieron pruebas para:

- clasificar exactamente 599, 600, 1023 y 1024 px;
- cubrir anchos representativos de 320, 768 y 1440 px;
- cambiar Reparto de pestañas móviles a columnas de escritorio sin perder la etapa seleccionada;
- conservar las transiciones y documentos reales de Cocina y Reparto;
- confirmar que la infraestructura operativa mantiene una carga, una suscripción y su cleanup;
- volver a validar formularios, borradores, recetas, Producto atómico, navegación, realtime, polling y tema.

Resultados finales:

- `npm test`: **110 aprobadas**.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**, exportación actualizada en `Pizzeria/dist`.
- `git diff --check`: **aprobado**.

## Límites y comprobación manual pendiente

Las pruebas DOM no acreditan teclado virtual, safe areas físicas, gestos reales, orientación, lector de pantalla, impresora ni comportamiento de WebView/Capacitor. Deben revisarse manualmente 320, 375, 599, 600, 768, 1023, 1024, 1280 y 1440 px en claro/oscuro y con texto pequeño/mediano/grande.

El recorrido manual debe incluir errores largos, nombres y direcciones extensos, formularios con teclado, regreso con trabajo pendiente, Producto con resultado incierto, Cocina/Reparto durante suspensión y reanudación, y Reportes con colecciones grandes. Las gráficas propuestas por los mockups podrán evaluarse en otra prioridad únicamente si existe un contrato de datos real.

P2 · 4 termina aquí. No se inició P2 · 5.

## Revisión dirigida posterior

La revisión se limitó a regresiones demostrables de P2 · 4 en los límites 599/600 y 1023/1024, reflow, objetivos táctiles, texto ampliado, scroll, formularios, composición operativa, conservación de estado, efectos de red, navegación y tema. Los mockups se usaron únicamente para contrastar jerarquía y adaptación; no se incorporó ninguna función que no exista en el sistema.

### Hallazgo y corrección

- **MEDIO — objetivos táctiles menores de 44 px:** varios controles heredados por las pantallas migradas seguían midiendo entre 40 y 43 px o dependían únicamente del tamaño del texto. Afectaban chips y acciones destructivas de Producción, categorías y acciones secundarias de Productos/Reportes, pestañas de Cocina, impresión compacta y enlaces «Quitar», «Eliminar» y «Editar producto». Se fijó `minHeight: 44` en las primitivas propietarias y se asignó una superficie táctil de 44 px a las acciones textuales. No cambiaron etiquetas, handlers, confirmaciones, payloads ni geometría de contenido.

Se añadió una regresión que construye los estilos temáticos reales y exige que esas nueve primitivas alcancen `theme.control.minTouch`. La prueba evita validar texto fuente y cubre los estilos consumidos por los componentes.

### Comprobaciones sin defecto

- Los cuatro límites clasifican de forma continua: 599 móvil, 600–1023 tablet y 1024 escritorio. El shell y las pantallas operativas cambian de composición en el mismo límite de 1024 px.
- Cocina y Reparto conservan la pestaña seleccionada al pasar entre pestañas y columnas. El ancho no forma parte de los efectos de carga, realtime o polling, y no se usan claves dependientes del tamaño que desmonten la pantalla.
- Producción, Recetas, Productos, Clientes, Usuarios y Reportes conservan sus estados y borradores porque el reflow solo cambia estilos o visibilidad de secciones ya montadas. Reportes no vuelve a consultar por un cambio de ancho.
- No se encontraron mínimos rígidos que ensanchen la página en las pantallas migradas. Las bandas horizontales de pestañas permanecen como scroll interno deliberado.
- Los campos mantienen alturas mínimas y padding vertical; `ThemedText` conserva la corrección de P2 · 3 para tamaños locales y `lineHeight`. No se encontró un modal nuevo, un bloqueo de scroll o una interferencia nueva con teclado móvil atribuible a P2 · 4.
- Sidebar y navegación inferior conservan permisos, `requestModuleNavigation`, guard de salida y sus destinos. Claro/oscuro siguen resolviéndose desde los mismos tokens.

### Pruebas y comandos

- Prueba dirigida de contrato responsive y objetivos táctiles: **3 aprobadas**.
- `npm test`: **111 aprobadas**.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**, con exportación actualizada en `Pizzeria/dist`.
- `git diff --check`: **aprobado**.

La verificación física de teclado, safe areas, orientación, WebView y gestos continúa en el recorrido manual ya indicado. La revisión dirigida de P2 · 4 termina aquí. No se inició P2 · 5.

## Actualización visual Material 3 Expressive

Se actualizó la presentación transversal sin cambiar contratos ni flujos. El tema compartido ahora define objetivos táctiles de 48 px, radios de 14/20/24/28 px para controles, tarjetas, secciones y modales, escala tipográfica con alturas de línea explícitas y elevaciones suaves para superficies y elementos flotantes. Las paletas clara y oscura conservan los colores de la pizzería y el mismo contrato semántico.

Botones, campos, avisos, confirmaciones, pestañas, chips, métricas y tarjetas usan superficies llenas o tonales según su jerarquía. El shell incorpora una barra lateral más clara en escritorio, encabezado compacto en móvil, navegación inferior flotante con selección tonal y una hoja «Todos los módulos» con grupos, iconos, estado actual y cierre de sesión diferenciado.

La misma presentación se aplicó a Dashboard, Punto de venta, Pedidos, Caja, Inventario, Compras, Producción, Productos, Cocina, Reparto, Clientes, Usuarios, Reportes y Ajustes. POS conserva su configurador modal y el acceso persistente al carrito móvil; recetas y formularios administrativos adoptan los mismos campos, tarjetas, chips y acciones. No se añadieron datos, acciones, endpoints ni permisos.

Se corrigió además una mezcla de radios abreviados y radios inferiores en el selector de zona del POS que React advertía al abrir y cerrar la lista. Se añadieron comprobaciones para mantener 48 px, la escala de formas expresiva y alturas de línea mayores al tamaño de título en ambos temas.

Validación posterior:

- suite completa secuencial: **115 aprobadas**;
- `npm run typecheck`: **aprobado**;
- `npm run build:web`: **aprobado**, con exportación actualizada en `Pizzeria/dist`;
- `git diff --check`: **aprobado**.

La adaptación toma la jerarquía, formas, superficies tonales y navegación de Material 3 Expressive como referencia. No incorpora Material You dinámico ni una dependencia de componentes externa. No se inició P2 · 5.

## Movimiento y navegación expresiva

La navegación adopta una combinación de dock flotante y selección tipo píldora. El destino activo responde con elevación y escala elástica breve; el contenido entra con una transición conjunta de opacidad, desplazamiento de 12 px y escala sutil durante 190 ms. La transición envuelve la composición existente y no usa una clave de ruta, por lo que cambiar de tamaño o animar no desmonta el módulo ni reinicia su estado.

Botones compartidos, tema y destinos principales responden al toque mediante compresión rápida. En web, botones, pestañas, enlaces y tarjetas navegables comparten hover, pulsación y transición tonal. El cambio claro/oscuro suaviza los fondos raíz. Los modales conservan sus transiciones nativas `fade` o `slide` y no esperan una animación para ejecutar acciones.

El movimiento usa únicamente `Animated` de React Native y propiedades CSS acelerables; no añade dependencias, solicitudes, temporizadores de negocio ni animaciones continuas. `prefers-reduced-motion` y `AccessibilityInfo.isReduceMotionEnabled()` eliminan desplazamiento, escala y transiciones cuando el usuario así lo solicita.

Se añadieron regresiones que confirman conservación del montaje y estado durante el cambio de ruta, reglas globales de interacción y soporte de movimiento reducido. Resultado posterior: **117 pruebas aprobadas**, typecheck, build web y `git diff --check` aprobados. No se inició P2 · 5.

## Paleta alineada con la marca

Se ajustó la autoridad compartida de color a la identidad del logotipo: carbón y blanco dominan fondos y texto, el rojo identifica acciones y selección, y los tonos de fuego se reservan para foco y advertencias. La paleta clara usa texto `#171717` y primario `#E3262E`; la oscura usa fondo `#090909`, texto `#F7F7F5` y primario `#FF5A4F`. Formularios, tarjetas, modales, navegación, estados y shell reciben el cambio desde los mismos tokens, sin recoloreado imperativo.

También se alinearon los valores iniciales configurables de marca, la luz de notificación Android y la vista previa monocromática del ticket. Los colores de negocio ya guardados siguen siendo editables y no se sobrescriben. Una regresión fija la jerarquía carbón/blanco/rojo y la comprobación de contraste continúa exigiendo al menos 4.5:1 en ambas paletas.

Validación posterior: **118 pruebas aprobadas**, `npm run typecheck` aprobado y `npm run build:web` aprobado con la exportación actualizada. No se modificaron flujos, datos, endpoints ni permisos. No se inició P2 · 5.
