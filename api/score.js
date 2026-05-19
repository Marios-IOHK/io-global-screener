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

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let attempts = 0;

    while (attempts < 3) {
      attempts++;
      try {
        const prompt = `You are a specialist recruiter. Score this candidate for the role below.

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

CANDIDATE:
Name: ${c.name}
Headline: ${c.headline || ''}
Location: ${c.address || ''}
CV / Profile:
${c.cv_text || 'Not available'}
${c.github ? `GitHub: ${c.github.url} | Languages: ${c.github.languages.join(', ')} | Last active: ${c.github.lastActive}` : ''}

Return ONLY a single valid JSON object, no markdown, no preamble:
{
  "id": "${c.id}",
  "score": 0-100,
  "tier": "Strong Match" or "Good Match" or "Weak Match",
  "decision": "Advance" or "Review" or "Reject",
  "strengths": ["specific strength 1", "specific strength 2", ...],
  "gaps": ["specific gap 1", "specific gap 2", ...],
  "summary": "2-3 sentence summary of this candidate",
  "github_signal": "one sentence on their GitHub activity or null"
}

Strengths and gaps should be specific to this candidate — reference actual experience, skills, or credentials from their CV.`;

        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }]
          })
        });

        if (r.status === 429) { await sleep(5000 * attempts); continue; }

        const data = await r.json();
        const text = data.content?.find(b => b.type === 'text')?.text || '{}';
        let score = {};
        try { score = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch {}
        results.push({ ...score, id: c.id });
        if (i < candidates.length - 1) await sleep(1000);
        break;

      } catch(e) {
        if (attempts >= 3) results.push({ id: c.id, score: 50, tier: 'Weak Match', decision: 'Review', strengths: [], gaps: [], summary: 'Could not score.', github_signal: null });
        else await sleep(3000 * attempts);
      }
    }
  }

  res.status(200).json({ scores: results });
}
