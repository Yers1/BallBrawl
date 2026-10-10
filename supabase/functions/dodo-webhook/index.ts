// Dodo calls this after a payment. Only a correctly signed (Standard Webhooks, HMAC-SHA256) and fresh payment.succeeded
// for the product of the pack in its metadata becomes gems: one bb_purchases row per payment_id, so retries never pay twice.
// A refund marks the row; a refund before the gems were taken means they're never given.
import { PACKS } from '../_shared/packs.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const enc = new TextEncoder();

async function verified(req: Request, raw: string): Promise<boolean> {
  const secret = Deno.env.get('DODO_WEBHOOK_KEY'), id = req.headers.get('webhook-id'), ts = req.headers.get('webhook-timestamp');
  const sigs = (req.headers.get('webhook-signature') ?? '').split(' ');
  if (!secret || !id || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5 minutes against replays
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mine = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${ts}.${raw}`)));
  return sigs.some(s => {
    const [v, b64] = s.split(',');
    if (v !== 'v1' || !b64) return false;
    let theirs: Uint8Array;
    try { theirs = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); } catch { return false; }
    if (theirs.length !== mine.length) return false;
    let diff = 0; // constant time
    for (let i = 0; i < mine.length; i++) diff |= mine[i] ^ theirs[i];
    return diff === 0;
  });
}

const db = (path: string, init: RequestInit) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const raw = await req.text();
  if (!(await verified(req, raw))) return new Response('bad signature', { status: 401 });
  const ev = JSON.parse(raw), d = ev?.data ?? {};
  if (ev.type === 'payment.succeeded') {
    const uid = d.metadata?.uid, pack = d.metadata?.pack, p = PACKS[pack];
    const right = p?.product && Array.isArray(d.product_cart) && d.product_cart.some((x: { product_id?: string }) => x?.product_id === p.product);
    if (typeof d.payment_id !== 'string' || typeof uid !== 'string' || !right) return new Response('ignored', { status: 200 }); // not one of ours
    const r = await db('bb_purchases', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ id: d.payment_id, owner: uid, pack, gems: p.gems, amount: d.total_amount ?? null, currency: d.currency ?? null }),
    });
    if (!r.ok) return new Response('db', { status: 500 }); // Dodo retries
  } else if (ev.type === 'refund.succeeded' && typeof d.payment_id === 'string') {
    await db(`bb_purchases?id=eq.${encodeURIComponent(d.payment_id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'refunded' }) });
  }
  return new Response('ok', { status: 200 });
});
