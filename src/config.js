// Public Supabase settings for the browser. The anon key is meant to be public: every table is locked
// behind RLS and players can only call the reviewed functions in supabase/migrations.
// Gem packs for real money through Dodo Payments (supabase/functions/dodo-*). Turn `on` once the products and secrets
// are set up in Dodo and Supabase; the price shown is a label only — Dodo charges what the product says.
export const PAY = { on: false, packs: [{ id: 's', gems: 80, price: '$0.99' }, { id: 'm', gems: 450, price: '$4.99', best: true }, { id: 'l', gems: 1000, price: '$9.99' }] };
export const SUPABASE_URL = 'https://zowdpibgfnpqcvwgtryv.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpvd2RwaWJnZm5wcWN2d2d0cnl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0Mzk2MDIsImV4cCI6MjEwNzAxNTYwMn0.quNL3UgE0yhywRBS092km6PX0GXwTIlo5a3gBZBLDQM';
