-- Friends, kid-safe: found by nickname (word ids, no free text), added only when both agree, no chat.
-- A friend can be called into a party with one tap: the invite carries just the party code and lives two minutes.
-- Online = seen in the last 90 s; friends() and my_invites() count as a heartbeat while the game is open.
create table public.bb_friends (
  a uuid not null references public.profiles (id) on delete cascade, -- who asked
  b uuid not null references public.profiles (id) on delete cascade, -- who was asked
  state text not null default 'pending' check (state in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a <> b)
);
alter table public.bb_friends enable row level security;
create index bb_friends_b on public.bb_friends (b);

create table public.bb_invites (
  id bigint generated always as identity primary key,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  mode text not null check (mode in ('boss', 'duo')),
  created_at timestamptz not null default now(),
  seen boolean not null default false
);
alter table public.bb_invites enable row level security;
create index bb_invites_to on public.bb_invites (to_id, created_at);

create function public.bb_me() returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles where owner = auth.uid();
$$;

-- how a player looks in friend lists
create function public.bb_card(p profiles, me uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'nick', p.nick, 'avatar', p.avatar, 'skin', p.skins ->> p.avatar, 'trophies', p.trophies,
    'online', p.last_seen > now() - interval '90 seconds',
    'rel', case
      when exists (select 1 from bb_friends f where f.state = 'accepted' and ((f.a = me and f.b = p.id) or (f.a = p.id and f.b = me))) then 'friend'
      when exists (select 1 from bb_friends f where f.state = 'pending' and f.a = me and f.b = p.id) then 'out'
      when exists (select 1 from bb_friends f where f.state = 'pending' and f.a = p.id and f.b = me) then 'in'
      else 'none' end);
$$;

create function public.find_players(p_nick jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := bb_me();
begin
  if me is null then raise exception 'no profile'; end if;
  return coalesce((select jsonb_agg(bb_card(p, me) order by p.last_seen desc) from (
    select * from profiles p
    where p.id <> me and (p.nick ->> 'a') = (p_nick ->> 'a') and (p.nick ->> 'n') = (p_nick ->> 'n') and (p.nick ->> 'd') = (p_nick ->> 'd')
      and p.last_seen > now() - interval '60 days'
    order by p.last_seen desc limit 10) p), '[]'::jsonb);
end $$;

create function public.friend_request(p_id uuid) returns text language plpgsql security definer set search_path = public as $$
declare me uuid := bb_me();
begin
  if me is null or p_id is null or p_id = me or not exists (select 1 from profiles where id = p_id) then return 'bad'; end if;
  if exists (select 1 from bb_friends where state = 'accepted' and ((a = me and b = p_id) or (a = p_id and b = me))) then return 'friend'; end if;
  if exists (select 1 from bb_friends where state = 'pending' and a = p_id and b = me) then -- they already asked: that's a yes
    update bb_friends set state = 'accepted' where a = p_id and b = me;
    return 'friend';
  end if;
  if (select count(*) from bb_friends where (a = me or b = me) and state = 'accepted') >= 100 then return 'full'; end if;
  if (select count(*) from bb_friends where a = me and state = 'pending') >= 20 then return 'many'; end if;
  insert into bb_friends (a, b) values (me, p_id) on conflict do nothing;
  return 'sent';
end $$;

create function public.friend_answer(p_id uuid, p_accept boolean) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := bb_me();
begin
  if p_accept then update bb_friends set state = 'accepted' where a = p_id and b = me and state = 'pending';
  else delete from bb_friends where a = p_id and b = me and state = 'pending'; end if;
end $$;

create function public.friend_remove(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := bb_me();
begin
  delete from bb_friends where (a = me and b = p_id) or (a = p_id and b = me);
end $$;

-- my friends, requests to me and from me; also says "I'm online"
create function public.friends() returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := bb_me();
begin
  if me is null then return '[]'::jsonb; end if;
  update profiles set last_seen = now() where id = me;
  return coalesce((select jsonb_agg(bb_card(p, me) order by (p.last_seen > now() - interval '90 seconds') desc, p.trophies desc)
    from profiles p
    where p.id in (select case when f.a = me then f.b else f.a end from bb_friends f where f.a = me or f.b = me)), '[]'::jsonb);
end $$;

create function public.party_invite(p_id uuid, p_code text, p_mode text) returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := bb_me();
begin
  if me is null or not exists (select 1 from bb_friends where state = 'accepted' and ((a = me and b = p_id) or (a = p_id and b = me))) then return false; end if;
  if exists (select 1 from bb_invites where from_id = me and to_id = p_id and created_at > now() - interval '15 seconds') then return false; end if;
  insert into bb_invites (from_id, to_id, code, mode) values (me, p_id, p_code, p_mode);
  delete from bb_invites where created_at < now() - interval '1 day';
  return true;
end $$;

-- fresh invites to me (each shown once); also says "I'm online"
create function public.my_invites() returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := bb_me(); res jsonb;
begin
  if me is null then return '[]'::jsonb; end if;
  update profiles set last_seen = now() where id = me;
  with fresh as (
    update bb_invites set seen = true
    where to_id = me and not seen and created_at > now() - interval '2 minutes'
    returning from_id, code, mode, created_at)
  select coalesce(jsonb_agg(jsonb_build_object('code', f.code, 'mode', f.mode, 'from', jsonb_build_object('nick', p.nick, 'avatar', p.avatar, 'skin', p.skins ->> p.avatar)) order by f.created_at desc), '[]'::jsonb)
    into res from fresh f join profiles p on p.id = f.from_id;
  return res;
end $$;

revoke execute on function public.bb_me(), public.bb_card(profiles, uuid) from public, anon, authenticated;
revoke execute on function public.find_players(jsonb), public.friend_request(uuid), public.friend_answer(uuid, boolean), public.friend_remove(uuid),
  public.friends(), public.party_invite(uuid, text, text), public.my_invites() from public, anon;
grant execute on function public.find_players(jsonb), public.friend_request(uuid), public.friend_answer(uuid, boolean), public.friend_remove(uuid),
  public.friends(), public.party_invite(uuid, text, text), public.my_invites() to authenticated;
