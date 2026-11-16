-- Reiseplaner · Gemeinsam planen, Stufen G2–G5 (docs/PLAN_GEMEINSAM.md)
-- 16.11.2026 · lokal getestet mit tests/db/gemeinsam.cjs; Produktion nur nach ausdrücklicher Freigabe durch Philipp.
--
-- G2 Realtime: trips, trip_ideas und trip_idea_votes in der Publikation supabase_realtime (Ereignisse nur als Auslöser
--    für den normalen Abgleich; Realtime prüft die Leseregeln). Private Kanäle "trip:<id>" für Anwesenheit nur für Mitglieder.
-- G3 profiles: freiwilliger Anzeigename; trip_member_list zeigt fremde E-Mail-Adressen nur noch dem Eigentümer.
-- G4 trip_ideas / trip_idea_votes: Ideen-Pinnwand je Reise. Alle Mitglieder (auch Leser) tragen ein und stimmen ab;
--    Status (eingeplant/verworfen) setzen nur Eigentümer und Bearbeiter. Ideen ändern den Plan nie selbst.
-- G5 trip_events / trip_seen: Verlauf ohne Inhalte (nur Bereichsnamen), 90 Tage; "Seit deinem letzten Besuch".
-- Bestehende Tabellen, Rechte und Funktionen bleiben unverändert, außer trip_member_list (Spalte display_name, E-Mail nur
-- für Eigentümer bzw. die eigene) und export_my_account (zusätzlich Profil und eigene Ideen).

-- ---------------------------------------------------------------- G3 Profile

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40 and display_name !~ '[[:cntrl:]]'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'Freiwilliger Anzeigename je Konto. Sichtbar nur für Mitglieder gemeinsamer Reisen (über Funktionen).';

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from anon, authenticated;
grant select, delete on public.profiles to authenticated;
grant insert (user_id, display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_own_select on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_own_insert on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_own_update on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profiles_own_delete on public.profiles for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.profiles_before_write()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.display_name := btrim(new.display_name);
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end $$;
create trigger profiles_before_write before insert or update on public.profiles
for each row execute function public.profiles_before_write();

-- Rückgabetyp ändert sich (display_name), daher neu anlegen.
drop function if exists public.trip_member_list(text);
create function public.trip_member_list(p_trip text)
returns table (user_id uuid, role public.trip_role, email text, display_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_role public.trip_role := public.trip_role_of(p_trip);
begin
  if v_role is null then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  return query
    select m.user_id, m.role,
           case when v_role = 'owner' or m.user_id = (select auth.uid()) then u.email::text end,
           p.display_name, m.created_at
    from public.trip_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.trip_id = p_trip
    order by (m.role = 'owner') desc, m.created_at;
end $$;

-- ---------------------------------------------------------------- G4 Ideen-Pinnwand

create table public.trip_ideas (
  id         uuid primary key default gen_random_uuid(),
  trip_id    text not null references public.trips (id) on delete cascade,
  author     uuid references auth.users (id) on delete set null default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  link       text check (link is null or (char_length(link) <= 500 and link ~ '^https://[^\s]+$')),
  day        date,
  status     text not null default 'neu' check (status in ('neu', 'eingeplant', 'verworfen')),
  status_by  uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index trip_ideas_trip on public.trip_ideas (trip_id, created_at);
comment on table public.trip_ideas is 'Ideen-Pinnwand: Vorschläge der Mitglieder. Ändert den Reiseplan nie selbst.';

create table public.trip_idea_votes (
  idea_id    uuid not null references public.trip_ideas (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
create index trip_idea_votes_user on public.trip_idea_votes (user_id);

create or replace function public.trip_ideas_before_write()
returns trigger language plpgsql set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_role public.trip_role; v_open integer;
begin
  -- Kontolöschung: Fremdschlüssel setzt author/status_by auf null (sonst nichts geändert). Kein Rechtecheck, die
  -- Mitgliedschaft ist zu diesem Zeitpunkt schon entfernt.
  if tg_op = 'UPDATE' and (new.author is null or new.status_by is null)
     and (new.author is not distinct from old.author or new.author is null)
     and (new.status_by is not distinct from old.status_by or new.status_by is null)
     and (new.id, new.trip_id, new.body, new.link, new.day, new.status, new.deleted_at, new.created_at)
         is not distinct from (old.id, old.trip_id, old.body, old.link, old.day, old.status, old.deleted_at, old.created_at) then
    return new;
  end if;
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  v_role := public.trip_role_of(coalesce(new.trip_id, old.trip_id));
  if v_role is null then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  new.body := btrim(new.body);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if exists (select 1 from public.trips t where t.id = new.trip_id and t.deleted_at is not null) then
      raise exception 'Reise ist gelöscht' using errcode = '22023';
    end if;
    select count(*) into v_open from public.trip_ideas i where i.trip_id = new.trip_id and i.deleted_at is null;
    if v_open >= 200 then raise exception 'Höchstens 200 Ideen je Reise' using errcode = '22023'; end if;
    new.author := v_me; new.status := 'neu'; new.status_by := null; new.created_at := now(); new.deleted_at := null;
    return new;
  end if;
  if new.id <> old.id or new.trip_id <> old.trip_id or new.author is distinct from old.author or new.created_at <> old.created_at then
    raise exception 'Unveränderliche Felder' using errcode = '42501';
  end if;
  if old.deleted_at is not null then raise exception 'Idee ist zurückgezogen' using errcode = '22023'; end if;
  if (new.body, new.link, new.day) is distinct from (old.body, old.link, old.day) and old.author is distinct from v_me then
    raise exception 'Nur die Person, die die Idee eingetragen hat, kann sie ändern' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if v_role not in ('owner', 'editor') then
      raise exception 'Nur Eigentümer und Bearbeiter setzen den Status' using errcode = '42501';
    end if;
    new.status_by := v_me;
  else
    new.status_by := old.status_by;
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if old.author is distinct from v_me and v_role <> 'owner' then
      raise exception 'Nur Autor oder Eigentümer können eine Idee zurückziehen' using errcode = '42501';
    end if;
    new.deleted_at := now();
  end if;
  return new;
end $$;
create trigger trip_ideas_before_write before insert or update on public.trip_ideas
for each row execute function public.trip_ideas_before_write();

alter table public.trip_ideas      enable row level security;
alter table public.trip_idea_votes enable row level security;
alter table public.trip_ideas      force row level security;
alter table public.trip_idea_votes force row level security;
revoke all on public.trip_ideas, public.trip_idea_votes from anon, authenticated;
grant select on public.trip_ideas to authenticated;
grant insert (trip_id, body, link, day) on public.trip_ideas to authenticated;
grant update (body, link, day, status, deleted_at) on public.trip_ideas to authenticated;
grant select, delete on public.trip_idea_votes to authenticated;
grant insert (idea_id) on public.trip_idea_votes to authenticated;

create policy ideas_select on public.trip_ideas for select to authenticated
  using (public.trip_role_of(trip_id) is not null);
create policy ideas_insert on public.trip_ideas for insert to authenticated
  with check (public.trip_role_of(trip_id) is not null);
create policy ideas_update on public.trip_ideas for update to authenticated
  using (public.trip_role_of(trip_id) is not null)
  with check (public.trip_role_of(trip_id) is not null);
-- Kein Löschen über die API: Zurückziehen ist weich (deleted_at), damit Stimmen und Verlauf nachvollziehbar bleiben.

create policy votes_select on public.trip_idea_votes for select to authenticated
  using (exists (select 1 from public.trip_ideas i where i.id = idea_id));
create policy votes_insert on public.trip_idea_votes for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.trip_ideas i where i.id = idea_id and i.deleted_at is null));
create policy votes_delete on public.trip_idea_votes for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- G5 Verlauf und Gelesen-Marke

create table public.trip_events (
  id      bigint generated always as identity primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  version bigint not null,
  actor   uuid references auth.users (id) on delete set null,
  kinds   text[] not null,
  at      timestamptz not null default now()
);
create index trip_events_trip on public.trip_events (trip_id, version);
comment on table public.trip_events is 'Wer hat wann welche Bereiche einer Reise geändert. Keine Inhalte. 90 Tage.';

create table public.trip_seen (
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  version bigint not null check (version >= 1),
  seen_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- Bereichsnamen je Feld des Reise-Dokuments; dieselben Namen wie RPMerge.GROUPS/LABELS in merge3.js, gröber gefasst.
create or replace function public.trip_area_of(p_key text)
returns text language sql immutable set search_path = ''
as $$
  select case
    when p_key in ('title', 'type', 'status', 'persons', 'budget', 'food', 'puffer', 'online', 'criteria', 'assumptions', 'prosCons', 'variant') then 'eckdaten'
    when p_key in ('dateMode', 'start', 'end', 'month', 'nights', 'tz', 'departTime', 'checkinTime', 'checkoutTime') then 'zeitraum'
    when p_key in ('place', 'catalog', 'stayId', 'stayQuote', 'stayRef', 'activeOfferId', 'packageId', 'customStays', 'offers', 'search', 'searchProfiles') then 'unterkunft'
    when p_key in ('origin', 'originGeo', 'dest', 'destGeo', 'travel', 'km', 'kmSrc', 'routeKm', 'routeMin', 'routeHomeMin', 'routeAt', 'dayRoutes', 'verb', 'preis', 'ticket', 'legs', 'transport') then 'anreise'
    when p_key in ('items', 'customActs', 'keepFree', 'pace') then 'tagesplan'
    when p_key in ('extraCosts', 'ledger', 'expenses', 'payPlan', 'guestCards', 'cardConfirmed') then 'kosten'
    when p_key in ('check', 'customChecks', 'packing', 'tasks', 'deadlineAck', 'countries', 'idDocs', 'insurance', 'emergency', 'docs') then 'vorbereitung'
    when p_key in ('party') then 'mitreisende'
    when p_key in ('journal', 'ratings', 'media', 'books') then 'erinnerungen'
    when p_key in ('notes') then 'notizen'
    when p_key in ('id', 'updated', 'schemaVersion') then null
    else 'sonstiges'
  end
$$;

create or replace function public.trips_after_update_events()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_kinds text[];
begin
  if new.deleted_at is not null and old.deleted_at is null then
    v_kinds := array['geloescht'];
  elsif new.deleted_at is null and old.deleted_at is not null then
    v_kinds := array['wiederhergestellt'];
  else
    select coalesce(array_agg(distinct a order by a), '{}') into v_kinds
    from (select public.trip_area_of(k) as a
          from (select jsonb_object_keys(old.data) as k union select jsonb_object_keys(new.data)) keys
          where (old.data -> k) is distinct from (new.data -> k)) d
    where a is not null;
  end if;
  if cardinality(v_kinds) > 0 then
    insert into public.trip_events (trip_id, version, actor, kinds) values (new.id, new.version, new.updated_by, v_kinds);
  end if;
  delete from public.trip_events e where e.trip_id = new.id and e.at < now() - interval '90 days';
  return new;
end $$;
create trigger trips_after_update_events after update on public.trips
for each row execute function public.trips_after_update_events();

alter table public.trip_events enable row level security;
alter table public.trip_seen   enable row level security;
alter table public.trip_events force row level security;
alter table public.trip_seen   force row level security;
revoke all on public.trip_events, public.trip_seen from anon, authenticated;
grant select on public.trip_events to authenticated;
grant select, delete on public.trip_seen to authenticated;
grant insert (trip_id, version) on public.trip_seen to authenticated;
grant update (version, seen_at) on public.trip_seen to authenticated;
create policy events_select on public.trip_events for select to authenticated
  using (public.trip_role_of(trip_id) is not null);
create policy seen_select on public.trip_seen for select to authenticated using (user_id = (select auth.uid()));
create policy seen_insert on public.trip_seen for insert to authenticated
  with check (user_id = (select auth.uid()) and public.trip_role_of(trip_id) is not null);
create policy seen_update on public.trip_seen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy seen_delete on public.trip_seen for delete to authenticated using (user_id = (select auth.uid()));

-- Gelesen-Marke setzen (nie zurück).
create or replace function public.mark_trip_seen(p_trip text, p_version bigint)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  if public.trip_role_of(p_trip) is null then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_version is null or p_version < 1 then raise exception 'Version ungültig' using errcode = '22023'; end if;
  insert into public.trip_seen (trip_id, user_id, version, seen_at) values (p_trip, (select auth.uid()), p_version, now())
  on conflict (trip_id, user_id) do update set version = greatest(public.trip_seen.version, excluded.version), seen_at = now();
end $$;

-- Änderungen anderer seit der eigenen Gelesen-Marke, mit Anzeigename (ohne E-Mail).
create or replace function public.trip_changes_since(p_trip text)
returns table (version bigint, at timestamptz, actor_name text, by_me boolean, kinds text[])
language plpgsql stable security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_seen bigint;
begin
  if public.trip_role_of(p_trip) is null then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  select s.version into v_seen from public.trip_seen s where s.trip_id = p_trip and s.user_id = v_me;
  return query
    select e.version, e.at, p.display_name, e.actor = v_me, e.kinds
    from public.trip_events e left join public.profiles p on p.user_id = e.actor
    where e.trip_id = p_trip and e.version > coalesce(v_seen, 0)
    order by e.version desc
    limit 50;
end $$;

-- ---------------------------------------------------------------- Kontoexport ergänzt (Profil, eigene Ideen)

create or replace function public.export_my_account()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  return jsonb_build_object(
    'format', 'reiseplaner-kontoexport', 'version', 2, 'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) from auth.users u where u.id = v_me),
    'profile', (select jsonb_build_object('display_name', p.display_name, 'updated_at', p.updated_at) from public.profiles p where p.user_id = v_me),
    'trips', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'role', m.role, 'version', t.version, 'created_at', t.created_at,
        'updated_at', t.updated_at, 'deleted_at', t.deleted_at, 'data', t.data) order by t.created_at)
      from public.trip_members m join public.trips t on t.id = m.trip_id where m.user_id = v_me), '[]'::jsonb),
    'invites_created', coalesce((select jsonb_agg(jsonb_build_object('trip_id', i.trip_id, 'role', i.role, 'email', i.email,
        'created_at', i.created_at, 'expires_at', i.expires_at, 'revoked_at', i.revoked_at, 'used_at', i.used_at) order by i.created_at)
      from public.trip_invites i where i.created_by = v_me), '[]'::jsonb),
    'ideas_created', coalesce((select jsonb_agg(jsonb_build_object('trip_id', d.trip_id, 'body', d.body, 'link', d.link, 'day', d.day,
        'status', d.status, 'created_at', d.created_at, 'deleted_at', d.deleted_at) order by d.created_at)
      from public.trip_ideas d where d.author = v_me), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- G2 Realtime

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trips, public.trip_ideas, public.trip_idea_votes;
  end if;
end $$;

-- Private Kanäle "trip:<id>" (Anwesenheit, Hinweis "Reise geändert"): nur Mitglieder dieser Reise.
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute $p$create policy trip_channel_read on realtime.messages for select to authenticated
      using (realtime.topic() like 'trip:%' and public.trip_role_of(substr(realtime.topic(), 6)) is not null)$p$;
    execute $p$create policy trip_channel_write on realtime.messages for insert to authenticated
      with check (realtime.topic() like 'trip:%' and public.trip_role_of(substr(realtime.topic(), 6)) is not null)$p$;
  end if;
end $$;

-- ---------------------------------------------------------------- Rechte der Funktionen

revoke all on function public.trip_member_list(text) from public, anon;
revoke all on function public.mark_trip_seen(text, bigint) from public, anon;
revoke all on function public.trip_changes_since(text) from public, anon;
revoke all on function public.trip_area_of(text) from public, anon;
revoke all on function public.profiles_before_write() from public, anon, authenticated;
revoke all on function public.trip_ideas_before_write() from public, anon, authenticated;
revoke all on function public.trips_after_update_events() from public, anon, authenticated;
grant execute on function public.trip_member_list(text) to authenticated;
grant execute on function public.mark_trip_seen(text, bigint) to authenticated;
grant execute on function public.trip_changes_since(text) to authenticated;
grant execute on function public.trip_area_of(text) to authenticated;
