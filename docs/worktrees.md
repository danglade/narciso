# Continuar desde otra sesión o worktree

`AGENTS.md` es la entrada automática para un agente nuevo. El código, la
personalidad pública, el roadmap, los documentos de arquitectura, las pruebas y
los handoffs están versionados. Un worktree creado desde `main` después de este
commit recibe esos archivos, aunque su conversación no tenga el historial anterior.

Para un worktree ya existente, incorpora `main` mediante merge/rebase según su
trabajo pendiente. Para otra copia del repositorio, primero `git fetch origin`.
Crear una rama desde una revisión antigua no incorpora documentos nuevos por sí
solo; debe partir de `main` actualizado o incorporar estos commits.

## Contexto compartido en el Mini

El contexto personal, las credenciales y los resultados privados permanecen fuera
del repositorio público. Los worktrees de la misma cuenta de macOS pueden acceder
a las mismas rutas, sin duplicar secretos:

| Contenido | Ruta compartida |
| --- | --- |
| Índice de material privado y evidencias | `~/.local/share/narciso/development/README.md` |
| Contexto personal usado por el servicio | `~/.local/share/narciso/app/CONTEXT.md` |
| Configuración activa | `~/.local/share/narciso/app/.env` |
| Estado y logs | `~/.local/share/narciso/data/` |
| Evaluaciones de navegador | `~/.local/share/narciso/evaluations/` |
| Evaluaciones de conversación | `~/.local/share/narciso/data/evaluations/` |
| Manifiestos de despliegue | `~/.local/share/narciso/*-deployment.json` |

Estas rutas sobreviven al cierre de una sesión o a eliminar un worktree. No se
sincronizan por Git y no aparecerán automáticamente en otro ordenador. Los
archivos en `/tmp` citados en notas antiguas son temporales; el índice compartido
señala las copias conservadas de los artefactos recientes importantes.

`CONTEXT.example.md` y `.env.example` son las plantillas públicas. No es necesario
copiar la configuración real a cada worktree para leer documentos o ejecutar las
pruebas locales. Evita apuntar tests o una segunda instancia al estado de producción.

## Estado que debe distinguir el siguiente agente

El commit de `main` reúne todo el trabajo local, incluidos experimentos que no se
han desplegado. `docs/HANDOFF.md` y los manifiestos indican qué está en producción.
Las variantes de `experiments/` y los cambios de publicación requieren su propia
evaluación antes de cambiar el servicio. Una actualización de Git no debe ejecutar
el instalador ni reiniciar Narciso automáticamente.

Antes de terminar una sesión, actualiza el handoff versionado y el índice privado
si agregaste evidencia local. De esa forma la continuidad depende de archivos
accesibles y del estado verificado, no de recordar una conversación.
