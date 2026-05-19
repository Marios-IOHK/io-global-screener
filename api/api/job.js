export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { shortcode } = req.query;
  if (!shortcode) { res.status(400).json({ error: 'shortcode required' }); return; }

  const WORKABLE_KEY = 'u7OS-cRLg-ZqhfBADwkKpkcmnuUnhG5_h6OeSN1qE-8';
  const SUBDOMAIN = 'io-global';

  try {
    const r = await fetch(
      `https://www.workable.com/spi/v3/accounts/${SUBDOMAIN}/jobs/${shortcode}`,
      { headers: { 'Authorization': `Bearer ${WORKABLE_KEY}` } }
    );
    if (!r.ok) { res.status(r.status).json({ error: `Workable error ${r.status}` }); return; }
    const data = await r.json();
    res.status(200).json({
      title: data.title || '',
      description: data.full_description || data.description || ''
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
