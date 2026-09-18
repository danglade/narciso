# Comparación de arquitectura: investigar/publicar o unificar

Experimento opt-in. No modifica la aplicación desplegada ni conecta Google,
Photon o Chrome. Consume la suscripción oficial de Claude Code. No es una
recomendación de despliegue y no presume conocer la arquitectura de Instinct.

## Hipótesis y variable

¿Mejora el resultado si el agente que investiga también selecciona y redacta,
sin compositor/auditor obligatorio ni catálogo obligatorio de propuestas?

- `staged`: worker y circuito de publicación actuales, incluidas reparaciones.
- `unified`: mismo trabajador y contexto, con responsabilidad de escribir el
  resultado; entrega el campo final sin etapas semánticas obligatorias.

Ambas variantes usan Opus 5/high en todas las llamadas, el mismo prompt común,
perfil, historial, fuentes y herramientas de lectura. High uniforme controla
esfuerzo; no reproduce el xhigh de investigación de producción. No comparamos
modelos, riqueza del perfil ni conexión real a Google. El prompt común sustituye
las instrucciones conversacionales de producción para AMBAS ramas: comparamos
los flujos de investigación/publicación, no dos productos íntegros.

El esquema de hallazgos y la captura de evidencia se mantienen en ambas ramas
para observar calidad. La unificada conserva validación estructural del campo
final, presupuestos, estado persistido, cancelación y notificador; no valida
semánticamente el texto antes de entregarlo. Las herramientas no pueden escribir
cuentas. El compositor separado solo puede proponer capacidades del fixture.

## Casos y protocolo

Ocho corpus sintéticos: cuatro reproducen familias de errores conocidos y cuatro
son escenarios nuevos para esta prueba. No se usan ejemplos privados en el código
público. Cada modelo debe decidir qué fuentes abrir; ambos ven los mismos títulos
y snippets, no los cuerpos completos hasta pedirlos. Fuentes obtenidas quedan en
su contexto de investigación. La rúbrica NO entra en el app temporal ni el prompt.

Se parte del mismo trabajo guardado y acusado en ambas ramas. Esto no mide si el
chat decide bien delegar. La entrega pasa por el notificador real con transporte
local; no es una prueba por iMessage ni de todos los fallos de red posibles.

Antes del ensayo se ejecuta un smoke separado (una reunión sintética), para
encontrar fallos técnicos del adaptador. No ajustar prompts a los ocho casos
después de congelar. Una ejecución por variante/caso; conservar fallos como tales,
sin elegir la mejor de varias generaciones. Manifiesto con hashes, orden y clave
A/B privada; balance de etiquetas. No elegir ganador antes de los votos.

```sh
node experiments/architecture-ab/run.mjs --smoke --output /PRIVATE/smoke
node experiments/architecture-ab/run.mjs --output /PRIVATE/frozen
node experiments/architecture-ab/run.mjs --concurrency --output /PRIVATE/concurrency
```

El ensayo de concurrencia demora cada lectura de la fuente 10 segundos. Tras
comenzar una lectura, pregunta `17 × 4` por el camino conversacional y registra si
responde antes de que termine la investigación. Luego verifica la notificación
del resultado en el transporte local. No introduce esperas en el servicio real.

Registrar preferencias del propietario aparte de exactitud, capacidades inventadas,
fuentes leídas, entrega, llamadas y latencia. La revisión posterior de hechos no
es una puerta de entrega para unified. Un único pase no prueba superioridad
general: el perfil, corpus y fuente simulada limitan la generalización.

`render-ballot.mjs /PRIVATE/frozen/blind.json /OUTPUT/compare.html` produce la
comparación sin clave de variantes. Preserva respuestas completas y permite
consultar las fuentes sintéticas. Los votos no despliegan una versión.

## Después

Si unified mejora preferencia sin degradar fiabilidad material, probarla con tareas
reales en modo sombra antes de ofrecer un cambio reversible del servicio. Si no,
examinar fallos por contexto/herramientas/modelo. El resultado no justifica retirar
controles de autorización ni aceptar hechos inventados para sonar más humano.
