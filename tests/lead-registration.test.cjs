'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const workflow = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../AgencyBot - Registrar Lead v4.json'), 'utf8'));
const node = name => { const n = workflow.nodes.find(n => n.name === name); assert.ok(n, name); return n; };
function run(name, json = {}, refs = {}, rows = [json]) {
  const code = node(name).parameters.jsCode;
  assert.equal(typeof code, 'string', `${name} must execute exported code`);
  const result = vm.runInNewContext(`(function(){${code}\n})()`, {
    $json: json, $input: { all: () => rows.map(json => ({ json })) },
    $: name => ({ first: () => ({json: refs[name]}), item: {json: refs[name]} }),
  });
  return JSON.parse(JSON.stringify(result))[0].json;
}
const valid = {sessionid: '+525512345678', conversation_id: '123', servicio_interes: 'web'};
const normalized = extra => {
  const validated = run('Validar Entrada', {...valid, ...extra});
  return Object.fromEntries(node('Normalizar Datos').parameters.assignments.assignments.map(a => {
    const value = vm.runInNewContext(a.value.slice(3, -2).trim(), {$json: validated});
    return [a.name, value === undefined || value === null ? '' : String(value)];
  }));
};
const merge = (input, rows) => run('Resolver y Fusionar Lead', {}, {'Normalizar Datos': input}, rows);
const old = {row_number: 8, WhatsApp: '525512345678', Servicio: 'web', Nombre: 'Ana', Fecha: '2025-01-01', 'Conversation ID': '12', 'Followups Enviados': '3', Notas: 'previas', Etiquetas: 'vip'};
test('validates keys before lookup and all effects', () => {
  assert.equal(workflow.connections.Trigger.main[0][0].node, 'Validar Entrada');
  assert.equal(workflow.connections['Validar Entrada'].main[0][0].node, 'Normalizar Datos');
  assert.equal(normalized().sessionid, '525512345678');
  for (const sessionid of ['', 'null', null, 'abc123', '00123456', '=123456789', '123', '1234567890123456']) assert.throws(() => normalized({sessionid}), /tel|WhatsApp/i);
  for (const conversation_id of ['x', '1/labels', '-1', '0', '=2', '9007199254740992']) assert.throws(() => normalized({conversation_id}), /conversation/i);
  for (const conversation_id of [undefined, null, 'null', '']) assert.equal(normalized({conversation_id}).conversation_id, '');
});
test('partial updates preserve missing/null fields and protected CRM metadata', () => {
  for (const nombre of [undefined, null, 'null', '']) {
    const result = merge(normalized({nombre, conversation_id: null, notas: null}), [old]);
    assert.equal(result.exists, true); assert.equal(result.row_number, 8);
    assert.equal(result.row.Nombre, 'Ana'); assert.equal(result.row.Notas, 'previas');
    for (const key of ['Fecha', 'Conversation ID', 'Followups Enviados']) assert.equal(result.row[key], old[key]);
  }
  assert.equal(merge(normalized({conversation_id: '456'}), [old]).row['Conversation ID'], '456');
  assert.equal(merge(normalized({score: 0, tiene_web: false}), [old]).row.Score, '0');
  assert.equal(merge(normalized({score: 0, tiene_web: false}), [old]).row['Tiene Web'], 'false');
});
test('resolves a single row by phone/service and rejects ambiguity or bad row numbers', () => {
  assert.equal(node('Buscar Lead').parameters.filtersUI.values.length, 1);
  assert.equal(node('Buscar Lead').parameters.options.returnFirstMatch, false);
  const other = {...old, row_number: 9, Servicio: 'ads'};
  assert.equal(merge(normalized(), [old, other]).row_number, 8);
  assert.equal(merge(normalized({servicio_interes: null}), [old]).row.Servicio, 'web');
  assert.throws(() => merge(normalized({servicio_interes: null}), [old, other]), /ambigu/i);
  assert.throws(() => merge(normalized(), [old, {...old, row_number: 9}]), /ambigu/i);
  for (const row_number of [0, 1, -1, '2x', null, 2.5, '9007199254740992']) assert.throws(() => merge(normalized(), [{...old, row_number}]), /row_number/);
  assert.throws(() => merge(normalized(), [{...old, WhatsApp: '521111111111'}]), /WhatsApp/);
  assert.throws(() => merge(normalized({servicio_interes: null}), [{}]), /servicio/i);
  const created = merge(normalized(), [{}]); assert.equal(created.exists, false); assert.equal(created.row['Followups Enviados'], '0');
});
test('writes RAW string values and updates only validated row_number', () => {
  const result = merge(normalized({nombre: '=IMPORTXML("x")', notas: '+SUM(1,2)'}), [old]);
  assert.equal(result.row.Nombre, '=IMPORTXML("x")');
  for (const name of ['Actualizar Lead', 'Crear Lead']) {
    const p = node(name).parameters; assert.equal(p.options.cellFormat, 'RAW');
    assert.ok(p.columns.schema.some(column => column.id === 'Servicio' && column.type === 'string'), `${name}: Servicio schema`);
    for (const [key, expr] of Object.entries(p.columns.value)) {
      assert.equal(expr, key === 'row_number' ? '={{ $json.row_number }}' : `={{ $json.row[${JSON.stringify(key)}] }}`);
    }
  }
  assert.deepEqual(node('Actualizar Lead').parameters.columns.matchingColumns, ['row_number']);
  assert.ok(Object.values(result.row).every(v => typeof v === 'string'));
});
test('CAPI uses trusted separate configuration and stays unconditionally blocked for every supported stage', () => {
  const config = node('Configuracion CAPI (confiable)'); assert.equal(config.type, 'n8n-nodes-base.set');
  const policy = Object.fromEntries(config.parameters.assignments.assignments.map(a => [a.name, a.value]));
  assert.equal(policy.enabled, false); assert.equal(policy.consent_verified, false);
  assert.equal(policy.durable_idempotency_ready, false); assert.equal(policy.event_id, ''); assert.equal(policy.event_time, '');
  assert.ok(!node('Trigger').parameters.workflowInputs.values.some(v => /consent|capi|event_id|idempotency/.test(v.name)));
  for (const [etapa, event_name] of Object.entries({nuevo:'Lead', clasificado:'Lead', cita_agendada:'Schedule', llamada_agendada:'Schedule'})) {
    const result = run('Preparar Evento CAPI', {}, {'Resolver y Fusionar Lead': {row:{Etapa:etapa}}, 'Configuracion CAPI (confiable)': {...policy, enabled:true, consent_verified:true, durable_idempotency_ready:true, event_id:'forged'}});
    assert.equal(result.skip, true); assert.equal(result.capi_status, 'blocked'); assert.equal(result.event_name, event_name); assert.equal(result.data, undefined);
  }
  for (const etapa of ['constructor', 'toString', '__proto__', 'unknown']) {
    const result = run('Preparar Evento CAPI', {}, {'Resolver y Fusionar Lead': {row:{Etapa:etapa}}, 'Configuracion CAPI (confiable)': policy});
    assert.equal(result.event_name, '');
    assert.equal(result.skip, true);
  }
  assert.equal(node('Enviar CAPI').parameters.jsonBody, '={{ JSON.stringify({ data: $json.data }) }}');
  assert.equal(node('Enviar CAPI').retryOnFail, false);
  assert.equal(node('Enviar CAPI?').parameters.conditions.conditions[0].leftValue, '={{ false }}');
});
test('response distinguishes CRM success from CAPI failure, malformed responses and blocked sends', () => {
  for (const input of [{error:{message:'timeout'}}, {body:{error:{message:'denied'}}, statusCode:400}, {}, {events_received:0}, {skip:true,capi_status:'blocked',error:'timeout'}, {body:null}]) {
    const r = run('Respuesta', input); assert.equal(r.crm_status, 'ok'); assert.equal(r.status, 'partial_error'); assert.equal(r.capi_status, 'error'); assert.ok(r.capi_error);
  }
  const blocked = run('Respuesta', {skip:true,capi_status:'blocked',capi_error:'integration_required'});
  assert.equal(blocked.crm_status, 'ok'); assert.equal(blocked.capi_status, 'blocked');
  assert.equal(run('Respuesta', {events_received:1}).capi_status, 'sent');
});
test('safe graph: no label mutation, inactive export, no pinned data, documented pending infrastructure', () => {
  assert.equal(workflow.active, false); assert.deepEqual(workflow.pinData, {});
  const targets = Object.values(workflow.connections).flatMap(c => c.main.flat().map(e => e.node));
  assert.ok(!targets.includes('Etiquetar Chatwoot'));
  for (const name of ['Actualizar Lead','Crear Lead']) assert.equal(workflow.connections[name].main[0][0].node, 'Configuracion CAPI (confiable)');
  assert.equal(workflow.connections['Buscar Lead'].main[0][0].node, 'Resolver y Fusionar Lead');
  const note = node('Sticky Note').parameters.content;
  for (const term of ['consent', 'idempot', 'concurrencia', 'etiquet']) assert.match(note.toLowerCase(), new RegExp(term));
});
