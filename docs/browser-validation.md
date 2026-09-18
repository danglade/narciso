# Validación del navegador real — 18 de septiembre de 2026

## Resultado observado

La extensión cargada en el Chrome del propietario completó una prueba en
`https://httpbin.org/forms/post`, un formulario de demostración HTTP. Se usaron
solo datos ficticios; no una cuenta, factura, solicitud ni pedido real.

La prueba pasó por `startErrand → prepareErrandAction → claimApproval →
executeErrandAction → verifyErrand` con una base SQLite en memoria y una
conversación de prueba. Las aprobaciones fueron fixtures del ensayo autorizado,
no mensajes recibidos por Photon. No se alteró la base de datos del propietario.

| Paso | Comprobación real |
| --- | --- |
| Campo de nombre | Chrome confirmó escritura; el servidor devolvió el marcador ficticio exacto |
| Campo de email | El servidor devolvió `narciso-demo@example.com` |
| Checkbox | El servidor devolvió la opción seleccionada (`onion`) |
| Texto multilínea | El servidor devolvió `Synthetic browser validation. No real order.` |
| Botón de envío | Navegó a `https://httpbin.org/post`; respuesta JSON con los datos enviados |
| Verificación | La gestión reconoció el marcador nuevo como confirmación del paso |
| Limpieza | Se cerró la pestaña creada para el ensayo |

No se guardaron los headers, IP ni otros datos de conexión devueltos por httpbin.
La respuesta a un POST de demostración no demuestra ejecución de pagos ni
procesamiento de solicitudes por un proveedor real.

## Error descubierto y corrección

Chrome puede devolver la URL del documento desde `element.formAction` aunque no
exista el atributo `formaction`. El prototipo lo interpretaba como un override y
mostraba `/forms/post` donde el formulario realmente enviaba a `/post`.

La extensión 0.2.1 usa el destino del formulario salvo que el control tenga un
atributo de override explícito. También corrige `formmethod`. Una prueba de
regresión reproduce el getter real de Chrome y comprueba el rechazo de un
formulario hacia otro origen.

79 pruebas automatizadas pasan. La versión 0.2.1 se copió al runtime de navegador;
el propietario la recargó y se verificó en Chrome real: los 13 controles del
formulario mostraron el destino correcto `https://httpbin.org/post`. Se cerró
la pestaña de comprobación. Pendiente: probar el recorrido con Claude/iMessage.
No se desplegó el gateway ni se activó la opción experimental del servicio.


## Claude y host: prueba integrada

Se hicieron dos recorridos de siete turnos cada uno con Claude Code y el mismo
Chrome conectado. Datos ficticios, base SQLite separada, sin conexión Photon ni
credenciales Google en el entorno de evaluación. Cada recorrido produjo una sola
gestión y tres operaciones: nombre, email y envío. El servidor devolvió los dos
valores esperados. Las aprobaciones del ensayo fueron fixtures validados contra
el origen, destino, tipo de acción y valor esperado antes de ejecutarlas.

El primer ensayo detectó propuestas duplicadas y una verificación demasiado
rápida durante la navegación. Se corrigió la instrucción de publicación y se
introdujo una espera acotada con relecturas del resultado, sin repetir el clic.
El segundo ensayo confirmó el envío en unos 291 ms tras la aprobación y mostró
una sola propuesta por paso. Las trazas completas permanecen en el almacenamiento
privado de evaluaciones del Mac, no en el repositorio público.

## Piloto desplegado

El 18 de septiembre a las 12:52 EDT se desplegó selectivamente el navegador y las
gestiones, preservando los módulos vigentes de investigación/publicación de correo.
81 pruebas pasan en el checkout y 41 de integración/límites en la copia exacta
preparada para despliegue. La extensión no necesitó otra recarga.

El primer bootstrap de launchd falló durante la transición; se restauró el runtime
anterior y se volvió a desplegar esperando la salida del proceso previo. Se verificó
el proceso nuevo, el evento Photon `narciso_connected`, Chrome conectado y
`NARCISO_BROWSER_INTERACTIVE=1`.

Respaldo: `~/.local/share/narciso/app.before-browser-pilot-20260918-125255`.
Metadatos: `~/.local/share/narciso/browser-pilot-deployment.json`.
Para revertir, esperar a que no haya gestiones/envíos en curso, detener el servicio,
restaurar ese runtime y volver a iniciarlo; no reintentar acciones externas ambiguas.

Se solicitó al propietario la prueba por iMessage (preparar un nombre ficticio y
responder con el código de aprobación). Esa confirmación de extremo a extremo
está pendiente. El piloto sigue requiriendo aprobación por paso; no es todavía
un ejecutor autónomo de pagos o trámites completos.


## Incidencia de la prueba telefónica: fragmentación del mensaje

La URL y el caption llegaron como dos eventos de texto separados por 7 ms. El
gateway respondió a cada evento y abrió una pestaña por turno. La propuesta del
segundo turno seguía esperando aprobación; no había ejecutado la escritura.

Se añadió agrupación acotada de URL+caption (750 ms, mismo DM) manteniendo registro
y recibo de lectura por fragmento. Los códigos de aprobación y adjuntos no se
agrupan. «Por aprobar — aún no aplicado» aclara el estado del formulario.

85 pruebas del checkout y 45 del runtime preparado pasan. Se reprodujo el caso
con Claude real: una llamada al modelo, una apertura de pestaña y una propuesta.
Desplegado el 18 de septiembre a las 13:02 EDT, sin cambiar la extensión. Pendiente
la repetición telefónica del propietario. No se interpretó la captura de un código
de aprobación como autorización para ejecutarlo.


## Ejecución directa del encargo — 18 de septiembre, 13:18 EDT

El propietario pidió retirar la aprobación por campo. El MCP ahora anuncia
`errand_act`; registra la petición auténtica, ejecuta una vez y comprueba el paso.
Las investigaciones de fondo no reciben esa herramienta. El alcance semántico
lo interpreta el modelo: el host vincula origen, turno, conversación y snapshot.

88 pruebas pasan, con casos de ejecución secuencial, ausencia de aprobaciones,
reintentos, recuperación y aislamiento. 40 comprobaciones también pasaron en el
candidato del runtime, y 21 de navegador/gestiones tras normalizar los metadatos.
En Chrome real, Claude recibió la URL y caption separados por 7 ms como un turno,
abrió una pestaña y aplicó NARCISO-PRUEBA sin códigos. Otro recorrido de tres turnos
llenó nombre/email y, solo después de pedir el envío, hizo un único submit a httpbin.
El eco JSON contenía exactamente ambos datos ficticios. El modelo reafirmó dos
campos antes del envío: cinco acciones totales, una sola de envío.

Despliegue selectivo confirmado con Photon y Chrome conectados. No cambió la
extensión ni la canalización de correo. Ningún pago real ni mensaje a terceros.
Falta que el propietario pruebe la nueva política desde iMessage.


## Radios y checkbox — 18 de septiembre, 13:36 EDT

0.2.2 se recargó con confirmación del propietario. 91 pruebas del checkout y 43
del runtime candidato pasan. La regresión `scripts/evaluate-browser-form.mjs`
probó Small/Bacon y el formulario completo con Claude en Chrome. httpbin tuvo un
502; la prueba final seleccionó httpbingo explícitamente, sin cambiar de destino
sobre la marcha. Observación DOM confirmó ambas selecciones antes del envío y el
JSON del servidor confirmó nombre/email/teléfono/size/topping/delivery/comments.
Una gestión y un único submit; sin aprobaciones. Resultado privado:
`~/.local/share/narciso/evaluations/form-controls-v1RbOg/summary.json`.

El runtime está desplegado con estado conectado. CUA se evaluó únicamente para
lectura AX y permisos; no está conectado al ejecutor de Narciso. Tres errores de
radios del demo antiguo, demostrablemente previos a la mutación, se recuperaron
con copia previa de SQLite; no se repitieron acciones externas al recuperarlos.
