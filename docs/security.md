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

## Lead-registration boundaries

The fourth export, `AgencyBot - Registrar Lead v4.json`, is included, inactive and has empty `pinData`. The caller still uses `YOUR_REGISTRAR_LEAD_WORKFLOW_ID`: select the imported workflow and verify its interface in staging. Inspect credentials, URLs, identifiers and embedded code before reuse, then rerun secret scans and synthetic end-to-end tests. No n8n runtime has been validated.

The exported merge preserves existing mapped fields when input is absent, `null`, literal `'null'` or blank, preserves `Fecha` and `Followups Enviados` on update, and changes `Conversation ID` only for a supplied valid value. `Ultima Interaccion` is the write-time timestamp, not verified latest-inbound time. Matching rejects ambiguous rows and updates a validated `row_number`. Sheets create/update use RAW string cell values to avoid formula interpretation at that write boundary; this does not sanitize later CSV exports or other consumers. There is no transaction, atomic uniqueness enforcement, lock or protection against concurrent row insertion, deletion, sorting or movement between lookup and update. Concurrent writers can create duplicates, lose updates or target the wrong row.

**CAPI is unconditionally blocked**, not merely disabled by configuration. Preparation returns `blocked` without constructing a payload or hashing identifiers, and the send gate is constant false. Changing `enabled`, consent flags or event IDs does not enable sending. Before any code/gate change, implement an external trusted consent source, deterministic authorization and a durable idempotency ledger with atomic claims, a stable validated event ID and original event time, plus recovery for ambiguous delivery outcomes. A stable event ID alone is not durable deduplication. LLM fields, including `disclosure_confirmado`, are not proof of consent. Do not blindly retry POSTs or assume the retained HTTP node is a complete supported integration.

**Chatwoot labels are disconnected** because the retained POST replaces the label collection and could erase existing labels. CRM label-token union does not update Chatwoot. Keep it disconnected unless a provider-supported additive operation or a trusted read/merge/write integration with concurrency controls has been implemented and tested; a naive GET followed by POST still races with other writers. Never send an empty replacement list as a fallback.

See [lead-registration contract and integration options](lead-registration.md) for the separate `crm_status`, `capi_status` and `labels_status` response fields and prerequisites. CRM errors stop execution rather than returning a fabricated success. None of these local checks resolves production readiness.

## Verification boundaries

Run `node --test tests/*.test.cjs`. Tests inspect export structure and execute reviewed reminder and lead-registration code using synthetic fixtures (with a fixed clock for reminder selection), mocked n8n bindings and no network calls. They check partial preservation, key/row ambiguity, RAW mappings, blocked CAPI, disconnected labels and response classification, not actual provider behavior. Node `vm` is a test harness, not a security isolation boundary for arbitrary code. No live provider execution, deployment, business performance or production-security certification is claimed.
