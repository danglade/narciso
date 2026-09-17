# Prueba de comportamiento de Instinct

17 de septiembre de 2026. Observación manual por WhatsApp Web, autorizada por
el propietario. Es una prueba de caja negra: no conocemos su implementación,
modelo, prompts ni mecanismos de concurrencia.

## Condiciones

- Chat de Instinct ya conectado a la cuenta del propietario.
- Caso de correo completamente ficticio; ninguna consulta al buzón real.
- Investigación posterior limitada a documentación pública, sin instalaciones
  ni cambios solicitados.
- Las horas son las mostradas por WhatsApp en America/New_York, con precisión
  de minutos. No son mediciones de latencia exacta.
- No se ejecutó esta misma conversación contra la versión actual de Narciso.
  Las capturas anteriores y las evaluaciones locales no son un A/B equivalente.

## Priorización y corrección

Primer caso: acceso desconocido a CloudNest, factura Acme por USD 240 que vence
mañana, reclutador sin plazo, recibo reconocido y 30 newsletters. Se pidió qué
merecía atención y qué haría después, indicando que todo era ficticio.

Instinct priorizó seguridad, factura y reclutador, dejando recibo y newsletters
sin atención inmediata. Propuso verificar el acceso y la factura; no presentó
acciones como ejecutadas. La respuesta inicial fue más explicativa que un breve
resumen diario: el prompt pedía explícitamente justificar próximos pasos.

Corrección enviada a las 19:07:

> Seguimos con el caso ficticio: el acceso a CloudNest sí fui yo y la factura de
> Acme ya está pagada. Tengo dos minutos; ¿qué queda que merezca mi atención?

Respuesta, también a las 19:07:

> Nada urgente.
>
> Si quieres usar bien esos 2 minutos, responde al recruiter con 2-3 horarios.
> Si no, lo dejas para después y ya: recibo reconocido y newsletters no merecen
> atención.

Observación: retira prioridades resueltas, conserva la solicitud pendiente y
evita inventar un plazo. Sugiere responder; no ofrece preparar el borrador en
esta respuesta, por lo que no demuestra iniciativa máxima en todos los turnos.

## Conversación durante una investigación

A las 19:07 se pidió comparar, usando documentación oficial de Playwright y
Chrome, un perfil persistente dedicado frente a conectarse a un Chrome abierto.
Contexto: asistente local en Mac, sesiones persistentes e intervención humana
ante CAPTCHA/MFA. Entregable: recomendación, tres limitaciones y enlaces.
Se indicó expresamente no instalar ni cambiar nada.

Secuencia observada:

1. Reacción 👀 sobre la petición.
2. A las 19:08: «Lo reviso solo en docs oficiales y te traigo recomendación +
   límites + fuentes.»
3. Se envió «Mientras tanto, ¿cuánto es 17 por 4?».
4. A las 19:08 respondió únicamente «68.»; aún no había entregado la investigación.
5. A las 19:09 se preguntó qué quedaba pendiente del caso ficticio. Respondió que
   solo el reclutador; recordó el acceso reconocido y la factura pagada.
6. A las 19:09 entregó recomendación y limitaciones, y a las 19:10 los enlaces
   oficiales. Cambió la reacción de la petición de 👀 a ✅. No se le pidió estado
   ni se le recordó entregar la investigación.

Esto demuestra que aceptó y respondió otro turno antes del resultado de la
tarea larga. No demuestra hilos de ejecución, procesos paralelos ni que siguiera
investigando exactamente durante ese turno.

## Resultado y contraste de fuentes

Recomendó un perfil persistente dedicado y visible, con intervención humana ante
CAPTCHA/MFA. Reservó conectar por CDP para casos puntuales. Separó el resultado
en recomendación, tres limitaciones y fuentes. No expuso IDs ni narración interna.

El contraste independiente confirmó:

- Playwright documenta cookies/localStorage persistentes y una menor fidelidad
  de conexión por CDP respecto a su protocolo. También desaconseja lanzar sobre
  el directorio de uso diario. [BrowserType](https://playwright.dev/docs/api/class-browsertype).
- Chrome 136 cambió el comportamiento de los flags de depuración sobre el
  directorio predeterminado. [Anuncio oficial](https://developer.chrome.com/blog/remote-debugging-port).

Una omisión material: entre sus fuentes estaba la configuración de Chrome
DevTools MCP, que documenta conexión automática a un Chrome activo desde Chrome
144, habilitando depuración y aceptando el permiso. La respuesta no comparó esa
alternativa explícitamente y podía hacer parecer obligatorio un perfil separado
en todos los modos. [Configuración oficial](https://developer.chrome.com/docs/devtools/agents/get-started/configuration).

Su frase sobre necesitar depuración habilitada sigue siendo compatible con ese
flujo; el problema es la comparación incompleta, no afirmar que todo el resultado
es falso. La recomendación de perfil separado es una elección de diseño, no una
prueba de imposibilidad de las otras opciones. Se envió un seguimiento para que
distinguiera Playwright de Chrome DevTools MCP, manteniendo solo lectura.

En el seguimiento de las 19:10–19:11 distinguió correctamente los dos caminos:
`--autoConnect` pertenece a Chrome DevTools MCP; `connectOverCDP` en Playwright
necesita un endpoint. Conservó su recomendación para Playwright y reconoció que
MCP mejora el caso de usar el Chrome actual con autorización. No asumió que el
flag de MCP exista en Playwright. Aun así, no reconoció expresamente que la
comparación original dejaba fuera una alternativa relevante para el objetivo.

## Criterios que trasladar a Narciso

- Una corrección invalida las prioridades anteriores que ya no aplican.
- La respuesta a una pregunta independiente debe bastar por sí sola; no añadir
  el estado de otra tarea a menos que el usuario lo pida o cambie algo relevante.
- Acuse breve y específico para una investigación; IDs y detalles de ejecución
  permanecen privados.
- Preservar el contexto de cada tema al alternar conversaciones.
- Completar la tarea original sin que el propietario tenga que recordarla.

## Conclusión y próxima comparación

La experiencia observada consigue lo que buscaba el propietario: acuse breve,
pregunta independiente respondida sin narrar procesos, memoria de correcciones y
entrega posterior autónoma. No hace falta copiar una arquitectura interna
desconocida para exigir ese comportamiento.

No fue infalible: la investigación omitió inicialmente una alternativa pertinente
que figuraba en sus fuentes, y requirió un seguimiento para explicarla. Conservar
la verificación de evidencia de Narciso; naturalidad no sustituye exactitud.

Próximo paso: reproducir el caso ficticio, su corrección y la intercalación en la
versión vigente de Narciso con un estado de prueba aislado. Medir orden de entrega,
memoria, omisiones y capacidades prometidas. Comparar investigación web cuando
Narciso tenga herramientas equivalentes; no exigir que finja navegación.

La prueba contra Instinct solo envió mensajes autorizados y documentó resultados.
La implementación posterior en Narciso se describe a continuación.

## Repetición en Narciso y cambios aplicados

Se ejecutó `scripts/evaluate-conversation.mjs` con el modelo real de Claude Code,
copiando el runtime, SOUL y contexto público a un directorio temporal. SQLite y
memorias estaban aislados; no se copiaron `.env`, contexto privado ni tokens de
Google. El envío final se recogió en memoria, sin Photon. Las trazas completas
temporales se eliminaron; el informe conserva respuestas y nombres de herramientas.

La primera pasada mostró tres problemas:

- Tras la corrección, sugería nuevos cuidados para el acceso ya reconocido.
- Admitía no tener web, pero entregaba un informe largo de memoria en sustitución
  de la investigación solicitada.
- Ignoraba la petición expresa de trabajar en segundo plano porque juzgaba fácil
  un lote ficticio de diez pagos, un duplicado, un pendiente y un digest discrepante.

Se ajustaron SOUL, instrucciones finales del chat y descripción de `task_start`:
honrar el modo solicitado, mantener cerradas las preocupaciones resueltas, no
convertir ruido en tareas de limpieza y responder brevemente cuando faltan las
herramientas necesarias. Una pasada intermedia ya delegaba y entregaba, pero aún
proponía archivar newsletters y daba una explicación demasiado larga del bloqueo.
Esos dos comportamientos motivaron el ajuste final.

| Turno | Antes, palabras | Después, palabras |
| --- | ---: | ---: |
| Caso ficticio de prioridades | 263 | 112 |
| Corrección de acceso y factura | 91 | 27 |
| Investigación web sin herramientas | 384 | 55 |
| Recuerdo de lo pendiente | 52 | 14 |
| Petición de segundo plano | 169, resuelta en el chat | 15, acuse de tarea guardada |

En la pasada final, la pregunta intercalada recibió solamente «68.» en 2,6 segundos,
mientras la tarea estaba abierta. La tarea se completó aproximadamente 33 segundos
después del acuse y se entregó sin otro mensaje del propietario. Total recibido:
USD 1085.00, frente a USD 1105.00 del digest; USD 75.00 permanecían pendientes.
La publicación conservó esa distinción y el fallo operativo sin inventar su causa.

Pasaron 18 comprobaciones de la evaluación y las 52 pruebas automatizadas existentes.
Las comprobaciones de texto son indicadores acotados; la revisión de las respuestas
completas sigue siendo necesaria. Una ejecución por variante no mide fiabilidad
estadística, ni demuestra paridad universal. Modelo y esfuerzo no se modificaron.

Reproducir (consume cuota de Claude Code, no conecta Google ni Photon):

```sh
node scripts/evaluate-conversation.mjs --output /tmp/narciso-conversation.json
```

Salidas sintéticas y secuencia:
[evaluations/2026-09-17-conversation.json](evaluations/2026-09-17-conversation.json).
La secuencia web no es comparable: Narciso no tiene esa herramienta. La prueba de
trabajo concurrente usó datos aportados en el mensaje y una petición explícita de
segundo plano; no prueba selección autónoma del modo en todos los casos.

Despliegue: servicio actualizado y conectado de nuevo a Photon a las
23:20:25 UTC del 17 de septiembre. Se comprobó `launchd` activo y coincidencia
de SOUL y los módulos modificados con el checkout. No hubo una nueva prueba
del recorrido completo por iMessage después de este despliegue.
