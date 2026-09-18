# Retomar Narciso

Actualizado: 18 de septiembre de 2026. Hay cambios locales y un despliegue selectivo;
`git log` de `main` por sí solo no identifica todos los archivos del runtime.
La base anterior a la mejora de selección es `ba90f6f`; no confundirla con la versión vigente.
Este documento es una fotografía del estado; comprobar Git y el servicio al retomar.

## Continuidad en Git y worktrees — 18 septiembre

El propietario pidió reunir todo el trabajo local en `main`, incluidos los
documentos y experimentos no publicados anteriormente. El punto de entrada para
sesiones nuevas es `AGENTS.md`; ver `docs/worktrees.md`. El contexto personal y las
credenciales permanecen privados en el runtime compartido del Mini. El índice
`~/.local/share/narciso/development/README.md` permite encontrarlos y conserva
artefactos relevantes que antes estaban solo en `.local/` o `/tmp`.

El commit reúne más código que el despliegue actual: no interpretar `main` como
una copia exacta del servicio. Esta preparación de Git no despliega ni reinicia
el runtime. La revisión completa encontró y corrigió en el notificador experimental
un evento que quedaba `sending` al cancelar durante una burbuja; ahora guarda la
cancelación del evento y sus partes pendientes incluso si el transporte rechaza
la llamada después de cancelar. Esa corrección queda en el checkout para su
próximo despliegue; no sustituye el pipeline de correo instalado.
Validación previa al commit: `npm test`, 111 pruebas aprobadas; `git diff --check`
sin errores. Los archivos nuevos y modificados se revisaron para excluir secretos
y datos personales antes de prepararlos para el repositorio público.

## Capturas del navegador por iMessage — 18 septiembre, 15:38 EDT

Desplegado selectivamente a las 15:38:40 EDT. `screenshot_for_owner` toma la
ventana de Chrome observada, encola la imagen real antes del texto y, por defecto,
impide más acciones de navegador en ese turno hasta la respuesta del propietario.
El contexto guarda la ventana; al continuar debe inspeccionar y recuperar la misma
pestaña. «Para» cancela capturas pendientes. Los envíos inciertos no se repiten.
Ver `docs/browser-screenshots.md`. Pasaron 52 pruebas del candidato y una captura
real de Chrome de una página local ficticia; falta confirmación de recepción en el
iPhone del propietario. No se enviaron mensajes de prueba por Photon.
Backup: `~/.local/share/narciso/app.before-screenshots-20260918-153840`.
Metadatos: `~/.local/share/narciso/screenshots-deployment.json`.

## Cancelación inmediata — 18 septiembre

Ver `docs/task-cancellation.md`. `para`, `no hagas más nada`, `no pera` y `stop`
entran por una ruta directa del gateway, fuera de la cola de Claude. Se revoca la
autoridad persistida, se aborta el grupo de procesos del turno y se cancelan trabajo
en cola, jobs, avisos y aprobaciones de esa conversación. Los mensajes siguientes
pueden iniciar trabajo nuevo. Lo ya enviado al navegador no se deshace.
El despliegue selectivo se registra en
`~/.local/share/narciso/cancellation-deployment.json`; comprobar ese archivo antes
de afirmar que está activo. La versión experimental de correo del checkout no
debe sustituir la del servicio.

Desplegado selectivamente a las 15:30:50 EDT; Photon reconectó a las 15:30:53
con PID 64845. 47 pruebas del candidato pasaron, incluidos el gateway sintético,
cancelación durante envío pendiente y terminación real del grupo de procesos.
Backup: `~/.local/share/narciso/app.before-cancellation-20260918-153050`.
Falta únicamente la comprobación de experiencia por el propietario en iMessage;
no se enviaron mensajes de prueba a terceros ni se tocaron cuentas reales.

## Corrección de falso bloqueo — 18 septiembre, 14:26 EDT

El reporte de iMessage de las 14:17 no era un bloqueo del Mini. La sesión pasó
`checkDesktop`; CUA devolvió `bring_to_front_exact_window_unverified` con
`process_activated=true`, `focused=true`, `frontmost_ordinary=false`. Una ventana
auxiliar de Chrome (omnibox) alteraba el orden de WindowServer. El adaptador
rechazaba la observación y el modelo inventaba que el Mac estaba bloqueado.

Corregido: excluir ventanas auxiliares sin título; aceptar únicamente ese
resultado parcial con proceso activado y foco confirmado, seguido de una
comprobación independiente del PID, window_id y superficie AX exacta. No se
relajan errores de permisos, foco ausente ni objetivos distintos. Cada intento de
observación invalida el snapshot anterior. Solo MAC_LOCKED autoriza describir
un bloqueo del Mac; los errores de foco no prueban su causa.

39 pruebas del candidato pasaron (incluye nuevos casos de foco parcial,
ventanas auxiliares y rechazo de superficie errónea). Regresión real en
`~/.local/share/narciso/evaluations/cua-LJNc1I`: la primera vuelta alcanzó el
límite de cinco minutos mientras completaba el formulario; se amplió el límite
CUA a ocho minutos, manteniendo el máximo de 80 acciones. La prueba retomó la
misma pestaña, verificó los campos y completó un único envío con valores exactos,
incluido el canvas. `summary.json` registra `passed=true`, `resumed=true`.
El script admite `NARCISO_CUA_RESUME` para repetir esa recuperación con datos
sintéticos, sin Photon. No se debe presentar la primera vuelta como aprobada.

Despliegue selectivo: 14:26:29 EDT. Backup anterior:
`~/.local/share/narciso/app.before-browser-pilot-20260918-142629`.
Photon volvió a conectar con backend CUA. Falta repetir la petición real del
propietario por iMessage; no se reprodujeron sus datos ni se envió su formulario
como parte de las pruebas.

## Trabajo actual: CUA como ejecutor por defecto

Adaptador implementado en `src/cua.mjs` y `src/cua-mcp.mjs`; Claude foreground
lo anuncia con `NARCISO_BROWSER_BACKEND=cua` y oculta las herramientas de acción
de la extensión. Trabajos de lectura conservan la extensión. 95 pruebas locales
pasan; el candidato selectivo final pasó 37 pruebas. La prueba real de CUA pasó.
**Desplegado a las 14:14:56 EDT**, después de terminar el mensaje activo.
Servicio PID 61127: Photon conectado, backend cua e interactive=1; extensión
conectada con interactionVersion=3 para investigación en segundo plano.
Backup: `~/.local/share/narciso/app.before-browser-pilot-20260918-141456`.

La primera regresión se interrumpió porque el Mini estaba bloqueado. Una segunda
confirmó que `loginwindow` era el proceso activo aunque Chrome seguía devolviendo
capturas. Se agregó detección de sesión bloqueada mediante IORegistry y el
propietario desbloqueó el Mini. También se ajustó teclado foreground por defecto
para evitar escrituras de omnibox que solo actualizan AX. No se cambiaron los
ajustes de bloqueo, permisos del sistema ni créditos de Claude.

Prueba aprobada: `scripts/evaluate-cua-browser.mjs`, resultado/log privado en
`/tmp/narciso-cua-live4.log`, datos en
`~/.local/share/narciso/evaluations/cua-pqfvzb`. El test usa un formulario local,
datos ficticios, radios/checkbox/select y un canvas sin semántica accesible.
El servidor recibió una sola vez los valores exactos, incluido custom=on, después
de una primera vuelta sin envío. La segunda vuelta retomó la misma ventana.
No hay tráfico Photon ni cuentas reales en esa evaluación.

Para futuros cambios, preparar con `/tmp/stage-narciso-browser-pilot.py`, validar
el candidato, comprobar idle y usar `/tmp/deploy-narciso-browser-pilot.py`.
NO usar el instalador general ni desplegar los cambios experimentales de correo
del checkout. Falta confirmación del propietario por iMessage; el recorrido
Claude Code → MCP → CUA → Chrome y la reanudación entre turnos sí se verificaron.
Límites: Chrome se usa en primer plano; sesión del Mini desbloqueada; no se
validaron aún diálogos externos de archivos, otras aplicaciones ni arranque
después de reiniciar macOS. El login conserva relevo humano en la misma pestaña.

## Dirección acordada: CUA por defecto, suscripción primero

El propietario quiere CUA como ruta por defecto si se cubre con Claude Max 20×,
y gasto adicional solo excepcional. La comprobación documental vigente de
Anthropic mantiene claude -p/Agent SDK dentro de límites de suscripción (cambios
anunciados pausados). Dirección: Claude Code oficial + CuaDriver local, sin nube
CUA ni segundo proveedor de inferencia. Integración desplegada como se documenta
en el estado actual de arriba. Extra usage de la cuenta
NO se comprobó: filtrar API keys no basta para garantizar cero sobrecoste.
Ver docs/browser.md. Nunca interpretar «extremos» como presupuesto ilimitado.

## Actual: radios/casillas y CUA evaluado

18 de septiembre, 13:36 EDT. Extensión 0.2.2 recargada por el propietario y
corrección desplegada selectivamente. Photon y Chrome conectados;
`interactionVersion: 3` confirma el ejecutor nuevo.

Causa del reporte Small/Bacon: la función inyectada no admitía radios ni como
check ni como click. La excepción quedaba como ausencia de resultado; la gestión
se marcaba incierta y Bacon no llegaba a ejecutarse. Claude además abría otra
pestaña para esquivar esa incertidumbre y describía ambos controles como fallidos.

Cambios: check soporta radios (true) y checkbox (true/false), la inspección expone
checked, grupo y acciones; verificación por estado observado. Errores estructurados
separan rechazos antes de la mutación de respuestas perdidas después del intento.
Los primeros admiten corrección en la misma gestión; los segundos no se repiten.
La política prohíbe abrir otra gestión para eludir incertidumbre y cambiar de
portal copiando los datos del propietario sin su decisión.

91 pruebas automatizadas pasan; 43 pruebas del candidato preparado también pasan.
La regresión real está en `scripts/evaluate-browser-form.mjs`, con datos e historial
privados aislados, sin otro consumidor Photon. El primer intento llenó y envió,
pero el modelo cerró la pestaña antes de la verificación independiente. Se precisó
que la conservara. El segundo encontró 502 en httpbin y cambió al espejo: la prueba
rechazó ese cambio y se añadió la política de alcance por sitio. La prueba final
eligió httpbingo explícitamente desde el fixture y pasó: todos los campos,
Small/Bacon, 17:00, instrucciones, cero envío prematuro y un único submit cuyo JSON
coincide. Registro privado: `~/.local/share/narciso/evaluations/form-controls-v1RbOg`.
Usar `NARCISO_TEST_FORM_ORIGIN=https://httpbingo.org` si httpbin no responde.

Tres rechazos de radios de la versión anterior se recuperaron a not_attempted y
las gestiones a ready: solo payload antiguo sin controlType, resultado nulo,
radio identificado en la observación y formulario de prueba httpbin. El código
0.2.1 demuestra que esas operaciones fallaban ANTES de mutar. No se reclasificaron
acciones ambiguas genéricas. Backup previo de SQLite:
`~/.local/share/narciso/evaluations/radio-recovery-zbnz0haw/before.sqlite`.
Backup del runtime: `~/.local/share/narciso/app.before-browser-pilot-20260918-133643`.

CUA: `/Applications/CuaDriver.app` 0.28.2. Daemon iniciado normalmente mediante
LaunchServices, modo standard; accesibilidad y grabación de pantalla autorizadas.
Se comprobó lectura AX de la ventana Chrome: Small AXRadioButton y Bacon AXCheckBox
con estado selected. NO se ejecutaron clics CUA ni se conectó aún CUA al MCP de
Narciso. Sigue pendiente un adaptador con ventana vinculada y coordinación de
intentos con la ruta DOM. No modificar permisos/grants ni activar CDP como efecto
colateral. Ver docs/browser.md para la evaluación. No se desplegó la canalización
experimental de correo.

## Actual: navegador sin aprobación redundante por paso

18 de septiembre, 13:18 EDT. El propietario confirmó que la escritura por código
funcionaba, pero pidió eliminar esa fricción: el encargo directo ya autoriza sus
pasos. Desplegado selectivamente; Photon y Chrome conectados. No requiere recarga
de la extensión (sigue 0.2.1).

- MCP anuncia `errand_act` en lugar de `prepare_browser_action`, solo en un turno
  activo del propietario y con la opción interactiva habilitada. Su estado público
  dice `owner-request-scoped`; se corrige el metadato antiguo del puente.
- El host registra petición original, turno, acción y resultado; ejecuta y verifica
  sin crear una aprobación. Continúa entre pasos dentro del turno. No existe aún
  un trabajador autónomo de gestiones que reanude después de un reinicio.
- Cada snapshot identifica un intento único. Repetir la llamada devuelve su estado,
  no repite el efecto; errores/desconexiones ambiguas quedan para verificación.
- El modelo interpreta alcance: preparar campos no autoriza enviar. Una pregunta
  de datos o una decisión sí requiere respuesta; no exige códigos para contestarla.
  El vínculo con el turno real no es una prueba semántica de autorización.
- Se retiró del camino directo el bloqueo basado en etiquetas de pago/firma;
  importe, destinatario y método deben venir del encargo. Esto no acredita soporte
  general de pagos: siguen los límites de controles sensibles, origen y login.
  No se probaron transacciones reales.
- Los códigos anteriores siguen funcionando como compatibilidad. Las escrituras
  Google conservan su política anterior; no se cambiaron en esta corrección.

Validación: 88 pruebas del checkout, 40 de integración/límites del candidato exacto
y 21 pruebas de navegador/gestiones después del ajuste de metadatos, todas pasan.
Claude + Chrome: URL/caption en un turno, una pestaña, campo aplicado y cero códigos.
Otro ensayo completó nombre/email y envío ficticio en tres turnos, una gestión,
un único envío y eco JSON correcto. Cuatro operaciones de campo (dos reafirmadas
antes de enviar) y un clic; ninguna aprobación. El primer ensayo esperaba tres
acciones exactas y falló esa aserción demasiado estricta; el criterio corregido
comprueba valores, alcance, envío único y resultado, y pasó en el runtime preparado.

Ensayos privados:
`~/.local/share/narciso/evaluations/direct-fragments-claude-79sEwo`
y `~/.local/share/narciso/evaluations/direct-browser-claude-r9jN63`.

Backup anterior a la ejecución directa:
`~/.local/share/narciso/app.before-browser-pilot-20260918-131634`.
Backup inmediatamente anterior al ajuste de metadatos:
`~/.local/share/narciso/app.before-browser-pilot-20260918-131809`.
La canalización de correo del servicio se preservó; no desplegar los experimentos
de este checkout mediante el instalador general. Falta la prueba telefónica del
propietario de esta NUEVA política; no confundir con la prueba anterior con código.

Las secciones siguientes son historial y describen políticas anteriores.

## Corrección posterior: enlace y texto separados por Photon

18 de septiembre, 13:02 EDT: Photon entregó la URL y su caption como dos mensajes
de texto con 7 ms de separación. El gateway los procesó por separado, produjo
dos respuestas y abrió dos pestañas. No era un enlace perdido. Los campos estaban
vacíos porque la acción seguía `prepared`, esperando aprobación.

Añadido `src/inbound-burst.mjs`: agrupa únicamente URL aislada + texto adyacente
del mismo DM en una ventana de 750 ms. Cada fragmento se guarda y marca leído
antes de esperar. El caption es el turno principal y recibe la reacción; los IDs
originales se vinculan en `delivery_groups`. No agrupa aprobaciones, mensajes de
otros DMs, respuestas citadas, notas de voz ni archivos. Al apagar se vacía el buffer.

La propuesta ahora dice «Por aprobar — aún no aplicado». No se eliminó el requisito
de aprobación por paso ni se rellenó retroactivamente el formulario del usuario.
85 pruebas pasan y 45 pasan en el runtime preparado para despliegue. Una repetición
real con Claude del caso URL/caption a 7 ms produjo 1 turno, 1 pestaña, 1 propuesta.
Corrección desplegada selectivamente; extensión sin cambios/recarga innecesaria.
Respaldo: `~/.local/share/narciso/app.before-browser-pilot-20260918-130245`.
Falta confirmar desde iMessage el envío agrupado y la aprobación del propietario.

## Último cambio: piloto de navegador y gestiones activo

18 de septiembre, 12:52 EDT: desplegados selectivamente `assistant`, `claude`,
`mcp`, `photon`, `browser`, `errands`, SOUL y el directorio de extensión/protocolo.
`NARCISO_BROWSER_INTERACTIVE=1` está activo en el .env del runtime. No se desplegó
la variante unificada experimental ni se reemplazaron los módulos de investigación,
publicación, Google o almacenamiento vigentes. No ejecutar el instalador general
sobre todo el checkout.

La extensión 0.2.1 está conectada al Chrome real. Pasó campos, checkbox y envío de
formulario ficticio, y quedó corregido/verificado el destino de los 13 controles.
Dos ensayos con Claude completaron siete turnos, una gestión y tres operaciones
cada uno. Se corrigieron propuestas duplicadas y comprobaciones prematuras durante
navegación: ahora se espera brevemente releyendo el resultado, sin repetir el clic.

81 pruebas del checkout y 41 pruebas sobre la copia exacta del piloto pasaron.
Se verificaron PID 51911, conexión Photon, Chrome y la opción experimental activa.
El primer bootstrap falló de forma transitoria; se restauró y repitió el cambio
esperando que terminara el proceso previo. Servicio conectado tras la recuperación.
Respaldo privado: `~/.local/share/narciso/app.before-browser-pilot-20260918-125255`.
Ver [detalle del ensayo y despliegue](browser-validation.md).

Se pidió al propietario una prueba de preparación/aprobación por iMessage;
confirmación pendiente. No afirmar validada la entrega al teléfono hasta recibirla.
El piloto exige aprobación por paso, no tiene continuación autónoma ni cierre
general de gestiones, y no ejecuta pagos/firmas de forma general. La evolución
siguiente es autorización por alcance y continuación entre pasos, con resultados
verificables. El trabajador de investigaciones sigue siendo de solo lectura.

## Objetivo y criterio del propietario

Asistente personal inspirado en Instinct, ejecutado en el Mac del propietario,
con iMessage como interfaz principal. Debe entender el contexto, tomar iniciativa
y ofrecer acciones concretas que realmente pueda realizar. Uso individual.

Preferencia reafirmada el 18 de septiembre: debe hacerse cargo de gestiones online
(permisos, facturas, cancelaciones), avanzar por el portal y resolverlas, evitando
devolverle al propietario tareas que puede ejecutar con herramientas. Ver
[gestiones online](online-errands.md). Registrada en SOUL y la variante experimental;
desplegada en SOUL y en el piloto de clics/formularios, sin pagos generales. La prioridad
funcional es cerrar esa brecha de ejecución, además de mejorar el criterio del resumen.

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
| Navegador local | Búsqueda/lectura implementadas vía extensión del perfil existente; verificar conexión con doctor. Piloto de clics/formularios activo; validado con Chrome y Claude, prueba telefónica pendiente. Ver docs/browser.md |
| Seguimientos programados | Pendientes; una tarea de fondo no es un scheduler |
| Otras identidades/cuentas | Pendientes; no asumir que están conectadas |

Roadmap completo: [TODO.md](../TODO.md). No todos los servicios de Google tienen
todas sus operaciones implementadas.

## Cambio más reciente y motivo

18 de septiembre: implementada la variante experimental unificada con comprobación
material; ver [protocolo](../experiments/unified-checked/README.md). El gateway no
la importa y no se desplegó. `src/unified.mjs` conserva un solo rol para investigar
y redactar; una comprobación aislada devuelve defectos concretos, sin compositor
ni selección de acciones por catálogo. El mismo rol recibe borrador y correcciones;
máximo dos vueltas. Continúan presupuesto, citas, herramientas de lectura y
cancelación. `src/imessage-format.mjs` prepara texto plano y burbujas; el notificador
experimental conserva cada parte y detiene envíos ambiguos sin duplicar partes.

68 pruebas automáticas pasaron. Ensayo inicial: seis casos nuevos terminados,
12 llamadas de modelo y 16 burbujas locales. Tres sondas dirigidas comprobaron
rechazo de certeza sobre un pago posterior y de autoría inventada de una inyección,
y aceptación de una opinión fundamentada. Son regresiones, no nuevos holdouts.
La primera repetición de la tarea real bloqueada terminó después de corregir una
cita, la confusión de dos inmuebles y la afirmación de ausencia de pagos pendientes.
No se releyó el buzón ni se modificó la tarea real: es evidencia guardada, no
monitoreo en vivo. Aún mostró detalle incidental; se ajustaron instrucciones
generales de selección y se evaluaron tres casos frescos (todos terminaron).
Los seis anteriores y sus limitaciones se conservan; no se suman las dos versiones
como si fueran nueve pruebas de la misma versión congelada.

Resultados privados: `unified-checked-2026-09-18/` (seis iniciales),
`unified-material-probes-2026-09-18/`, `unified-checked-shadow-2026-09-18/`,
`unified-checked-style-2026-09-18/` y `unified-checked-shadow-v2-2026-09-18/`, todos
bajo el directorio privado de evaluaciones. Repetir el mismo caso real mide la
iteración, no generalización. La v2 terminó en tres burbujas, pero la revisión manual
NO la considera lista para activar: dejó pasar una consecuencia operacional no
demostrada y todavía mostró detalles incidentales. Ver `review.md` y `decision.json`
del directorio v2. No seguir regenerando el mismo caso para escoger una salida
favorable. Hace falta mejorar certeza/selección y validar casos nuevos antes del piloto.
El último ajuste acotado del calendario evita inferir un año al cruzar de mes;
se probó automáticamente y no se regeneraron resultados congelados.
No desplegar todo el checkout: incluye trabajo previo de navegador aún pendiente.

18 de septiembre: experimento de arquitectura autorizado tras la crítica de
Fable. Ver [experimento A/B](../experiments/architecture-ab/README.md). Compara
investigación + compositor/auditor con investigación y redacción unificadas,
usando Opus 5/high en todas las llamadas, mismo contexto y herramientas sintéticas.
No cambia el servicio ni consulta cuentas reales. Protocolo congelado y resultados
privados en `~/.local/share/narciso/data/evaluations/architecture-ab-2026-09-18/`;
la clave de variantes está en `manifest.json`, nunca en el ballot. Separar
preferencia del propietario, errores de hechos y éxito de entrega. No desplegar
una variante por ganar unos casos; falta resolver errores materiales y luego,
si procede, probar en sombra con tareas reales. El ensayo parte de trabajos ya delegados:
no demuestra que el chat elija correctamente cuándo delegar.

Ensayo terminado: 16 salidas conservadas, hashes sin cambios, perfiles de modelo
verificados. `metrics.json` y `assessor-review.md` contienen métricas y revisión
factual privada. Votos recibidos y guardados en `owner-votes.json`: unified 6/8,
staged 2/8 (contrato y reembolso). Letras A/B alternaban entre casos. El propietario
prefiere mensajes más cortos, separados por idea en burbujas, y texto plano sin
marcadores Markdown en iMessage. Son preferencias registradas, aún no desplegadas.
La rama unificada entregó 8/8 y la separada 7/8; mediana de 10.9 y 35.9 segundos
respectivamente en este ensayo. No es un benchmark de producción. La respuesta
unificada de factura, aunque preferida, confundió martes 22 con lunes y descartó
sin evidencia un pago posterior; en el aviso malicioso atribuyó procedencia no
probada. Preferencia no equivale a exactitud. Siguiente propuesta: un agente
responsable de investigar y redactar, con comprobaciones concretas de fechas,
importes y afirmaciones materiales; probar fuera del servicio antes de desplegar.
No hubo cambio del runtime al registrar los votos.
Prueba aparte en `architecture-concurrency-2026-09-18/`: ambas versiones respondieron
«68» mientras investigaban y entregaron después mediante el notificador con
transporte local. Esto no verifica Photon ni recuperación de fallos de red.

18 de septiembre: corregido y desplegado el fallo de publicación de novedades de
correo. Ver [mail-publication-incident.md](mail-publication-incident.md). 61 pruebas
pasan y la repetición privada con Claude, usando evidencia guardada, produjo un
resumen aprobado. Despliegue acotado: solo `publication.mjs` y `job-runner.mjs`
actualizados sobre la aplicación previa. Servicio confirmado conectado a Photon
a las 14:03:36 UTC, PID 36610. El resto de cambios de navegador del checkout NO
está desplegado. No se envió un iMessage de prueba ni se reactivó automáticamente
la tarea bloqueada; resumen recuperado en el directorio privado de evaluación.

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

Actualización: el propietario pidió implementar búsqueda con su perfil local de
Chrome. Se añadió el puente nativo y la extensión de lectura; consultar
[browser.md](browser.md) para instalación y límites. No confundir búsqueda/lectura
con automatización de pagos. Los votos de la comparación conversacional ya se
guardaron en el directorio privado: actual 8, breve 3, empate 1; casos nuevos 3–3.
No se sustituyó la personalidad por la variante breve.

Estado de esta implementación de navegador (18 de septiembre): el propietario
autorizó activar la extensión. `node scripts/install-browser.mjs` instaló el
native host y los archivos en `~/.local/share/narciso/browser-runtime`.
El control del navegador bloqueó abrir `chrome://extensions` por política de URL;
no intentar rutas alternativas para eludirlo. El propietario debe cargar
manualmente `~/.local/share/narciso/browser-runtime/browser/extension` en su perfil
de Chrome mediante Load unpacked. ID: `dgaahliofdgpefcokgdkfnbkoefidpmi`.
El gateway aún no se actualizó; esperar conexión y validar búsqueda real primero.
Pruebas locales: 57 automatizadas; falta búsqueda real con Chrome y Claude tras
activar la extensión. Antes del despliegue comprobar tareas y entregas activas.

**Decisión pendiente del propietario: comparación ciega del núcleo conversacional.**
Tras probar mensajes reales, el propietario cuestionó si acumular reglas era el
camino correcto. Se congeló un experimento de 12 casos (seis adaptados de sus
ejemplos y seis sintéticos nuevos), con 24 respuestas, mismo Opus 5/high y mismo
runtime/herramientas. Una variante usa las instrucciones actuales y otra una
personalidad breve más contrato de autoridad/capacidades. No se modificó ni
redesplegó el servicio con este experimento. No elegir ganador antes de sus votos.

Protocolo y reproducción: [../experiments/core-ab/README.md](../experiments/core-ab/README.md).
Resultados, hashes y clave A/B privada:
`~/.local/share/narciso/data/evaluations/core-ab-2026-09-17/`.
`manifest.json` contiene la clave; `blind.json`/`blind.md` la omiten.
La interfaz local se genera desde `blind.json` con `render-ballot.mjs`.
La clave no está incrustada en la interfaz. Recibir votos por caso, separar
preferencias de errores materiales, y examinar casos nuevos antes de proponer
una sustitución. No seguir ajustando las variantes con estos mismos casos
mientras se espera la evaluación. Las pruebas de estilo anteriores no equivalen
a una validación de producto, y no demuestran que Narciso ya sea satisfactorio.

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

> Lee `docs/HANDOFF.md` y `experiments/architecture-ab/README.md`. Revisa el ensayo
> congelado y los votos A/B antes de cambiar arquitectura; no regeneres respuestas
> para sustituir las que salieron mal. Lee también `docs/evidence-publication.md`.
> Comprueba el estado actual
> de Git y del servicio y lee `docs/selection-evaluation.md`. Continúa desde los
> resultados medidos, no desde la arquitectura anterior de tres llamadas. Evalúa
> selección y naturalidad de Narciso,
> conservando la verificación de evidencia. Empieza evaluando las salidas privadas
> ya guardadas, sin repetir toda la investigación ni enviar mensajes de prueba.
> No asumas que el navegador o los seguimientos programados están implementados.


## 2026-09-18: Chase tab crashes — diagnosis, not resolved

Three local Chrome Crashpad dumps at 14:54:15, 14:54:43 and 14:57:18
share Chrome 153.0.8010.48 framework exception offset 0xabace84.
The final trace mixes background accessibility input with foreground pointer
input; Next is attempted via both methods. This correlation does not prove
AX causes the crash or exclude bank anti-automation/security code. Owner reports
manual interaction in the same tab works. Do not claim the bank website is broken,
that automation detection is established, or that the password is wrong.
Do not repeat bank login/OTP attempts automatically or bypass security challenges.

Prepared in CHECKOUT ONLY: NARCISO_CUA_MODE=visual, forwarded only to foreground
CUA turns. It disables page AX traversal, disallows element/set_value/background
input, requires an exact screenshot, and forces foreground delivery for native
tools supporting it. Tool descriptions and prompt instruct stopping on Aw Snap
without reloading/retrying login. Eight CUA tests pass; real read-only Chrome
capture returned a valid 1280x838 screenshot, correct PID/window, zero AX elements.
NOT deployed; bank flow NOT retested. This is a diagnostic mode, not a confirmed
fix or a method for bypassing bank anti-automation. Native window focus and input
may still consult OS accessibility internally; no claim of eliminating all AX.


### Visual pilot deployed at 15:11 EDT

Owner explicitly requested that we run the diagnostic tests. Full real Claude
Code → CUA → existing Chrome visual test passed in
`~/.local/share/narciso/evaluations/cua-fUYXQc`: all six expected fields, radio,
checkbox, select and custom canvas verified by exactly one synthetic POST.
All recorded inputs used foreground/global_input. 36 targeted tests passed and
8 CUA tests also passed in the staged live copy. No account login attempts made.

Selective deployment overlays only src/cua.mjs, src/claude.mjs and test/cua.test.mjs
on a copy of production; NARCISO_CUA_MODE=visual. Backup:
`~/.local/share/narciso/app.before-browser-pilot-20260918-151125`.
PID 84926 alive and Photon connection confirmed. Existing extensions unchanged.
Closed only the synthetic demo tab, leaving the existing Chase login tab visible.
Asked owner to enter credentials and stop at “Let's make sure it's you”, before
requesting OTP. Pending: ONE controlled visual transition and crash-file check.
Do not report Chase fixed or extension culprit identified yet. Our extension
has no automatic content_scripts; script injection happens only on explicit
native-message browser operations. Other profile extensions have content scripts,
so conflicts remain possible; isolate only if visual trial still fails.
