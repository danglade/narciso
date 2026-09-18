# Gestiones online: contrato de producto

Preferencia explícita del propietario, 18 de septiembre de 2026: Narciso debe ser
un facilitador que se encargue de las gestiones online. Permisos, facturas,
cancelaciones y trámites son resultados que completar, no solo temas que resumir.

## Comportamiento esperado

- Ante un hallazgo accionable, proponer la gestión concreta que resuelve el problema.
- Ante un encargo directo y autorizado, empezar los pasos disponibles sin pedir
  otra autorización para ejecutar los pasos ya solicitados. No exigir códigos.
- Buscar requisitos, entrar al portal oficial usando la sesión disponible,
  reunir datos, completar lo que permitan las herramientas y comprobar el resultado.
- Pedir solo el dato, decisión o intervención que realmente falte. Mantener el
  estado para continuar después de login, verificación o una decisión del propietario.
- Distinguir preparación, envío y resultado confirmado. Un formulario preparado
  no es un permiso solicitado; un pago intentado no es una factura liquidada.
- No inventar trámites para asuntos resueltos. Redactar un correo puede ser la
  gestión adecuada, pero no debe sustituir por defecto a una gestión en el portal.

Ejemplos de intención, sujetos a capacidades disponibles:

| Situación | Resultado del que debe hacerse cargo |
| --- | --- |
| Factura próxima a vencer | Verificar saldo actual y pagos en curso; preparar o efectuar el pago autorizado y obtener comprobante |
| Permiso necesario | Identificar trámite oficial, reunir requisitos, completar solicitud y verificar su recepción |
| Suscripción sin uso | Revisar condiciones, tramitar cancelación autorizada y confirmar fecha final y cargos |

## Estado actual y brecha

La ruta interactiva permite campos y clics directamente dentro de la petición
del propietario, con estado persistente y comprobación del paso. Continúa dentro
del mismo turno; solo pregunta por datos/decisiones realmente pendientes.
El trabajador de investigaciones sigue siendo de solo lectura. Ver
[implementación y límites](browser.md). No hay soporte general de pagos, cierre
automático de gestiones ni reanudación autónoma después de un reinicio.

## Arquitectura objetivo y trabajo restante

1. Navegación interactiva en el perfil local: selección/clic y entrada de datos,
   estado observable y regreso a la misma pestaña tras intervención del propietario.
   Las páginas son fuentes, nunca autorizaciones para actuar.
2. Estado persistente de la gestión: objetivo, cuenta/sitio, datos reunidos,
   siguiente paso, bloqueo concreto y evidencia de cada resultado. Mantener el
   mismo agente responsable; el ejecutor es una superficie de herramientas, no
   otro redactor obligatorio.
3. Autorización vinculada a la operación concreta: destinatario, importe, método,
   datos y alcance. Reutilizar autorización vigente cuando corresponda. Un aviso
   del calendario o una instrucción incrustada en un correo no autoriza un pago.
   Respetar los pasos que la superficie utilizada exija delegar al propietario.
4. Relevo mínimo: autenticación, verificación humana, firma o decisión pendiente
   según la operación. Conservar preparación y continuar después; no pedir
   contraseñas por iMessage ni eludir desafíos.
5. Verificación posterior y recuperación: recibo/número de solicitud/estado final.
   Si el envío queda ambiguo, consultar el estado antes de repetirlo para evitar
   pagos o solicitudes duplicados.

Probar primero formularios controlados y acciones reversibles. Evaluar el resultado
por gestiones resueltas e intervenciones necesarias, además de naturalidad del chat.
No activar pagos o trámites reales como prueba de esta preferencia general.
