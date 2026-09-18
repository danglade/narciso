# Agente unificado con comprobaciones materiales

Variante experimental; `src/photon.mjs` no la importa y el servicio instalado no
cambia. `createUnifiedJobRunner` mantiene trabajos, presupuestos, cancelación,
checkpoints y herramientas de lectura. El mismo rol investiga y escribe; una
corrección vuelve a ese rol con el borrador, hallazgos y acceso a las fuentes.
Cada segmento sigue siendo una llamada CLI nueva, no una sesión continua oculta.

## Comprobaciones y presentación

- Citas vinculadas a fuentes reales de la tarea y cálculos con evidencia.
- Comprobación determinista de fechas con día de semana y mes en español.
  Fechas abreviadas/otros idiomas dependen del comprobador semántico. Sin año
  explícito solo infiere el año para el mes de la petición, para evitar falsos
  rechazos al cruzar de diciembre a enero.
- Una llamada aislada comprueba únicamente hechos materiales, capacidades,
  atribuciones, cobertura y excepciones que cambian una decisión. No compone,
  reordena temas ni impone un catálogo de acciones. También puede equivocarse.
- Hasta dos correcciones; se guardan feedback y resultados por texto/contexto
  exactos. El tercer rechazo queda bloqueado, sin enviar un borrador inválido.
- Texto plano y párrafos cortos. El formato elimina marcadores de Markdown sin
  resumir ni modificar hechos; cada párrafo se entrega como una burbuja.
- El notificador guarda el estado de cada burbuja. Una entrega ambigua detiene
  las siguientes y exige revisión; no reenvía automáticamente partes anteriores.

No se ha retirado el control de autorización para operaciones de cuenta. El
comprobador recibe todas las fuentes ya capturadas, hasta un paquete de 200 KB;
un paquete mayor queda bloqueado y constituye una limitación pendiente de escala.
No tiene acceso al buzón ni puede demostrar hechos que las fuentes no contienen.

## Ejecución aislada

```sh
node experiments/unified-checked/run.mjs --output /PRIVATE/new-cases
node experiments/unified-checked/run.mjs --style --output /PRIVATE/selection-cases
node experiments/unified-checked/run.mjs --shadow --output /PRIVATE/saved-task
node experiments/unified-checked/probe.mjs /PRIVATE/material-probes
```

El ensayo de seis casos nuevos congela hashes y conserva todas las salidas. No
es un A/B aleatorio contra producción ni prueba estadística de superioridad.
Las rúbricas quedan fuera del entorno accesible al modelo. Opus 5/high, fuentes
sintéticas y transporte local; los resultados no se envían por iMessage.

`--style` usa tres casos nuevos para revisar selección y concisión después de
ajustar esas instrucciones. `probe.mjs` comprueba dos defectos deliberados y una
opinión válida con el comprobador real; son regresiones conocidas, no casos
nuevos para medir generalización. Cada directorio conserva su versión y salidas.

`--shadow` abre la base real en modo solo lectura y toma el último trabajo
terminado/bloqueado con evidencia. Recrea su pregunta, mensajes previos del
propietario, fecha y fuentes en una base temporal. Usa el perfil de evaluación;
no reproduce toda la configuración conversacional de producción. No relee Google
ni activa Photon/Chrome y no cambia el trabajo original. Es una repetición en
sombra sobre evidencia real guardada, NO un observador de nuevas tareas en vivo.
Los datos y resultados quedan fuera del repositorio, con permisos privados.

Para un futuro piloto en vivo todavía falta integrar explícitamente la variante
en el gateway y usar un transporte que envíe UNA burbuja por llamada del
notificador. No anidar el `summaryChunks` antiguo dentro de ese transporte: se
perdería la correspondencia entre parte persistida y mensaje enviado.

## Criterio de decisión

Leer resultados y fuentes: entrega exitosa no equivale a respuesta correcta.
Registrar por separado errores de hechos, iniciativa, longitud y cambios de
certeza. No editar respuestas congeladas ni sustituir fallos por un reintento
mejor. No desplegar automáticamente por pasar pruebas o ganar preferencias.
