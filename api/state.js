import * as G from '../lib/game.js';
export default async function handler(req, res) {
  try { const q = req.query || {}; G.json(res, 200, await G.state(await G.playerOf(q.session))); }
  catch (e) { G.json(res, 400, { error: e.message }); }
}
