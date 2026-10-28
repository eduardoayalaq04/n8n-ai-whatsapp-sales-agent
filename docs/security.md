# Security and production boundaries

## Publishing versus running

This repository is a sanitized portfolio reference, not an authorized public-facing service. No live credential is required for local tests. A static scan cannot prove that all possible sensitive data is absent, and it does not validate external deployment configuration.

- Keep tokens, secrets, provider responses, real messages, customer identifiers and populated configuration out of Git.
- Use n8n's credential store and dedicated staging accounts. Use minimal OAuth scopes and restrict Calendar/Sheets access.
- Keep imported workflows inactive until the dependency, schemas, authentication and synthetic integration tests have been reviewed.
- All examples and commercial catalog values are illustrative. Do not treat the prompt as evidence of customer outcomes or as an authorized offer.

## Historical content and attribution

The initial commit retains a local-machine author address and the earlier commercial prompt. New commits use public GitHub noreply attribution, but that does not remove past metadata or content. No history rewrite was performed. Rewriting already-public history requires an explicit owner decision and cannot retract copies, forks or caches. Do not call HEAD-only edits complete erasure or anonymity.

## Required before production — not implemented safeguards

1. **Authenticated input:** verify webhook origin/authentication at a trusted boundary. `inbox.id` and other payload fields are not proof of origin. Document any reverse-proxy controls and reject unknown accounts/inboxes.
2. **Tool authorization:** enforce identity, allowed fields, confirmation, dates/durations and business rules in deterministic code outside the LLM. Prompt instructions do not prevent prompt injection.
3. **Calendar ownership:** bind event IDs to the authenticated conversation/lead, return availability without other customers' PII, and check conflicts immediately before mutation. Current event tools lack those checks.
4. **Idempotency/concurrency:** replace Redis GET/IF/SET with atomic claims and durable processing state. Atomically extract buffers and retain recoverable work. Current read/delete paths can duplicate or lose processing.
5. **Follow-up correctness:** update CRM counters only after confirmed delivery, handle ambiguous POST outcomes without blind retry, validate nonnegative integer counters, and separate inbound/outbound timestamps. Enforce opt-out, current human ownership and the actual WhatsApp messaging window immediately before send. Current workflow does not provide these guarantees.
6. **Memory/privacy:** namespace identifiers by account/inbox/conversation, normalize identity, restrict storage access and define TTL, retention, deletion and consent for PostgreSQL, Redis, Sheets, Calendar and Telegram. A context-window limit is not a deletion policy.
7. **Attachments:** validate scheme/host, redirects, DNS/private-address targets, MIME and size before download; apply outbound network restrictions. Current attachment URLs originate in the payload and lack a documented allowlist.
8. **Durable handoff and faults:** persist human handoff, recheck assignment before replies, redact/escape Telegram content, and handle Redis, download, STT, vision and delivery failures independently. Notification alone does not transfer control.
9. **Reminder delivery:** the selector now returns only valid, future, same-CDMX-day events with HTTPS meeting links and one positive conversation marker. This checks syntax, not identity: a single forged marker in an externally controlled Calendar description is still untrusted. Move routing into protected structured metadata; add `eventId + occurrence` idempotency, scoped time-range queries, success-based notes and safe retry behavior. All-day and voice-only events without links are deliberately excluded.
10. **Runtime validation:** verify n8n/node versions, Luxon/debounce duration semantics, Chatwoot timestamp formats, Calendar paging, WhatsApp template approval and voice-call versus Meet behavior. Local Code-node tests do not execute the n8n nodes.

## Review when Registrar_Lead is added

Inspect all credentials, URLs, identifiers, `pinData` and embedded code before reuse. Check input/output mappings, data types, `null` handling, upsert uniqueness, Sheets formula-injection protection, timestamps, counter preservation and concurrent updates. Then rerun secret scans and synthetic end-to-end tests. The export is currently missing; no stub impersonates a complete implementation.

## Verification boundaries

The current tests use synthetic fixtures and a fixed clock, execute only the reviewed reminder selector and make no network calls. Node `vm` is a test harness, not a security isolation boundary for arbitrary code. No live provider execution, deployment, business performance or production-security certification is claimed.
