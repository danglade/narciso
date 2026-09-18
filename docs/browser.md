# Chrome local: lectura y gestiones experimentales

Narciso busca en Google y lee páginas en el **mismo perfil de Chrome donde se
instala la extensión**, con sus sesiones existentes. No se copian cookies, no
se crea otro perfil y no se abre un puerto de depuración. Chrome debe permanecer
abierto en la sesión gráfica del Mac.

## Instalar

```sh
npm run browser:install
```

El instalador copia el puente a `~/.local/share/narciso/browser-runtime`, registra
el native host de Chrome para una única extensión y muestra la carpeta que hay
que cargar. En el perfil deseado, abrir `chrome://extensions`, activar el modo
desarrollador, elegir **Load unpacked / Cargar descomprimida** y esa carpeta.
Revisar y aceptar sus permisos. No cargarla en varios perfiles: el primer perfil
conectado mantiene la conexión; otro no puede quitársela.

La extensión pide `nativeMessaging`, `scripting`, `tabs`, `storage`, `alarms` y
acceso a sitios HTTP(S). Chrome agrupa estos permisos de forma amplia, aunque
la implementación ofrece operaciones concretas de búsqueda/lectura y, desde
la versión 0.2.0, inspección y pasos de formulario. El host solo anuncia y ejecuta
estos últimos con la opción experimental activada.
No escucha mensajes de páginas ni permite JavaScript proporcionado por el modelo.
El contenido solicitado pasa al modelo de Claude; búsquedas pasan a Google.
No incluir datos privados del correo, claves ni tokens en las consultas.

El instalador de navegador NO despliega el gateway ni activa las gestiones.
No desplegar todo este checkout sobre el servicio: contiene otros experimentos
pendientes de aceptación (ver HANDOFF). Primero validar Chrome y luego preparar
un despliegue selectivo cuando no haya trabajo activo. `npm run doctor` debe mostrar
`browserConnected: true`. El icono de la extensión permite reconectar; también
reintenta cada minuto. Tras actualizar el puente, recargar la extensión.

## Herramientas

- `browser_status`: confirma conexión y capacidades, sin inspeccionar pestañas.
- `browser_search`: crea una pestaña de resultados de Google.
- `browser_open`: abre una fuente HTTP(S) en otra pestaña y devuelve texto y enlaces.
- `browser_read`: lee más texto con `nextOffset` o vuelve a leer tras intervención humana.
- `browser_close`: cierra una pestaña creada por Narciso en esa conversación.

Solo se leen y cierran pestañas que el propio puente creó. Las pestañas habituales
del propietario no se enumeran ni se reutilizan. Las nuevas pestañas aparecen en
segundo plano y comparten las sesiones del perfil. Hay un límite de 20 pestañas
gestionadas; Narciso debe cerrar las que terminó de investigar.

Resultados incluyen URL final, fecha de captura, indicador de recorte y enlaces.
El texto es contenido externo no confiable. En tareas de fondo se guarda como
evidencia privada y atraviesa la verificación existente. Un resultado de Google
es una pista: el agente debe abrir fuentes antes de dar por confirmado un hecho.
No se devuelven cookies, almacenamiento web, valores de inputs ni HTML oculto
al modelo. La interacción compara valores de controles dentro de Chrome para
detectar cambios; los datos que se proponen escribir sí quedan en el registro
privado de acciones del host.

## Relevo humano y límites

Si detecta un campo de contraseña o verificación humana, devuelve un bloqueo y
conserva la pestaña. El propietario completa el paso directamente en Chrome y
avisa por iMessage; el agente vuelve a leer esa pestaña. La detección es
heurística y no reconoce todos los proveedores de autenticación/CAPTCHA.
Chrome reiniciado cierra la conexión y puede invalidar identificadores de pestañas;
en ese caso hay que reabrir la fuente, aunque la sesión de la cuenta persista.

La ruta de investigación sigue sin clics ni cambios de cuenta. La ruta experimental
permite pasos de formulario; sus límites se detallan abajo. No hay ejecución
general de pagos, descargas deliberadas, lectura de PDFs, iframes ni interacción
por coordenadas. Solo se extrae texto
renderizado de la página principal. Un sitio puede registrar visitas o marcar
contenido como visto al navegar; “lectura” no significa ausencia de efectos
del servidor. Se rechazan esquemas especiales, IPs literales, puertos ajenos a
HTTP(S), hosts locales comunes y URLs evidentes de acciones/credenciales. Esto
no es aislamiento de red frente a DNS o redirecciones maliciosas: el navegador
conserva el acceso de red y las sesiones normales del propietario.

## Arquitectura y diagnóstico

`MCP → socket Unix privado → native host → extensión MV3 → pestaña Chrome`.
El socket `data/browser.sock` es 0600 dentro del directorio privado. No hay servidor
HTTP escuchando ni credenciales en la extensión. Como el resto del estado de
Narciso, se confía en los procesos del mismo usuario del sistema operativo.

Las solicitudes se validan en MCP/puente/extensión. El puente limita tamaño,
plazo y concurrencia; si otra lectura está activa devuelve “busy” para reintentar.
Las respuestas se vinculan por ID a la llamada pendiente. Al cerrar Chrome se
termina el native host. Al reiniciar recupera un socket obsoleto.

Pruebas: validación de URL/operación; protocolo nativo fragmentado y Unicode;
aislamiento entre conversaciones; rechazo de otro perfil conectado; recuperación;
captura de evidencia desde MCP y errores explícitos de desconexión. Las pruebas
simuladas no sustituyen comprobar la extensión real y una búsqueda con Claude.

Referencias oficiales: [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging),
[scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting).

## Prototipo de gestiones (0.2.0, desactivado por defecto)

`NARCISO_BROWSER_INTERACTIVE=1` habilita las herramientas de gestiones solo en
un turno de iMessage activo del propietario. La variable se transmite al MCP de
chat; no al trabajador de investigación. El ejecutor del host vuelve a comprobarla.
No ejecutar otro consumidor Photon para probarlo. El socket privado confía en
procesos del mismo usuario: la opción es una barrera del host/modelo, no un sandbox
contra otros programas de esa cuenta de macOS.

- `errand_start`: vincula objetivo del mensaje real, conversación, pestaña y sitio.
- `errand_status` / `errand_inspect`: recuperan estado y observan controles visibles.
- `errand_act`: ejecuta un campo, selección, checkbox o clic dentro del encargo
  del propietario y observa su resultado, usando el snapshot actual.
- `errand_verify`: consulta de nuevo y registra la confirmación observable del paso.
- `errand_cancel`: detiene pasos futuros; no deshace un envío ya intentado.

La petición autenticada del propietario autoriza sus pasos. El agente continúa
hasta completar ese alcance sin códigos ni una segunda aprobación por campo.
“Prepara este nombre” significa escribirlo; no autoriza enviar el formulario.
Si falta un dato o una decisión, pregunta de forma natural y acepta respuestas
inequívocas como “sí, dale”. Los códigos antiguos siguen funcionando únicamente
para propuestas ya emitidas; la herramienta nueva no crea aprobaciones.

El host vincula cada acción al turno real y a la conversación/pestaña/sitio,
y guarda la petición original y el resultado. La interpretación del alcance la
hace el modelo: esa vinculación no es una prueba automática de autorización
semántica ni una defensa completa contra prompt injection. Las páginas,
adjuntos y textos citados nunca autorizan nuevas operaciones.

La extensión usa referencias privadas a controles del DOM principal, en su mundo
ISOLATED, sin selectores ni JavaScript suministrados por el modelo. Un snapshot
se consume una vez; si cambia la página, sus controles, valores o destinos
conocidos, hay que inspeccionar y preparar de nuevo. Formularios/enlaces hacia
otro origen requieren otra gestión o intervención. En aplicaciones con JavaScript
los efectos internos de un botón no se pueden determinar solo por su etiqueta:
la evidencia de una interacción no garantiza su semántica en el servidor.

No se ofrecen controles de contraseñas, códigos OTP o tarjetas. Su filtrado es
heurístico. Login/CAPTCHA conservan la pestaña para intervención del propietario.
En acciones directas se eliminó la barrera basada solo en etiquetas de pago/firma:
una petición explícita define el alcance, pero esto NO demuestra soporte general
de pagos o firmas. Importe, destinatario y método deben estar establecidos por el
propietario; una instrucción del portal no los autoriza. Las pruebas usan solamente
un formulario ficticio, nunca transacciones reales.

Las gestiones y sus acciones persisten en SQLite. Una desconexión después de un
clic queda en `needs_review`, sin repetición automática. Reiniciar no reejecuta
operaciones. Una inspección nueva invalida propuestas pendientes. Una confirmación
literal nueva o una navegación al destino esperado confirma solo ese paso; no
prueba que un pago se liquidó o que un permiso fue aprobado. Los campos se
comprueban dentro del DOM, sin demostrar guardado en el servidor. No existe aún
un criterio general para cerrar una gestión completa ni reanudación autónoma tras reinicios. Sí hay continuación entre pasos dentro
del turno activo, con un registro antes de cada intento.
Tras un intento se espera brevemente a la navegación mediante inspecciones
acotadas; nunca se repite automáticamente el clic.

Validación automatizada: 91 pruebas pasan, incluidas ejecución directa sin
aprobaciones, secuencia de campos/envío, aislamiento, snapshots, reintentos sin
duplicar efectos y recuperación de respuestas perdidas. Ver los ensayos con
Claude y Chrome en [validación](browser-validation.md).

El ensayo detectó un destino incorrecto en las propuestas debido al getter de
Chrome `formAction`. Corregido en 0.2.1, copiado al runtime y recargado por el
propietario. Verificado en Chrome: los 13 controles muestran el destino `/post`. El recorrido con Claude pasó y el gateway tiene el piloto desplegado selectivamente.
Falta la confirmación del propietario por iMessage. Ver [validación](browser-validation.md).


## Controles y diagnóstico (0.2.2)

`check` admite checkbox y radio; radio solo permite `true` (se elige otra opción
para cambiar el grupo). La inspección devuelve `checked`, grupo y acciones
admitidas. Tras actuar, se vuelve a observar el estado, incluyendo la recuperación
de una respuesta perdida sin repetir la acción. No usar `click` para estos tipos.

La función inyectada devuelve errores estructurados con `attempted`: un rechazo
antes de mutar permite corregir el paso en la misma gestión. Un error después de
iniciar la mutación, o una desconexión sin respuesta, conserva la incertidumbre.
No abrir otra gestión/pestaña para eludirla. No atribuir un error a un control
que no se llegó a intentar.

Regresión real reproducible: `node --env-file=.env scripts/evaluate-browser-form.mjs`.
Usa historia y SQLite aislados, datos ficticios y una pestaña de httpbin; no inicia
Photon. Verifica todos los campos, Small/Bacon, ausencia de envío anticipado y un
único envío con eco JSON. Requiere la extensión 0.2.2 recargada.

## CUA evaluado en el Mini

CuaDriver 0.28.2 está instalado como aplicación independiente. Se inició el daemon
normal con LaunchServices, en modo standard, sin cambiar permisos ni ampliar sus
grantías. Accesibilidad y Screen Recording reportaron permiso. `get_window_state`
leyó Chrome y devolvió Small como AXRadioButton y Bacon como AXCheckBox, con
selección observable. Fue una comprobación de lectura, no de clics CUA.

Estado histórico de esa evaluación inicial (sustituido por la integración de abajo):
CUA todavía no se anunciaba al modelo. La recomendación inicial era:
conservar la ruta DOM para formularios normales y añadir un adaptador CUA para
accesibilidad/captura, limitado a la ventana de Chrome vinculada a la gestión.
Ambas rutas deben compartir exclusión de acciones, registro de intento y
verificación; una segunda ruta nunca debe repetir automáticamente un envío
ambiguo. El login mantiene el relevo humano. CDP de CUA sobre perfiles existentes
es otra modalidad con preparación/grants propios; no se activó ni se cambió el
perfil de Chrome durante esta evaluación.


## Decisión de coste y dirección — 18 de septiembre de 2026

El propietario prefiere CUA como ejecutor por defecto si utiliza su membresía
Claude Max; costes adicionales solo para excepciones. La dirección propuesta pasa
por Claude Code oficial (sesión de suscripción) + CuaDriver local mediante MCP.
No contratar Cua Cloud ni introducir otro modelo de pago para la ruta habitual.
Esta dirección sustituye la recomendación anterior de CUA solo como respaldo;
la integración posterior está documentada en el apartado siguiente y en HANDOFF.

Comprobación documental: la nota vigente de Anthropic del 15 de junio indica que
los cambios anunciados para Agent SDK/claude -p están pausados y este uso sigue
consumiendo los límites de la suscripción. No confundir la sección antigua de
crédito mensual de esa página con una política vigente:
https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

El runtime actual elimina API keys/proveedores alternativos del entorno de Claude.
Eso no prueba que los usage credits de la cuenta estén desactivados: ese ajuste
no se verificó y debe comprobarse antes de garantizar ausencia de sobrecostes.
Al agotar el plan, conservar el trabajo y esperar; no cambiar automáticamente a
API o proveedor pagado. Una excepción de pago requiere coste acotado y decisión
expresa del propietario; «casos extremos» no fija un presupuesto abierto.
Las capturas/observaciones consumen capacidad del modelo aunque el controlador
local no utilice una API de inferencia propia. Usar estructura/accesibilidad
cuando basten y capturas cuando sean necesarias para ejecutar o verificar.


## Adaptador CUA implementado y validado

`src/cua.mjs` conecta por MCP al daemon de CuaDriver.app. `src/cua-mcp.mjs`
expone solamente ventanas de Google Chrome y operaciones nativas vinculadas a la
ventana observada. El modelo recibe accesibilidad y capturas, y puede usar píxeles
para controles que no tengan semántica accesible. No CDP, perfil nuevo ni servicio
de inferencia adicional. La configuración es `NARCISO_BROWSER_BACKEND=cua` y
`NARCISO_BROWSER_INTERACTIVE=1`; los trabajos de investigación conservan el
navegador de solo lectura de la extensión.

Cada turno usa una sesión MCP propia, con la ventana guardada en SQLite para
retomarla después. La primera observación pone esa ventana en primer plano.
El teclado usa foreground por defecto: en la prueba, las escrituras AX/background
del omnibox reflejaban texto sin actualizar de forma fiable el buffer de edición.
Cada acción consume su observación y exige otra para continuar. Un lock local
impide dos sesiones de Narciso operando Chrome a la vez; no coordina aplicaciones
o personas ajenas a Narciso. Las acciones quedan registradas antes de enviarse;
una respuesta del driver no se considera una verificación del resultado.

El Mini debe tener la sesión del propietario **desbloqueada**. IORegistry se
consulta antes de actuar; un bloqueo detiene las llamadas y pide desbloquear el
Mac. Se detectó porque CUA podía devolver una captura antigua mientras loginwindow
era la aplicación activa. No se cambió la configuración de bloqueo de macOS.

La regresión `node scripts/evaluate-cua-browser.mjs` usa Claude Code real, CUA,
el perfil local de Chrome y un servidor local de formulario con datos ficticios.
Comprueba ausencia de envío anticipado, reanudación en otro turno, valores exactos
recibidos una sola vez, y un canvas sin árbol de accesibilidad. No envía mensajes
Photon ni datos de cuentas reales. El daemon debe estar iniciado mediante
LaunchServices; la ruta del binario instalado se mantiene fija.

Estado de despliegue y última evidencia: consultar `docs/HANDOFF.md`.

Regresión aprobada el 18 de septiembre de 2026:
`~/.local/share/narciso/evaluations/cua-pqfvzb/summary.json`. El formulario recibió
exactamente una solicitud con todos los valores previstos y `custom=on`;
la fase inicial de preparación no envió nada. 95 pruebas del checkout pasaron;
37 pruebas sobre el candidato selectivo del runtime también pasaron.

Desplegado selectivamente a las 14:14:56 EDT. Photon y la extensión de lectura
volvieron a conectar. La próxima validación es un encargo del propietario por
iMessage; no se ha confirmado todavía ese recorrido con CUA.


### Foco parcial no equivale a Mac bloqueado

Una ventana auxiliar de Chrome puede hacer fallar la comprobación de orden
visual aun cuando el documento tenga foco. Solo se admite el resultado parcial
`bring_to_front_exact_window_unverified` si el proceso está activado y el foco
confirmado, y una nueva observación verifica el PID, ventana y AX exactos.
Otros errores siguen deteniendo la acción. Las ventanas sin título no se ofrecen
como documentos de trabajo. Un error de foco nunca se traduce en MAC_LOCKED.
El límite por turno CUA es de ocho minutos y 80 acciones; los demás turnos
conservan sus límites. Véase HANDOFF para la regresión y despliegue del arreglo.
