# P1 · 4 — Correcciones concretas del POS

## Alcance

Revisión y correcciones del POS desde la perspectiva de una persona principiante. Sin rediseño general, cambios de reglas comerciales, modificaciones de API, migraciones, nuevas dependencias, push ni despliegue. No se inicia P1 · 5. Los cambios anteriores de P0 permanecen.

## Hallazgos y soluciones

| Nivel | Reproducción del problema anterior | Solución |
| --- | --- | --- |
| ALTO | Elegir Cortesía y después Cobrar al entregar enviaba ambas opciones; el servidor rechazaba el pedido. | Elecciones excluyentes. Cobrar al entregar limpia el método anterior; se explica que no se registra un pago ahora. Cortesía explica que no se cobrará. La validación de pago mixto no se aplica a cobro al entregar. |
| ALTO | Elegir colonia A y después B conservaba A como dirección. | Las direcciones generadas por el selector se actualizan. Se conserva una dirección manual o guardada y se exige revisarla al cambiar la zona. Su procedencia se mantiene en memoria; tras reiniciar se trata conservadoramente como dirección existente. |
| ALTO | Durante una operación incierta aún era posible cambiar la colonia. | Selector y opciones deshabilitados, además de protección en los manejadores. No se elimina ni cambia la clave de operación. |
| ALTO | Quitar o cambiar cliente/dirección borraba el destinatario y los datos manuales. | Quitar el cliente conserva la entrega. Elegir otro permite conservar los datos de entrega y vincular el cliente, o sustituirlos con consentimiento. Cambiar dirección requiere consentimiento cuando sobrescribe datos distintos. |
| ALTO | En móvil, abrir el carrito desmontaba los configuradores y borraba sabores, extras y notas sin agregar. | El catálogo del mismo POS se oculta sin desmontar sus configuradores durante esa alternancia. No mantiene otros módulos montados ni genera consultas adicionales. |
| MEDIO | Elegir un sabor por encima del máximo reemplazaba silenciosamente al primero. | Se conserva la selección y se indica quitar un sabor para cambiarlo. Se mantiene la sustitución directa en opciones de un solo sabor. Aplica a productos y combos. |
| MEDIO | Confirmar quedaba bloqueado sin identificar los campos faltantes y algunos bloqueos no cambiaban su apariencia. | Lista de pendientes, ayuda junto a campos vacíos y acción para enfocar el primer dato faltante o abrir las zonas. El botón y su apariencia usan la misma condición. Las zonas no disponibles impiden enviar domicilio. |
| MEDIO | El carrito móvil pedía Actualizar, pero el control estaba en el catálogo oculto. | Acción Actualizar precios y disponibilidad dentro del carrito cuando falta verificación. Reutiliza la recarga explícita existente. |
| MEDIO | Continuar desde Pedidos del día no navegaba a ese módulo. | Acción renombrada Continuar con otra venta; se explica dónde encontrar el pedido. No vuelve a crear ni cobrar la venta registrada. |
| MEDIO | Domicilio estaba implícito en una casilla desmarcada de Pasa a recoger. | Opciones explícitas Recoger en local / Entrega a domicilio, con estado accesible. Cambiar entre ellas conserva contacto y dirección. |
| MEDIO | Los extras del combo mostraban nombre sin su recargo. | Precio por opción calculado con selectionPrice y multiplicación monetaria existentes; recargo de sabores por componente. Respeta overrides, unidades y Tricombo. |

No se demostró un hallazgo CRÍTICO ni duplicación de cobros. No se añadieron cambios cosméticos clasificados como BAJO. La combinación inválida de cortesía y cobro contra entrega ya era rechazada por el backend.

## Archivos y compatibilidad

- `src/features/pos/PosScreen.tsx`: cambios de interacción, validación y mensajes.
- `src/components/FloatingTextInput.tsx`: únicamente una referencia opcional al input nativo para enfocar desde el POS. Los consumidores anteriores permanecen compatibles.
- `src/testSupport/loadUi.mjs`: ancho configurable, ocultación y referencias en widgets simulados.
- `src/posUsability.test.mjs`: nueve pruebas de regresión de los casos anteriores.

No se modificó el formato persistente de P0 · 2. Los indicadores de dirección generada y revisión son de memoria; los campos recuperables siguen la lista explícita existente. No se persisten selecciones de producto todavía no agregadas. La conservación de configuradores cubre alternar catálogo/carrito dentro del mismo POS; no promete conservar configuraciones sin agregar al cambiar de módulo o cerrar la aplicación.

Se mantienen consultas paginadas de clientes, revalidación, búsqueda remota, precios compartidos, autoridad del servidor, aislamiento, escritura duradera de la clave antes del POST, resolución de respuestas perdidas y envío explícito a cocina al recuperar. No se añadieron reintentos automáticos.

## Verificación automatizada

- Frontend: `npm test`, **49 aprobadas**: las 40 existentes y nueve nuevas.
- `npm run typecheck`: **aprobado**, ejecutado separado del build. Un intento simultáneo detectó archivos de `dist` eliminados durante la exportación (TS6053); se repitió con la exportación terminada.
- `npm run build:web`: **aprobado**, exportación en `Pizzeria/dist`.
- Backend: `php artisan test --compact --filter='PriceConsistencyTest|WorkRecoveryTest|OrderFlowTest|ComboOrderTest'`, **35 aprobadas, 290 aserciones**.
- `git diff --check`: **aprobado** en ambos repositorios.
- No se cambió PHP; no corresponde ejecutar Pint sobre archivos nuevos de esta tarea. No se añadió ESLint.

Los tests nuevos renderizan los componentes reales con transporte, almacenamiento y widgets nativos simulados, usando ancho 390 para móvil. Cubren pagos excluyentes, direcciones generadas y manuales, bloqueo de operación incierta, confirmación al sustituir entrega, conservación de selecciones y notas, máximo de sabores, foco, modos de entrega, reintento de lectura desde carrito, precios por unidad/override y continuar después de fallo de cocina sin otro POST.

Las suites existentes vuelven a comprobar paginación, debounce, respuestas fuera de orden, aislamiento y conservación de borradores, conflicto de precios y recuperación de respuesta perdida sin un segundo pedido/pago. No se ejecutó toda la suite backend en esta tarea; las pruebas de concurrencia MariaDB de P0 siguen requiriendo un entorno dedicado.

## Comprobaciones manuales pendientes

1. En móvil real, configurar sabores, extras y notas; abrir carrito y volver. Revisar conservación, desplazamiento, teclado y controles táctiles.
2. Seleccionar cliente registrado y conservar un destinatario distinto. Sustituir luego su dirección, primero conservando los datos y después aceptando el cambio.
3. Elegir dos colonias sucesivas con dirección generada; repetir con dirección manual y comprobar revisión obligatoria.
4. Probar Recoger en local / Entrega a domicilio y completar los campos desde la acción de ayuda; verificar foco y visibilidad con teclado abierto.
5. Simular una respuesta perdida y comprobar que la colonia no cambia. Recuperar el pedido y confirmar que no se registra otro cobro.
6. Interrumpir una lectura de catálogo desde móvil y reintentar desde el carrito. Cambiar un precio en otra sesión y repetir revisión de P0.
7. Verificar extras de combo por unidad, orilla con override y Tricombo con dos sabores incluidos.

No se validó disposición visual en navegador móvil real, lector de pantalla ni dispositivo Android/iOS. No se verificó el servidor Debian. Las simulaciones DOM no sustituyen esas comprobaciones.
