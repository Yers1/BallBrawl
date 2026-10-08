-- BallBrawl backend: anonymous profiles, server-owned trophies, leaderboards, async PvP opponents.
-- Kids' game: no personal data. Nicknames are word IDs from fixed lists, never free text.
-- Every table is locked behind RLS with NO policies: clients can only call the functions below.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique references auth.users (id) on delete cascade, -- one profile per player
  nick jsonb not null,
  trophies int not null default 0 check (trophies >= 0),
  max_trophies int not null default 0,
  squad text[] not null default array['basic', 'basic', 'basic'],
  skins jsonb not null default '{}'::jsonb,
  avatar text not null default 'basic',
  save jsonb not null default '{}'::jsonb, -- client progress (coins, balls, quests…): cosmetic/economy, trusted
  save_at timestamptz not null default 'epoch',
  wins int not null default 0,
  losses int not null default 0, -- abandoned matches count as losses too
  flagged boolean not null default false, -- hidden from leaderboards until reviewed
  day_key date,
  day_gain int not null default 0, -- trophies gained today (Almaty), capped at 200
  transfer_code text unique,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index profiles_trophies on public.profiles (trophies desc);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  opponent_id uuid references public.profiles (id) on delete set null, -- null = computer squad
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  state text not null default 'open' check (state in ('open', 'won', 'lost', 'draw', 'abandoned')),
  delta int not null default 0
);
create index matches_profile on public.matches (profile_id, started_at desc);
create index matches_week on public.matches (ended_at) where delta > 0;

create table public.events (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('session_day', 'match_end', 'challenge_created')),
  at timestamptz not null default now()
);
create index events_profile on public.events (profile_id, type, at desc);

create table public.redeem_attempts (
  owner uuid not null,
  at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.events enable row level security;
alter table public.redeem_attempts enable row level security;
revoke all on public.profiles, public.matches, public.events, public.redeem_attempts from anon, authenticated;

-- ---------- helpers (not callable by clients) ----------

create function public.bb_balls() returns text[] language sql immutable as $$
  select array['basic', 'leech', 'cell', 'spider', 'ninja', 'train', 'magnet', 'bomb', 'turtle', 'lightning', 'hedgehog', 'ice']
$$;

create function public.bb_valid_nick(n jsonb) returns boolean language sql immutable as $$
  select coalesce(jsonb_typeof(n -> 'a') = 'number' and jsonb_typeof(n -> 'n') = 'number' and jsonb_typeof(n -> 'd') = 'number'
    and (n ->> 'a') ~ '^\d+$' and (n ->> 'n') ~ '^\d+$' and (n ->> 'd') ~ '^\d+$'
    and (n ->> 'a')::int between 0 and 19 and (n ->> 'n')::int between 0 and 19 and (n ->> 'd')::int between 10 and 999, false)
$$;

create function public.bb_valid_squad(s text[]) returns boolean language sql immutable as $$
  select coalesce(array_length(s, 1) = 3 and s <@ public.bb_balls(), false)
$$;

create function public.bb_valid_skins(s jsonb) returns boolean language sql immutable as $$
  select coalesce(jsonb_typeof(s) = 'object' and octet_length(s::text) < 1000, false)
$$;

-- 8 characters, no look-alikes (0/O, 1/I/L), from a secure random source
create function public.bb_code() returns text language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (get_byte(b, i) % 31), 1), '')
  from (select gen_random_bytes(8) as b) r, generate_series(0, 7) as i
$$;

create function public.bb_loss(trophies int) returns int language sql immutable as $$
  select least(trophies, least(8, 2 + trophies / 150))
$$;

-- Any match still open when you start another (closed the tab mid-fight, lost the network…) counts as a loss.
create function public.bb_settle(pid uuid) returns void language plpgsql security definer set search_path = public as $$
declare r record; d int;
begin
  for r in select id from matches where profile_id = pid and state = 'open' for update loop
    select -bb_loss(trophies) into d from profiles where id = pid;
    update matches set state = 'abandoned', ended_at = now(), delta = d where id = r.id;
    update profiles set trophies = trophies + d, losses = losses + 1 where id = pid;
  end loop;
end $$;

-- ---------- client API (anonymous users have the 'authenticated' role) ----------

-- Creates your profile on first contact; offline trophies are imported once, capped at 400.
create function public.ensure_profile(p_nick jsonb, p_squad text[], p_skins jsonb, p_avatar text, p_local_trophies int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me profiles; created boolean := false; t int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into me from profiles where owner = auth.uid();
  if not found then
    if not bb_valid_nick(p_nick) then raise exception 'bad nick'; end if;
    t := least(greatest(coalesce(p_local_trophies, 0), 0), 400);
    insert into profiles (owner, nick, trophies, max_trophies, squad, skins, avatar, transfer_code)
    values (auth.uid(), p_nick, t, t,
      case when bb_valid_squad(p_squad) then p_squad else array['basic', 'basic', 'basic'] end,
      case when bb_valid_skins(p_skins) then p_skins else '{}'::jsonb end,
      case when p_avatar = any (bb_balls()) then p_avatar else 'basic' end,
      bb_code())
    returning * into me;
    created := true;
  else
    update profiles set last_seen = now() where id = me.id;
  end if;
  if not exists (select 1 from events where profile_id = me.id and type = 'session_day'
                 and (at at time zone 'Asia/Almaty')::date = (now() at time zone 'Asia/Almaty')::date) then
    insert into events (profile_id, type) values (me.id, 'session_day');
  end if;
  if random() < 0.05 then -- lazy retention cleanup, no cron needed
    delete from matches where started_at < now() - interval '90 days';
    delete from events where at < now() - interval '90 days';
    delete from redeem_attempts where at < now() - interval '1 day';
    delete from profiles where last_seen < now() - interval '365 days';
  end if;
  return jsonb_build_object('id', me.id, 'created', created, 'nick', me.nick, 'trophies', me.trophies,
    'max_trophies', me.max_trophies, 'save', me.save, 'save_at', me.save_at, 'code', me.transfer_code);
end $$;

-- Stores the newer progress blob; publishes squad/skins/avatar/nick (cosmetic, client-trusted).
create function public.sync_save(p_save jsonb, p_save_at timestamptz, p_squad text[], p_skins jsonb, p_avatar text, p_nick jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update profiles set
    save = case when p_save_at > save_at and jsonb_typeof(p_save) = 'object' and octet_length(p_save::text) < 30000 then p_save else save end,
    save_at = case when p_save_at > save_at and jsonb_typeof(p_save) = 'object' and octet_length(p_save::text) < 30000 then least(p_save_at, now()) else save_at end,
    squad = case when bb_valid_squad(p_squad) then p_squad else squad end,
    skins = case when bb_valid_skins(p_skins) then p_skins else skins end,
    avatar = case when p_avatar = any (bb_balls()) then p_avatar else avatar end,
    nick = case when bb_valid_nick(p_nick) then p_nick else nick end,
    last_seen = now()
  where owner = auth.uid()
  returning save, save_at, trophies, max_trophies, transfer_code into r;
  if not found then raise exception 'no profile'; end if;
  return jsonb_build_object('save', r.save, 'save_at', r.save_at, 'trophies', r.trophies, 'max_trophies', r.max_trophies, 'code', r.transfer_code);
end $$;

-- A real player's squad near your trophies (not you, not your last 5 opponents). null → fight the computer's squad.
create function public.find_opponent() returns jsonb language sql volatile security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('id', p.id, 'nick', p.nick, 'squad', p.squad, 'skins', p.skins, 'trophies', p.trophies)
    from profiles p, profiles me
    where me.owner = auth.uid() and p.id <> me.id and not p.flagged
      and p.trophies between me.trophies - 100 and me.trophies + 100
      and p.last_seen > now() - interval '30 days'
      and p.id not in (select m.opponent_id from matches m where m.profile_id = me.id and m.opponent_id is not null
                       order by m.started_at desc limit 5)
    order by random() limit 1), 'null'::jsonb)
$$;

create function public.start_match(p_opponent uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare me profiles; m uuid;
begin
  select * into me from profiles where owner = auth.uid() for update;
  if not found then raise exception 'no profile'; end if;
  perform bb_settle(me.id);
  if p_opponent is not null and not exists (
    select 1 from profiles where id = p_opponent and id <> me.id and abs(trophies - me.trophies) <= 200) then
    p_opponent := null;
  end if;
  insert into matches (profile_id, opponent_id) values (me.id, p_opponent) returning id into m;
  return m;
end $$;

-- Win +8 (+1 flawless, max +200 a day), loss −min(8, 2 + trophies/150), never below 0.
create function public.finish_match(p_match uuid, p_result text, p_flawless boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me profiles; mt matches; d int := 0; today date := (now() at time zone 'Asia/Almaty')::date; gained int; r record;
begin
  select * into me from profiles where owner = auth.uid() for update;
  if not found then raise exception 'no profile'; end if;
  select * into mt from matches where id = p_match and profile_id = me.id for update;
  if not found or mt.state <> 'open' then raise exception 'match closed'; end if;
  if now() - mt.started_at < interval '15 seconds' then raise exception 'too early'; end if;
  if now() - mt.started_at > interval '10 minutes' then
    perform bb_settle(me.id);
    select trophies, max_trophies into r from profiles where id = me.id;
    return jsonb_build_object('expired', true, 'delta', 0, 'trophies', r.trophies, 'max_trophies', r.max_trophies);
  end if;
  gained := case when me.day_key is distinct from today then 0 else me.day_gain end;
  if p_result = 'won' then d := least(8 + case when p_flawless then 1 else 0 end, greatest(0, 200 - gained));
  elsif p_result = 'lost' then d := -bb_loss(me.trophies);
  elsif p_result <> 'draw' then raise exception 'bad result';
  end if;
  update matches set state = p_result, ended_at = now(), delta = d where id = mt.id;
  update profiles set
    trophies = trophies + d,
    max_trophies = greatest(max_trophies, trophies + d),
    wins = wins + (p_result = 'won')::int,
    losses = losses + (p_result = 'lost')::int,
    day_key = today,
    day_gain = gained + greatest(d, 0),
    flagged = flagged or (wins + losses + 1 >= 30 and (wins + (p_result = 'won')::int) > 0.95 * (wins + losses + 1)),
    last_seen = now()
  where id = me.id
  returning trophies, max_trophies into r;
  insert into events (profile_id, type) values (me.id, 'match_end');
  return jsonb_build_object('delta', d, 'trophies', r.trophies, 'max_trophies', r.max_trophies);
end $$;

-- Top 100: all time (current trophies) or this week (trophies gained since Monday 00:00 Almaty).
-- Players inactive for 30 days or flagged are left out.
create function public.leaderboard(p_week boolean) returns jsonb language sql stable security definer set search_path = public as $$
  with ws as (select (date_trunc('week', now() at time zone 'Asia/Almaty') at time zone 'Asia/Almaty') as t),
  scores as (
    select p.owner, p.nick, p.avatar, p.skins,
      case when p_week then coalesce((select sum(m.delta) from matches m, ws
                                      where m.profile_id = p.id and m.delta > 0 and m.ended_at >= ws.t), 0)::int
           else p.trophies end as score
    from profiles p
    where not p.flagged and p.last_seen > now() - interval '30 days'
  ),
  ranked as (select *, rank() over (order by score desc) as rnk from scores where score > 0 or not p_week)
  select jsonb_build_object(
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', rnk, 'nick', nick, 'avatar', avatar,
                       'skin', skins ->> avatar, 'score', score, 'me', owner = auth.uid()) order by rnk)
                     from (select * from ranked order by rnk limit 100) t), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', rnk, 'score', score) from ranked where owner = auth.uid()))
$$;

-- Move your profile to this device with its code. This device's own fresh profile is dropped (one profile per player).
create function public.redeem_code(p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare target profiles; n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select count(*) into n from redeem_attempts where owner = auth.uid() and at > now() - interval '1 hour';
  if n >= 5 then raise exception 'too many tries'; end if;
  insert into redeem_attempts (owner) values (auth.uid());
  select * into target from profiles where transfer_code = upper(trim(p_code)) for update;
  if not found then return 'null'::jsonb; end if;
  if target.owner <> auth.uid() then
    delete from profiles where owner = auth.uid();
    update profiles set owner = auth.uid(), transfer_code = bb_code(), last_seen = now() where id = target.id;
  end if;
  return jsonb_build_object('id', target.id);
end $$;

create function public.delete_profile() returns void language sql security definer set search_path = public as $$
  delete from profiles where owner = auth.uid(); -- matches and events go with it (on delete cascade)
$$;

create function public.log_event(p_type text) returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if p_type <> 'challenge_created' then raise exception 'bad event'; end if;
  select id into pid from profiles where owner = auth.uid();
  if pid is null then return; end if;
  if (select count(*) from events where profile_id = pid and type = p_type and at > now() - interval '1 day') >= 50 then return; end if;
  insert into events (profile_id, type) values (pid, p_type);
end $$;

-- ---------- permissions ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.ensure_profile(jsonb, text[], jsonb, text, int),
  public.sync_save(jsonb, timestamptz, text[], jsonb, text, jsonb),
  public.find_opponent(),
  public.start_match(uuid),
  public.finish_match(uuid, text, boolean),
  public.leaderboard(boolean),
  public.redeem_code(text),
  public.delete_profile(),
  public.log_event(text)
to authenticated;
