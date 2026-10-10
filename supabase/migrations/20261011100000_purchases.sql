-- Gem packs bought with Dodo Payments. Rows are written only by the dodo-webhook function (service role) after
-- Dodo's signed payment.succeeded; a player can only take their own paid, unclaimed rows, once, with claim_purchases().
create table public.bb_purchases (
  id text primary key, -- Dodo's payment_id: the same payment never pays twice
  created_at timestamptz not null default now(),
  owner uuid not null references auth.users (id) on delete cascade,
  pack text not null,
  gems int not null check (gems > 0),
  amount int,   -- in the smallest currency unit, as Dodo sends it
  currency text,
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  claimed_at timestamptz
);
alter table public.bb_purchases enable row level security;
create index bb_purchases_owner on public.bb_purchases (owner) where claimed_at is null;

create function public.claim_purchases() returns jsonb language sql volatile security definer set search_path = public as $$
  with c as (
    update bb_purchases set claimed_at = now()
    where owner = auth.uid() and claimed_at is null and status = 'paid'
    returning id, pack, gems)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'pack', pack, 'gems', gems)), '[]'::jsonb) from c;
$$;
revoke execute on function public.claim_purchases() from public, anon;
grant execute on function public.claim_purchases() to authenticated;
