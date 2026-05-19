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

  const daysFrom = parseInt(from) || 0;
  const daysTo = parseInt(to) || 30;
  const now = new Date();
  const newerThan = new Date(now - daysFrom * 86400000);
  const olderThan = new Date(now - daysTo * 86400000);
  const MAX = 100;

  // Fetch job description
  let jobDescription = '';
  try {
    const jobRes = await fetch(
      `https://www.workable.com/spi/v3/accounts/${SUBDOMAIN}/jobs/${shortcode}`,
      { headers: { 'Authorization': `Bearer ${WORKABLE_KEY}` } }
    );
    if (jobRes.ok) {
      const jobData = await jobRes.json();
      const raw = jobData.full_description || jobData.description || '';
      jobDescription = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  } catch(e) {}

  // Fetch candidates
  let all = [];
  let url = `https://www.workable.com/spi/v3/accounts/${SUBDOMAIN}/jobs/${shortcode}/candidates?limit=100`;
  let pageCount = 0;
  let done = false;

  while (url && !done && all.length < MAX) {
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
      const created = new Date(c.created_at);
      if (created < olderThan) { done = true; break; }
      if (created > newerThan) continue;
      if (c.disqualified) continue;
      if (c.stage_kind !== 'applied') continue;
      all.push(c);
      if (all.length >= MAX) { done = true; break; }
    }

    pageCount++;
    url = data.paging?.next || null;
  }

  // Enrich candidates with full profile
  const enriched = await Promise.all(all.map(async (c, i) => {
    await sleep(i * 300);
    try {
      const r = await fetch(
        `https://www.workable.com/spi/v3/candidates/${c.id}`,
        { headers: { 'Authorization': `Bearer ${WORKABLE_KEY}` } }
      );
      if (!r.ok) return c;
      const full = await r.json();

      const text = [
        full.summary || '',
        (full.experience_entries || []).map(e => `${e.title} ${e.description || ''}`).join(' '),
        (full.education_entries || []).map(e => `${e.degree} ${e.field} ${e.school}`).join(' ')
      ].join(' ');

      const githubMatch = text.match(/github\.com\/([a-zA-Z0-9_-]+)/i);
      const linkedinMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);

      let githubData = null;
      if (githubMatch) {
        try {
          const ghRes = await fetch(`https://api.github.com/users/${githubMatch[1]}/repos?sort=pushed&per_page=10`);
          if (ghRes.ok) {
            const repos = await ghRes.json();
            githubData = {
              username: githubMatch[1],
              url: `https://github.com/${githubMatch[1]}`,
              languages: [...new Set(repos.map(r => r.language).filter(Boolean))],
              lastActive: repos[0]?.pushed_at || null,
              repoCount: repos.length
            };
          }
        } catch(e) {}
      }

      const cvText = [
        full.summary || '',
        (full.experience_entries || []).map(e =>
          `${e.title} at ${e.company} (${e.start_date || ''} - ${e.end_date || 'present'}): ${e.description || ''}`
        ).join('\n'),
        (full.education_entries || []).map(e =>
          `${e.degree} in ${e.field} at ${e.school}`
        ).join('\n'),
        (full.skills || []).map(s => s.name).join(', ')
      ].filter(Boolean).join('\n\n');

      return {
        ...c,
        cv_text: cvText.substring(0, 3000),
        github: githubData,
        linkedin_url: linkedinMatch ? `https://linkedin.com/in/${linkedinMatch[1]}` : null,
        has_cv: !!full.resume_url
      };
    } catch(e) {
      return c;
    }
  }));

  res.status(200).json({ candidates: enriched, jobDescription, total: enriched.length });
}
