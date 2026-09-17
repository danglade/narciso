# Selección y próximas acciones — evaluación

17 de septiembre de 2026. Esta revisión sucede a `ba90f6f`.

## Problema y cambio

El circuito anterior podía verificar hechos y aun así enviar detalles incidentales,
salvedades repetidas y propuestas vagas. Ahora cada hallazgo tiene una decisión
explícita de inclusión u omisión, privada. Se agrupan los temas relacionados y se
conserva solo el detalle que ayuda a decidir; el detalle solicitado se mantiene.

La siguiente acción se selecciona de un catálogo de capacidades y se redacta en
el runtime junto al hallazgo relevante. Puede preguntar por un acceso desconocido,
buscar confirmación de pago en el correo o proponer una respuesta a una persona.
No agrega una pregunta a recibos rutinarios ni promete pagar, navegar o programar
seguimientos. La propuesta no ejecuta acciones.

La publicación normal pasa de tres llamadas a dos: composición con evidencia y
auditoría independiente de hechos, selección y utilidad. Publicación usa esfuerzo
`high`; la investigación conserva `xhigh`. El compositor ve las fuentes capturadas,
pero no tiene herramientas. La auditoría también ve las omisiones y las fuentes.

## Resultados observados

52 pruebas automatizadas pasaron. Los ocho casos fijos de interpretación de
fuentes pasaron con el compositor real, además de una publicación completa.
Las siguientes son ejecuciones por caso, no un promedio ni una garantía de latencia:

| Caso sintético | Acción final | Palabras | Llamadas | Tiempo |
| --- | --- | ---: | ---: | ---: |
| Correo mixto: accesos, pagos, fallo técnico y promoción | Confirmar accesos; omite promoción y datos incidentales | 56 | 2 | 13,8 s |
| Factura con saldo pendiente | Buscar comprobante de pago en correo | 68 | 2 | 9,9 s |
| Solicitud de un reclutador | Preparar respuesta para Ana | 29 | 2 | 6,9 s |
| Recibo rutinario en inglés | Ninguna pregunta adicional | 20 | 2 | 4,5 s |
| Petición explícita de IP, hora y dispositivo | Conserva esos datos, sin gestión adicional | 41 | 2 | 8,0 s |

En el mismo paquete sintético de correo mixto, la versión anterior necesitó
3 llamadas, 24,0 segundos y 131 palabras; la nueva, 2 llamadas, 13,8 segundos y
56 palabras. Cambiaron tanto la arquitectura como el esfuerzo de publicación;
no atribuir todo el ahorro a eliminar una llamada. No se midió una equivalencia
entre estas cifras y el cupo facturado de la suscripción.

También se reutilizó la evidencia privada de la revisión real anterior, sin
reconsultar Google ni enviar iMessages. La salida anterior tenía 195 palabras;
la nueva, 77, necesitó 2 llamadas y 23,2 segundos. Conservó los accesos que había
que reconocer, el total monetario comprobado y el crecimiento del almacenamiento,
sin enumerar pagadores, códigos de acceso ni salvedades sobre la aritmética.
Esa comparación no implica que todos los demás detalles sean siempre irrelevantes.

Los casos, comprobaciones y salidas sintéticas están en
[evaluations/2026-09-17-selection.json](evaluations/2026-09-17-selection.json).
El corpus y la salida reales permanecen fuera del repositorio.

## Fallos encontrados durante el trabajo

- El filtro de acciones bloqueaba «no puedo pagar» como si fuera una promesa;
  ahora permite expresar una limitación cuando el propietario pide esa acción.
- Se propuso responder a un número de factura. Las propuestas de respuesta
  requieren un hallazgo de solicitud directa; una factura sin resolver conduce
  a revisar correo, con una propuesta específica de buscar comprobante.
- Los campos de incertidumbre inducían salvedades genéricas. Se aclaró la
  distinción entre incertidumbre material y explicaciones teóricas, se añadieron
  controles de redacción y se acortaron los párrafos de resumen.
- Una edición del fixture añadió términos incorrectos a la lista que debía
  aparecer en una petición de detalle. Se corrigió el fixture y se repitió ese
  caso: IP, hora, zona y dispositivo siguieron presentes.

## Reproducir

```sh
npm test
node --env-file-if-exists=.env scripts/evaluate-publication.mjs
node --env-file-if-exists=.env scripts/evaluate-experience.mjs --baseline --output /tmp/narciso-experience.json
```

Los dos últimos comandos consumen cupo de Claude. No leen Google ni envían
mensajes. `NARCISO_EVAL_CASE=invoice` permite repetir un solo caso.

## Límites que permanecen

La auditoría semántica sigue siendo probabilística. La misma familia de modelos
puede compartir errores; controles léxicos no verifican todas las implicaciones.
La selección puede variar entre ejecuciones. Los tiempos cambian con carga,
fuentes y correcciones; una publicación puede requerir más de dos llamadas.
Las pruebas no demuestran paridad universal con Instinct ni ausencia absoluta
de errores. Navegador, seguimientos y auditoría del chat ordinario siguen siendo
trabajos separados. La verificación tras despliegue comprueba código/servicio;
una prueba nueva de extremo a extremo por iMessage queda como validación de campo.
