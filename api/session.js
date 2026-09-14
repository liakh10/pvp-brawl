/* Wallet sign-in for the arena. GET returns a one-time nonce; POST { address, nonce, signature } checks the
   signature (no gas, no transaction) and returns a session token that identifies the wallet for 7 days. */
import crypto from 'node:crypto';
import { verifyMessage, getAddress } from 'viem';
import { redis } from '../lib/store.js';
import { json, message } from '../lib/game.js';

export default async function handler(req, res) {
  const R = redis();
  try {
    if (req.method === 'GET') {
      const nonce = crypto.randomBytes(12).toString('hex');
      await R.set('pvp:nonce:' + nonce, '1', { ex: 600 });
      return json(res, 200, { nonce, message: message(nonce) });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'GET or POST' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!/^0x[0-9a-fA-F]{40}$/.test(b.address || '') || !/^[a-f0-9]{24}$/.test(b.nonce || '') || !/^0x[0-9a-fA-F]+$/.test(b.signature || '')) throw Error('Sign-in data is incomplete.');
    if (!(await R.get('pvp:nonce:' + b.nonce))) throw Error('Sign-in expired, try again.');
    await R.del('pvp:nonce:' + b.nonce);
    const address = getAddress(b.address);
    const ok = await verifyMessage({ address, message: message(b.nonce), signature: b.signature });
    if (!ok) throw Error('Signature does not match this wallet.');
    const session = crypto.randomBytes(24).toString('hex');
    await R.set('pvp:sess:' + session, address.toLowerCase(), { ex: 86400 * 7 });
    json(res, 200, { session, address });
  } catch (e) { json(res, 400, { error: e.message }); }
}
