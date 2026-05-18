export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { shortcode } = req.query;
  if (!shortcode) { res.status(400).json({ error: 'shortcode required' }); return; }

  const WORKABLE_KEY = 'u7OS-cRLg-ZqhfBADwkKpkcmnuUnhG5_h6OeSN1qE-8';
  const SUBDOMAIN = 'io-global';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let all = [];
  let url = `https://www.workable.com/spi/v3/accounts/${SUBDOMAIN}/jobs/${shortcode}/candidates?limit=100&stage_slug=applied`;
  let pageCount = 0;

  while (url) {
    // Rate limit protection — max 10 req/10s, so wait 1.2s between pages
    if (pageCount > 0) await sleep(1200);
    
    let attempts = 0;
    let data = null;

    while (attempts < 3) {
      attempts++;
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${WORKABLE_KEY}` } });
      
      if (r.status === 429) {
        await sleep(5000 * attempts);
        continue;
      }
      
      if (!r.ok) { res.status(r.status).json({ error: `Workable error ${r.status}` }); return; }
      data = await r.json();
      break;
    }

    if (!data) { res.status(429).json({ error: 'Workable rate limit — please try again in a moment' }); return; }

    const filtered = (data.candidates || []).filter(c =>
      !c.disqualified && c.stage_kind === 'applied'
    );
    all = all.concat(filtered);
    pageCount++;
    url = data.paging?.next || null;
  }

  res.status(200).json({ candidates: all, total: all.length });
}
