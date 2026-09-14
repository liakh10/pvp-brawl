import * as G from '../lib/game.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return G.json(res, 405, { error: 'POST only' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const pid = G.pidOf(b.key), ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0].trim();
    const n = await G.push(pid, String(b.hero || ''), b.n, ip);
    G.json(res, 200, { ok: true, pushed: n, ...(await G.state(pid)) });
  } catch (e) { G.json(res, 400, { error: e.message }); }
}
