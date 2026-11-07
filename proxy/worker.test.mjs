// Tests the CMA CGM proxy with sample DCSA events (no real API call): node --test proxy/
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import worker, { toSiteFormat } from './cma-cgm-worker.js';

const sample = JSON.parse(readFileSync(new URL('./sample-cma-cgm-events.json', import.meta.url)));
const env = { CMA_CGM_API_KEY: 'test-key', ALLOWED_ORIGIN: 'https://sajeevds91.github.io' };

test('converts DCSA events to the site format', () => {
  const r = toSiteFormat(sample, 'CMAU5622104');
  assert.strictEqual(r.status, 'IN_TRANSIT');
  assert.strictEqual(r.origin.code, 'LKCMB');
  assert.strictEqual(r.destination.code, 'NLRTM');
  assert.deepStrictEqual([r.destination.lat, r.destination.lon], [51.95, 4.05]);
  assert.strictEqual(r.etd, '2026-10-25T18:00:00.000Z');
  assert.strictEqual(r.eta, '2026-11-11T09:00:00.000Z', 'estimated arrival wins over the planned one');
  assert.strictEqual(r.vessel.name, 'CMA CGM TEST VESSEL');
  assert.strictEqual(r.vessel.imo, '9839131');
  assert.strictEqual(r.events.filter((e) => e.code === 'ARRI').length, 1, 'planned + estimated arrival merged');
  assert.strictEqual(r.events[0].description, 'Empty container released');
  assert.strictEqual(r.source, 'CMA CGM');
});

test('status follows the journey', () => {
  const upTo = (n) => sample.slice(0, n);
  assert.strictEqual(toSiteFormat(upTo(2).concat(sample.slice(2).map((e) => ({ ...e, eventClassifierCode: 'PLN' }))), 'X').status, 'GATE_IN');
  const arrived = sample.map((e) => ({ ...e, eventClassifierCode: 'ACT' }));
  assert.strictEqual(toSiteFormat(arrived, 'X').status, 'DISCHARGED');
  const delivered = arrived.concat([{ eventType: 'EQUIPMENT', eventClassifierCode: 'ACT', eventDateTime: '2026-11-15T10:00:00Z', equipmentEventTypeCode: 'GTIN', emptyIndicatorCode: 'EMPTY', eventLocation: { locationName: 'Rotterdam', UNLocationCode: 'NLRTM' } }]);
  assert.strictEqual(toSiteFormat(delivered, 'X').status, 'DELIVERED');
});

test('proxy calls CMA CGM with the key and the right query, and adds CORS', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url: String(url), key: opts.headers.KeyId }); return new Response(JSON.stringify(sample), { status: 200 }); };
  const res = await worker.fetch(new Request('https://w.example/?ref=cmau 562210-4', { headers: { Origin: 'https://sajeevds91.github.io' } }), env, { waitUntil() {} });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://sajeevds91.github.io');
  assert.strictEqual(calls[0].url, 'https://apis.cma-cgm.net/operation/trackandtrace/v1/events?equipmentReference=CMAU5622104');
  assert.strictEqual(calls[0].key, 'test-key');
  const body = await res.json();
  assert.strictEqual(body.status, 'IN_TRANSIT');
  assert.ok(!JSON.stringify(body).includes('test-key'), 'key never reaches the browser');
});

test('B/L numbers try transport document, then booking reference', async () => {
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return calls.length === 1 ? new Response('[]', { status: 200 }) : new Response(JSON.stringify(sample), { status: 200 }); };
  const res = await worker.fetch(new Request('https://w.example/?ref=CMDULKA1234567'), env, { waitUntil() {} });
  assert.strictEqual(res.status, 200);
  assert.match(calls[0], /transportDocumentReference=CMDULKA1234567/);
  assert.match(calls[1], /carrierBookingReference=CMDULKA1234567/);
});

test('errors are clear and safe', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  let res = await worker.fetch(new Request('https://w.example/?ref=CMAU5622104'), env, { waitUntil() {} });
  assert.strictEqual(res.status, 502);
  assert.strictEqual((await res.json()).error, 'CMA CGM rejected the API key');
  globalThis.fetch = async () => new Response('[]', { status: 200 });
  res = await worker.fetch(new Request('https://w.example/?ref=CMAU5622104'), env, { waitUntil() {} });
  assert.strictEqual(res.status, 404);
  res = await worker.fetch(new Request('https://w.example/?ref=bad!'), env, { waitUntil() {} });
  assert.strictEqual(res.status, 400);
  res = await worker.fetch(new Request('https://w.example/?ref=CMAU5622104'), {}, { waitUntil() {} });
  assert.match((await res.json()).error, /not set up/);
  res = await worker.fetch(new Request('https://w.example/', { method: 'OPTIONS' }), env, {});
  assert.strictEqual(res.status, 204);
});
