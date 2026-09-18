# Fallo de publicación de correo — 18 de septiembre de 2026

El propietario pidió novedades de correo. La investigación leyó datos, pero el
servicio devolvió un error genérico sobre cobertura después de agotar los intentos
de publicación. El error se produjo antes de enviar un resumen: no fue una caída
de Gmail ni dependía del navegador pendiente de activar.

## Causas comprobadas

- El validador rechazaba cualquier hora en resúmenes, incluidos horarios de
  servicios y plazos útiles. Debe distinguirlos de horas incidentales de avisos.
- La validación de zona horaria reconocía UTC/EST/EDT pero no ET y aplicaba la
  zona de una hora a otras horas distintas del mismo hallazgo.
- La comparación numérica no reconocía formatos equivalentes de reloj, por
  ejemplo `4:00 PM`, `16:00` y `4:00 p.m.`.
- Cada reparación recibía solo el último error, sin el borrador rechazado ni
  los errores anteriores; era posible volver a introducir problemas ya corregidos.
- La publicación trataba el plan interno de investigación como si fuera la
  petición literal del propietario. Sus exigencias de contadores y horas
  contradecían las reglas de presentación concisa.
- El runner no guardaba el motivo final exacto y usaba el mismo mensaje para
  una lectura incompleta y un fallo del resumen.

## Cambios

Validación de relojes normalizados y zona asociada a la hora correspondiente;
horarios útiles permitidos en hallazgos de plazos; conservación del borrador y
feedback acumulado; petición original suministrada por separado al compositor y
auditor; diagnóstico privado en `task_failures`; mensaje de error que identifica
un fallo de preparación sin exponer datos internos ni culpar a la cobertura.
Las comprobaciones de citas, importes, hechos inventados y auditoría siguen activas.

## Validación y operación

61 pruebas automatizadas, incluidas regresiones de formatos equivalentes, cambios
de hora/día indebidos, zona horaria, reparaciones acumulativas, separación de
petición y plan, y diagnóstico privado. Repetición con Claude usando una copia
privada de la evidencia: `data/evaluations/mail-failure-2026-09-18/`.
Los primeros intentos fallidos se conservaron para diagnosticar, no se publicaron.
No se volvió a consultar Gmail ni se enviaron iMessages de prueba.

La corrección operativa se desplegó desde la aplicación anterior y cambió solo
`src/publication.mjs` y `src/job-runner.mjs`. La integración de Chrome del checkout
permanece pendiente de activación manual y se despliega por separado.

Verificado: servicio activo y Photon conectado a las 14:03:36 UTC; hashes de los
dos módulos coinciden con el checkout. La repetición final con Claude pasó y
guardó `recovered-summary.txt` en el directorio privado indicado. No hubo nueva
prueba por iMessage; la tarea originalmente bloqueada quedó intacta.
