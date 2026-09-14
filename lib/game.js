import { createPublicClient, http, erc20Abi } from 'viem';
import { redis } from './store.js';
export const HEROES = ['cashcat', 'inu', 'blob', 'moo', 'ainu', 'jubjub', 'frog'];
export const MAX_PER_CALL = 40;
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const message = nonce => `Player vs Player\nSign in to push for your fighter. No transaction, no gas.\nNonce: ${nonce}`;

/* a signed-in wallet: session token -> lowercase address */
export async function playerOf(session) {
  if (!/^[a-f0-9]{48}$/.test(String(session || ''))) return null;
  return (await redis().get('pvp:sess:' + session)) || null;
}

const hash = o => { if (!Array.isArray(o)) return o || {}; const m = {}; for (let i = 0; i < o.length; i += 2) m[o[i]] = o[i + 1]; return m; };
const nums = o => { const m = hash(o); return Object.fromEntries(HEROES.map(h => [h, Number(m[h]) || 0])); };
function pairs(arr) { const out = []; for (let i = 0; i < (arr || []).length; i += 2) out.push({ pid: arr[i], pts: Number(arr[i + 1]) }); return out; }

export async function state(pid) {
  const R = redis(), now = Date.now(), day = dayKey(now), yday = dayKey(now - 86400000);
  const [today, total, prev, top, mine] = await Promise.all([
    R.hgetall('pvp:day:' + day), R.hgetall('pvp:total'), R.hgetall('pvp:day:' + yday),
    R.zrange('pvp:players:' + day, 0, 4, { rev: true, withScores: true }),
    pid ? R.get('pvp:me:' + day + ':' + pid) : null
  ]);
  const t = nums(today), all = nums(total), y = nums(prev);
  const yTop = HEROES.reduce((a, h) => y[h] > y[a] ? h : a, HEROES[0]);
  const msToReset = new Date(day + 'T00:00:00Z').getTime() + 86400000 - now;
  return { day, msToReset, today: t, total: all, yesterday: y[yTop] > 0 ? { hero: yTop, pts: y[yTop] } : null, top: pairs(top), me: { pid, today: Number(mine) || 0, weight: pid ? await weight(pid) : 1 } };
}

/* holders of $PVP push double once PVP_CA is set in the environment */
let pub = null;
export async function weight(address) {
  const ca = process.env.PVP_CA || '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(ca) || !/^0x[0-9a-f]{40}$/.test(address)) return 1;
  const R = redis(), k = 'pvp:w:' + address, c = await R.get(k);
  if (c) return Number(c);
  pub = pub || createPublicClient({ chain: { id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } } }, transport: http('https://rpc.mainnet.chain.robinhood.com', { timeout: 8000 }) });
  let w = 1;
  try { w = (await pub.readContract({ address: ca, abi: erc20Abi, functionName: 'balanceOf', args: [address] })) > 0n ? 2 : 1; } catch {}
  await R.set(k, String(w), { ex: 300 });
  return w;
}

export async function push(pid, hero, n, ip) {
  if (!HEROES.includes(hero)) throw Error('Pick a fighter.');
  n = Math.max(1, Math.min(MAX_PER_CALL, parseInt(n, 10) || 0));
  const R = redis(), day = dayKey();
  const rl = 'pvp:rl:' + ip, hits = await R.incrby(rl, n);
  if (hits === n) await R.expire(rl, 10);
  if (hits > 400) throw Error('Easy there. Too many pushes from this connection.');
  const rw = 'pvp:rlw:' + pid, whits = await R.incrby(rw, n);
  if (whits === n) await R.expire(rw, 10);
  if (whits > 300) throw Error('Easy there. Too many pushes from this wallet.');
  const mult = await weight(pid), pts = n * mult;
  await Promise.all([
    R.hincrby('pvp:day:' + day, hero, pts), R.hincrby('pvp:total', hero, pts),
    R.zincrby('pvp:players:' + day, pts, pid), R.incrby('pvp:me:' + day + ':' + pid, pts)
  ]);
  await Promise.all([R.expire('pvp:day:' + day, 86400 * 8), R.expire('pvp:players:' + day, 86400 * 3), R.expire('pvp:me:' + day + ':' + pid, 86400 * 2)]);
  return { n, pts, mult };
}
export function json(res, code, obj) { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); }
