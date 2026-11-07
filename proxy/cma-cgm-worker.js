/**
 * Cloudflare Worker: live CMA CGM tracking for the Transco site.
 *
 * Holds the CMA CGM API key (a Worker secret, never in the website), calls CMA CGM's
 * Track & Trace API (DCSA standard), and returns the site's tracking format:
 *   GET https://<your-worker>.workers.dev/?ref=CMAU1234567
 *
 * Worker settings:
 *   CMA_CGM_API_KEY     (secret, required)  key from https://api-portal.cma-cgm.com
 *   ALLOWED_ORIGIN      (optional)          site allowed to call this, default https://sajeevds91.github.io
 *   CMA_CGM_EVENTS_URL  (optional)          events endpoint, default below; check it in the API portal
 */

const DEFAULT_EVENTS_URL = 'https://apis.cma-cgm.net/operation/trackandtrace/v1/events';
const CACHE_SECONDS = 600;

// Coordinates for common ports so they can be drawn on the map (UN/LOCODE -> [lat, lon]).
const PORT_COORDS = {
  LKCMB: [6.95, 79.84], INMAA: [13.1, 80.3], INNSA: [18.95, 72.95], INMUN: [22.74, 69.7], INTUT: [8.76, 78.2], INCOK: [9.97, 76.26],
  PKKHI: [24.84, 66.98], BDCGP: [22.31, 91.8], MVMLE: [4.18, 73.51],
  SGSIN: [1.26, 103.82], MYPKG: [3.0, 101.39], MYTPP: [1.36, 103.55], THLCH: [13.08, 100.88], VNSGN: [10.76, 106.75], VNCMT: [10.53, 107.03],
  IDJKT: [-6.1, 106.88], PHMNL: [14.6, 120.96], HKHKG: [22.33, 114.12], TWKHH: [22.6, 120.28],
  CNSHA: [31.36, 121.62], CNNGB: [29.94, 121.85], CNSZX: [22.5, 113.88], CNYTN: [22.57, 114.27], CNCAN: [22.75, 113.6], CNTAO: [36.08, 120.32], CNTXG: [38.97, 117.79], CNXMN: [24.45, 118.07],
  KRPUS: [35.08, 129.05], JPTYO: [35.62, 139.78], JPYOK: [35.45, 139.66],
  AEJEA: [25.01, 55.06], AEKHL: [24.82, 54.65], OMSLL: [16.95, 54.0], SAJED: [21.47, 39.16], EGPSD: [31.26, 32.3], EGSOK: [29.6, 32.35],
  DJJIB: [11.6, 43.13], KEMBA: [-4.05, 39.67], ZADUR: [-29.87, 31.03], MAPTM: [35.88, -5.5],
  NLRTM: [51.95, 4.05], BEANR: [51.27, 4.33], DEHAM: [53.54, 9.97], DEBRV: [53.58, 8.55], GBFXT: [51.95, 1.32], GBSOU: [50.9, -1.43], GBLGP: [51.5, 0.47],
  FRLEH: [49.48, 0.12], FRFOS: [43.42, 4.88], ESALG: [36.13, -5.44], ESVLC: [39.44, -0.32], ITGOA: [44.4, 8.92], ITGIT: [37.97, 15.65], MTMAR: [35.82, 14.54], GRPIR: [37.94, 23.62], TRAMB: [40.97, 28.68],
  USNYC: [40.67, -74.04], USSAV: [32.08, -81.09], USCHS: [32.78, -79.92], USORF: [36.9, -76.33], USHOU: [29.73, -95.27], USMIA: [25.77, -80.17],
  USLAX: [33.73, -118.26], USLGB: [33.75, -118.2], USOAK: [37.8, -122.32], USSEA: [47.58, -122.35], CAVAN: [49.29, -123.1], CAMTR: [45.55, -73.53],
  PAMIT: [9.36, -79.88], PABLB: [8.95, -79.57], BRSSZ: [-23.96, -46.3], AUSYD: [-33.97, 151.21], AUMEL: [-37.83, 144.92],
};

const EQUIPMENT_TEXT = {
  GTIN: 'Gated in', GTOT: 'Gated out', LOAD: 'Loaded on vessel', DISC: 'Discharged from vessel', STUF: 'Container stuffed',
  STRP: 'Container stripped', PICK: 'Picked up', DROP: 'Dropped off', INSP: 'Inspected', RSEA: 'Resealed', RMVD: 'Removed',
};
const TRANSPORT_TEXT = { ARRI: 'Vessel arrived', DEPA: 'Vessel departed' };

const isContainer = (ref) => /^[A-Z]{3}[UJZ]\d{7}$/.test(ref);

function cors(allowed) {
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function locationOf(e) {
  const l = e.eventLocation || e.transportCall?.location || {};
  const code = l.UNLocationCode || e.transportCall?.UNLocationCode || null;
  const coords = l.latitude != null && l.longitude != null ? [Number(l.latitude), Number(l.longitude)] : PORT_COORDS[code];
  return { code, name: l.locationName || l.facilityName || code || '', lat: coords ? coords[0] : null, lon: coords ? coords[1] : null };
}

function vesselOf(e) {
  const tc = e.transportCall || {};
  const v = tc.vessel || {};
  if (!v.vesselName && !v.vesselIMONumber) return null;
  return { name: v.vesselName || null, imo: v.vesselIMONumber ? String(v.vesselIMONumber) : null, mmsi: null, voyage: tc.exportVoyageNumber || tc.importVoyageNumber || null };
}

function describe(e) {
  if (e.eventType === 'TRANSPORT') return TRANSPORT_TEXT[e.transportEventTypeCode] || `Transport event ${e.transportEventTypeCode}`;
  if (e.eventType === 'EQUIPMENT') {
    const base = EQUIPMENT_TEXT[e.equipmentEventTypeCode] || `Equipment event ${e.equipmentEventTypeCode}`;
    if (e.emptyIndicatorCode === 'EMPTY' && (e.equipmentEventTypeCode === 'GTOT' || e.equipmentEventTypeCode === 'GTIN')) {
      return e.equipmentEventTypeCode === 'GTOT' ? 'Empty container released' : 'Empty container returned';
    }
    return e.emptyIndicatorCode === 'LADEN' && (e.equipmentEventTypeCode === 'GTOT' || e.equipmentEventTypeCode === 'GTIN') ? `${base} (full)` : base;
  }
  return e.shipmentEventTypeCode ? `Shipment ${e.shipmentEventTypeCode}` : 'Event';
}

/** Converts DCSA Track & Trace events into the Transco site's tracking format. */
function toSiteFormat(events, reference) {
  const list = (Array.isArray(events) ? events : events?.events || [])
    .filter((e) => e && e.eventDateTime && (e.eventType === 'EQUIPMENT' || e.eventType === 'TRANSPORT'))
    .map((e) => ({ raw: e, time: new Date(e.eventDateTime).toISOString(), loc: locationOf(e), actual: e.eventClassifierCode === 'ACT' }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  // DCSA can send the same milestone as planned, estimated and actual: keep the most certain one.
  const rank = { ACT: 3, EST: 2, PLN: 1 };
  const byKey = new Map();
  for (const ev of list) {
    const e = ev.raw;
    const key = [e.eventType, e.equipmentEventTypeCode || e.transportEventTypeCode, ev.loc.code, e.emptyIndicatorCode || '', vesselOf(e)?.voyage || ''].join('|');
    const prev = byKey.get(key);
    if (!prev || (rank[e.eventClassifierCode] || 0) >= (rank[prev.raw.eventClassifierCode] || 0)) byKey.set(key, ev);
  }
  const evs = [...byKey.values()].sort((a, b) => new Date(a.time) - new Date(b.time));
  const code = (ev) => ev.raw.equipmentEventTypeCode || ev.raw.transportEventTypeCode;

  const loads = evs.filter((ev) => code(ev) === 'LOAD');
  const discs = evs.filter((ev) => code(ev) === 'DISC');
  const origin = (loads[0] || evs[0])?.loc || null;
  const destination = (discs[discs.length - 1] || evs[evs.length - 1])?.loc || null;
  const transshipment = [];
  for (const ev of discs.slice(0, -1)) if (ev.loc.code && ev.loc.code !== destination?.code && !transshipment.some((t) => t.code === ev.loc.code)) transshipment.push(ev.loc);

  const depart = evs.find((ev) => code(ev) === 'DEPA' && ev.loc.code === origin?.code) || loads[0];
  const arrive = [...evs].reverse().find((ev) => code(ev) === 'ARRI' && ev.loc.code === destination?.code) || discs[discs.length - 1];

  const done = evs.filter((ev) => ev.actual);
  const last = done[done.length - 1];
  let status = 'BOOKED';
  if (last) {
    const c = code(last);
    const at = last.loc.code;
    const empty = last.raw.emptyIndicatorCode === 'EMPTY';
    const afterPod = done.some((ev) => code(ev) === 'DISC' && ev.loc.code === destination?.code);
    if (afterPod) {
      status = 'DISCHARGED';
      if (c === 'GTOT' && !empty) status = 'GATE_OUT';
      if (c === 'STRP' || (c === 'GTIN' && empty) || c === 'DROP') status = 'DELIVERED';
    } else if (c === 'ARRI' && at === destination?.code) status = 'ARRIVED';
    else if (c === 'DEPA') status = 'IN_TRANSIT';
    else if (c === 'LOAD') status = at === origin?.code ? 'LOADED' : 'IN_TRANSIT';
    else if (c === 'DISC' || (c === 'ARRI' && transshipment.some((t) => t.code === at))) status = 'TRANSSHIPMENT';
    else if (c === 'GTIN' && !empty) status = 'GATE_IN';
    else if (c === 'ARRI') status = 'IN_TRANSIT';
  }

  // Vessel: the one on the latest actual vessel event, else the first planned one.
  const withVessel = evs.filter((ev) => vesselOf(ev.raw));
  const vesselEv = [...withVessel].reverse().find((ev) => ev.actual) || withVessel[0];

  return {
    status,
    origin,
    destination,
    transshipment,
    etd: depart?.time || null,
    eta: arrive?.time || null,
    vessel: vesselEv ? vesselOf(vesselEv.raw) : null,
    events: evs.map((ev) => ({
      time: ev.time,
      code: code(ev),
      location: { code: ev.loc.code, name: ev.loc.name },
      description: describe(ev.raw),
      vessel: vesselOf(ev.raw)?.name || null,
      actual: ev.actual,
    })),
    reference,
    source: 'CMA CGM',
  };
}

async function fetchEvents(env, param, reference) {
  const url = new URL(env.CMA_CGM_EVENTS_URL || DEFAULT_EVENTS_URL);
  url.searchParams.set(param, reference);
  const res = await fetch(url, { headers: { KeyId: env.CMA_CGM_API_KEY, Accept: 'application/json' } });
  if (res.status === 404 || res.status === 204) return [];
  if (!res.ok) {
    const err = new Error(`CMA CGM returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return Array.isArray(body) ? body : body?.events || [];
}

export default {
  async fetch(request, env, ctx) {
    const allowed = env.ALLOWED_ORIGIN || 'https://sajeevds91.github.io';
    const headers = cors(allowed);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, headers);

    const reference = String(new URL(request.url).searchParams.get('ref') || '').toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z0-9]{4,20}$/.test(reference)) return json({ error: 'Enter a valid container, booking or B/L number' }, 400, headers);
    if (!env.CMA_CGM_API_KEY) return json({ error: 'The CMA CGM API key is not set up on the proxy yet' }, 500, headers);

    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheKey = new Request(`https://cache.transco/cma-cgm/${reference}`);
    const hit = cache && (await cache.match(cacheKey));
    if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...headers } });

    try {
      let events;
      if (isContainer(reference)) {
        events = await fetchEvents(env, 'equipmentReference', reference);
      } else {
        events = await fetchEvents(env, 'transportDocumentReference', reference);
        if (!events.length) events = await fetchEvents(env, 'carrierBookingReference', reference);
      }
      if (!events.length) return json({ error: `CMA CGM has no tracking events for ${reference} yet` }, 404, headers);
      const body = toSiteFormat(events, reference);
      const res = json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
      if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return new Response(res.body, { status: 200, headers: { ...Object.fromEntries(res.headers), ...headers } });
    } catch (err) {
      const msg = err.status === 401 || err.status === 403 ? 'CMA CGM rejected the API key' : err.message;
      return json({ error: msg }, 502, headers);
    }
  },
};

export { toSiteFormat };
