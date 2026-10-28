'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'AgencyBot - Confirmar Cita.json'), 'utf8'));
const code = workflow.nodes.find(node => node.name === 'Extraer Datos').parameters.jsCode;
const NOW = '2026-10-27T15:00:00.000Z'; // 09:00 CDMX
function run(items, now = NOW) {
  const instant = Date.parse(now);
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  const result = vm.runInNewContext(`(function () { ${code}\n})()`, {
    $input: { all: () => items }, Date: FixedDate, URL,
  }, { timeout: 1000 });
  assert.ok(Array.isArray(result), 'Extraer Datos debe retornar un array de items');
  return JSON.parse(JSON.stringify(result));
}
function event(overrides = {}) {
  return { json: {
    start: { dateTime: '2026-10-27T10:30:00-06:00' },
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    description: 'Prospecto\nCONVERSATION_ID: 123\nFin',
    summary: 'Cita - Ana - +12025550123', ...overrides,
  } };
}
function rejected(overrides) { assert.deepEqual(run([event(overrides)]), []); }

test('exports presentes: JSON válido, nombres únicos y conexiones existentes', () => {
  const files = fs.readdirSync(root).filter(file => file.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    assert.ok(Array.isArray(data.nodes), file);
    const names = new Set(data.nodes.map(node => node.name));
    assert.equal(names.size, data.nodes.length, file);
    for (const [source, outputs] of Object.entries(data.connections || {})) {
      assert.ok(names.has(source), `${file}: ${source}`);
      for (const groups of Object.values(outputs)) {
        for (const group of groups) for (const edge of group) assert.ok(names.has(edge.node), `${file}: ${edge.node}`);
      }
    }
  }
});

test('cero eventos retorna []', () => assert.deepEqual(run([]), []));
test('un evento futuro de hoy retorna contrato existente y hora CDMX', () => {
  assert.deepEqual(run([event()]), [{ json: {
    hora: new Date('2026-10-27T16:30:00Z').toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true,
    }),
    hangoutLink: 'https://meet.google.com/abc-defg-hij', conversation_id: '123',
    whatsapp: '12025550123', summary: 'Cita - Ana - +12025550123',
  } }]);
});
test('múltiples eventos conservan orden y routing individual', () => {
  assert.deepEqual(run([event(), event({ description: 'CONVERSATION_ID: 456' })])
    .map(item => item.json.conversation_id), ['123', '456']);
});
test('ayer, mañana, hoy pasado y cancelado se descartan', () => {
  for (const overrides of [
    { start: { dateTime: '2026-10-26T18:00:00-06:00' } },
    { start: { dateTime: '2026-10-28T10:30:00-06:00' } },
    { start: { dateTime: '2026-10-27T08:59:59-06:00' } },
    { status: 'cancelled' },
  ]) rejected(overrides);
  assert.equal(run([event({ start: { dateTime: '2026-10-27T09:00:00-06:00' } })]).length, 1);
});
test('día local CDMX y hora no dependen del día UTC ni del offset original', () => {
  const now = '2026-10-28T04:00:00Z'; // todavía 27 en CDMX
  const result = run([
    event({ start: { dateTime: '2026-10-28T05:30:00Z' } }),
    event({ start: { dateTime: '2026-10-28T06:30:00Z' } }),
  ], now);
  assert.equal(result.length, 1);
  assert.equal(result[0].json.hora, new Date('2026-10-27T23:30:00-06:00').toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true,
  }));
});
test('items corruptos no abortan ni impiden seleccionar el válido', () => {
  const junk = [null, undefined, {}, { json: null }, { json: [] }, { json: 3 },
    event({ description: {} }), event({ summary: {} }), event({ conferenceData: { entryPoints: {} }, hangoutLink: '' })];
  assert.equal(run([...junk, event()]).length, 1);
});
test('solo start.dateTime ISO real con zona explícita; no all-day ni fechas normalizadas', () => {
  for (const start of [null, '2026-10-27T16:30:00Z', {}, { date: '2026-10-27' },
    ...['garbage', 1793118600000, '2026-10-27', '2026-10-27T10:30:00',
      '2026-10-27T25:30:00Z', '2026-02-30T10:30:00Z', '2026-10-27T10:30:00+25:00',
      '2026-10-27T10:30:00Z junk'].map(dateTime => ({ dateTime }))]) rejected({ start });
});
test('https válido sin credenciales; fallback de conferenceData soportado', () => {
  for (const hangoutLink of ['http://meet.google.com/a', 'javascript:alert(1)', '//meet.google.com/a',
    'https://user:pass@meet.google.com/a', 'https://meet.google.com@evil.example/a',
    'https://', 'https://localhost/a', 'https://bad host/a', 'https://-bad.example/a',
    'https:\\meet.google.com\\a', ' https://meet.google.com/a', 'https://meet.google.com/\nabc', 123, {}]) rejected({ hangoutLink });
  rejected({ hangoutLink: '', conferenceData: {} });
  const result = run([event({ hangoutLink: '', conferenceData: { entryPoints: [
    { entryPointType: 'phone', uri: 'tel:+123' },
    { entryPointType: 'video', uri: 'https://video.example.org/room?x=1' },
  ] } })]);
  assert.equal(result[0].json.hangoutLink, 'https://video.example.org/room?x=1');
});
test('conversation ID entero positivo seguro y marcador anclado exacto', () => {
  for (const description of ['', null, 123, 'CONVERSATION_ID: undefined', 'CONVERSATION_ID: 0',
    'CONVERSATION_ID: -1', 'CONVERSATION_ID: 1.5', 'CONVERSATION_ID: 1e3',
    'CONVERSATION_ID: 01', 'CONVERSATION_ID: 9007199254740992',
    'prefijo CONVERSATION_ID: 123', ' CONVERSATION_ID: 123',
    'CONVERSATION_ID:\n123', 'CONVERSATION_ID: 123 extra',
    'CONVERSATION_ID: 123/../../999', 'CONVERSATION_ID: 123?x=999',
    'CONVERSATION_ID: 123\nCONVERSATION_ID: 999',
    'CONVERSATION_ID: 123\nCONVERSATION_ID: 123',
    'CONVERSATION_ID: 123\ntexto CONVERSATION_ID: 999',
    'CONVERSATION_ID: 123\nCONVERSATION_ID: invalid']) rejected({ description });
  assert.equal(run([event({ description: 'Texto\r\nCONVERSATION_ID:\t456 \r\nFin' })])[0].json.conversation_id, '456');
});
test('routing inyectado nunca produce item ni llega a expresiones downstream', () => {
  const valid = run([event({ description: 'CONVERSATION_ID: 123/../../999' }), event()]);
  assert.equal(valid.length, 1);
  for (const name of ['Nota Interna', 'Enviar Confirmacion']) {
    const url = workflow.nodes.find(node => node.name === name).parameters.url;
    const rendered = url.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) =>
      vm.runInNewContext(expression, { $: node => {
        assert.equal(node, 'Extraer Datos');
        return { item: valid[0] };
      } }));
    assert.equal(new URL(rendered).pathname, '/api/v1/accounts/1/conversations/123/messages');
  }
});
