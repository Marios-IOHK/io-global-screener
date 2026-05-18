export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { candidates, notes } = req.body;
  if (!candidates?.length) { res.status(400).json({ error: 'candidates required' }); return; }

  const ANTHROPIC_KEY = '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';

  const prompt = `You are a specialist recruiter. Score each candidate 0-100 for this role. Return ONLY a valid JSON array, no markdown, no preamble.

Hiring brief:
${notes}

Candidates:
${JSON.stringify(candidates.map(c => ({ id: c.id, name: c.name, headline: c.headline||'', location: c.address||'' })))}

Each item: {"id":"...","score":0-100,"tags":["tag1","tag2"],"reasoning":"2-3 sentences"}
Tags: 1-3 short labels like "private credit","emerging markets","location mismatch","no exp","strong fit"
Return only the JSON array.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await r.json();
  const text = data.content?.find(b => b.type === 'text')?.text || '[]';
  let scores = [];
  try { scores = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch {}
  res.status(200).json({ scores });
}
