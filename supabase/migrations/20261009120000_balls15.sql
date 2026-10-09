-- Three new balls (poison, chain, forge): the server whitelist must know them, or squads and avatars using them are silently kept stale.
create or replace function public.bb_balls() returns text[] language sql immutable as $$
  select array['basic', 'leech', 'cell', 'spider', 'ninja', 'train', 'magnet', 'bomb', 'turtle', 'lightning', 'hedgehog', 'ice', 'poison', 'chain', 'forge']
$$;
