/*
 * Site settings. Edit this file on GitHub to change them.
 * Everything here is PUBLIC (anyone can read it), so never put passwords or secret API keys here.
 */
window.TRANSCO_CONFIG = {
  companyName: 'Transco Consolidation',

  // Shown in the footer, e.g. 'customerservice@transco.example'
  supportEmail: '',

  // Optional: Transco's own track & trace page. {ref} is replaced by the container / B/L number.
  // e.g. 'https://track.transco.example/?ref={ref}'
  transcoTrackingUrl: '',

  // Optional: a live tracking feed the browser can call directly. It must allow cross-origin (CORS)
  // requests and must not need a secret key. {ref} and {carrier} are filled in. Leave empty for demo data.
  // The expected response format is described in README.md.
  trackingApiUrl: '',
};
