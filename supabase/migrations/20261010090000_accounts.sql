-- Email accounts: deleting a profile must also delete the sign-in (email + password), not just the game data.
create or replace function public.delete_profile() returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  delete from profiles where owner = me; -- matches and events go with it (on delete cascade)
  delete from auth.users where id = me;  -- the sign-in itself, email included
end $$;
