// A player taps a gem pack: make a one-time Dodo checkout for it and hand back its URL. The player is whoever the
// Supabase session says (never a body field), and that id rides along in the metadata to the webhook.
import { CORS, DODO_API, PACKS } from '../_shared/packs.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const HOME = ['https://ballbrawl-5gr.pages.dev', 'https://ballbrawl-silk.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const key = Deno.env.get('DODO_API_KEY');
  if (!key) return json({ error: 'not set up' }, 503);
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: req.headers.get('Authorization') ?? '' } });
  const user = who.ok ? await who.json() : null;
  if (!user?.id) return json({ error: 'no user' }, 401);
  const { pack, back } = await req.json().catch(() => ({}));
  const p = PACKS[pack];
  if (!p?.product) return json({ error: 'bad pack' }, 400);
  const home = HOME.find(h => typeof back === 'string' && back.startsWith(h)) ?? HOME[0]; // only ever back to the game
  const r = await fetch(`${DODO_API}/checkouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_cart: [{ product_id: p.product, quantity: 1 }], metadata: { uid: user.id, pack }, return_url: `${home}/?paid=${pack}` }),
  });
  const s = await r.json().catch(() => null);
  if (!r.ok || !s?.checkout_url) return json({ error: 'dodo', status: r.status }, 502);
  return json({ url: s.checkout_url });
});
