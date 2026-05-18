export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { shortcode } = req.query;
  if (!shortcode) { res.status(400).json({ error: 'shortcode required' }); return; }

  const WORKABLE_KEY = 'u7OS-cRLg-ZqhfBADwkKpkcmnuUnhG5_h6OeSN1qE-8';
  const SUBDOMAIN = 'io-global';

  let all = [];
  let url = `https://www.workable.com/spi/v3/accounts/${SUBDOMAIN}/jobs/${shortcode}/candidates?limit=100`;

  while (url) {
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${WORKABLE_KEY}` } });
    if (!r.ok) { res.status(r.status).json({ error: `Workable error ${r.status}` }); return; }
    const data = await r.json();
    all = all.concat(data.candidates || []);
    url = data.paging?.next || null;
  }

  res.status(200).json({ candidates: all });
}
