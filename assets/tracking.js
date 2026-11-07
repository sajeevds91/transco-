/* Tracking logic for the browser: carriers, demo journeys, feed normalization, links.
 * Generated from the Transco server app so both behave the same. */
(() => {
'use strict';

// ---------------------------------------------------------------- geo
const R = 6371; // km
const rad = (d) => (d * Math.PI) / 180;

function distanceKm([lat1, lon1], [lat2, lon2]) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearing([lat1, lon1], [lat2, lon2]) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function pathLengthKm(path) {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += distanceKm(path[i - 1], path[i]);
  return d;
}

/** Point and heading at fraction f (0..1) along a polyline. */
function along(path, f) {
  const total = pathLengthKm(path);
  let target = Math.min(Math.max(f, 0), 1) * total;
  for (let i = 1; i < path.length; i++) {
    const seg = distanceKm(path[i - 1], path[i]);
    if (target <= seg || i === path.length - 1) {
      const t = seg === 0 ? 0 : Math.min(target / seg, 1);
      const [a, b] = [path[i - 1], path[i]];
      return { lat: a[0] + (b[0] - a[0]) * t, lon: a[1] + (b[1] - a[1]) * t, course: bearing(a, b) };
    }
    target -= seg;
  }
  const last = path[path.length - 1];
  return { lat: last[0], lon: last[1], course: 0 };
}

// ---------------------------------------------------------------- carriers
/** Shipping lines with their public track & trace pages. {ref} is replaced by the reference. */
const CARRIERS = [
  { code: 'MAEU', name: 'Maersk', prefixes: ['MAEU', 'MRKU', 'MSKU', 'MRSU', 'SUDU'], url: 'https://www.maersk.com/tracking/{ref}' },
  { code: 'MSCU', name: 'MSC', prefixes: ['MSCU', 'MEDU', 'MSDU', 'MSMU'], url: 'https://www.msc.com/en/track-a-shipment?trackingNumber={ref}' },
  { code: 'CMDU', name: 'CMA CGM', prefixes: ['CMAU', 'CGMU', 'APHU', 'APZU'], url: 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={ref}' },
  { code: 'HLCU', name: 'Hapag-Lloyd', prefixes: ['HLCU', 'HLXU', 'HAMU', 'UACU'], url: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container={ref}' },
  { code: 'ONEY', name: 'Ocean Network Express (ONE)', prefixes: ['ONEU', 'NYKU', 'MOLU', 'KKFU'], url: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam={ref}' },
  { code: 'EGLV', name: 'Evergreen', prefixes: ['EGHU', 'EMCU', 'EGSU', 'EISU'], url: 'https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do' },
  { code: 'COSU', name: 'COSCO Shipping', prefixes: ['CSNU', 'CBHU', 'CCLU', 'FCIU'], url: 'https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number={ref}' },
  { code: 'OOLU', name: 'OOCL', prefixes: ['OOLU', 'OOCU'], url: 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx' },
  { code: 'YMLU', name: 'Yang Ming', prefixes: ['YMLU', 'YMMU'], url: 'https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx' },
  { code: 'ZIMU', name: 'ZIM', prefixes: ['ZIMU', 'ZCSU', 'ZMOU'], url: 'https://www.zim.com/tools/track-a-shipment?consnumber={ref}' },
  { code: 'HDMU', name: 'HMM', prefixes: ['HDMU', 'HMMU'], url: 'https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do' },
  { code: 'PABV', name: 'PIL', prefixes: ['PCIU'], url: 'https://www.pilship.com/en-our-track-and-trace-pil-pacific-international-lines/120.html' },
];

const byCode = new Map(CARRIERS.map((c) => [c.code, c]));

function normalizeReference(ref) {
  return String(ref || '').toUpperCase().replace(/[\s-]/g, '').slice(0, 40);
}

/** ISO 6346 container number check (e.g. MSCU1234565). */
function isContainerNumber(ref) {
  return /^[A-Z]{3}[UJZ]\d{7}$/.test(ref);
}

/** ISO 6346 check digit for the first 10 characters of a container number. */
function containerCheckDigit(first10) {
  const letterValues = {};
  let v = 10;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (v % 11 === 0) v++;
    letterValues[ch] = v++;
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = first10[i];
    const val = /\d/.test(ch) ? Number(ch) : letterValues[ch];
    sum += val * 2 ** i;
  }
  return (sum % 11) % 10;
}

function containerCheckDigitValid(ref) {
  return isContainerNumber(ref) && containerCheckDigit(ref.slice(0, 10)) === Number(ref[10]);
}

function detectCarrier(ref) {
  const prefix = ref.slice(0, 4);
  const hit = CARRIERS.find((c) => c.prefixes.includes(prefix));
  return hit ? hit.code : null;
}

function detectRefType(ref) {
  return isContainerNumber(ref) ? 'container' : 'bl';
}

function carrierTrackingUrl(carrierCode, ref) {
  const c = byCode.get(carrierCode);
  if (!c) return `https://www.google.com/search?q=${encodeURIComponent(ref + ' container tracking')}`;
  return c.url.replace('{ref}', encodeURIComponent(ref));
}

function transcoTrackingUrl(ref) {
  const t = (window.TRANSCO_CONFIG || {}).transcoTrackingUrl;
  return t ? t.replace('{reference}', encodeURIComponent(ref)).replace('{ref}', encodeURIComponent(ref)) : null;
}

function marineTrafficUrl({ imo, mmsi, name } = {}) {
  if (imo) return `https://www.marinetraffic.com/en/ais/details/ships/imo:${encodeURIComponent(imo)}`;
  if (mmsi) return `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${encodeURIComponent(mmsi)}`;
  if (name) return `https://www.marinetraffic.com/en/ais/index/search/all/keyword:${encodeURIComponent(name)}`;
  return 'https://www.marinetraffic.com/';
}

// ---------------------------------------------------------------- demo track & trace
/**
 * Demo track & trace provider.
 *
 * Produces realistic, deterministic shipment journeys (every reference always gets the
 * same route, vessel and schedule) that move forward in real time, so the dashboard,
 * map and email updates can be tried end-to-end without any API keys.
 * Every shipment passes through Colombo, either as origin, destination or transshipment hub.
 */

const DAY = 86400000;
const KM_PER_DAY = 17 * 1.852 * 24; // 17 knots

const PORTS = {
  LKCMB: { code: 'LKCMB', name: 'Colombo, Sri Lanka', lat: 6.95, lon: 79.84 },
  CNSHA: { code: 'CNSHA', name: 'Shanghai, China', lat: 31.36, lon: 121.62 },
  CNNGB: { code: 'CNNGB', name: 'Ningbo, China', lat: 29.94, lon: 121.85 },
  SGSIN: { code: 'SGSIN', name: 'Singapore', lat: 1.26, lon: 103.82 },
  INMAA: { code: 'INMAA', name: 'Chennai, India', lat: 13.1, lon: 80.3 },
  AEJEA: { code: 'AEJEA', name: 'Jebel Ali, UAE', lat: 25.01, lon: 55.06 },
  NLRTM: { code: 'NLRTM', name: 'Rotterdam, Netherlands', lat: 51.95, lon: 4.05 },
  GBFXT: { code: 'GBFXT', name: 'Felixstowe, United Kingdom', lat: 51.95, lon: 1.32 },
  DEHAM: { code: 'DEHAM', name: 'Hamburg, Germany', lat: 53.54, lon: 9.97 },
  USNYC: { code: 'USNYC', name: 'New York, USA', lat: 40.67, lon: -74.04 },
};

// Sea lanes from Colombo to each port (waypoints between the two ports).
const SUEZ = [
  [6.6, 78.6], [8.5, 72.0], [11.8, 58.0], [12.3, 45.5], [12.6, 43.4], [15.5, 41.6], [20.5, 38.3],
  [27.0, 34.2], [29.8, 32.6], [31.4, 32.35], [33.4, 28.0], [35.6, 20.0], [37.3, 11.2], [37.6, 1.5],
  [36.0, -5.4], [36.6, -9.4], [43.2, -9.9], [48.3, -5.7], [49.9, -1.2], [51.0, 1.6],
];
const EAST = [
  [5.7, 80.6], [5.95, 85.0], [6.3, 93.0], [5.9, 97.5], [4.2, 99.5], [2.5, 101.3], [1.15, 103.6],
];
const LANES = {
  SGSIN: EAST,
  CNSHA: [...EAST, [1.25, 104.3], [2.5, 105.2], [8.0, 108.5], [15.0, 112.0], [22.5, 117.2], [27.0, 121.3]],
  CNNGB: [...EAST, [1.25, 104.3], [2.5, 105.2], [8.0, 108.5], [15.0, 112.0], [22.5, 117.2], [27.0, 121.3]],
  INMAA: [[6.2, 79.7], [5.75, 80.6], [7.0, 82.2], [9.5, 82.0], [12.4, 80.7]],
  AEJEA: [[7.4, 77.5], [15.0, 66.0], [22.5, 60.0], [25.6, 57.0], [26.5, 56.4], [25.6, 55.3]],
  NLRTM: SUEZ,
  GBFXT: SUEZ,
  DEHAM: [...SUEZ, [53.3, 4.6], [54.0, 7.8], [53.9, 8.7]],
  USNYC: [...SUEZ.slice(0, 15), [37.0, -20.0], [39.5, -50.0], [40.3, -70.0], [40.45, -73.9]],
};

const VESSELS = [
  'OCEAN MERIDIAN', 'LANKA PIONEER', 'EASTERN HORIZON', 'SAPPHIRE TRADER', 'INDIGO STAR',
  'CEYLON SPIRIT', 'NORTHERN VOYAGER', 'CORAL EXPRESS', 'MONSOON BRIDGE', 'SILK ROAD CARRIER',
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function vesselFor(seed) {
  const name = VESSELS[seed % VESSELS.length];
  return {
    name,
    imo: null, // demo vessels are fictional: no IMO/MMSI so we never point at a real ship
    mmsi: null,
    voyage: `${(seed % 90) + 10}${'EWNS'[seed % 4]}`,
    demo: true,
  };
}

function legPath(from, to) {
  // Each leg is between Colombo and another port.
  if (from === 'LKCMB') return [[PORTS.LKCMB.lat, PORTS.LKCMB.lon], ...LANES[to], [PORTS[to].lat, PORTS[to].lon]];
  return legPath('LKCMB', from).slice().reverse();
}

function pickPorts(h) {
  const others = Object.keys(LANES);
  const mode = h % 3; // 0 export from Colombo, 1 import to Colombo, 2 transshipment via Colombo
  const a = others[(h >>> 3) % others.length];
  let b = others[(h >>> 7) % others.length];
  if (mode === 0) return ['LKCMB', a];
  if (mode === 1) return [a, 'LKCMB'];
  if (b === a) b = others[(others.indexOf(a) + 3) % others.length];
  // Keep transshipments sensible: one side east of Colombo, one side west.
  const east = ['SGSIN', 'CNSHA', 'CNNGB', 'INMAA'];
  const west = ['AEJEA', 'NLRTM', 'GBFXT', 'DEHAM', 'USNYC'];
  return [east[(h >>> 5) % east.length], west[(h >>> 9) % west.length]];
}

function iso(t) {
  return new Date(t).toISOString();
}

/**
 * @param {{reference:string, carrier?:string, createdAt?:string}} shipment
 */
function demoTrack({ reference, createdAt }) {
  const h = hash(reference);
  const now = Date.now();
  const anchor = createdAt ? new Date(createdAt).getTime() : now;
  const [o, d] = pickPorts(h);
  const transship = o !== 'LKCMB' && d !== 'LKCMB';
  const legs = transship ? [[o, 'LKCMB'], ['LKCMB', d]] : [[o, d]];

  // Departure between 9 days before and 4 days after the shipment was added.
  const etd = anchor + ((h % 14) - 9) * DAY + ((h >>> 4) % 24) * 3600000;
  const events = [];
  const ev = (time, code, location, description, vessel) =>
    events.push({ time: iso(time), code, location: location.name, locode: location.code, description, vessel: vessel?.name || null, actual: time <= now });

  ev(etd - 7 * DAY, 'BOOKED', PORTS[o], 'Booking confirmed');
  ev(etd - 4 * DAY, 'EMPTY_OUT', PORTS[o], 'Empty container released to shipper');
  ev(etd - 3 * DAY, 'GATE_IN', PORTS[o], 'Full container gated in at terminal');

  let t = etd;
  const legInfo = [];
  legs.forEach(([from, to], i) => {
    const path = legPath(from, to);
    const days = Math.max(1.5, pathLengthKm(path) / KM_PER_DAY);
    const vessel = vesselFor(h + i * 7);
    const dep = t;
    const arr = dep + days * DAY;
    ev(dep - 0.4 * DAY, 'LOADED', PORTS[from], `Loaded on ${vessel.name} voyage ${vessel.voyage}`, vessel);
    ev(dep, 'DEPARTED', PORTS[from], `Vessel departed ${PORTS[from].name}`, vessel);
    ev(arr, 'ARRIVED', PORTS[to], `Vessel arrived at ${PORTS[to].name}`, vessel);
    ev(arr + 0.4 * DAY, 'DISCHARGED', PORTS[to], i < legs.length - 1 ? 'Discharged for transshipment' : 'Discharged from vessel', vessel);
    legInfo.push({ from, to, path, dep, arr, vessel });
    t = arr + 2 * DAY; // transshipment dwell
  });

  const eta = legInfo[legInfo.length - 1].arr;
  ev(eta + 2.5 * DAY, 'GATE_OUT', PORTS[d], 'Full container gated out for delivery');
  ev(eta + 3.5 * DAY, 'DELIVERED', PORTS[d], 'Delivered to consignee');
  ev(eta + 5 * DAY, 'EMPTY_RETURN', PORTS[d], 'Empty container returned');

  // Current state
  const happened = events.filter((e) => e.actual);
  const last = happened[happened.length - 1] || null;
  let status = 'BOOKED';
  let currentLeg = legInfo[0];
  let position = null;
  for (const leg of legInfo) {
    if (now >= leg.dep && now < leg.arr) {
      status = 'IN_TRANSIT';
      currentLeg = leg;
      const p = along(leg.path, (now - leg.dep) / (leg.arr - leg.dep));
      position = { ...p, speed: 16 + (h % 30) / 10, navStatus: 'Under way using engine' };
    }
  }
  if (!position) {
    if (last) {
      const map = { BOOKED: 'BOOKED', EMPTY_OUT: 'BOOKED', GATE_IN: 'GATE_IN', LOADED: 'LOADED', DEPARTED: 'IN_TRANSIT', ARRIVED: 'ARRIVED', DISCHARGED: 'DISCHARGED', GATE_OUT: 'GATE_OUT', DELIVERED: 'DELIVERED', EMPTY_RETURN: 'DELIVERED' };
      status = map[last.code];
      if (transship && last.locode === 'LKCMB' && (last.code === 'ARRIVED' || last.code === 'DISCHARGED') && now < legInfo[1].dep) {
        status = 'TRANSSHIPMENT';
      }
    }
    // Vessel position when not carrying our box: alongside at the relevant port.
    const leg = now < legInfo[0].dep ? legInfo[0] : legInfo.find((l) => now < l.dep) || legInfo[legInfo.length - 1];
    currentLeg = leg;
    const port = now < leg.dep ? PORTS[leg.from] : PORTS[leg.to];
    position = { lat: port.lat, lon: port.lon, course: 0, speed: 0, navStatus: 'Moored' };
  }

  const totalSpan = eta - etd;
  const progress = Math.min(1, Math.max(0, (now - etd) / totalSpan));

  return {
    reference,
    source: 'demo',
    status,
    origin: PORTS[o],
    destination: PORTS[d],
    transshipment: transship ? [PORTS.LKCMB] : [],
    etd: iso(etd),
    eta: iso(eta),
    progress: ['ARRIVED', 'DISCHARGED', 'GATE_OUT', 'DELIVERED'].includes(status) ? 1 : progress,
    vessel: { ...currentLeg.vessel },
    vesselPosition: { ...position, timestamp: iso(now - ((h % 25) + 3) * 60000), source: 'demo' },
    route: legInfo.flatMap((l) => l.path),
    events,
    lastEvent: last,
    fetchedAt: iso(now),
  };
}

// ---------------------------------------------------------------- live feed (optional)
/**
 * Generic HTTP track & trace provider.
 *
 * Calls TRACKING_API_URL (with {reference}, {carrier} and {type} placeholders) and expects the
 * normalized JSON documented in README.md ("Connecting a real track & trace feed").
 * If your feed returns a different shape, adapt `normalize()` below; nothing else needs to change.
 */

const STATUSES = ['BOOKED', 'GATE_IN', 'LOADED', 'IN_TRANSIT', 'TRANSSHIPMENT', 'ARRIVED', 'DISCHARGED', 'GATE_OUT', 'DELIVERED'];

function port(p) {
  if (!p) return null;
  if (typeof p === 'string') return { code: null, name: p, lat: null, lon: null };
  return { code: p.code || p.locode || null, name: p.name || p.code || '', lat: p.lat ?? null, lon: p.lon ?? p.lng ?? null };
}

function normalize(raw, reference) {
  const now = Date.now();
  const events = (raw.events || [])
    .map((e) => ({
      time: e.time || e.date || e.timestamp,
      code: (e.code || e.status || '').toUpperCase(),
      location: e.location?.name || e.location || '',
      locode: e.location?.code || e.locode || null,
      description: e.description || e.status || '',
      vessel: e.vessel || null,
      actual: e.actual ?? new Date(e.time || e.date || e.timestamp).getTime() <= now,
    }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  const happened = events.filter((e) => e.actual);
  const status = STATUSES.includes(String(raw.status).toUpperCase()) ? String(raw.status).toUpperCase() : 'IN_TRANSIT';
  const etd = raw.etd || raw.departure || null;
  const eta = raw.eta || raw.arrival || null;
  let progress = raw.progress;
  if (progress == null && etd && eta) {
    progress = Math.min(1, Math.max(0, (now - new Date(etd)) / (new Date(eta) - new Date(etd))));
  }
  return {
    reference,
    source: 'api',
    status,
    origin: port(raw.origin || raw.pol),
    destination: port(raw.destination || raw.pod),
    transshipment: (raw.transshipment || []).map(port),
    etd,
    eta,
    progress: progress ?? 0,
    vessel: raw.vessel ? { name: raw.vessel.name || raw.vessel, imo: raw.vessel.imo || null, mmsi: raw.vessel.mmsi || null, voyage: raw.vessel.voyage || null } : null,
    vesselPosition: null,
    route: raw.route || null,
    events,
    lastEvent: happened[happened.length - 1] || null,
    fetchedAt: new Date(now).toISOString(),
  };
}

function feedUrlFor(carrier) {
  const cfg = window.TRANSCO_CONFIG || {};
  return (cfg.liveTracking && cfg.liveTracking[carrier]) || cfg.trackingApiUrl || '';
}

async function feedTrack({ reference, carrier }, template) {
  const url = template
    .replace('{ref}', encodeURIComponent(reference)).replace('{reference}', encodeURIComponent(reference))
    .replace('{carrier}', encodeURIComponent(carrier || ''));
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('The live tracking service could not be reached. Please try again shortly.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || (res.status === 404 ? 'This reference is not in the tracking system yet' : `Tracking service returned HTTP ${res.status}`));
  const snap = normalize(body, reference);
  snap.sourceName = body.source || 'live feed';
  return snap;
}

// ---------------------------------------------------------------- public API
const STATUS_LABELS = {
  BOOKED: 'Booked', GATE_IN: 'At origin terminal', LOADED: 'Loaded on vessel', IN_TRANSIT: 'In transit',
  TRANSSHIPMENT: 'At transshipment port', ARRIVED: 'Arrived at destination', DISCHARGED: 'Discharged',
  GATE_OUT: 'Out for delivery', DELIVERED: 'Delivered', UNKNOWN: 'Awaiting tracking data',
};

async function getTracking(s) {
  const feed = feedUrlFor(s.carrier);
  const live = Boolean(feed);
  let snap;
  try {
    snap = live ? await feedTrack(s, feed) : demoTrack({ reference: s.reference, createdAt: s.addedAt });
  } catch (err) {
    snap = { reference: s.reference, source: live ? 'api' : 'demo', status: 'UNKNOWN', error: err.message, events: [], lastEvent: null, progress: 0, fetchedAt: new Date().toISOString() };
  }
  if (s.vesselImo || s.vesselMmsi) snap.vessel = { ...(snap.vessel || {}), imo: s.vesselImo || null, mmsi: s.vesselMmsi || null, demo: false };
  snap.statusLabel = STATUS_LABELS[snap.status] || snap.status;
  snap.carrierName = byCode.get(s.carrier)?.name || 'Other shipping line';
  const v = { imo: snap.vessel?.imo, mmsi: snap.vessel?.mmsi, name: snap.vessel?.name };
  snap.links = {
    carrier: carrierTrackingUrl(s.carrier, s.reference),
    transco: transcoTrackingUrl(s.reference),
    marineTraffic: v.imo || v.mmsi || v.name ? marineTrafficUrl(v) : null,
  };
  return snap;
}

window.TranscoTracking = {
  CARRIERS: CARRIERS.map(({ code, name }) => ({ code, name })),
  carrierName: (code) => byCode.get(code)?.name || 'Other shipping line',
  isKnownCarrier: (code) => byCode.has(code),
  normalizeReference, isContainerNumber, containerCheckDigitValid, detectCarrier, detectRefType,
  getTracking,
  liveFeed: () => Boolean((window.TRANSCO_CONFIG || {}).trackingApiUrl),
  // Names of shipping lines with their own live feed, e.g. ['CMA CGM']
  liveCarriers: () => Object.entries((window.TRANSCO_CONFIG || {}).liveTracking || {}).filter(([, url]) => url).map(([code]) => byCode.get(code)?.name || code),
};
})();
