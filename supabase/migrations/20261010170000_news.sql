-- Messages from the team to every player: news, events, small gifts. Written by the team with SQL
-- (see README); players can only read them, through news(). Gifts are claimed once per save on the client.
create table public.bb_news (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  title jsonb not null, -- {"ru": "...", "en": "...", ...}
  body jsonb not null,
  gift jsonb,           -- {"coins": 100, "gems": 5} or null
  until timestamptz     -- hidden after this moment; null = stays
);
alter table public.bb_news enable row level security;

create function public.news() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', created_at, 'title', title, 'body', body, 'gift', gift) order by id desc), '[]'::jsonb)
  from (select * from public.bb_news where until is null or until > now() order by id desc limit 30) n;
$$;
revoke execute on function public.news() from public, anon;
grant execute on function public.news() to authenticated;
