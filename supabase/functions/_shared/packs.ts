// The gem packs. Prices are set on the products in the Dodo dashboard; the product ids come from secrets:
//   npx supabase secrets set DODO_PRODUCT_S=pdt_... DODO_PRODUCT_M=pdt_... DODO_PRODUCT_L=pdt_...
// Fixed contents only — nothing random is ever sold for money.
export const PACKS: Record<string, { gems: number; product: string | undefined }> = {
  s: { gems: 80, product: Deno.env.get('DODO_PRODUCT_S') },
  m: { gems: 450, product: Deno.env.get('DODO_PRODUCT_M') },
  l: { gems: 1000, product: Deno.env.get('DODO_PRODUCT_L') },
};
// DODO_MODE=test while trying it out (test cards), live for real money.
export const DODO_API = Deno.env.get('DODO_MODE') === 'live' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
