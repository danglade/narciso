# 1Password CLI integration research

Date: 2026-09-18. Status: researched, not installed or implemented.

## Recommendation

Use the official `op` CLI behind a local credential broker with a service account
restricted to read_items in a new dedicated Narciso vault. Expose a login action
to Claude, never a general secret-reading tool or arbitrary CLI execution.
Service accounts cannot access the built-in Personal/Private/Employee vault or
the default Shared vault. Explicitly copy/select only delegated logins into the
new vault, and account for password rotation if duplicated items are retained.

Desktop app integration is suitable for attended use, not a guarantee of
unattended service operation: terminal-session authorization expires after ten
minutes of inactivity, has a twelve-hour hard maximum, and is revoked when the
app locks. Service-account authentication uses a token independently of that UI.
It does not unlock macOS, provide SMS codes, or fix Chrome/CUA crashes.

## Host findings

`op` was not found on PATH, /opt/homebrew/bin/op, or /usr/local/bin/op.
/Applications/1Password.app was not present. The Chrome profile metadata does
list the 1Password extension. No account, vault, subscription or secret inspected.

## Proposed flow (not implemented)

1. Authenticated owner request selects an approved account alias and existing tab.
2. Broker maps alias to configured vault/item IDs; it does not accept arbitrary
   op:// paths, shell text, domains, or commands originating in a web page.
3. Independently verify the actual HTTPS origin, exact tab/frame, password field,
   and target focus. A screenshot/model-supplied URL is insufficient verification.
   Specify approved identity-provider redirects explicitly. Stop if target changes.
4. Broker invokes a fixed op executable with an argument array (no shell), using
   op read for required fields or op item get --otp for a configured TOTP item.
   CLI stdout is private process memory, never model-visible tool output.
5. Deliver through a dedicated secret-input path bound to that verified target;
   suppress secret-bearing tool arguments, CUA recordings/echoes, and screenshots
   during entry. Return only filled/authenticated/needs-owner/failed states.
6. Resume ordinary browser work after independently verifying the login state.
   A filled field alone does not establish authentication. Do not replay uncertain
   login submissions or code requests; bound attempts and retain the same tab.

The service token should be provisioned directly into an OS credential store
and passed only to the op subprocess. Do not expose it in the Claude environment,
source tree, launch-agent plist, chat, or command-line arguments. Test Keychain
access for the actual launchd service and reboot conditions. This contains access;
it is not isolation from all code running as the same macOS user.

## Existing implementation gaps

src/cua.mjs serializes all action arguments to cua_actions.parameters, and can
return driver errors/content. Generic type_text MUST NOT carry real secrets.
src/trace.mjs redacts named password/token fields, but does not reliably redact
an arbitrary password in a text argument or a JSON-encoded string. Redaction of
traces alone would not protect the independent SQLite action log.
Model instructions currently require login/OTP handoff. Modify that instruction
only when the dedicated credential operation and its target checks are available.
CUA visual mode still lacks a machine-verified URL/frame/field binding for secret
entry. Decide and test that mechanism before promising universal browser login.
Audit CuaDriver's own recording/logging and all error paths, not just Narciso logs.

## Cost and limits

Official 1Password Developer page says developer tools are included in every
plan, including Individual and Families. Service-account docs specify 1,000
requests per day per Individual/Family account (some CLI commands make multiple
requests), and hourly read/write limits. No Business upgrade appears necessary
for this use case; the owner's account entitlement has not been verified.
Claude subscription remains separate; this design adds no model API dependency.

## Acceptance tests before any real account

- Dedicated dummy Login item: retrieve/fill/submit a local password fixture once.
- A known fake secret must be absent from SQLite, model transcripts, tool results,
  stderr, crash/error reports, recordings and screenshots retained by our stack.
- Wrong domain, cross-origin frame, focus switch, navigation and missing origin
  proof must refuse before the secret is sent.
- Missing/revoked/expired token, rate limit and missing item fail with safe errors.
- Service restart does not replay a login or expose cached secrets.
- Then one owner-selected real nonfinancial service; banks remain a separate
  compatibility acceptance test. TOTP support does not imply SMS/push/passkey support.

## Sources

- https://www.1password.dev/cli
- https://www.1password.dev/cli/app-integration-security
- https://www.1password.dev/service-accounts/get-started
- https://www.1password.dev/service-accounts/use-with-1password-cli
- https://www.1password.dev/service-accounts/rate-limits
- https://www.1password.dev/cli/reference/commands/read
- https://www.1password.dev/cli/reference/management-commands/item
- https://1password.com/developer-security
