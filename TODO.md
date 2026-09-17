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

## Fase 3 — Navegador en el Mac

- [ ] Control de un navegador local con sesiones persistentes.
- [ ] Perfiles separados para cada identidad/cuenta.
- [ ] Relevo humano visible para credenciales, MFA y CAPTCHA.
- [ ] Pausar y continuar la misma tarea tras completar el relevo.
- [ ] Verificar resultados y guardar evidencia útil de las acciones.
- [ ] Reglas claras para acciones irreversibles, envíos y compras.

## Fase 4 — Completar gestiones

- [ ] Localizar facturas y comprobar el saldo real en el proveedor.
- [ ] Preparar pagos con importe, destinatario y método; ejecución tras aprobación.
- [ ] Gestionar cancelaciones y solicitudes de reembolso.
- [ ] Distinguir solicitud enviada, confirmación del proveedor y dinero recibido.
- [ ] Guardar estado, evidencia y próximos pasos de cada gestión.

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
