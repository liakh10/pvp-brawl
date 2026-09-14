/* Upstash Redis via the Vercel Marketplace. PVP_MEMORY=1 only for the local test server. */
import { Redis } from '@upstash/redis';
let client = null;
export function redis() {
  if (client) return client;
  if (process.env.PVP_MEMORY === '1') return (client = memory());
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw Error('Storage is not connected yet.');
  return (client = new Redis({ url, token, automaticDeserialization: false }));
}
function memory() {
  const m = new Map(), exp = new Map();
  const alive = k => { const e = exp.get(k); if (e && e < Date.now()) { m.delete(k); exp.delete(k); } return m.has(k); };
  const obj = k => alive(k) ? m.get(k) : {};
  return {
    async incr(k) { const v = (alive(k) ? Number(m.get(k)) : 0) + 1; m.set(k, v); return v; },
    async incrby(k, n) { const v = (alive(k) ? Number(m.get(k)) : 0) + n; m.set(k, v); return v; },
    async expire(k, s) { exp.set(k, Date.now() + s * 1000); return 1; },
    async get(k) { return alive(k) ? String(m.get(k)) : null; },
    async hincrby(k, f, n) { const o = obj(k); o[f] = (Number(o[f]) || 0) + n; m.set(k, o); return o[f]; },
    async hgetall(k) { const o = obj(k); return Object.keys(o).length ? Object.fromEntries(Object.entries(o).map(([a, b]) => [a, String(b)])) : null; },
    async zincrby(k, n, mem) { const o = obj(k); o[mem] = (Number(o[mem]) || 0) + n; m.set(k, o); return o[mem]; },
    async zrange(k, s, e, opt = {}) { const o = obj(k); const a = Object.entries(o).sort((x, y) => opt.rev ? y[1] - x[1] : x[1] - y[1]).slice(s, e + 1); return opt.withScores ? a.flatMap(([mm, sc]) => [mm, String(sc)]) : a.map(x => x[0]); }
  };
}
