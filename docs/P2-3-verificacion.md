# P2 · 3 — Sistema visual, tokens semánticos, tema y tipografía

## Alcance

Se sustituyó el recoloreado del DOM por un tema declarativo compartido entre web y React Native. La migración abarca el arranque, el shell, los componentes comunes y los 14 módulos activos. Se conservaron navegación, permisos, breakpoints, flujos, contratos API, payloads, precios, borradores, realtime, polling e impresión. No se modificó el backend, no se añadieron dependencias y no se inició P2 · 4.

## Inventario anterior

La revisión inicial encontró 528 apariciones de color y 159 literales distintos, 25 tamaños tipográficos en 96 usos, 382 usos de espaciado y 137 radios. Los valores más repetidos eran blancos, terracotas, texto oscuro y superficies cálidas. Solo nueve estilos declaraban `lineHeight`.

`SystemTheme` era una autoridad exclusiva de web: leía `pizzeria-color-theme` y `pizzeria-font-size`, recorría todos los descendientes de `#root`, consultaba `getComputedStyle`, clasificaba colores y tamaños, escribía atributos `data-pizzeria-*` y repetía el proceso mediante `MutationObserver`. React Native no recibía una paleta oscura equivalente.

## Arquitectura resultante

`ThemeProvider` envuelve desde el primer render al boundary, `WorkProvider`, shell y diálogo global. `useTheme()` expone modo, tema resuelto, tamaño de texto, alternancia y actualización tipográfica. `useThemedStyles()` memoiza factories por la identidad del tema.

En web se conservan las claves anteriores. Una preferencia clara u oscura guardada tiene prioridad; si no existe, se usa `prefers-color-scheme`. Solo existe un listener global del sistema. En nativo el proceso comienza claro y la alternancia permanece en memoria. Cambiar tema no ejecuta llamadas de red.

El proveedor actualiza `color-scheme`, fondos raíz y una única hoja CSS para placeholder y autofill. Esos valores proceden de los mismos tokens. Se eliminaron `SystemTheme`, el recorrido del DOM, `MutationObserver`, `getComputedStyle` y los atributos generados de tema/tipografía.

## Tokens y paletas

El contrato en `src/theme/tokens.ts` contiene:

- fondos, superficies, texto, bordes, acción primaria, foco, overlay y sombra;
- grupos `danger`, `warning`, `success` e `info`, con superficie y texto;
- tipografía `display`, `title`, `heading`, `subheading`, `body`, `bodyStrong`, `label`, `caption` y `numeric`;
- espaciado de 4, 8, 12, 16, 20 y 24;
- radios de control, tarjeta, sección, modal y píldora;
- objetivo táctil de 44 y opacidad deshabilitada de 0.48;
- sombras de superficie y elemento flotante.

Las paletas clara y oscura tienen exactamente la misma forma. La clara usa fondo `#F7F4EF`, superficies cálidas y primario `#B83A26`; la oscura usa fondo `#111315`, superficies `#202327`/`#292D32` y primario `#F06A50`. Los estados operativos siguen perteneciendo a cada feature y solo se representan mediante intenciones semánticas.

## Tipografía

La escala base es 30/24/20/16/14/13/11 px, con alturas de línea declaradas. Se mantiene la fuente del sistema y la preferencia pequeño/mediano/grande aplica factores 0.8/1/1.2 tanto a tokens como a tamaños locales intencionales. `ThemedText` aporta texto y cuerpo por defecto; tamaños, pesos y jerarquías específicas siguen en los estilos propietarios.

No se introdujeron alturas fijas nuevas para texto. Los truncados existentes solo permanecen en los lugares donde ya cumplían una función concreta.

## Migración por superficie

- Los componentes comunes —botones, campos, avisos, estados remotos, paginación y diálogo— usan variantes semánticas, foco visible, estado deshabilitado y superficies de error/éxito sin alterar gates, roles, anuncios ni retorno de foco.
- El shell, login, restauración, sidebar, barra compacta, hoja «Más», usuario y logout usan el mismo tema en web y nativo. Grupos, permisos, prioridad y `requestModuleNavigation` no cambiaron.
- Dashboard, Inventario, Compras, Producción, POS, Pedidos, Caja, Productos, Recetas, Combos, Cocina, Reparto, Clientes, Usuarios, Reportes y Ajustes obtienen color y tipografía del tema.
- Inventario conserva sus textos Disponible/Baja/Crítica/Agotado. Cocina conserva tonos y etiquetas por etapa. Las reglas de negocio no se trasladaron al tema.
- El fallback del boundary muestra un mensaje seguro y temático; el error técnico solo se registra en diagnóstico.

`appStyles` dejó de ser estático y ahora es una factory temática memoizada. Continúa como hoja transitoria compartida por shell, pedidos, documentos, Dashboard, Productos y Reportes porque esos estilos todavía son realmente compartidos tras P2 · 2. No se usó P2 · 3 para alterar geometría o extraer componentes otra vez.

## Contraste

La utilidad propia de luminancia sRGB verifica al menos 4.5:1 en los pares de texto previstos. Las pruebas cubren texto principal, texto atenuado, acción primaria y estados peligro, advertencia, éxito e información en ambas paletas. Los valores mínimos comprobados permanecen por encima del umbral; la evaluación de pantallas completas y contenido gráfico queda como revisión manual.

## Excepciones deliberadas

Después de la revisión final quedan 80 apariciones de color literal en TypeScript/TSX: 66 pertenecen a los dos objetos de paleta y 14 a las excepciones enumeradas. El conteo previo de 78 era anterior a incorporar los dos colores semánticos para texto secundario sobre superficie inversa. Fuera de las paletas solo permanecen:

- papel y texto negro de documentos impresos;
- vista previa clara del ticket en Ajustes;
- colores primario/secundario configurables del negocio y sus ejemplos;
- luz de notificación del sistema Android.

Estas excepciones no actúan como una segunda paleta de interfaz. Assets e imágenes tampoco son recoloreados.

## Pruebas y resultados

Se añadieron ocho pruebas dirigidas para paridad de contratos, escala tipográfica, contraste, restauración/alternancia, listener global, conservación del montaje y estado, ausencia de red, componentes compartidos en ambos modos, altura de línea y ausencia del recoloreado DOM. La suite real vuelve a cubrir navegación, `work.leave()`, POS, precios, Producto atómico, recetas, compras, inventario, operaciones inciertas, realtime, polling, documentos y foco de diálogos.

Resultados finales:

- `npm test`: **107 aprobadas**.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**, con exportación actualizada en `Pizzeria/dist`.
- `git diff --check`: **aprobado**.
- Búsqueda de `MutationObserver`, `getComputedStyle` y atributos activos `data-pizzeria-*`: **sin implementación de tema restante**.

No se ejecutó ni modificó el backend.

## Límites y comprobación manual

Las pruebas automatizadas no acreditan contraste de cada combinación final, reflow físico, autofill de todos los navegadores, lector de pantalla ni equivalencia visual en dispositivos Android/iOS. También permanecen fuera de alcance los breakpoints internos y la reorganización responsive de P2 · 4.

Comprobación manual recomendada:

1. Recorrer los 14 módulos en claro y oscuro, incluyendo carga, vacío, error, selección, disabled, éxito y advertencia.
2. Cambiar tema antes y después de iniciar sesión; recargar web con y sin preferencia guardada y cambiar el tema del sistema sin preferencia explícita.
3. Cambiar texto a pequeño, mediano y grande; revisar labels, totales, navegación, modales, Cocina, permisos y formularios largos.
4. Probar teclado y foco en sidebar, barra compacta, «Más», diálogos, campos y acciones destructivas.
5. Revisar placeholder y autofill en Chrome, Safari y Firefox.
6. Confirmar ticket y documento impreso sobre papel claro, además de la vista previa en ambos temas.
7. Recorrer Producto, POS, Compra y Producción con cambios pendientes para confirmar que tema/tamaño no afectan guards ni borradores.
8. Verificar Cocina y Reparto con realtime/polling, suspensión y reanudación en dispositivo.

P2 · 3 termina aquí. No se inició P2 · 4.

## Revisión dirigida posterior

La revisión se limitó a P2 · 3. Se inspeccionaron la autoridad de tema, preferencias web/nativas, tokens, contraste, tipografía, factories, componentes comunes, shell, los 14 módulos, estados operativos, excepciones de color y regresiones P0/P1/P2. No se cambiaron navegación, breakpoints, APIs, reglas comerciales ni backend.

### Hallazgos y severidad

- **ALTO — texto inverso incorrecto en modo oscuro:** el sidebar usaba `surfaceRaised` (`#292D32`) sobre `surfaceInverse` (`#171A1E`), y etiquetas pequeñas del sidebar claro reutilizaban `textSubtle` con una relación aproximada de 3.04:1. El problema afectaba marca, usuario, grupos, iconos y superficies inversas. Se añadió `textInverseMuted`, se corrigió `textInverse` oscuro y se asignaron los pares inversos explícitos. El texto inverso principal queda en 15.78:1 claro y 15.72:1 oscuro; el secundario queda en 9.46:1 y 9.51:1.
- **ALTO — foreground incorrecto en acciones primarias:** botones y selecciones activas de shell, POS, operaciones, Caja, Clientes, Usuarios, Ajustes y hoja «Más» usaban un color de superficie como texto. Se sustituyó por `primaryText`; Cocina aplica el mismo foreground a sus tonos sólidos. El foco de `ActionButton` primario ahora usa un borde que contrasta con el propio fondo, en vez del foco azul prácticamente indistinguible sobre terracota.
- **MEDIO — altura de línea heredada podía recortar texto grande:** `ThemedText` aplicaba siempre el `lineHeight` de cuerpo. Un icono o título con `fontSize` local y sin `lineHeight` conservaba 20 px de caja incluso con 40–60 px de glifo. Ahora se omite únicamente esa altura heredada cuando el estilo local define tamaño y no define una altura intencional. El escalado 0.8/1/1.2 continúa aplicándose una sola vez.
- **MEDIO — tema nativo incompleto en estado del sistema:** `StatusBar` usaba `auto`, por lo que una alternancia explícita dentro de la aplicación podía dejar iconos correspondientes al tema del sistema. Ahora se monta desde la raíz y sigue el modo resuelto también durante restauración y login. No se añadió persistencia nativa.
- **MEDIO — campo nativo aislado sin colores de tema:** el motivo avanzado de cancelación en Pedidos era el único `TextInput` React Native directo. Se añadieron texto y placeholder semánticos. Los demás campos activos usan `FloatingTextInput`.
- **BAJO — trabajo CSS innecesario:** la hoja web de placeholder/autofill se regeneraba también al cambiar únicamente el tamaño tipográfico. La dependencia quedó acotada a modo y paleta.
- **BAJO — avisos semánticos no usaban su token de texto:** `Notice` mostraba texto general sobre superficies de estado. Aunque varios pares ya superaban el umbral, ahora éxito, error, advertencia e información usan sus respectivos `*Text`.

No se encontraron una segunda autoridad de tema, solicitudes de red producidas por la alternancia, desmontaje de pantallas, reinicio de formularios/operaciones, listeners duplicados, imports circulares ni dependencias activas del recoloreado anterior.

### Preferencias y plataformas

En web se probaron preferencia clara/oscura explícita, ausencia de preferencia, cambio de `prefers-color-scheme`, precedencia de la selección explícita y limpieza del único listener. La preferencia sigue siendo global a la pestaña/navegador y no se reinicia por login, logout, usuario o sucursal; el tamaño proveniente de `/preferences` continúa actualizándose al restaurar otra sesión.

En React Native, las guardas de plataforma impiden acceder a `window`, `document` o `localStorage`. El contrato permanece: inicio claro, alternancia en memoria del proceso y `StatusBar` derivado del modo resuelto. Esta revisión no afirma ejecución física en Android/iOS.

### Contraste automatizado

La utilidad se validó con negro/blanco = 21:1, color idéntico = 1:1 y `#777777`/blanco ≈ 4.478:1, además de comprobar linealización sRGB, luminancia relativa y ratio. Los pares usados quedan así:

| Par | Claro | Oscuro |
| --- | ---: | ---: |
| Texto/fondo | 14.13:1 | 16.77:1 |
| Texto secundario/superficie | 6.33:1 | 9.09:1 |
| Placeholder/superficie elevada | 5.19:1 | 6.40:1 |
| Texto/superficie inversa | 15.78:1 | 15.72:1 |
| Texto inverso secundario/superficie inversa | 9.46:1 | 9.51:1 |
| Texto/acción primaria | 5.72:1 | 6.03:1 |
| Peligro | 7.69:1 | 7.69:1 |
| Advertencia | 7.18:1 | 7.99:1 |
| Éxito | 5.81:1 | 7.71:1 |
| Información | 6.32:1 | 7.79:1 |

También se comprueba el foreground usado sobre los tonos sólidos de Cocina. Los controles deshabilitados mantienen texto y forma, pero su opacidad reducida es un estado no interactivo y no se usa para transmitir una decisión disponible.

### Excepciones revisadas

Las 14 apariciones fuera de las paletas se clasificaron individualmente: una pertenece al CSS de impresión sobre papel claro, siete a la vista previa fija del ticket, cuatro a los dos valores configurables de marca y sus placeholders, y dos a la luz de notificación Android. No quedó ningún literal activo de interfaz sin justificar; `transparent` sigue siendo una propiedad estructural de borde, no una paleta.

### Pruebas añadidas y regresiones

Las tres pruebas nuevas posteriores al cierre inicial comprueban:

1. cambio del tema del sistema únicamente sin preferencia explícita, limpieza del listener y contrato del `StatusBar`;
2. alternancia sin petición de red, sin remontaje y conservando estado local;
3. ausencia de `lineHeight` corporal sobre un glifo grande con tamaño local.

Se ampliaron además contraste y componentes compartidos para usar casos conocidos, pares realmente renderizados, texto semántico y foco primario. Las regresiones existentes confirmaron borradores, guards, operaciones inciertas, configuración atómica, `revision`, `operation_key`, dinero, POS móvil, validación/foco, recetas, compras, inventario, navegación, composición, realtime, polling e impresión.

### Límites y riesgos restantes

- Contraste de composiciones completas, sombras, fotografías, logos configurables y estados gráficos requiere inspección visual.
- Autofill real depende del navegador; la prueba verifica el CSS generado y el contrato, no todos los motores.
- No se verificaron dispositivos Android/iOS, barras del sistema físicas, lector de pantalla ni impresora real.
- Texto al 200/400 %, teclado virtual y reflow completo permanecen en la matriz manual; corregir layout responsive corresponde a P2 · 4 y no se inició.
- Los bordes base son deliberadamente sutiles; foco, selección, texto y estados aportan señales adicionales. La evaluación integral de componentes no equivale a una certificación WCAG.

### Comandos y resultados

- Pruebas dirigidas de tema, formularios, navegación y extracción: **37 aprobadas**.
- `npm test`: **107 aprobadas**.
- `npm run typecheck`: **aprobado**.
- `npm run build:web`: **aprobado**, exportación actualizada en `Pizzeria/dist`.
- `git diff --check`: **aprobado**.
- Búsqueda de `MutationObserver`, `getComputedStyle`, `data-pizzeria-*` y `SystemTheme`: sin implementación activa.

La revisión dirigida de P2 · 3 termina aquí. No se inició P2 · 4.
