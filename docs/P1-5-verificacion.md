# P1 · 5 — Formularios, validación y feedback compartidos

## Alcance y proceso

Se auditaron los componentes compartidos y los módulos POS, Productos, Clientes, Usuarios, recetas de venta, Compras, Inventario, Caja, Producción, Cocina, Reparto y Ajustes/Administración. Antes de implementar se presentó el inventario y la estrategia de migración. Se priorizaron los formularios principales y los patrones repetidos de riesgo razonable; no se sustituyó toda la interfaz.

No se inició P1 · 6. No se cambiaron reglas de pricing, contratos API, navegación, formato de borradores ni tema oscuro. No hay nuevas dependencias, migraciones, cambios PHP, push o despliegue. Los cambios anteriores de P0 y P1 · 4 permanecen.

## Inventario de patrones

| Patrón | Implementaciones encontradas | Diferencias | Problema UX / duplicación | Componente reutilizado o propuesto | Riesgo / prioridad |
| --- | --- | --- | --- | --- | --- |
| Botones de escritura | `Pressable` y estilos `s`, `styles`, `ops` en módulos | Etiqueta fija, spinner sin texto o textos distintos; bloqueo por estado React | Pulsaciones antes del siguiente render; botones que no explican progreso | `ActionButton` y `useActionGate` | Medio / A |
| Botones secundarios/destructivos | Variantes locales de borde, enlaces y botones | Acción peligrosa a veces dice solamente Eliminar o Aceptar | No distingue claramente la consecuencia | Variantes primary, secondary y destructive del mismo botón; texto específico | Bajo / B |
| Campos | `FloatingTextInput`, etiquetas externas, placeholders con asterisco y formatos locales | Label persistente existente, pero sin interfaz común de error | Falta asociación campo/mensaje y convención de obligatorio | Extender `FloatingTextInput`, sin crear otro Field | Medio / A |
| Validación | Condiciones de `disabled`, mensajes generales, validaciones dentro de handlers | Nombre/teléfono deshabilitan el envío; errores remotos se muestran completos | El usuario no sabe qué corregir; no se enfoca el campo | `useFormErrors` y helpers puros | Medio / A |
| Feedback | `Feedback` de operaciones, `Text` amarillo y cajas locales | Éxito, advertencia y fallo comparten presentación | Solo el color o un texto ambiguo distingue resultados | `Notice`; `Feedback` existente delega su presentación | Bajo / B |
| Estados remotos | `RemoteListStatus`, `EmptyState`, `LoadingState`, indicadores locales | P0 ya distingue carga, vacío, búsqueda vacía y fallo en directorios | Duplicar otro estado remoto rompería coherencia y reintentos parciales | Reutilizar los tres existentes | Bajo / B |
| Confirmaciones | `ConfirmationDialog` con opciones y llamadas sin opciones | Títulos y botones genéricos pese a admitir textos específicos | No explica qué ocurrirá ni qué significa aceptar | Reutilizar diálogo y pasar opciones concretas | Bajo / A |
| Números | `Number`, `Number(...) || 0`, `inputNumber`, conversión de coma | Vacío puede ser cero; conversión parcial/ambigua según pantalla | Capturas similares producen resultados diferentes | `decimalInput` en campos migrados | Medio / A |
| Dinero | Helpers exactos de P0 · 3 y parseo local de texto | El cálculo es compartido, pero la entrada no | Coma decimal o texto inválido llega de manera inconsistente | `moneyInput` adapta texto y delega a `money` | Medio / A |
| Fechas/horas | Texto AAAA-MM-DD, `new Date`, comparaciones de cadenas | Fechas inexistentes pueden superar comprobaciones superficiales | Se envía una fecha inválida o interpretada de otra forma | `validDate`, `validLocalDateTime` en campos modificados | Medio / A |
| Dirty state | `useWorkGuard`, `useWorkField`, flags locales | P0 ya distingue memoria y recuperación | Otro sistema duplicaría autoridades y perdería trabajo | Conservar los hooks de P0 | Alto / A |
| Encabezados/secciones | `Section` de operaciones y títulos locales | Diferencias principalmente visuales | No justifica otro SectionHeader | Reutilizar `Section`; resto para P2 | Bajo / C |

Se distinguieron las pantallas activas de los componentes antiguos de `App.tsx` (`Pos`, `CustomersView`, `UsersView`, entre otros). No se migró código antiguo solo por parecer duplicado. Se conserva ese saneamiento como deuda separada; no hubo refactor completo de App.

## Base compartida final

- `src/components/ActionButton.tsx`: tres variantes, disabled, loading con etiqueta, motivo opcional de bloqueo, foco visible y exclusión inmediata mediante referencia. Espera la acción; no la reintenta. Los errores inesperados muestran un mensaje seguro.
- `src/components/Notice.tsx`: success, error, warning e info mediante tipo explícito. Texto de estado, símbolo, estructura y color; error se anuncia como alerta y los otros mensajes mediante región polite. `useFeedback` permite separar el tipo del texto.
- `src/components/FloatingTextInput.tsx`: mantiene la etiqueta y la API anterior; incorpora required, error, referencia de foco, identificación del mensaje, `aria-invalid`, `aria-required`, `aria-describedby` y ayuda accesible. Los campos migrados dicen «obligatorio».
- `src/forms/useFormErrors.ts`: errores por clave y foco al primer input registrado. Permite mapear claves del backend a nombres locales. No almacena el formulario ni gestiona dirty state.
- `src/forms/useActionGate.ts`: exclusión por formulario entre acciones distintas, incluyendo el tiempo de confirmación antes de escribir. No es idempotencia y no resuelve operaciones inciertas.
- `src/forms/validation.ts`: captura decimal, adaptación monetaria, fechas, campos obligatorios, correo opcional y errores seguros.
- `src/forms/catalogValidation.ts`: comprobación de nombre, precio y número de sabores compartida por alta y edición de variantes. Las restricciones definitivas siguen en backend.

Reutilizados: `RemoteListStatus`, `Pagination`, `ConfirmationDialog`, `Section`, `EmptyState`, `LoadingState`, `Feedback`, `useWorkGuard`, `useWorkField` y los helpers monetarios de P0. No se crearon FormError, RetryState, EmptyState ni SectionHeader duplicados.

## Migración realizada

| Módulo / flujo | Aplicación |
| --- | --- |
| POS | Acciones principales comparten botón y exclusión durante confirmación. Feedback explícito, campos de contacto/pago/programación con errores asociados, decimal en pago mixto y fecha/hora explícita. Errores técnicos de catálogo, cocina y documentos no se copian a la pantalla. Se conservan acciones explícitas de recuperación y cocina. |
| Productos | Alta y guardado de configuración conservan sus operaciones existentes; añaden validación local, errores por campo y precios desde la adaptación monetaria. La operación atómica conserva revisión, cuerpo congelado, clave y distinción de resultado incierto. Desactivación con consecuencia y acciones específicas. |
| Recetas de venta | Nombre y cantidades con validación compartida; coma decimal; feedback y botón de guardado. Revalidación de insumos y memoria de P0 intactas. No se rediseñó la creación de recetas. |
| Clientes | Alta/edición y direcciones con validación por campo, foco, mensajes seguros, botón compartido y exclusión. Desactivación y eliminación de dirección tienen confirmación específica. Se conservan los guards existentes. Ajuste de puntos usa decimal estricto; reglas de puntos solo recibieron mensajes seguros, gate y texto de confirmación. |
| Compras | Campos de cantidad, costo y fechas; errores próximos al campo; botones para agregar/guardar y confirmación explícita. Alta rápida de proveedor con validación. Se conserva el aviso de resultado incierto, sin reintento automático. La compra sigue en memoria de P0. |
| Inventario y Producción | Migración de feedback por el adaptador `Feedback` y errores remotos seguros. No se cambiaron cálculos, movimientos, validaciones operativas ni formularios completos. |
| Directorios que usan RemoteListStatus | Misma lógica de carga/vacío/búsqueda/error; presentación de error y botón de reintento compartidos. No se cambiaron paginación, debounce ni alcance de recarga. |

No todos los controles son botones de acción: chips de selección, cantidades, pestañas, navegación de tamaños y selectores mantienen sus patrones y estado. No se reemplazaron por ActionButton solo para uniformar nombres.

## Validación, errores y feedback

1. La validación local se ejecuta al intentar guardar; los campos inválidos permanecen editables después del fallo. Los inputs de los formularios migrados bloquean edición durante sus guardados para evitar perder lo escrito mientras se espera la respuesta.
2. Los errores 422 se asocian usando claves conocidas. Se muestra un texto propio por campo o grupo de renglones; no se copia el mensaje arbitrario recibido. Si no existe una traducción específica, la operación mantiene una explicación general para revisar opciones.
3. Sesión vencida, falta de permiso, conflicto, validación y resultado no confirmado tienen textos distintos. Una respuesta perdida no se declara «sin guardar» ni activa un reintento automático.
4. El diagnóstico conserva contexto de acción y estado HTTP, sin imprimir token, payload, contactos, SQL ni stack. `ApiError` y su payload no cambiaron, por lo que siguen disponibles para las reglas de recuperación existentes.
5. Guardado confirmado y fallo posterior de recarga se comunican separadamente en los flujos modificados. No se convierte ese fallo de lectura en una invitación a repetir la escritura.
6. El botón bloquea pulsaciones repetidas propias; el gate coordina acciones distintas del mismo formulario, incluso antes de terminar un diálogo. No reemplaza transacciones, permisos, idempotencia o seguimiento de P0.

## Entrada numérica y fechas

- Se acepta punto o coma decimal (`1.25` y `1,25`) y espacios exteriores. No se admiten separadores de miles, exponentes, hexadecimal ni texto parcial como `12abc`. Vacío no se convierte en cero.
- Los campos monetarios explican la convención. `moneyInput` normaliza el separador y llama a `money` con texto decimal; no introduce otro cálculo de precios, redondeo o rango. Importes negativos se rechazan antes de redondear.
- Cantidades usan `decimalInput` y mantienen sus comprobaciones de positividad o integridad donde correspondía. No se cambió precisión de inventario ni costos derivados.
- Cumpleaños, fecha de compra y caducidad modificados comprueban fecha real AAAA-MM-DD. La programación del POS conserva la hora local y exige AAAA-MM-DD HH:mm, hora/minuto válidos y futuro antes de enviar.
- `inputNumber` de los formularios operativos no migrados permanece para evitar cambiar implícitamente el significado de sus campos opcionales. No se afirma uniformidad numérica total en todo el sistema.

## Accesibilidad y responsive

Se incorporaron nombres de campo persistentes, obligatoriedad en texto, asociación de errores, foco al primer input inválido, roles y estados busy/disabled, regiones de feedback y borde de foco. Los botones permiten texto flexible y no fijan un ancho de escritorio. Los colores usan la base existente; no se sustituyó `SystemTheme`.

Se conserva el comportamiento de teclado, Escape y retorno de foco del diálogo de P0. No se afirma cumplimiento WCAG completo. Los labels flotantes antiguos y formularios densos siguen requiriendo revisión visual con texto ampliado y teclado móvil.

## Módulos y subformularios pendientes

| Área auditada | Motivo para no migrar completamente ahora |
| --- | --- |
| Usuarios y roles | Mantienen paginación y errores por sección; sus formularios de permisos requieren pruebas específicas antes de sustituir validación/guardados. Reciben únicamente los cambios compartidos de campos/directorio que utilizan. |
| Caja | Se detectó `Number` y mensajes locales en apertura, movimientos y cierre. Se documenta como migración pendiente por impacto financiero; no se cambia implícitamente el significado de cero, vacío o cierre. |
| Cocina y Reparto | Estados y confirmaciones dependen de la operación del pedido, cobro y autorización. Se mantienen sus transiciones y bloqueos; requieren una migración con pruebas por transición. |
| Ajustes/Administración | Incluye impresoras, tonos, permisos y ajustes monetarios. No se sustituye un formulario heterogéneo por un único patrón de guardado. |
| Editor de paquetes/promociones dentro de Productos | Se mantuvo independiente del alta/configuración de producto. Su composición de componentes y opciones requiere pruebas propias; no se cambió su pricing ni su formulario en esta tarea. |
| Reglas de puntos | No se migraron sus campos numéricos y validación completos; solo feedback seguro, gate y confirmación específica. |
| Inventario y Producción | Feedback migrado, pero formularios de unidades, recetas de producción, lotes y movimientos siguen pendientes. Evita convertir P1 · 5 en un rediseño de esos módulos. |

En estas áreas pueden permanecer mensajes y botones locales. La base permite migrarlas incrementalmente; este informe no declara que toda la interfaz utilice ya los componentes nuevos.

## Pruebas y resultados

- `npm test`: **63 aprobadas**, incluyendo las 49 previas y 14 nuevas.
- `npm run typecheck`: **aprobado**, separado de la exportación web.
- `npm run build:web`: **aprobado**, exportación actualizada en `Pizzeria/dist`.
- API, `php artisan test --compact`: **154 aprobadas, 2 omitidas, 1368 aserciones**.
- Omitidas: concurrencia real de pedidos y configuración con MariaDB/InnoDB dedicado y pcntl. No se ejecutan sobre datos reales.
- `git diff --check`: **aprobado** en ambos repositorios.
- No se modificó PHP; no hay archivos PHP nuevos que formatear con Pint. No se añadió ESLint.

`src/forms.test.mjs` cubre bloqueo síncrono de pulsaciones, disabled, progreso, asociación campo/error, obligatorio, foco, tipos semánticos de feedback, vacío frente a búsqueda, reintento de una sección sin recargar otra, errores técnicos, coma decimal/rangos, calendario/hora, dirty state, confirmación cancelada sin escritura, Compras, alta/edición de Productos, Recetas y exclusión de acciones del POS durante la confirmación.

El adaptador puede usar FloatingTextInput real. Para Productos se extrae mediante AST la función real de App y se sustituyen únicamente el contenedor nativo, estilos y hermanos ajenos al formulario; no se copian sus handlers. No sustituye una prueba de integración de toda la aplicación en un dispositivo.

Las suites previas conservan pruebas de paginación, búsqueda remota, debounce, respuestas fuera de orden, fallos parciales, borradores, aislamiento, operaciones inciertas, dinero, configuración atómica, idempotencia, pagos excluyentes, direcciones, configuradores móviles y combos. La aserción de bloqueo tras conflicto de precio espera ahora que termine el estado de progreso; no se eliminó la comprobación ni la protección.

## Revisión final y límites

- No hay un segundo sistema de dinero, dirty state o confirmación.
- Se conserva la autoridad del backend y no se añadieron reintentos de escrituras.
- La migración evita que errores técnicos sean el mensaje principal en los flujos migrados; los módulos pendientes no se declaran corregidos.
- La exclusión de UI no prueba idempotencia de compras, altas o recetas ante cierre forzado. Se mantienen avisos y garantías previas; no se añadió persistencia para esas operaciones.
- Las pruebas son automatizadas con widgets/IO simulados. No se verificaron físicamente Android/iOS, lector de pantalla, teclado móvil, impresora ni servidor Debian de 32 bits.
- Para P2 quedan diferencias cosméticas, estilos locales todavía usados, densidad, tamaños, contraste visual en dispositivos y etiquetas antiguas con texto ampliado. No se borraron estilos preexistentes solo por similitud.

## Prueba manual recomendada

1. Registrar cliente vacío; comprobar explicación, foco y anuncio del error. Corregir nombre/teléfono, probar correo y cumpleaños inválidos y guardar una vez con red lenta.
2. Simular 422 y 500 con contenido técnico. Debe aparecer un mensaje propio, y el campo correspondiente debe conservar su valor.
3. Cancelar desactivación de cliente, eliminación de dirección y desactivación de producto: no debe enviarse una escritura. Aceptar y comprobar mensaje específico.
4. Probar compra con `1,5`, costo `0,005`, fecha inexistente y caducidad anterior; corregir y comprobar total. Cancelar la confirmación conserva renglones.
5. Editar producto con dos variantes. Comprobar errores en la variante correcta, un solo PUT de configuración, conflicto de revisión y recuperación de respuesta perdida.
6. Capturar receta con cantidad decimal; navegar y volver. Comprobar memoria y guard al cerrar sesión, sin guardado automático.
7. En POS alternar domicilio/recogida, carrito móvil y catálogo; comprobar P1 · 4. En pago mixto usar coma decimal; probar fecha inválida, precio cambiado y respuesta perdida.
8. En directorios bloquear una sección y pulsar Reintentar: comprobar que solo se recarga esa sección y que búsqueda/página se conservan.
9. Repetir con modo oscuro, texto ampliado, teclado y lector de pantalla. Comprobar Tab, Escape y retorno de foco de los diálogos.

P1 · 5 termina con esta base y migración incremental. P1 · 6 no fue iniciado.
