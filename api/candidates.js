export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { shortcode, from, to } = req.query;
  if (!shortcode) { res.status(400).json({ error: 'shortcode required' }); return; }

  const WORKABLE_KEY = 'u7OS-cRLg-ZqhfBADwkKpkcmnuUnhG5_h6OeSN1qE-8';
  const SUBDOMAIN = 'io-global';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Convert from/to days-ago into actual dates
  const now = new Date();
  const fromDate = to ? new Date(now - to * 86400000) : null;       // "to" days ago = older boundary
  const toDate = from ? new Date(now - from * 86400000) : null;     // "from" days ago = newer boundary

  let all = [];
  let url = `https://www.workable.com/spi/v3/accounts/${SUBDOMAIN}/jobs/${shortcode}/candidates?limit=100&stage_slug=applied`;
  let pageCount = 0;
  let done = false;

  while (url && !done) {
    if (pageCount > 0) await sleep(1200);

    let attempts = 0;
    let data = null;

    while (attempts < 3) {
      attempts++;
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${WORKABLE_KEY}` } });
      if (r.status === 429) { await sleep(5000 * attempts); continue; }
      if (!r.ok) { res.status(r.status).json({ error: `Workable error ${r.status}` }); return; }
      data = await r.json();
      break;
    }

    if (!data) { res.status(429).json({ error: 'Rate limited — please try again' }); return; }

    for (const c of (data.candidates || [])) {
      if (c.disqualified || c.stage_kind !== 'applied') continue;

      const created = new Date(c.created_at);

      // If candidate is older than our "to" boundary, stop paginating (results are newest-first)
      if (fromDate && created < fromDate) { done = true; break; }

      // Skip if newer than our "from" boundary
      if (toDate && created > toDate) continue;

      all.push(c);
    }

    pageCount++;
    url = data.paging?.next || null;
  }

  res.status(200).json({ candidates: all, total: all.length });
}
