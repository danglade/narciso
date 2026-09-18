# Roadmap de Narciso

El objetivo es completar tareas personales en un Mac controlado por su dueño,
con la iniciativa y el estilo de un asistente como Instinct.
Los puntos abiertos son planes, no capacidades ya disponibles.

## Fase 1 — Base funcionando

- [x] Servicio local supervisado, una sola instancia y propietario autorizado.
- [x] iMessage vía Photon, recibos de lectura y respuestas finales limpias.
- [x] Claude Code oficial con la suscripción del propietario.
- [x] Personalidad, contexto privado, historial y memoria confirmada.
- [x] Integraciones iniciales de Gmail, Calendar, Tasks, Drive, Docs y Sheets.
- [x] Aprobaciones escritas para cambios de Google.
- [x] Fotos/screenshots, captions, álbumes pequeños y contexto visual reciente.
- [x] Notas de voz con transcripción local en inglés y español.
- [x] Reacciones nativas, automáticas para tareas de Google y opcionales en chat.
- [x] CLI de escritorio, diagnóstico y pruebas de límites del runtime.

## Fase 2 — Conversación y trabajo independiente

- [x] Decisión del modelo: responder directamente o iniciar una investigación.
- [x] Acuse de recepción antes de arrancar una tarea guardada.
- [x] Contexto de trabajo independiente mientras el chat sigue disponible.
- [x] Checkpoints persistentes para continuar investigaciones largas.
- [x] Estado, aclaraciones del propietario, cancelación y reanudación.
- [x] Notificaciones de hallazgos relevantes, bloqueos y resultados.
- [x] Lecturas de Gmail paginadas y conteos reales en lugar de estimaciones.
- [x] Seguimiento separado de asuntos/resúmenes y cuerpos de correos.
- [x] Impedir un resultado completo si queda cobertura pendiente de inspección.
- [x] Herramientas de fondo limitadas a investigación/lectura.
- [ ] Evaluar la decisión de delegar con más tareas reales y afinarla.
- [ ] Extender el seguimiento de cobertura a otras colecciones de Google.

- [x] Resúmenes por tema, límites de lectura en lenguaje sencillo y contadores privados.
- [x] Suma decimal exacta con referencias de origen y rechazo de fuentes repetidas.
- [ ] Evaluar periódicamente prioridades y exactitud con correos reales; la suma no verifica por sí sola la extracción ni deduplica avisos con IDs diferentes.

- [x] Registro privado de fuentes y hallazgos con citas vinculadas a cada tarea.
- [x] Composición basada en evidencia y auditoría aislada, con recuperación por etapa.
- [x] Misma verificación para hallazgos intermedios; sin envío directo del investigador.
- [x] Casos fijos reproducibles para los errores observados.
- [x] Selección explícita de hallazgos, omisiones privadas y propuestas desde un catálogo de capacidades.
- [x] Dos llamadas de publicación en el recorrido normal, métricas por etapa y evaluación comparativa.
- [ ] Política de retención para fuentes y artefactos privados en SQLite.
- [ ] Evaluar verificador independiente y extender el control a reformulaciones del chat.
- [x] Variante experimental con autor unificado y correcciones materiales devueltas al mismo rol.
- [x] Formato de texto plano y notificador experimental con estado persistido por burbuja.
- [x] Ensayos aislados con casos nuevos y repetición en sombra de evidencia real guardada.
- [ ] Aprobar calidad de la variante y preparar piloto reversible con tareas nuevas; no está desplegada.
- [ ] Escalar comprobaciones a paquetes mayores de 200 KB sin perder contradicciones ni bloquear innecesariamente.

## Fase 3 — Navegador en el Mac

- [x] Búsqueda y lectura con extensión en el perfil local de Chrome y sesiones existentes.
- [x] Prototipo opt-in de clics/formularios con aprobación por paso y snapshot de controles. Piloto desplegado; validado con datos ficticios en Chrome y Claude.
- [x] Verificar en Chrome real campos, checkbox y envío con datos ficticios; ver docs/browser-validation.md.
- [x] Recargar 0.2.1 y confirmar en Chrome el destino correcto de los 13 controles del formulario.
- [x] Probar el recorrido con Claude y desplegar un piloto selectivo con respaldo.
- [x] Corregir fragmentación URL/caption de Photon y verificar una sola pestaña/propuesta con Claude.
- [ ] Confirmar desde iMessage la entrada agrupada y ejecución sin códigos.
- [x] Ejecución de pasos del encargo directo sin códigos, con snapshot único y verificación; interpretación del alcance por el modelo.
- [ ] Reanudación autónoma duradera de gestiones y validación amplia de alcance en portales reales.
- [ ] Perfiles separados para cada identidad/cuenta.
- [x] Conservar pestaña ante login/CAPTCHA detectado y pedir intervención humana.
- [x] Volver a leer la misma pestaña al retomar una tarea tras el aviso del propietario.
- [x] Guardar fuentes web de tareas de fondo para el circuito de verificación.
- [ ] Validar relevo con distintos proveedores y recuperación tras reiniciar Chrome.
- [ ] Verificar resultados y guardar evidencia útil de futuras acciones de escritura.
- [ ] Reglas claras para acciones irreversibles, envíos y compras.

## Fase 4 — Completar gestiones

- [ ] Prioridad del propietario: ejecutar gestiones online de principio a fin, con estado persistente y relevo mínimo; ver [contrato de producto](docs/online-errands.md).
- [ ] Localizar facturas y comprobar el saldo real en el proveedor.
- [ ] Preparar pagos con importe, destinatario y método; ejecución tras aprobación.
- [ ] Gestionar cancelaciones y solicitudes de reembolso.
- [ ] Distinguir solicitud enviada, confirmación del proveedor y dinero recibido.
- [x] Persistir intentos, aprobaciones, bloqueos y evidencia de pasos del prototipo.
- [ ] Criterios de cierre de cada gestión, reanudación autónoma y evidencia del resultado completo.

## Fase 5 — Proactividad que persiste

- [ ] Scheduler duradero para recordatorios y seguimientos.
- [ ] Monitoreo de correo y calendario con frecuencia y alcance configurables.
- [ ] Avisos por cambios relevantes, sin repetir estados que no cambiaron.
- [ ] Horarios de silencio y controles de frecuencia.
- [ ] Detección de tareas bloqueadas y de seguimientos vencidos.

## Fase 6 — Cuentas y Google ampliado

- [ ] Google Workspace adicional y correo empresarial.
- [ ] Aislamiento de credenciales, memoria, sesiones y permisos por identidad.
- [ ] Archivado por lotes, filtros de Gmail y baja de suscripciones.
- [ ] Más operaciones de Calendar, incluidas modificaciones e invitaciones.
- [ ] Más formato en Docs, fórmulas y gráficos en Sheets.
- [ ] Pruebas conectadas de escritura en cuentas y datos de prueba.

## Fase 7 — Experiencia y fiabilidad

- [ ] Panel de escritorio para tareas, sesiones, aprobaciones y diagnósticos.
- [ ] Editar, exportar y borrar memoria e historial de forma explícita.
- [ ] Recuperación guiada de `needs_review`, sin duplicar acciones externas.
- [ ] Mejor feedback mientras una tarea larga se ejecuta o espera al usuario.
- [ ] Mejor transcripción de notas cortas, nombres y ruido de fondo.
- [ ] PDFs/documentos y, posteriormente, video.
- [ ] Respuestas de audio opcionales.
- [ ] Onboarding y verificación automática de dependencias/configuración.
- [ ] Ampliar las pruebas de fallos de conexión, reinicios y recuperación.


### Navegador: regresión de controles

- [x] Radios/checkboxes con estado checked observable y verificación posterior.
- [x] Distinguir rechazos previos a una acción de intentos con resultado desconocido.
- [x] Regresión reproducible del formulario completo con datos ficticios.
- [x] Evaluar CuaDriver instalado: permisos y lectura AX de Chrome comprobados.
- [x] Adaptador CUA como ejecutor por defecto en turnos interactivos, con ventana
  vinculada, exclusión, observación antes/después y detección de Mac bloqueado.
- [x] Regresión Claude Code + CUA + Chrome real: texto, radio, casilla, select,
  canvas sin accesibilidad y envío único verificado por el servidor.
- [ ] Ampliar CUA a diálogos de archivos/aplicaciones externas con pruebas reales.
- [ ] Validar arranque de CuaDriver tras reinicio/login del Mini.
- [ ] Confirmación del propietario por iMessage con CUA activo.
