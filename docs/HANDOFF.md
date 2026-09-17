# Retomar Narciso

Actualizado: 17 de septiembre de 2026. La versión funcional actual se identifica en `git log` de `main`.
La base anterior a la mejora de selección es `ba90f6f`; no confundirla con la versión vigente.
Este documento es una fotografía del estado; comprobar Git y el servicio al retomar.

## Objetivo y criterio del propietario

Asistente personal inspirado en Instinct, ejecutado en el Mac del propietario,
con iMessage como interfaz principal. Debe entender el contexto, tomar iniciativa
y ofrecer acciones concretas que realmente pueda realizar. Uso individual.

La experiencia deseada:

- Acusar una tarea naturalmente: «Dale, reviso y te cuento».
- Decidir cuándo trabajar en segundo plano sin bloquear la conversación.
- Responder una pregunta independiente sin añadir estado innecesario de la tarea.
- Volver con lo importante, bien verificado, y una siguiente acción útil.
- Usar reacciones ocasionales y recibos de lectura. No mostrar IDs internos,
  narración de herramientas, razonamiento ni explicaciones del proceso.
- Conservar detalles de diagnóstico de forma privada.
- Usar la suscripción personal de Claude Code; no introducir facturación API
  alternativa sin una decisión explícita.

Instinct ganó la comparación inicial. La siguiente revisión aborda los detalles
incidentales y las acciones vagas con selección explícita, propuestas del runtime
y una auditoría de utilidad. Las evaluaciones prueban escenarios concretos, no una
paridad universal con Instinct. Consultar el informe de selección al retomar.

## Qué funciona y qué falta

| Área | Estado al cierre |
| --- | --- |
| iMessage/Photon | Conectado; recepción persistida, Read, respuestas y reacciones |
| Fotos y notas de voz | Funcionando; transcripción local inglés/español |
| Claude | CLI oficial, suscripción; Opus 5: `high` chat/publicación, `xhigh` investigación |
| Google personal | Gmail, Calendar, Tasks, Drive, Docs y Sheets; operaciones disponibles según herramientas |
| Escrituras Google | Flujo de aprobación del runtime; los investigadores solo leen |
| Investigaciones | Persistencia, checkpoints, aclaraciones, cancelación y resultados posteriores |
| Publicación de resultados | Fuentes → comprobaciones → composición con evidencia → auditoría |
| Navegador local | Pendiente; no prometer entrar a portales, pagar o cerrar sesiones |
| Seguimientos programados | Pendientes; una tarea de fondo no es un scheduler |
| Otras identidades/cuentas | Pendientes; no asumir que están conectadas |

Roadmap completo: [TODO.md](../TODO.md). No todos los servicios de Google tienen
todas sus operaciones implementadas.

## Cambio más reciente y motivo

Antes, el mismo investigador redactaba directamente lo que se enviaba. Las
evaluaciones encontraron totales inconsistentes, urgencia inventada, relaciones
causales no probadas, generalizaciones de alertas y resúmenes contractuales que
omitían excepciones. Mejorar solo el tono o el esfuerzo del modelo no resolvió eso.

Ahora cada hallazgo lleva fuentes de su propia tarea y citas comprobables.
Los totales monetarios usan aritmética decimal exacta con referencias de origen.
Una composición aislada revisa, selecciona y redacta usando las fuentes capturadas;
un auditor independiente verifica hechos, omisiones y utilidad. Son dos llamadas
en el recorrido normal. Ambas etapas carecen de herramientas y acceso directo al
buzón. El compositor sí ve el paquete de fuentes, a diferencia del antiguo editor.
La acción propuesta sale de `src/next-actions.mjs` y el host la redacta junto al
hallazgo correspondiente. No ejecuta nada ni amplía las capacidades disponibles.

SQLite conserva fuentes, investigación y resultados de cada etapa. Cambiar las
fuentes, instrucciones o configuración invalida la caché correspondiente. Los
fallos editoriales permiten hasta dos correcciones; agotarlas bloquea el envío
sin volver a investigar todo Google. Una aclaración o cancelación evita entregar
un resultado obsoleto. Los avisos intermedios pasan por el mismo circuito.

Límites actuales: 18 segmentos de investigación, 36 llamadas de modelo por tarea,
3 minutos por llamada, paquete de evidencia de 200.000 caracteres y resumen de
hasta 160 palabras por resumen (45 por tema) o 250 cuando se solicitó detalle,
antes de la nota de alcance añadida por el host.

Diseño y límites detallados: [evidence-publication.md](evidence-publication.md).
Para un propietario en un Mac mantuvimos SQLite y procesos aislados. Una cola
externa o servicios separados quedan para necesidades demostradas de capacidad
o aislamiento. Un modelo verificador independiente es una opción a evaluar.

## Validación de la versión anterior y sus límites

Los siguientes datos corresponden a `ba90f6f`. Para la revisión de selección,
consultar [selection-evaluation.md](selection-evaluation.md).

- **46 pruebas automatizadas** pasaron en el código final.
- **8 casos sintéticos con el modelo** pasaron: alerta válida y regresiones de
  legitimidad de cargos, mayorías, contratos incompletos, causalidad, urgencia,
  coincidencia de IP y excepciones contractuales. Se ejecutaron antes de los
  últimos ajustes editoriales; la política del revisor se mantuvo.
- Evaluación privada de correo real, solo lectura: 85 mensajes enumerados y
  resúmenes inspeccionados; 25 cuerpos consultados, 10 recortados. Una búsqueda
  auxiliar inspeccionó 51 resúmenes. No sumar ambas búsquedas como correos únicos.
- El último pase de publicación con la política final produjo 195 palabras,
  pasó revisión y auditoría y conservó el total monetario comprobado.
- La evaluación aislada no envió iMessages ni modificó Google.
- Tras desplegar se comprobó `launchd` activo, conexión de Photon y coincidencia
  del código desplegado. **No hubo una nueva prueba completa por iMessage del
  circuito final después de este despliegue.**

Las primeras evaluaciones revelaron bucles por cobertura auxiliar incompleta y
por devolver fallos editoriales a investigación. Se corrigieron con llamadas
pendientes explícitas, conservación de hallazgos y separación de los errores.
No reutilizar las primeras salidas como ejemplo de calidad objetivo.

Los controles de citas y aritmética son deterministas. Interpretar correctamente
una fuente sigue dependiendo del modelo. Los revisores de la misma familia pueden
compartir errores. Un correo no prueba por sí solo la realidad del hecho reportado.

## Por dónde continuar

Prueba posterior de caja negra por WhatsApp:
[instinct-behavior-evaluation.md](instinct-behavior-evaluation.md). Incluye
correcciones de contexto, una pregunta intercalada durante investigación y
entrega autónoma. Es comportamiento observado, no evidencia de su arquitectura
interna. La repetición aislada con Claude real en Narciso encontró y corrigió
consejos sobre asuntos resueltos, informes no verificados ante falta de web y
peticiones explícitas de segundo plano resueltas en el chat. Pasaron 18 controles
de comportamiento y las 52 pruebas existentes; no se cambió modelo/esfuerzo.
La comparación web no es equivalente porque Narciso aún carece de navegador.
El nuevo recorrido no se ha probado por iMessage; la evaluación usa entrega local.

1. **Mantener la evaluación de selección y naturalidad.** Reutilizar evidencia ya capturada para
   comparar redacciones sin volver a leer Gmail en cada iteración. Menos IPs,
   horas exactas, versiones, nombres y salvedades incidentales. Conservar lo que
   cambia una decisión y ofrecer una acción disponible. No ocultar incertidumbre
   material ni fabricar capacidades para sonar más proactivo.
2. **Medir calidad con ejemplos estables.** Comparar exactitud, prioridades,
   claridad, acción propuesta y latencia. No considerar el límite de palabras una
   prueba de buena escritura. No cambiar las respuestas esperadas para hacer pasar
   una regresión.
3. **Validar una tarea completa por iMessage.** Revisión amplia y una pregunta
   independiente mientras trabaja; comprobar Read, reacción, acuse breve,
   resultado natural y ausencia de datos internos. No enviar mensajes de prueba
   a terceros. Coordinar la prueba con el propietario.
4. **Cerrar límites pendientes.** La reformulación de resultados en chat normal
   aún no pasa por esta auditoría; falta retención de fuentes/artefactos SQLite.
   El borrado periódico de trazas no elimina esos registros.
5. **Después, navegador local.** Sesiones persistentes, perfiles por identidad y
   relevo humano para MFA/CAPTCHA. Es la capacidad necesaria para las gestiones
   que motivaron el proyecto; todavía no está implementada.

## Mapa de código

| Archivo | Responsabilidad |
| --- | --- |
| `src/photon.mjs` | Gateway de iMessage y ciclo del servicio |
| `src/claude.mjs` | CLI oficial, modelo/esfuerzo y aislamiento de etapas |
| `src/jobs.mjs`, `src/job-runner.mjs` | Estado, presupuesto, investigación, recuperación y publicación |
| `src/evidence.mjs` | Fuentes por tarea, citas, esquema de hallazgos y totales |
| `src/publication.mjs` | Composición con evidencia, auditor, validaciones y caché |
| `src/next-actions.mjs` | Catálogo de propuestas, validación de destinos y texto de la acción |
| `src/mail-review.mjs` | Paginación, alcance y lecturas pendientes |
| `src/mcp.mjs` | Herramientas del modelo y captura de fuentes |
| `SOUL.md`, `CONTEXT.example.md` | Personalidad pública y plantilla de contexto privado |
| `test/publication.test.mjs` | Pruebas del circuito de evidencia/publicación |
| `test/fixtures/evidence-review.json` | Casos sintéticos publicables |
| `scripts/evaluate-publication.mjs` | Regresiones de evidencia; consume cupo de Claude |
| `scripts/evaluate-experience.mjs` | Selección, acciones, detalle solicitado y comparación con la versión anterior |

## Operación en el Mac y datos privados

- Checkout de trabajo: `~/Documents/Projects/narciso`.
- Aplicación desplegada: `~/.local/share/narciso/app`.
- Versión previa conservada por el instalador: `~/.local/share/narciso/app.previous`.
- Estado: `~/.local/share/narciso/data/narciso.sqlite`.
- Servicio: `ai.narciso.gateway`, LaunchAgent del usuario actual.
- Logs: `~/.local/share/narciso/data/service.log` y `service-error.log`.
- Evaluación privada: `~/.local/share/narciso/data/evaluations/evidence-publication-2026-09-17/`.
  Contiene `latest-publication.json`, `validation.json`, `evaluation.json` y una
  copia de la base de evaluación. No es el estado del servicio en producción.
- Repetición privada de selección: `~/.local/share/narciso/data/evaluations/selection-2026-09-17/`,
  con `selection-replay-verified.json` y copia de su base.

La configuración de este Mac no debe asumirse en otro host. Los cambios del
checkout no actualizan automáticamente el servicio: el instalador copia el código.
Hermes fue deshabilitado para ceder la conexión; no arrancarlo junto con Narciso.
No iniciar `npm start` mientras el LaunchAgent consume la misma conexión de Photon.

Nunca publicar `.env`, `CONTEXT.md`, credenciales, bases, trazas, conversaciones,
imágenes o corpus real de evaluación. El repositorio es público. Consultar los
valores de cuenta/teléfono en la configuración privada cuando sean necesarios;
este documento deliberadamente no los reproduce.

## Secuencia práctica para la próxima sesión

Desde el checkout, comprobar el estado sin modificarlo:

```sh
git status --short
git log -5 --oneline
scutil --get LocalHostName
npm run doctor
launchctl print gui/$(id -u)/ai.narciso.gateway
```

Leer este documento, la arquitectura y el código del área elegida. Revisar los
resultados privados localmente si hacen falta; no pegarlos en issues públicos.
Después de un cambio funcional, ejecutar `npm test`. La evaluación con modelo es
opcional y consume la suscripción:

```sh
node --env-file-if-exists=.env scripts/evaluate-publication.mjs
```

Antes de desplegar, comprobar que no hay tareas `waiting_ack/queued/running` ni
entregas activas. No interrumpir trabajo del propietario. Para desplegar:

```sh
python3 scripts/install-service.py
launchctl print gui/$(id -u)/ai.narciso.gateway
```

Verificar una nueva conexión `narciso_connected` y que el runtime corresponde al
código esperado. Revisar el diff por datos privados antes de commit/push. Los
cambios exclusivos de documentación no necesitan reiniciar el servicio.

## Prompt para retomar

> Lee `docs/HANDOFF.md` y `docs/evidence-publication.md`. Comprueba el estado actual
> de Git y del servicio y lee `docs/selection-evaluation.md`. Continúa desde los
> resultados medidos, no desde la arquitectura anterior de tres llamadas. Evalúa
> selección y naturalidad de Narciso,
> conservando la verificación de evidencia. Empieza evaluando las salidas privadas
> ya guardadas, sin repetir toda la investigación ni enviar mensajes de prueba.
> No asumas que el navegador o los seguimientos programados están implementados.
