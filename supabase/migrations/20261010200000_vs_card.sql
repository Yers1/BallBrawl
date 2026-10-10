-- The VS screen before a fight shows the opponent like Clash Royale does: their banner, decoration, avatar ball,
-- level (from their XP), familiar and clan (name + badge). Everything but the clan comes from their saved game.
create or replace function public.find_opponent() returns jsonb language sql volatile security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('id', p.id, 'nick', p.nick, 'squad', p.squad, 'skins', p.skins, 'trophies', p.trophies,
      'avatar', p.avatar, 'banner', p.save -> 'wear' -> 'banner', 'deco', p.save -> 'wear' -> 'deco', 'xp', p.save -> 'xp',
      'fam', p.save -> 'fam',
      'clan', (select jsonb_build_object('name', k.name, 'badge', k.badge) from bb_clans k where k.id = p.clan))
    from profiles p, profiles me
    where me.owner = auth.uid() and p.id <> me.id and not p.flagged
      and p.trophies between me.trophies - 100 and me.trophies + 100
      and p.last_seen > now() - interval '30 days'
      and p.id not in (select m.opponent_id from matches m where m.profile_id = me.id and m.opponent_id is not null
                       order by m.started_at desc limit 5)
    order by random() limit 1), 'null'::jsonb)
$$;
