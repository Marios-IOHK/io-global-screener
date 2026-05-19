export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { jobDescription, notes } = req.body;
  if (!jobDescription && !notes) { res.status(400).json({ error: 'jobDescription or notes required' }); return; }

  const ANTHROPIC_KEY = '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';

  const cleanDescription = (jobDescription || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  const prompt = `Extract the key scoring criteria from this job description and hiring notes.
Return ONLY a valid JSON array, no markdown, no preamble.

Job Description:
${cleanDescription}

Hiring Notes:
${notes || ''}

Return an array of criteria objects. Each should be short and specific (max 8 words).
Categorise each as "must" (clearly required), "nice" (preferred but not essential), or "exclude" (not relevant for scoring).
Format: [{"text": "5+ years credit analysis experience", "type": "must"}, ...]
Extract 8-15 criteria total. Be specific and actionable.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await r.json();
  const text = data.content?.find(b => b.type === 'text')?.text || '[]';
  let criteria = [];
  try { criteria = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch {}
  res.status(200).json({ criteria });
}
