# Lead registration: contract and integration boundaries

`AgencyBot - Registrar Lead v4.json` is the included dependency for the primary workflow's `Registrar_Lead` tool. It is an inactive portfolio export, not a validated production service. Local tests exercise exported code and configuration, not the n8n runtime or live providers. Sheets registration is represented; Meta CAPI sending and safe Chatwoot label synchronization are **not complete implementations**.

## Bind the included dependency in staging

Import all four exports into an isolated n8n instance with non-production accounts and keep them inactive during review. In `AgencyBot - Flujo 1 v3.json`, open the `Registrar Lead` tool and select the imported `AgencyBot - Registrar Lead v4` workflow instead of `YOUR_REGISTRAR_LEAD_WORKFLOW_ID`. The placeholder does not automatically resolve to the imported dependency. Verify the tool's input mappings and returned output in your n8n version; no compatible runtime version or end-to-end execution has been established.

Configure Sheets credentials through n8n's credential store, replace `YOUR_GOOGLE_SHEETS_LEADS_ID`, and verify the `Leads` tab, headers and lookup/write behavior. Use synthetic data only. Do not reconnect the retained Chatwoot label node or bypass the CAPI gate to make a smoke test pass.

## Input and row selection

The trigger expects one item with these fields:

- Identity/routing: `sessionid`, `conversation_id`.
- Profile: `nombre`, `negocio`, `giro`, `ciudad`, `tiene_web`, `url_web`.
- Qualification: `servicio_interes`, `segmento`, `senal_presupuesto`, `paquete_recomendado`, `elegible_offmenu`, `disclosure_confirmado`, `etapa`, `score`.
- CRM annotations: `etiquetas`, `notas`.

`Validar Entrada` runs before lookup or writes. It rejects non-scalar values, trims scalar text, and treats null-like values as empty. `sessionid` is required: one leading `+` is removed and the remainder must be 8–15 digits with a nonzero first digit. This is syntax validation, not proof of phone ownership or account authorization. Optional `conversation_id` must be a positive safe integer in decimal notation; blank/null-like values are allowed. It is not an authorization check.

`Buscar Lead` retrieves all rows for the normalized `WhatsApp`, not just the first match. The resolver verifies returned phone values and, when supplied, selects by exact `Servicio`. Without a service, only one phone-matched row may be updated. Multiple matching rows abort as ambiguous. Creating a row requires `servicio_interes`. An existing row must have a safe integer `row_number` of at least 2. `Actualizar Lead` matches on that validated row number, not on the phone alone; `Crear Lead` appends when no match exists.

## Partial merge and Sheets schema

Absent fields, actual `null`, literal `'null'` (case-insensitive after trimming), empty strings and whitespace-only input preserve existing mapped values. They are not requests to erase fields. There is no explicit clear-field operation. `0` and `false` remain supplied values and are written as strings.

On update:

- `Fecha` and `Followups Enviados` are preserved from the existing row rather than reset.
- `Conversation ID` changes only when an explicit valid value is supplied; missing/null/blank input preserves it.
- Supplied profile/qualification/annotation fields replace their mapped values, except `Etiquetas`: supplied comma-separated label tokens are unioned with existing CRM tokens, trimmed and deduplicated.
- `Ultima Interaccion` is always refreshed with the resolver's current ISO timestamp. It is **not evidence of the latest inbound message** and cannot alone establish WhatsApp follow-up eligibility.

On create, `Fecha` and `Ultima Interaccion` use the current timestamp, `Followups Enviados` is `'0'`, and unsupplied mapped fields are empty strings. The mapped headers are:

```text
Fecha, WhatsApp, Servicio, Nombre, Negocio, Giro, Ciudad, Tiene Web,
URL Web, Segmento, Senal Presupuesto, Paquete Recomendado,
Elegible Offmenu, Disclosure Confirmado, Etapa, Score, Etiquetas,
Notas, Conversation ID, Followups Enviados, Ultima Interaccion
```

Both write nodes receive merged string cell values and use Sheets `RAW` mode; the update locator `row_number` is numeric metadata, not a lead cell value. RAW is intended to store formula-like strings as text rather than execute them at this write boundary. Verify that behavior in staging; it does not sanitize later CSV exports, copied cells or downstream formula-enabled consumers. Validate headers and types against the actual n8n Sheets node rather than relying on automatic coercion.

**This is a read/merge/write sequence, not an atomic upsert.** There is no transaction, uniqueness constraint, compare-and-swap or mutual exclusion. Concurrent calls can append duplicate leads or overwrite each other's changes. A validated row number does not protect against insertion, deletion, sorting or movement of rows between lookup and update; the wrong row could be changed. For stronger guarantees, consider a transactional database with a unique logical key and a controlled Sheets projection, or a serialized writer covering all mutations with explicit row-identity revalidation. These are integration options, not safeguards provided here; manual/external writers must be accounted for too.

## CAPI: unconditionally blocked

`Configuracion CAPI (confiable)` is a separate Set node, not an LLM/trigger consent interface. It contains `enabled: false`, `consent_verified: false`, `durable_idempotency_ready: false`, and empty `event_id`/`event_time` placeholders. Naming these fields does not implement trusted consent or a ledger.

`Preparar Evento CAPI` always returns `skip: true` and `capi_status: 'blocked'`, without constructing a CAPI payload or hashing identifiers. `Enviar CAPI?` has a constant-false condition. **Changing `enabled` does not enable sending**, even if the other flags are also changed. The retained HTTP node is unreachable through the normal exported graph; its URL/API version, authentication and provider compatibility have not been runtime validated.

The stage map is only future event-name metadata: `nuevo`/`clasificado` map to `Lead`; `cita_agendada`/`llamada_agendada` map to `Schedule`. No event is emitted for these stages in this export.

Before considering any change to preparation or the gate, choose and implement a trusted integration, for example an authenticated internal service or a deterministic subworkflow backed by protected consent records and a durable database. It must provide:

1. Verified consent with identity, purpose, provenance and revocation handling outside LLM-controlled fields. `disclosure_confirmado` is not trusted consent.
2. Deterministic event authorization, a stable validated event ID and the original event timestamp, not a fresh timestamp on each retry.
3. A durable idempotency ledger with an atomic claim/unique key, persisted processing outcomes and recovery for crashes or ambiguous POST results. A stable event ID alone is not durable deduplication or an exactly-once guarantee.
4. Provider-specific payload normalization/hashing, secure credential storage, supported API validation, retention policy and explicit handling of errors/retries without blind POST replay.

None of that infrastructure is implemented here. Prefer leaving CAPI blocked, or delegating delivery to a separately reviewed service, over treating a configuration toggle as consent/idempotency enforcement. Test failure, duplicate, revocation and recovery paths before any activation.

## Chatwoot labels: deliberately disconnected

`Etiquetar Chatwoot` remains in the export for reference but has no incoming graph connection. Its POST can replace the conversation's existing label collection, so reconnecting it could erase labels owned by humans or other automations. Empty label lists are not a safe fallback. The CRM's token union only changes the Sheets `Etiquetas` cell; it does not synchronize Chatwoot.

Options before enabling label synchronization:

- Keep labels CRM-only and leave Chatwoot mutation disconnected.
- Use a provider-supported additive label operation **if available and verified** for the deployed version.
- Build a trusted reader/merger/writer that preserves existing labels, validates conversation/account ownership, avoids empty replacement lists, and coordinates concurrent mutations through serialization or supported conditional writes. A naive GET/merge/POST sequence still has a lost-update race; a local lock cannot protect against uncoordinated external writers.

Choose and test an approach before wiring the node. Safe concurrent label synchronization is not implemented by this export.

## Response semantics

The normal path reaches `Respuesta` only after a Sheets write. Its expected exported-path result is:

```json
{
  "status": "crm_ok_capi_blocked",
  "crm_status": "ok",
  "capi_status": "blocked",
  "capi_error": "trusted_consent_and_durable_idempotency_integration_required",
  "labels_status": "skipped_unsafe_replace",
  "message": "CRM registrado/actualizado; CAPI: blocked"
}
```

- `crm_status: 'ok'` means execution reached the response after the CRM write node. Validation, ambiguity or Sheets failures stop execution; no structured CRM-error response is implemented here.
- `capi_status: 'blocked'` describes the unconditional safety block, not a successful conversion delivery.
- `labels_status: 'skipped_unsafe_replace'` explicitly means no Chatwoot label mutation was performed.
- The response code can classify synthetic/future provider output as `capi_status: 'sent'` with `status: 'ok'` only for `events_received === 1` without an error. Missing/malformed/error output becomes `capi_status: 'error'` and `status: 'partial_error'`, with `capi_error`. Those branches are locally tested, not evidence that sending is enabled or a provider has accepted anything.

Consumers must inspect the separate statuses rather than interpret a CRM success as successful CAPI or labeling. The blocked normal path is intentional, not a completed multi-provider registration.

## Local verification and remaining work

From the repository root:

```bash
node --test tests/*.test.cjs
```

The tests execute reviewed exported code with mocked n8n bindings and synthetic data, inspect mappings/graph configuration, and classify mocked responses. They do not execute Sheets/Chatwoot/Meta nodes, prove n8n coercion or item linking, simulate real concurrent writers, or establish production security. Node `vm` is not a sandbox for arbitrary untrusted code.

Before deployment, validate the imported caller/dependency interface, actual Sheets RAW behavior and row numbers, authorization, timestamps, failures and recovery in staging. Keep the optional integrations blocked/disconnected until their chosen designs are implemented and independently verified. Review the wider [security boundaries](security.md). No production resolution or measured commercial outcome is claimed.
