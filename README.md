# Transco Consolidation – Shipment Tracking

A shipment tracking website for Transco Consolidation customers, hosted free on **GitHub Pages**. No login: customers open the site, enter a container, booking or bill of lading number, and see:

- **Status, ETA and journey progress**, with the full track & trace history (booked → loaded → departed → transshipment → arrived → delivered)
- **A map** with the route, ports and the vessel carrying the cargo
- **Links** to the vessel on **MarineTraffic**, to the shipping line's own tracking page, and (optionally) to Transco's track & trace page
- **A list of their shipments**, saved in their own browser, so they see everything at a glance next time
- **Share buttons**: copy a tracking link, or email the latest status to someone

Container numbers are checked with the ISO 6346 check digit, and the shipping line is detected from the container prefix.

Transco staff can send customers a direct link to a shipment:
`https://sajeevds91.github.io/transco-/#/shipment/MSCU1234566`

## Turning on the website (one time)

1. On GitHub, open this repository → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose branch **main** and folder **/ (root)**, then **Save**.
3. After a minute or two the site is live at **https://sajeevds91.github.io/transco-/**.

Every change pushed to `main` goes live automatically. To use your own domain (e.g. `track.transco.lk`), enter it under **Custom domain** on the same Pages screen and follow GitHub's DNS instructions.

## Settings

Edit **`config.js`** (you can do it directly on GitHub with the pencil icon): company name, support email, the link to Transco's own track & trace page, and an optional live tracking feed.

Everything in this repository is public, so **never put passwords or secret API keys in it**.

## Tracking data

Until a live feed is set in `config.js`, the site shows **demo tracking data**: realistic journeys through Colombo that move forward in real time, so the site can be tried out.

For live data, `trackingApiUrl` must point to a feed that a web browser can call directly (it must allow cross-origin/CORS requests) and that does not need a secret key. `{ref}` and `{carrier}` in the URL are filled in. It should return JSON like:

```json
{
  "status": "IN_TRANSIT",
  "origin": { "code": "LKCMB", "name": "Colombo, Sri Lanka", "lat": 6.95, "lon": 79.84 },
  "destination": { "code": "NLRTM", "name": "Rotterdam, Netherlands", "lat": 51.95, "lon": 4.05 },
  "etd": "2026-11-02T08:00:00Z",
  "eta": "2026-11-24T06:00:00Z",
  "vessel": { "name": "VESSEL NAME", "imo": "9876543", "mmsi": "123456789", "voyage": "045W" },
  "events": [
    { "time": "2026-11-01T10:00:00Z", "code": "LOADED", "location": { "code": "LKCMB", "name": "Colombo" }, "description": "Loaded on vessel", "actual": true }
  ]
}
```

Most commercial tracking APIs need a secret key, which can't go in a public website. To use one of those, put a small proxy in front of it (for example a free Cloudflare Worker that adds the key) and point `trackingApiUrl` at the proxy.

## What GitHub Pages can't do

GitHub Pages only serves web pages, so this version has **no logins and no automatic email updates**, and shows MarineTraffic positions through links rather than a live API (a MarineTraffic API key would be public here). Those features need a server: a full version with customer accounts, live MarineTraffic positions and scheduled email updates exists in the `transco-dashboard/` folder of the `sajeevds91/rowing` repository (branch `claude/dreamy-darwin-rpih2z`).

## Files

| Path | What it is |
|---|---|
| `index.html` | The page |
| `config.js` | Settings |
| `assets/app.js` | The website |
| `assets/tracking.js` | Tracking: demo journeys, live feed, carrier and MarineTraffic links, container checks |
| `assets/styles.css` | Styles |
| `vendor/leaflet/` | Leaflet map library (BSD-2 licence) |
