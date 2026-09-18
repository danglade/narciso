# Narciso: continuation across sessions and worktrees

Start by reading `docs/HANDOFF.md`, `docs/worktrees.md` and `TODO.md` in this
checkout. These are tracked continuation documents; do not depend on the previous
agent's conversation history. Read the feature-specific documents linked there
before changing the corresponding subsystem.

Identify the execution host (`scutil --get LocalHostName` on macOS). On the owner's
Mac Mini, shared private context and artifacts live outside any Git worktree:

- `~/.local/share/narciso/development/README.md`: private artifact index.
- `~/.local/share/narciso/app/CONTEXT.md`: deployed personal context.
- `~/.local/share/narciso/app/.env`: deployed configuration; read only as needed
  and never print credentials or copy them into tracked files.
- `~/.local/share/narciso/data/`: live state, logs and evaluations. Inspect the
  database read-only when diagnosing; use isolated temporary data for tests.

Do not assume these paths exist or describe another computer. Private material
is not distributed through this public repository. On a different host, public
documentation remains available but local credentials/context require setup.

The running service and checkout can differ: browser features were deployed
selectively while mail/publication experiments remained in the checkout. Inspect
the current deployment manifests and live files before a deployment. A commit,
passing tests or creating a worktree does not deploy it. Do not replace the entire
live application merely to synchronize a worktree.

All local agents share one live Photon consumer and one Chrome profile. Never
start a second gateway or take over another agent's browser session. Use isolated
test databases/transports; coordinate live service or browser changes. Preserve
the user's existing authorization rather than asking for it again.

Never commit `.env`, `CONTEXT.md`, OAuth credentials, messages, databases, traces,
screenshots of real accounts or private evaluation output. Public examples and
fixtures must be synthetic. At the end of meaningful work, update the tracked
handoff document with what changed, validation, deployment status and remaining
work; put private evidence in the shared directory and index it there.
