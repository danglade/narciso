# Conversación actual frente a instrucciones breves

Protocolo previo a la generación, 17 de septiembre de 2026.

## Pregunta

¿La acumulación de instrucciones de conversación está empeorando la experiencia
frente a una personalidad breve con las mismas herramientas y límites?

Comparamos únicamente esa capa. No es una comparación completa de arquitecturas:
SQLite, CLI, esquema de salida, restricciones, MCP, aprobaciones y herramientas
siguen iguales. La versión simple conserva un contrato de autoridad/capacidades.
No se cambia el servicio activo ni se sustituye su configuración.

## Muestra y controles

12 casos: seis adaptados de situaciones aportadas por el propietario y seis
situaciones sintéticas nuevas. Se omiten datos personales, enlaces personalizados,
credenciales y transacciones reales. La muestra nueva no se usará para ajustar el
prompt antes de recibir la evaluación del propietario. No llamar a estos casos
«12 conversaciones reales» ni «test estadístico independiente».

- Mismo Claude Opus 5, esfuerzo high, CLI oficial y suscripción.
- Mismo contexto público, fecha de contexto fija y zona America/New_York.
- Cada caso/variante recibe estado temporal nuevo; no hay memoria entre casos.
- No se copian `.env`, `CONTEXT.md`, OAuth ni datos del servicio. Google está
  desconectado en ambas variantes; no hay Photon, navegador ni mensajes externos.
- Historial idéntico en casos con contexto. La variante simple reemplaza la
  construcción de baseSystem solo en su copia temporal de claude.mjs.
- En la pregunta intercalada se introduce el mismo trabajo pendiente en SQLite;
  se mide la respuesta conversacional, no se ejecuta la investigación ni se
  mide concurrencia. La prueba anterior ya ejercitó concurrencia con modelo real.
- Texto transcrito/adaptado; no se mide percepción de imágenes, audio ni UI de iMessage.
- Una generación por caso/variante. Orden de ejecución aleatorio. A/B equilibrado
  y aleatorio por caso, independiente del orden de ejecución. No se escogen las
  mejores respuestas ni se reintentan por mala calidad.
- Se guardan hashes de casos, instrucciones y código antes de llamar al modelo.
  Errores de ejecución se conservan como errores, no se ocultan.

## Evaluación del propietario

Se muestran pregunta, contexto necesario y ambas respuestas sin variante,
latencia, herramientas ni nombre del grupo conocido/nuevo. La clave permanece en
el directorio privado de resultados; no se incrusta en la interfaz.

Por caso: A, B, empate o ninguna, y motivo opcional. Valorar criterio, naturalidad,
iniciativa y exactitud. Ninguna equivale a que el usuario no querría esa respuesta
como asistente, incluso si una es relativamente menos mala.

No declararemos ganador por longitud, pruebas mecánicas o autoevaluación del modelo.
Después de votar, se revelan variantes, se cuentan preferencias separadas en casos
conocidos/nuevos y se revisan errores de hechos, permisos o capacidades. Una mayoría
subjetiva con un fallo grave no basta para desplegar. Esta muestra pequeña orienta
el siguiente experimento; no prueba una tasa estable de éxito.

Si la breve mejora claramente la preferencia sin regresiones materiales, probarla
con más tareas antes de sustituir la conversación actual. Si no, evaluar selección
de modelo/contexto y recorrido de herramientas; evitar seguir agregando reglas por
cada captura. El protocolo no atribuye capacidades internas desconocidas a Instinct.

## Ejecutar

Consume cupo de Claude. No requiere cargar `.env`.

```sh
node experiments/core-ab/run.mjs --output /ruta/privada/nueva
```

`manifest.json` contiene la clave y hashes. `blind.json` y `blind.md` no revelan la
identidad de las respuestas. Las trazas completas se eliminan con el entorno
transitorio; se conservan solo respuestas, duración, herramientas usadas y estado
mínimo de tareas/aprobaciones. No publicar resultados identificados antes de votar.
