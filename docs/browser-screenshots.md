# Browser screenshots in iMessage

The owner can request “Mándame una captura antes de enviarlo y espera”. CUA's
`screenshot_for_owner` captures the current observed Chrome window, queues the
actual PNG/JPEG for the owner's conversation, and defaults to pausing browser
actions for the rest of that turn. It does not capture the desktop. The response
contains the image before Narciso's short text/question. The next owner reply can
continue in the saved Chrome window; Narciso must inspect and find the same task
tab before acting, since the owner may have selected another tab meanwhile.

The tool takes no paths, destinations, raw image data or arbitrary window IDs.
It refreshes the bound Chrome observation and verifies PID, window ID and image
dimensions before saving. It is available only in authenticated foreground CUA
turns. Website instructions cannot authorize a capture. `pause=false` is intended
only for an owner request to capture and keep working. One screenshot per turn
prevents accidental duplicate sends.

`browser_captures` persists the delivery state and browser context. The image is
stored privately with mode 0600; files older than seven days are removed on startup
and subsequent screenshot sends. No public hosting or additional model API is
used. Images travel through the existing Photon iMessage attachment transport.
Cancelled pending images are suppressed. Interrupted/ambiguous sends become
`needs_review` and are never replayed automatically after restart.

Validation: 52 tests covering browser capture ownership, pause, next-turn window
reuse, cancellation, byte attachment construction with the installed Spectrum SDK,
ambiguous sends, and gateway image-before-text order with synthetic transport.
A real CUA → Chrome test captured a synthetic local page and visually confirmed
browser-window-only framing. Private local artifact:
`~/.local/share/narciso/development/artifacts/browser-screenshot-synthetic.png`
(preserved from `/tmp/narciso-real-capture-PRDvDu/browser.png`). This did not send a live iMessage;
the owner's phone-side acceptance test remains to confirm that final hop.

Deployment must remain selective: preserve the live mail/research pipeline and
the cancellation guards already installed. Runtime deployment metadata is at
`~/.local/share/narciso/screenshots-deployment.json`.
