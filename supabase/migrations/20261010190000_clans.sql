-- Clans, kid-safe: the name is two words from the nickname lists (no free text), an emblem, a member list
-- and the clan's total trophies. No chat. Up to 30 members; the leader passes to the top player on leaving.
create table public.bb_clans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name jsonb not null, -- {"a": adjective id, "n": noun id}, the nickname word lists
  badge int not null default 0 check (badge between 0 and 7),
  leader uuid references public.profiles (id) on delete set null
);
alter table public.bb_clans enable row level security;
alter table public.profiles add column clan uuid references public.bb_clans (id) on delete set null;
create index profiles_clan on public.profiles (clan);

create function public.clan_list() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(c order by c.total desc), '[]'::jsonb) from (
    select k.id, k.name, k.badge, count(p.id)::int as members, coalesce(sum(p.trophies), 0)::int as total
    from bb_clans k left join profiles p on p.clan = k.id
    group by k.id order by total desc limit 50) c;
$$;

create function public.clan_info(p_clan uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', k.id, 'name', k.name, 'badge', k.badge,
    'members', coalesce((select jsonb_agg(jsonb_build_object('nick', p.nick, 'trophies', p.trophies, 'avatar', p.avatar,
        'skin', p.skins ->> p.avatar, 'leader', p.id = k.leader, 'me', p.owner = auth.uid()) order by p.trophies desc)
      from profiles p where p.clan = k.id), '[]'::jsonb))
  from bb_clans k where k.id = coalesce(p_clan, (select clan from profiles where owner = auth.uid()));
$$;

create function public.clan_create(p_name jsonb, p_badge int) returns uuid language plpgsql security definer set search_path = public as $$
declare me profiles; cid uuid;
begin
  select * into me from profiles where owner = auth.uid();
  if me.id is null then raise exception 'no profile'; end if;
  if me.clan is not null then raise exception 'already in a clan'; end if;
  if jsonb_typeof(p_name -> 'a') is distinct from 'number' or jsonb_typeof(p_name -> 'n') is distinct from 'number'
     or (p_name ->> 'a')::int not between 0 and 19 or (p_name ->> 'n')::int not between 0 and 19 or p_badge not between 0 and 7
  then raise exception 'bad clan'; end if;
  insert into bb_clans (name, badge, leader)
    values (jsonb_build_object('a', (p_name ->> 'a')::int, 'n', (p_name ->> 'n')::int), p_badge, me.id) returning id into cid;
  update profiles set clan = cid where id = me.id;
  return cid;
end $$;

create function public.clan_join(p_clan uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare me profiles; n int;
begin
  select * into me from profiles where owner = auth.uid();
  if me.id is null or me.clan is not null then return false; end if;
  perform 1 from bb_clans where id = p_clan for update; -- one join at a time per clan, so the count holds
  if not found then return false; end if;
  select count(*) into n from profiles where clan = p_clan;
  if n >= 30 then return false; end if;
  update profiles set clan = p_clan where id = me.id;
  return true;
end $$;

create function public.clan_leave() returns void language plpgsql security definer set search_path = public as $$
declare me profiles; heir uuid;
begin
  select * into me from profiles where owner = auth.uid();
  if me.id is null or me.clan is null then return; end if;
  update profiles set clan = null where id = me.id;
  select id into heir from profiles where clan = me.clan order by trophies desc limit 1;
  if heir is null then delete from bb_clans where id = me.clan; -- the last one out closes the clan
  else update bb_clans set leader = heir where id = me.clan and (leader = me.id or leader is null); end if;
end $$;

revoke execute on function public.clan_list(), public.clan_info(uuid), public.clan_create(jsonb, int), public.clan_join(uuid), public.clan_leave() from public, anon;
grant execute on function public.clan_list(), public.clan_info(uuid), public.clan_create(jsonb, int), public.clan_join(uuid), public.clan_leave() to authenticated;
