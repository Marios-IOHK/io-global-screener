export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { candidates, jobDescription, notes, criteria } = req.body;
  if (!candidates?.length) { res.status(400).json({ error: 'candidates required' }); return; }

  const ANTHROPIC_KEY = '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';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const cleanDescription = (jobDescription || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  const mustHave = (criteria || []).filter(c => c.type === 'must').map(c => `- ${c.text}`).join('\n') || '- Use job description';
  const niceToHave = (criteria || []).filter(c => c.type === 'nice').map(c => `- ${c.text}`).join('\n') || '- Use job description';
  const excluded = (criteria || []).filter(c => c.type === 'exclude').map(c => `- ${c.text}`).join('\n') || '- None';

  const results = [];
  const BATCH = 5;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);

    const prompt = `You are a specialist recruiter. Score each candidate for the role below.

JOB DESCRIPTION:
${cleanDescription}

ADDITIONAL NOTES:
${notes || 'None'}

MUST HAVE (penalise heavily if missing):
${mustHave}

NICE TO HAVE:
${niceToHave}

IGNORE THESE CRITERIA:
${excluded}

CANDIDATES:
${JSON.stringify(batch.map(c => ({
  id: c.id,
  name: c.name,
  headline: c.headline || '',
  location: c.address || '',
  cv_text: (c.cv_text || '').substring(0, 1500),
  github: c.github ? `${c.github.url} | Languages: ${c.github.languages.join(', ')} | Last active: ${c.github.lastActive}` : null
})))}

Return ONLY a valid JSON array, no markdown, no preamble. One object per candidate:
[{
  "id": "...",
  "score": 0-100,
  "tier": "Strong Match" or "Good Match" or "Weak Match",
  "decision": "Advance" or "Review" or "Reject",
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "gaps": ["specific gap 1", "specific gap 2"],
  "summary": "2-3 sentence summary referencing their actual experience",
  "github_signal": "one sentence on their GitHub activity, or null if no GitHub"
}]

Be specific — reference actual job titles, companies, skills and credentials from their CV in strengths and gaps.`;

    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }]
          })
        });

        if (r.status === 429) { await sleep(5000 * attempts); continue; }

        const data = await r.json();
        const text = data.content?.find(b => b.type === 'text')?.text || '[]';
        let scores = [];
        try { scores = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch {}
        results.push(...scores);
        if (i + BATCH < candidates.length) await sleep(1000);
        break;

      } catch(e) {
        if (attempts >= 3) {
          batch.forEach(c => results.push({
            id: c.id, score: 50, tier: 'Weak Match', decision: 'Review',
            strengths: [], gaps: [], summary: 'Could not score — review manually.', github_signal: null
          }));
        } else {
          await sleep(3000 * attempts);
        }
      }
    }
  }

  res.status(200).json({ scores: results });
}
