# Task cancellation

Implemented 2026-09-18. Direct owner text such as `para`, `cancela la tarea`,
`no hagas más nada`, `stop`, or `cancel this task` bypasses the model work queue.
The observed typo `no pera` is also recognized. Replies containing those commands
are supported; attachment contents, quotations and instructions from websites are
not treated as stop commands. Voice transcription does not use this fast path.

The stop applies to ongoing and queued work in that owner's conversation:

- Persist cancellation before waiting on network operations; discard buffered
  link/caption fragments and queued instructions.
- Abort foreground Claude and its process group, including MCP children.
- Cancel background jobs, pending notifications, approvals and browser errands.
  The existing background worker observes cancellation on its polling cycle.
- Recheck authority before tool calls, browser dispatch and outgoing reply chunks.
  Suppress late results even if a stopped worker returns successfully.
- Confirm briefly without invoking the model. A subsequent explicit new request
  starts normally. An ambiguous acknowledgment must not resume the stopped task.

Cancellation survives restart. It does not close unrelated browser tabs, sign out
accounts, undo completed work, or retract an action/message already dispatched.
The response mentions uncertainty when an action is known to be in flight. A CUA
operation already accepted by the native driver may finish; subsequent operations
are blocked. Delivery of the acknowledgment still depends on Photon/network health.

Ordinary action requests such as “cancel my subscription” are not emergency stops.
The parser intentionally matches standalone commands rather than guessing from
arbitrary text. Use a short text stop for immediate interruption.

Validation: real gateway control flow with a synthetic Photon transport and
synthetic assistant; active cancellation, discarded queued work, suppressed stale
success and a subsequent new turn. A subprocess test verifies Claude-wrapper
process-group termination with a child that ignores SIGTERM. Additional tests cover
notification cancellation during an outbound wait, persistence, conversation
isolation, buffered attachments and cancellation during CUA's awaited window check.
These tests do not contact live accounts or submit browser forms.

Deployment is selective. Preserve the live mail/research pipeline; apply only the
notification cancellation guard to the live `job-runner.mjs`, whose implementation
differs from the experimental checkout. Do not deploy the whole checkout.
