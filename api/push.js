import * as G from '../lib/game.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return G.json(res, 405, { error: 'POST only' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const pid = await G.playerOf(b.session);
    if (!pid) return G.json(res, 401, { error: 'Connect your wallet to push.', auth: true });
    const ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0].trim();
    const r = await G.push(pid, String(b.hero || ''), b.n, ip);
    G.json(res, 200, { ok: true, pushed: r.n, points: r.pts, weight: r.mult, ...(await G.state(pid)) });
  } catch (e) { G.json(res, 400, { error: e.message }); }
}
