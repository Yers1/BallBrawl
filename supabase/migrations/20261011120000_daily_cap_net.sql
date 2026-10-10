-- The daily trophy cap (+200) now counts what you really gained today — wins minus losses — so a player who lost
-- trophies can win them back the same day. A win that hits the cap says so (capped), instead of a silent +0.
create or replace function public.finish_match(p_match uuid, p_result text, p_flawless boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me profiles; mt matches; d int := 0; today date := (now() at time zone 'Asia/Almaty')::date; gained int; r record; maxwin int;
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
  maxwin := 8 + case when p_flawless then 1 else 0 end;
  if p_result = 'won' then d := least(maxwin, greatest(0, 200 - gained));
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
    day_gain = greatest(0, gained + d), -- net: a loss gives room back
    flagged = flagged or (wins + losses + 1 >= 30 and (wins + (p_result = 'won')::int) > 0.95 * (wins + losses + 1)),
    last_seen = now()
  where id = me.id
  returning trophies, max_trophies into r;
  insert into events (profile_id, type) values (me.id, 'match_end');
  return jsonb_build_object('delta', d, 'trophies', r.trophies, 'max_trophies', r.max_trophies, 'capped', p_result = 'won' and d < maxwin);
end $$;

-- today's counters under the new rule: what each player really gained today
update public.profiles p set day_gain = greatest(0, coalesce((
  select sum(m.delta) from public.matches m
  where m.profile_id = p.id and (m.ended_at at time zone 'Asia/Almaty')::date = (now() at time zone 'Asia/Almaty')::date), 0))
where p.day_key = (now() at time zone 'Asia/Almaty')::date;
