-- "Report a problem" from the settings: bugs, complaints about a player, ideas, purchases. Players can only send
-- (5 an hour); the team reads them in the dashboard (table bb_feedback) and ticks `done`.
create table public.bb_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  owner uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('bug', 'player', 'idea', 'payment', 'other')),
  body text not null check (char_length(body) between 1 and 600),
  about text check (char_length(about) <= 60), -- the reported player's nickname, as typed
  meta jsonb not null default '{}'::jsonb,     -- version, language, trophies, profile id: to find the bug
  done boolean not null default false
);
alter table public.bb_feedback enable row level security;
create index bb_feedback_owner on public.bb_feedback (owner, created_at);

create function public.send_feedback(p_kind text, p_body text, p_about text, p_meta jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no user'; end if;
  if (select count(*) from bb_feedback where owner = auth.uid() and created_at > now() - interval '1 hour') >= 5 then return false; end if;
  insert into bb_feedback (owner, kind, body, about, meta)
  values (auth.uid(), p_kind, left(btrim(p_body), 600), nullif(left(btrim(coalesce(p_about, '')), 60), ''),
          case when jsonb_typeof(p_meta) = 'object' and pg_column_size(p_meta) < 1500 then p_meta else '{}'::jsonb end);
  return true;
end $$;
revoke execute on function public.send_feedback(text, text, text, jsonb) from public, anon;
grant execute on function public.send_feedback(text, text, text, jsonb) to authenticated;
