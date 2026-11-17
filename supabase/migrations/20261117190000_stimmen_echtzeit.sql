-- Reiseplaner · Gemeinsam planen: Stimmen ohne eigene Echtzeit-Tabelle (Nachbesserung zu G4/G7, PLAN_GEMEINSAM §9d)
-- 16.11.2026 · Claude · im Rahmen der Freigabe Philipp 16.11. („Beides nacheinander“)
--
-- Supabase Realtime wendet RLS auf DELETE-Ereignisse nicht an: Beim Zurücknehmen einer Stimme ging der Primärschlüssel
-- (idea_id/poll_id, user_id, option) an jedes angemeldete Konto, das die Tabelle abonniert hatte. Inhalte waren nie
-- betroffen, aber Konto-IDs Fremder gehören dort nicht hin.
-- * trip_idea_votes und trip_poll_votes verlassen die Realtime-Publikation.
-- * Stattdessen wird beim Abstimmen die übergeordnete Zeile berührt (trip_ideas.updated_at, trip_polls.votes_at). Deren
--   UPDATE-Ereignisse prüft Realtime mit RLS, also sehen sie nur Mitglieder.
-- Hartes Löschen von Ideen, Abstimmungen und Kommentaren gibt es über die API nicht (nur mit der ganzen Reise); dabei
-- enthält ein DELETE-Ereignis nur die zufällige Zeilen-ID.

do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_idea_votes') then
    alter publication supabase_realtime drop table public.trip_idea_votes;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_poll_votes') then
    alter publication supabase_realtime drop table public.trip_poll_votes;
  end if;
end $$;

-- ---------------------------------------------------------------- Ideen: Stimme berührt die Idee

create or replace function public.trip_idea_votes_touch()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_idea uuid := coalesce(new.idea_id, old.idea_id); v_trip text;
begin
  select i.trip_id into v_trip from public.trip_ideas i where i.id = v_idea and i.deleted_at is null;
  -- Kontolöschung (Mitgliedschaft schon weg) oder zurückgezogene Idee: nichts zu melden
  if v_trip is null or (select auth.uid()) is null or public.trip_role_of(v_trip) is null then return null; end if;
  update public.trip_ideas set updated_at = now() where id = v_idea;
  return null;
end $$;
create trigger trip_idea_votes_touch after insert or delete on public.trip_idea_votes
for each row execute function public.trip_idea_votes_touch();

-- ---------------------------------------------------------------- Abstimmungen: Stimme berührt die Abstimmung

alter table public.trip_polls add column votes_at timestamptz;
comment on column public.trip_polls.votes_at is 'Letzte Stimmabgabe; nur Auslöser für Echtzeit, von vote_poll gesetzt.';

create or replace function public.vote_poll(p_poll uuid, p_options integer[])
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_p public.trip_polls; v_opts integer[];
begin
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  select * into v_p from public.trip_polls p where p.id = p_poll for update;
  if v_p.id is null or public.trip_role_of(v_p.trip_id) is null then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if v_p.deleted_at is not null then raise exception 'Abstimmung ist zurückgezogen' using errcode = '22023'; end if;
  if v_p.closed_at is not null then raise exception 'Abstimmung ist geschlossen' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_opts from unnest(coalesce(p_options, '{}')) x;
  if exists (select 1 from unnest(v_opts) x where x is null or x < 0 or x >= cardinality(v_p.options)) then
    raise exception 'Antwort gibt es nicht' using errcode = '22023';
  end if;
  if not v_p.multi and cardinality(v_opts) > 1 then raise exception 'Nur eine Antwort möglich' using errcode = '22023'; end if;
  delete from public.trip_poll_votes v where v.poll_id = p_poll and v.user_id = v_me;
  insert into public.trip_poll_votes (poll_id, user_id, option) select p_poll, v_me, x from unnest(v_opts) x;
  update public.trip_polls set votes_at = now() where id = p_poll;
end $$;

revoke all on function public.trip_idea_votes_touch() from public, anon, authenticated;
revoke all on function public.vote_poll(uuid, integer[]) from public, anon;
grant execute on function public.vote_poll(uuid, integer[]) to authenticated;
