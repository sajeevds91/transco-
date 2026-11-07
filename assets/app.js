/* Transco Consolidation shipment tracking (static site: no login, list saved in this browser). */
(() => {
  'use strict';

  const CFG = Object.assign({ companyName: 'Transco Consolidation', supportEmail: '', transcoTrackingUrl: '', trackingApiUrl: '' }, window.TRANSCO_CONFIG || {});
  const T = window.TranscoTracking;
  const STORE_KEY = 'transco.shipments.v1';

  const state = { list: [], tracking: new Map(), filter: 'active', search: '' };
  let maps = [];
  const $app = document.getElementById('app');
  const $modal = document.getElementById('modal-root');

  // ---------------------------------------------------------------- storage (this browser only)
  function load() {
    try { state.list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]').filter((s) => s && s.reference); } catch { state.list = []; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.list)); return true; } catch { return false; }
  }
  const findSaved = (ref) => state.list.find((s) => s.reference === ref);

  // ---------------------------------------------------------------- utils
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let toastTimer;
  function toast(msg, isErr = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `show${isErr ? ' err' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = ''), 3800);
  }
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  function relDays(iso) {
    if (!iso) return '';
    const d = Math.round((new Date(iso) - Date.now()) / 86400000);
    if (d === 0) return 'today';
    if (d === 1) return 'tomorrow';
    if (d === -1) return 'yesterday';
    return d > 0 ? `in ${d} days` : `${-d} days ago`;
  }
  function ago(iso) {
    if (!iso) return '';
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
  }
  const STATUS_CLASS = {
    BOOKED: 's-pre', GATE_IN: 's-pre', LOADED: 's-pre', IN_TRANSIT: 's-transit', TRANSSHIPMENT: 's-port',
    ARRIVED: 's-done', DISCHARGED: 's-done', GATE_OUT: 's-done', DELIVERED: 's-done', UNKNOWN: 's-unknown',
  };
  const statusClass = (s) => STATUS_CLASS[s] || 's-unknown';
  const pill = (t) => `<span class="pill ${statusClass(t.status)}">${esc(t.statusLabel || 'Unknown')}</span>`;
  const isDone = (t) => t.status === 'DELIVERED';
  const shareUrl = (ref) => `${location.origin}${location.pathname}#/shipment/${encodeURIComponent(ref)}`;

  const ICON = {
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h5"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };
  const LOGO = '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#163a5c"/><path d="M12 38h40l-6 10H18z" fill="#2fb5a8"/><rect x="18" y="24" width="12" height="11" rx="1.5" fill="#fff"/><rect x="32" y="24" width="12" height="11" rx="1.5" fill="#a5c4e0"/><rect x="25" y="13" width="12" height="10" rx="1.5" fill="#fff"/></svg>';

  async function busy(btn, fn) {
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${ICON.refresh.replace('<svg', '<svg class="spin"')} Working…`;
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
  }

  // ---------------------------------------------------------------- tracking
  async function track(s, force = false) {
    if (!force && state.tracking.has(s.reference)) return state.tracking.get(s.reference);
    const t = await T.getTracking(s);
    state.tracking.set(s.reference, t);
    return t;
  }
  const trackAll = (force = false) => Promise.all(state.list.map((s) => track(s, force)));

  // Validates a reference typed by the customer. Returns { reference, refType, carrier } or throws.
  function checkReference(raw, carrier) {
    const reference = T.normalizeReference(raw);
    if (reference.length < 4) throw new Error('Enter a container, booking or bill of lading number');
    const refType = T.detectRefType(reference);
    if (refType === 'container' && !T.containerCheckDigitValid(reference)) {
      throw new Error(`${reference} does not look like a valid container number (the check digit does not match). Please check it.`);
    }
    return { reference, refType, carrier: carrier || T.detectCarrier(reference) || 'OTHER' };
  }

  function addShipment({ reference, refType, carrier, label = '', vesselImo = '', vesselMmsi = '' }) {
    const existing = findSaved(reference);
    if (existing) return existing;
    const s = { reference, refType, carrier, label: label.trim().slice(0, 80), vesselImo, vesselMmsi, addedAt: new Date().toISOString() };
    state.list.unshift(s);
    if (!save()) toast('Your browser is not letting this site save, so the list will be lost when you close it.', true);
    return s;
  }

  // ---------------------------------------------------------------- router
  function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const m = h.match(/^\/shipment\/([^/?]+)/);
    if (m) return { name: 'shipment', ref: T.normalizeReference(decodeURIComponent(m[1])) };
    return { name: 'dashboard' };
  }
  window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });

  function render() {
    maps.forEach((m) => m.remove());
    maps = [];
    const r = route();
    $app.innerHTML = shell();
    if (r.name === 'shipment') return renderDetail(r.ref);
    return renderDashboard();
  }

  function shell() {
    return `
    <header class="topbar"><div class="inner">
      <a class="brand" href="#/">${LOGO}<div><b>${esc(CFG.companyName)}</b><small>Shipment tracking</small></div></a>
      <nav><a href="#/" class="active">My shipments</a></nav>
      <div class="spacer"></div>
      ${CFG.supportEmail ? `<a class="btn ghost small" style="color:#dbe7f3" href="mailto:${esc(CFG.supportEmail)}">Contact us</a>` : ''}
    </div></header>
    <main id="view"></main>
    <div class="footer-note">
      ${T.liveFeed() ? '' : T.liveCarriers().length ? `<b>${esc(T.liveCarriers().join(', '))}</b> shipments show live tracking data; other shipping lines show <b>demo tracking data</b>. ` : 'Showing <b>demo tracking data</b>. '}Use the MarineTraffic link for the vessel's live AIS position.
      Your shipment list is saved in this browser only.
      ${CFG.supportEmail ? ` · Questions? <a href="mailto:${esc(CFG.supportEmail)}">${esc(CFG.supportEmail)}</a>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------- map
  // A clean map drawn from Natural Earth country outlines hosted with the site (no tile server, no
  // API key), with OpenStreetMap available as a "Street map" layer for zooming into ports.
  const MAP_COLORS = { transit: '#1d4ed8', port: '#d97706', done: '#15803d', pre: '#0f8f84', unknown: '#64748b' };
  const statusColor = (t) => MAP_COLORS[(STATUS_CLASS[t.status] || 's-unknown').slice(2)] || MAP_COLORS.unknown;

  let worldPromise = null;
  function loadWorld() {
    if (!worldPromise) {
      worldPromise = fetch('assets/world-50m.json')
        .then((r) => { if (!r.ok) throw new Error('map data'); return r.json(); })
        .then((topo) => {
          const geo = topojson.feature(topo, topo.objects.countries);
          // Keep rings continuous where they cross the 180° line, so no stray lines are drawn across the map.
          const unwrap = (ring) => {
            let prev = null;
            let shift = 0;
            return ring.map(([lon, lat]) => {
              if (prev !== null) {
                if (lon + shift - prev > 180) shift -= 360;
                else if (lon + shift - prev < -180) shift += 360;
              }
              prev = lon + shift;
              return [lon + shift, lat];
            });
          };
          geo.features = geo.features
            .filter((f) => f.id !== '010') // Antarctica
            .map((f) => {
              const g = f.geometry;
              if (g.type === 'Polygon') g.coordinates = g.coordinates.map(unwrap);
              if (g.type === 'MultiPolygon') g.coordinates = g.coordinates.map((poly) => poly.map(unwrap));
              return f;
            });
          return geo;
        })
        .catch((err) => { worldPromise = null; throw err; });
    }
    return worldPromise;
  }

  function graticule() {
    const lines = [];
    for (let lat = -60; lat <= 80; lat += 20) lines.push([[lat, -180], [lat, 180]]);
    for (let lon = -180; lon <= 180; lon += 30) lines.push([[-75, lon], [85, lon]]);
    return L.polyline(lines, { color: '#ffffff', weight: 1, opacity: 0.45, interactive: false, pane: 'grid' });
  }

  function makeMap(el) {
    if (typeof L === 'undefined') { el.innerHTML = '<div class="empty">The map could not load.</div>'; return null; }
    el.classList.add('map-clean');
    const map = L.map(el, {
      scrollWheelZoom: false, minZoom: el.clientWidth < 600 ? 1 : 2, maxZoom: 10, zoomSnap: 0.25, worldCopyJump: false,
      maxBounds: [[-75, -220], [85, 220]], maxBoundsViscosity: 0.8, attributionControl: true,
    }).setView([18, 70], 3);
    map.attributionControl.setPrefix(false);
    map.createPane('land').style.zIndex = 200;
    map.createPane('grid').style.zIndex = 250;
    map.createPane('routes').style.zIndex = 420;

    const clean = L.layerGroup().addTo(map);
    graticule().addTo(clean);
    const landRenderer = L.canvas({ pane: 'land', padding: 0.3 });
    loadWorld().then((geo) => {
      if (!maps.includes(map)) return;
      L.geoJSON(geo, {
        renderer: landRenderer, interactive: false,
        style: { color: '#c9c4b5', weight: 0.7, fillColor: '#f6f3ea', fillOpacity: 1 },
      }).addTo(clean);
    }).catch(() => { if (maps.includes(map)) map.addLayer(street); });

    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    clean.getAttribution = () => 'Map data: <a href="https://www.naturalearthdata.com/">Natural Earth</a>';
    map.attributionControl.addAttribution(clean.getAttribution());
    map.on('baselayerchange', (e) => {
      el.classList.toggle('map-clean', e.layer === clean);
      map.attributionControl[e.layer === clean ? 'addAttribution' : 'removeAttribution'](clean.getAttribution());
    });
    L.control.layers({ Map: clean, 'Street map': street }, null, { position: 'topright' }).addTo(map);
    maps.push(map);
    return map;
  }

  function vesselIcon(course, moving, color) {
    const html = moving
      ? `<span class="vessel-halo" style="--c:${color}"></span><svg width="30" height="30" viewBox="0 0 30 30" style="transform:rotate(${course || 0}deg)"><path d="M15 3l7.5 21L15 19.5 7.5 24z" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`
      : `<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" fill="${color}" stroke="#fff" stroke-width="2.5"/><path d="M7 12.5h8l-1.4 2.5H8.4zM9 9.5h4v2.4H9z" fill="#fff"/></svg>`;
    const size = moving ? 30 : 22;
    return L.divIcon({ className: 'vessel-icon', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
  }

  function portMarker(port, kind, color, label, side = kind === 'origin' ? 'left' : 'right') {
    const style = {
      origin: { radius: 6, color: '#fff', weight: 2.5, fillColor: '#0f2b46', fillOpacity: 1 },
      destination: { radius: 7, color, weight: 3, fillColor: '#fff', fillOpacity: 1 },
      via: { radius: 5, color: '#fff', weight: 2, fillColor: MAP_COLORS.port, fillOpacity: 1 },
    }[kind];
    const m = L.circleMarker([port.lat, port.lon], { ...style, pane: 'markerPane' });
    const name = esc(port.name.split(',')[0]);
    if (label) {
      m.bindTooltip(name, { permanent: true, direction: side, offset: [side === 'left' ? -8 : 8, 0], className: 'port-label' });
      m.portLabel = { name, side };
    }
    else m.bindTooltip(esc(port.name), { direction: 'top', offset: [0, -6] });
    return m;
  }

  // Splits a route at the vessel's position into the part already sailed and the part still to go.
  function splitRoute(route, p) {
    if (!p || p.lat == null) return [route, []];
    let best = 0;
    let bestD = Infinity;
    route.forEach(([la, lo], i) => {
      const d = (la - p.lat) ** 2 + (lo - p.lon) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    const here = [p.lat, p.lon];
    return [[...route.slice(0, best + 1), here], [here, ...route.slice(best + 1)]];
  }

  function drawShipment(map, s, t, focus = false) {
    const bounds = [];
    const color = statusColor(t);
    const p = t.vesselPosition;
    // Only show the ship once the cargo is on board and under way (or waiting at a transshipment port).
    const atSea = p?.lat != null && ['IN_TRANSIT', 'TRANSSHIPMENT'].includes(t.status);
    if (t.route?.length) {
      const [done, ahead] = isDone(t) ? [t.route, []] : atSea ? splitRoute(t.route, p) : [[], t.route];
      if (done.length) L.polyline(done, { pane: 'routes', color, weight: focus ? 4 : 3, opacity: focus ? 0.95 : 0.8, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      if (ahead.length) L.polyline(ahead, { pane: 'routes', color, weight: focus ? 3 : 2, opacity: focus ? 0.55 : 0.4, dashArray: '2 7', lineCap: 'round' }).addTo(map);
      if (focus) bounds.push(...t.route);
    }
    const ports = [[t.origin, 'origin'], [t.destination, 'destination'], ...(t.transshipment || []).map((x) => [x, 'via'])];
    // Put each port's name on the side facing away from the other end of the route.
    const westToEast = t.origin?.lon != null && t.destination?.lon != null ? t.origin.lon <= t.destination.lon : true;
    for (const [port, kind] of ports) {
      if (port?.lat == null) continue;
      const side = kind === 'origin' ? (westToEast ? 'left' : 'right') : (westToEast ? 'right' : 'left');
      portMarker(port, kind, color, focus && kind !== 'via', side).addTo(map);
      bounds.push([port.lat, port.lon]);
    }
    if (atSea) {
      L.marker([p.lat, p.lon], { icon: vesselIcon(p.course, (p.speed || 0) > 0.5, color), zIndexOffset: 500 })
        .bindPopup(`<div class="map-pop"><b>${esc(s.label || s.reference)}</b><span>${esc(t.vessel?.name || 'Vessel')}${p.speed != null ? ` · ${p.speed.toFixed(1)} kn` : ''}</span><br>
          <span>${esc(t.statusLabel)} · ETA ${fmtDate(t.eta)}</span><br><a href="#/shipment/${encodeURIComponent(s.reference)}">View shipment</a>
          ${t.links?.marineTraffic ? ` · <a href="${esc(t.links.marineTraffic)}" target="_blank" rel="noopener">MarineTraffic</a>` : ''}</div>`)
        .bindTooltip(esc(t.vessel?.name || s.reference), { direction: 'top', offset: [0, -14] })
        .addTo(map);
      bounds.push([p.lat, p.lon]);
    }
    return bounds;
  }

  // Room around the route for port names; less on phones so the route isn't tiny.
  function detailPadding(map) {
    return map.getContainer().clientWidth < 600 ? { paddingTopLeft: [24, 44], paddingBottomRight: [24, 30] } : { paddingTopLeft: [70, 40], paddingBottomRight: [70, 50] };
  }

  // Moves a port name to the other side (or above) if it would be cut off at the edge of the map.
  function fitLabels(map) {
    const box = map.getContainer().getBoundingClientRect();
    map.eachLayer((layer) => {
      if (!layer.portLabel || !layer.getTooltip()) return;
      const fits = () => {
        const r = layer.getTooltip().getElement()?.getBoundingClientRect();
        return !r || (r.left >= box.left + 4 && r.right <= box.right - 4);
      };
      if (fits()) return;
      const { name, side } = layer.portLabel;
      for (const dir of ['top', side === 'left' ? 'right' : 'left']) {
        layer.unbindTooltip();
        layer.bindTooltip(name, { permanent: true, direction: dir, offset: dir === 'top' ? [0, -9] : [dir === 'left' ? -8 : 8, 0], className: 'port-label' });
        if (fits()) return;
      }
    });
  }

  function addLegend(map) {
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const d = L.DomUtil.create('div', 'map-legend');
      d.innerHTML = `
        <span><i class="lg-line" style="background:${MAP_COLORS.transit}"></i>Sailed</span>
        <span><i class="lg-dash" style="color:${MAP_COLORS.transit}"></i>To go</span>
        <span><i class="lg-dot" style="background:#0f2b46"></i>Origin</span>
        <span><i class="lg-ring" style="border-color:${MAP_COLORS.transit}"></i>Destination</span>`;
      return d;
    };
    legend.addTo(map);
  }

  // ---------------------------------------------------------------- dashboard
  function carrierOptions(selected) {
    return `<option value="">Shipping line (auto-detect)</option>${T.CARRIERS.map((c) => `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="OTHER" ${selected === 'OTHER' ? 'selected' : ''}>Other / not sure</option>`;
  }

  function quickAddHtml() {
    return `
      <form class="card hero-card" id="quick-add" novalidate>
        <h2>Track a shipment</h2>
        <p>Enter a container, booking or bill of lading number. It is added to your list on this device.</p>
        <div id="qa-error"></div>
        <div class="quick-add">
          <input type="text" name="reference" placeholder="e.g. MSCU1234566" autocomplete="off" aria-label="Container, booking or B/L number" required>
          <select name="carrier" aria-label="Shipping line" style="flex:0 1 240px">${carrierOptions('')}</select>
          <input type="text" name="label" placeholder="Your reference (optional)" maxlength="80" aria-label="Your reference" style="flex:1 1 200px;font-family:inherit">
          <button class="btn primary" type="submit">${ICON.plus} Track</button>
        </div>
        <small class="hint" id="ref-hint"></small>
      </form>`;
  }

  function bindQuickAdd() {
    const form = document.getElementById('quick-add');
    const ref = form.elements.reference;
    const hint = document.getElementById('ref-hint');
    ref.addEventListener('input', () => {
      const v = T.normalizeReference(ref.value);
      if (T.isContainerNumber(v)) {
        const ok = T.containerCheckDigitValid(v);
        hint.textContent = ok ? `✓ Valid container number${T.detectCarrier(v) ? ` · ${T.carrierName(T.detectCarrier(v))}` : ''}` : 'This container number’s check digit does not match. Please check it.';
        hint.className = `hint ${ok ? 'good' : 'bad'}`;
      } else {
        hint.textContent = /^[A-Z]{4}\d{7}$/.test(v) ? 'Container numbers have U, J or Z as the 4th letter.' : '';
        hint.className = 'hint bad';
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const info = checkReference(ref.value, form.elements.carrier.value);
        const existed = findSaved(info.reference);
        addShipment({ ...info, label: form.elements.label.value });
        location.hash = `#/shipment/${encodeURIComponent(info.reference)}`;
        toast(existed ? `${info.reference} is already in your list` : `${info.reference} added to your list`);
      } catch (err) {
        document.getElementById('qa-error').innerHTML = `<div class="error">${esc(err.message)}</div>`;
      }
    });
  }

  async function renderDashboard() {
    const view = document.getElementById('view');
    if (!state.list.length) {
      view.innerHTML = `
        <div class="page-head"><div><h1>Where is my shipment?</h1><p>Status, ETA, vessel position and full tracking history for your ${esc(CFG.companyName)} shipments.</p></div></div>
        ${quickAddHtml()}
        <div class="card empty">${ICON.box}<h3>No shipments yet</h3><p>Shipments you track are kept in a list on this device, so you can see them all at a glance next time.</p></div>`;
      bindQuickAdd();
      return;
    }
    view.innerHTML = `<div class="page-head"><div><h1>My shipments</h1><p>Loading tracking…</p></div></div>`;
    await trackAll();
    if (route().name !== 'dashboard') return;

    const items = state.list.map((s) => ({ s, t: state.tracking.get(s.reference) }));
    const soon = Date.now() + 7 * 86400000;
    const c = {
      total: items.length,
      transit: items.filter(({ t }) => ['IN_TRANSIT', 'TRANSSHIPMENT'].includes(t.status)).length,
      arriving: items.filter(({ t }) => t.eta && !['ARRIVED', 'DISCHARGED', 'GATE_OUT', 'DELIVERED'].includes(t.status) && new Date(t.eta) <= soon).length,
      delivered: items.filter(({ t }) => isDone(t)).length,
    };

    view.innerHTML = `
      <div class="page-head">
        <div><h1>My shipments</h1><p>${c.total} shipment${c.total === 1 ? '' : 's'} · updated ${ago(items[0].t.fetchedAt)}</p></div>
        <div class="actions"><button class="btn" id="refresh-all">${ICON.refresh} Refresh</button></div>
      </div>
      ${quickAddHtml()}
      <div class="kpis four">
        <div class="card kpi"><div class="label">Tracking</div><div class="value">${c.total}</div></div>
        <div class="card kpi"><div class="label">At sea</div><div class="value">${c.transit}</div></div>
        <div class="card kpi"><div class="label">Arriving ≤ 7 days</div><div class="value">${c.arriving}</div></div>
        <div class="card kpi"><div class="label">Delivered</div><div class="value">${c.delivered}</div></div>
      </div>
      <div class="map" id="map" role="region" aria-label="Map of vessels carrying your shipments"></div>
      <div class="card" style="margin-top:18px">
        <div class="list-head">
          <h3>Shipments</h3>
          <div class="filters">${[['active', 'Active'], ['done', 'Delivered'], ['all', 'All']].map(([k, l]) => `<button data-f="${k}" class="${state.filter === k ? 'active' : ''}">${l}</button>`).join('')}</div>
          <label class="search">${ICON.search}<span class="sr-only">Search shipments</span><input type="text" id="q" placeholder="Search reference, vessel, port…" value="${esc(state.search)}"></label>
        </div>
        <div class="rows" id="rows"></div>
      </div>`;
    bindQuickAdd();

    const drawRows = () => {
      const q = state.search.trim().toLowerCase();
      const list = items
        .filter(({ t }) => (state.filter === 'all' ? true : state.filter === 'done' ? isDone(t) : !isDone(t)))
        .filter(({ s, t }) => !q || [s.reference, s.label, t.vessel?.name, t.origin?.name, t.destination?.name, t.carrierName].some((v) => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => new Date(a.t.eta || 8.64e15) - new Date(b.t.eta || 8.64e15));
      document.getElementById('rows').innerHTML = list.length ? list.map(({ s, t }) => {
        const pct = Math.round((t.progress || 0) * 100);
        return `<a class="row saved-row" href="#/shipment/${encodeURIComponent(s.reference)}">
          <div><div class="ttl">${esc(s.label || s.reference)}</div><div class="ref">${esc(s.reference)} · ${esc(t.carrierName)}</div></div>
          <div class="col-route"><div class="route">${t.origin ? `${esc(t.origin.name)} ${ICON.arrow} ${esc(t.destination?.name)}` : `<span class="muted">${esc(t.error || 'Waiting for tracking data')}</span>`}</div>
            ${t.vessel?.name ? `<div class="vessel-line">${esc(t.vessel.name)}${t.vessel.voyage ? ` · ${esc(t.vessel.voyage)}` : ''}</div>` : ''}</div>
          <div>${pill(t)}</div>
          <div class="eta col-eta"><b>${fmtDate(t.eta)}</b><span>${t.eta ? `ETA ${relDays(t.eta)}` : ''}</span></div>
          <div class="col-progress"><span class="muted" style="font-size:12.5px">${pct}% complete</span><div class="progress"><div class="${statusClass(t.status)}-bar" style="width:${pct}%"></div></div></div>
        </a>`;
      }).join('') : '<div class="empty" style="padding:32px">No shipments match.</div>';
    };
    drawRows();

    const map = makeMap(document.getElementById('map'));
    if (map) {
      const bounds = [];
      items.filter(({ t }) => !isDone(t)).forEach(({ s, t }) => bounds.push(...drawShipment(map, s, t)));
      addLegend(map);
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5, animate: false });
      else if (bounds.length === 1) map.setView(bounds[0], 4, { animate: false });
    }

    view.querySelectorAll('.filters button').forEach((b) => b.addEventListener('click', () => {
      state.filter = b.dataset.f;
      view.querySelectorAll('.filters button').forEach((x) => x.classList.toggle('active', x === b));
      drawRows();
    }));
    document.getElementById('q').addEventListener('input', (e) => { state.search = e.target.value; drawRows(); });
    document.getElementById('refresh-all').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      await trackAll(true);
      render();
      toast('Tracking refreshed');
    }));
  }

  // ---------------------------------------------------------------- detail
  function emailText(s, t) {
    return [
      `${s.label || s.reference} (${s.reference}, ${t.carrierName})`,
      t.origin ? `Route: ${t.origin.name} -> ${t.destination?.name}` : null,
      `Status: ${t.statusLabel}`,
      `ETA: ${fmtDate(t.eta)}`,
      t.lastEvent ? `Latest: ${t.lastEvent.description} - ${t.lastEvent.location} (${fmtDateTime(t.lastEvent.time)})` : null,
      t.vessel?.name ? `Vessel: ${t.vessel.name}${t.vessel.voyage ? ` / ${t.vessel.voyage}` : ''}` : null,
      '',
      `Track it: ${shareUrl(s.reference)}`,
      t.links?.marineTraffic ? `Vessel on MarineTraffic: ${t.links.marineTraffic}` : null,
    ].filter((x) => x !== null).join('\n');
  }

  async function renderDetail(ref) {
    const view = document.getElementById('view');
    let s = findSaved(ref);
    const saved = Boolean(s);
    if (!s) {
      let info;
      try { info = checkReference(ref); } catch (err) {
        view.innerHTML = `<a class="back" href="#/">${ICON.back} My shipments</a><div class="card empty"><h3>Can't track this number</h3><p>${esc(err.message)}</p></div>`;
        return;
      }
      s = { ...info, label: '', addedAt: new Date().toISOString() };
    }
    view.innerHTML = `<a class="back" href="#/">${ICON.back} My shipments</a><div class="empty">Loading tracking…</div>`;
    const t = await track(s);
    if (route().ref !== ref) return;

    const p = t.vesselPosition;
    const pct = Math.round((t.progress || 0) * 100);
    const events = t.events || [];
    const lastActualIdx = events.reduce((acc, e, i) => (e.actual ? i : acc), -1);

    view.innerHTML = `
      <a class="back" href="#/">${ICON.back} My shipments</a>
      ${saved ? '' : `<div class="save-banner"><span>Save <b>${esc(s.reference)}</b> to your list to see it with your other shipments next time.</span><button class="btn primary small" id="save">${ICON.star} Save to my list</button></div>`}
      <div class="page-head">
        <div>
          <h1>${esc(s.label || s.reference)} ${pill(t)}</h1>
          <p><span class="mono">${esc(s.reference)}</span> · ${esc(t.carrierName)} · ${s.refType === 'container' ? 'Container' : 'Booking / B/L'} · ${t.source === 'demo' ? '<span class="muted">Demo data</span>' : `<b style="color:var(--green)">Live data</b>`}</p>
        </div>
        <div class="actions">
          <button class="btn" id="refresh">${ICON.refresh} Refresh</button>
          ${saved ? '<button class="btn" id="edit">Edit details</button>' : ''}
        </div>
      </div>

      <div class="detail-grid">
        <div class="stack">
          <div class="card">
            <div class="summary">
              <div><div class="k">From</div><div class="v">${esc(t.origin?.name || '—')}<small>ETD ${fmtDate(t.etd)}</small></div></div>
              <div><div class="k">To</div><div class="v">${esc(t.destination?.name || '—')}<small>${t.transshipment?.length ? `via ${esc(t.transshipment.map((x) => x.name).join(', '))}` : 'Direct'}</small></div></div>
              <div><div class="k">ETA</div><div class="v">${fmtDate(t.eta)}<small>${relDays(t.eta)}</small></div></div>
              <div><div class="k">Last update</div><div class="v">${t.lastEvent ? esc(t.lastEvent.description) : '—'}<small>${t.lastEvent ? `${esc(t.lastEvent.location)} · ${fmtDateTime(t.lastEvent.time)}` : ''}</small></div></div>
            </div>
            <div class="journey">
              <div class="journey-bar"><span>${esc(t.origin?.code || 'Origin')}</span><div class="progress"><div class="${statusClass(t.status)}-bar" style="width:${pct}%"></div></div><span>${esc(t.destination?.code || 'Destination')}</span></div>
              <div class="muted" style="font-size:12.5px;margin-top:6px">${pct}% of the journey complete</div>
            </div>
          </div>

          <div class="map tall" id="map" role="region" aria-label="Map of this shipment's route and vessel"></div>

          <div class="card card-pad">
            <h3>Vessel</h3>
            ${t.vessel ? `
            <dl class="kv">
              <dt>Name</dt><dd>${esc(t.vessel.name || '—')}${t.vessel.voyage ? ` <span class="muted">· voyage ${esc(t.vessel.voyage)}</span>` : ''}</dd>
              ${t.vessel.imo ? `<dt>IMO</dt><dd class="mono">${esc(t.vessel.imo)}</dd>` : ''}
              ${t.vessel.mmsi ? `<dt>MMSI</dt><dd class="mono">${esc(t.vessel.mmsi)}</dd>` : ''}
              ${p?.lat != null ? `
                <dt>Position</dt><dd>${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°</dd>
                <dt>Speed / course</dt><dd>${p.speed != null ? `${p.speed.toFixed(1)} kn` : '—'} / ${p.course != null ? `${Math.round(p.course)}°` : '—'}</dd>
                ${p.navStatus ? `<dt>Status</dt><dd>${esc(p.navStatus)}</dd>` : ''}` : ''}
            </dl>` : '<p class="muted">No vessel assigned yet.</p>'}
            <div class="notice">${ICON.info}<div>${p?.lat != null ? 'The position shown is estimated from the voyage schedule.' : 'The ship\'s current position isn\'t part of the tracking data.'} Open MarineTraffic for the vessel's live AIS position.${saved && !(t.vessel?.imo || t.vessel?.mmsi) ? ' Add the vessel IMO or MMSI under <b>Edit details</b> to link the exact ship.' : ''}</div></div>
            <div class="links">
              ${t.links?.marineTraffic ? `<a class="btn small" href="${esc(t.links.marineTraffic)}" target="_blank" rel="noopener">${ICON.ext} View vessel on MarineTraffic</a>` : ''}
              ${t.links?.transco ? `<a class="btn small" href="${esc(t.links.transco)}" target="_blank" rel="noopener">${ICON.ext} Transco track &amp; trace</a>` : ''}
              ${t.links?.carrier ? `<a class="btn small" href="${esc(t.links.carrier)}" target="_blank" rel="noopener">${ICON.ext} ${esc(t.carrierName)} tracking</a>` : ''}
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card card-pad">
            <h3>Share this shipment</h3>
            <p class="muted" style="margin:0 0 12px;font-size:14px">Send the tracking link to a colleague, or email yourself the latest status.</p>
            <div class="btn-row">
              <button class="btn" id="copy">${ICON.link} Copy link</button>
              <a class="btn" id="email" href="mailto:?subject=${encodeURIComponent(`${s.label || s.reference}: ${t.statusLabel}, ETA ${fmtDate(t.eta)}`)}&body=${encodeURIComponent(emailText(s, t))}">${ICON.mail} Email this update</a>
            </div>
          </div>
          <div class="card card-pad">
            <h3>Tracking history</h3>
            ${t.error ? `<div class="error">${esc(t.error)}</div>` : ''}
            ${events.length ? `<ol class="timeline">${events.map((e, i) => `
              <li class="${e.actual ? 'done' : 'future'} ${i === lastActualIdx ? 'current' : ''}">
                <span class="dot"></span>
                <div class="t-title">${esc(e.description)}${e.actual ? '' : '<span class="est">Planned</span>'}</div>
                <div class="t-meta">${esc(e.location)} · ${fmtDateTime(e.time)}${e.vessel && !e.description.includes(e.vessel) ? ` · ${esc(e.vessel)}` : ''}</div>
              </li>`).join('')}</ol>` : '<p class="muted">No tracking events yet.</p>'}
            <div class="muted" style="font-size:12.5px">Checked ${ago(t.fetchedAt)} · ${t.source === 'demo' ? 'demo data' : `live data from ${esc(t.sourceName || 'tracking feed')}`}</div>
          </div>
          ${saved ? `<div class="card card-pad"><h3>Remove from my list</h3><p class="muted" style="margin:0 0 12px;font-size:14px">Removes it from the list on this device.</p><button class="btn danger" id="remove">Remove</button></div>` : ''}
        </div>
      </div>`;

    const map = makeMap(document.getElementById('map'));
    if (map) {
      const bounds = drawShipment(map, s, t, true);
      addLegend(map);
      if (bounds.length) map.fitBounds(bounds, { ...detailPadding(map), maxZoom: 6, animate: false });
      // Re-measure once the shipment view is laid out, so the map isn't clipped after a route change.
      requestAnimationFrame(() => {
        if (!maps.includes(map)) return;
        map.invalidateSize({ animate: false });
        if (bounds.length) map.fitBounds(bounds, { ...detailPadding(map), maxZoom: 6, animate: false });
        fitLabels(map);
      });
    }

    document.getElementById('refresh').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      await track(s, true);
      render();
      toast('Tracking refreshed');
    }));
    document.getElementById('copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(shareUrl(s.reference)); toast('Link copied'); } catch { prompt('Copy this link:', shareUrl(s.reference)); }
    });
    document.getElementById('save')?.addEventListener('click', () => { addShipment(s); render(); toast('Saved to your list'); });
    document.getElementById('edit')?.addEventListener('click', () => openEditModal(s));
    document.getElementById('remove')?.addEventListener('click', () => {
      if (!confirm(`Remove ${s.label || s.reference} from your list?`)) return;
      state.list = state.list.filter((x) => x.reference !== s.reference);
      save();
      location.hash = '#/';
      toast('Removed');
    });
  }

  // ---------------------------------------------------------------- edit modal
  function closeModal() { $modal.innerHTML = ''; document.removeEventListener('keydown', escClose); }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }

  function openEditModal(s) {
    $modal.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
      <form id="edit-form" novalidate>
        <header><h2>Edit shipment</h2><button class="btn ghost small" type="button" data-close aria-label="Close">${ICON.x}</button></header>
        <div class="body">
          <div id="edit-error"></div>
          <div class="grid-2">
            <label class="field"><span>Shipping line</span><select name="carrier">${carrierOptions(s.carrier)}</select></label>
            <label class="field"><span>Your reference</span><input type="text" name="label" maxlength="80" value="${esc(s.label || '')}"></label>
            <label class="field"><span>Vessel IMO</span><input type="text" name="vesselImo" inputmode="numeric" maxlength="7" value="${esc(s.vesselImo || '')}" placeholder="7 digits"></label>
            <label class="field"><span>Vessel MMSI</span><input type="text" name="vesselMmsi" inputmode="numeric" maxlength="9" value="${esc(s.vesselMmsi || '')}" placeholder="9 digits"></label>
          </div>
          <small class="hint">The vessel numbers are only needed to link the exact ship on MarineTraffic.</small>
        </div>
        <footer><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></footer>
      </form></div></div>`;
    const back = $modal.querySelector('.modal-back');
    back.addEventListener('mousedown', (e) => { if (e.target === back) closeModal(); });
    $modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    document.addEventListener('keydown', escClose);
    const form = $modal.querySelector('form');
    form.elements.label.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const imo = form.elements.vesselImo.value.replace(/\D/g, '');
      const mmsi = form.elements.vesselMmsi.value.replace(/\D/g, '');
      const err = imo && imo.length !== 7 ? 'IMO numbers have 7 digits' : mmsi && mmsi.length !== 9 ? 'MMSI numbers have 9 digits' : '';
      if (err) { $modal.querySelector('#edit-error').innerHTML = `<div class="error">${esc(err)}</div>`; return; }
      Object.assign(s, { carrier: form.elements.carrier.value || T.detectCarrier(s.reference) || 'OTHER', label: form.elements.label.value.trim().slice(0, 80), vesselImo: imo, vesselMmsi: mmsi });
      save();
      state.tracking.delete(s.reference);
      closeModal();
      render();
      toast('Shipment updated');
    });
  }

  // ---------------------------------------------------------------- boot
  document.title = `${CFG.companyName} · Shipment Tracking`;
  load();
  render();
  setInterval(() => {
    if (!document.hidden && !$modal.innerHTML) { state.tracking.clear(); render(); }
  }, 10 * 60 * 1000);
})();
