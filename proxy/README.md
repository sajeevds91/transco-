# Live CMA CGM tracking

This folder holds a small **Cloudflare Worker** (`cma-cgm-worker.js`) that connects the website to CMA CGM's free Track & Trace API. The worker keeps the CMA CGM API key secret: the key is stored in Cloudflare, never in this public repository or the website.

Once it's set up, shipments with **CMA CGM** as the shipping line show live status, ETA, tracking history and vessel. Other shipping lines keep showing demo data, labelled as demo.

It covers CMA CGM's public tracking data: container moves (gate in/out, load, discharge, transshipment) and vessel arrival/departure dates. It doesn't include the ship's live position; the MarineTraffic button links to the exact ship instead.

## 1. Get a CMA CGM API key (free)

1. Go to https://api-portal.cma-cgm.com and create an account.
2. Subscribe your application to the **Track & Trace** (DCSA) API.
3. Copy your API key. CMA CGM calls it the **KeyId**.
4. In the API's description on the portal, check the address of the events endpoint. This worker uses `https://apis.cma-cgm.net/operation/trackandtrace/v1/events`. If the portal shows a different one, you'll set it in step 2.

## 2. Create the Cloudflare Worker (free)

1. Create a free account at https://dash.cloudflare.com.
2. Go to **Workers & Pages** → **Create** → **Create Worker**, name it `transco-cma-cgm`, and click **Deploy**.
3. Click **Edit code**, delete the sample code, paste in the whole of `cma-cgm-worker.js` from this folder, and click **Deploy**.
4. Go to the worker's **Settings** → **Variables and Secrets** and add:
   - `CMA_CGM_API_KEY`: type **Secret**, value = your CMA CGM KeyId
   - `ALLOWED_ORIGIN`: type **Text**, value = `https://sajeevds91.github.io`
   - only if step 1.4 showed a different address: `CMA_CGM_EVENTS_URL` (Text) = that address
5. Note the worker's address, e.g. `https://transco-cma-cgm.yourname.workers.dev`.

Check it works: open `https://transco-cma-cgm.yourname.workers.dev/?ref=` followed by a real CMA CGM container number. You should see tracking data. If you see an error message instead, it says what's wrong (e.g. the key was rejected or the container has no events yet).

## 3. Switch it on in the website

Edit `config.js` in the repository and fill in the CMA CGM line:

```js
liveTracking: {
  CMDU: 'https://transco-cma-cgm.yourname.workers.dev/?ref={ref}',
},
```

Commit the change. GitHub Pages updates the site within a minute or two.

## Notes

- Results are cached for 10 minutes to save API calls.
- CMA CGM containers are detected automatically from the prefix (CMAU, CGMU, APHU, APZU). For other containers carried by CMA CGM (e.g. leased boxes), customers pick **CMA CGM** as the shipping line when adding the shipment.
- Booking and B/L numbers work too: the worker tries them as a transport document reference, then as a booking reference.
- Command-line alternative to step 2: `cd proxy && npx wrangler deploy && npx wrangler secret put CMA_CGM_API_KEY`.

## Testing

`node --test proxy/worker.test.mjs` runs the worker against `sample-cma-cgm-events.json` (sample data in CMA CGM's DCSA format; no real API call).
