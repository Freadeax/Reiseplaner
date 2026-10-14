-- Reiseplaner · Kernschema für Reisen, Mitgliedschaften und Einladungen
-- Version 1 · 14.10.2026 · Issue #6
--
-- Grundsätze
-- * Jede Reise gehört genau einem Eigentümer (trip_members.role = 'owner'); weitere Mitglieder sind
--   'editor' (bearbeiten) oder 'viewer' (lesen). Rechte werden ausschließlich hier in der Datenbank
--   über Row Level Security und Spalten-Grants durchgesetzt, nicht in der Oberfläche.
-- * Die fachliche Reise (Tagesplan, Kosten, Angebote, Zahlungsbuch, Quellen, Notizen) liegt als ein
--   versioniertes JSON-Dokument in trips.data. Begründung in docs/SUPABASE_SETUP.md: Diese Inhalte
--   werden immer gemeinsam bearbeitet und müssen atomar mit einer Versionsprüfung gespeichert werden.
-- * Abfragerelevante Felder (Titel, Daten, Status) werden serverseitig aus data abgeleitet.
-- * Optimistische Sperre: version wird bei jeder Änderung vom Server erhöht. Clients ändern nur mit
--   "where version = <bekannt>" und erkennen so gleichzeitige Bearbeitung ohne stilles Überschreiben.
-- * Löschen ist ein Soft-Delete (deleted_at), damit Offline-Geräte die Löschung erfahren und Reisen
--   nicht versehentlich wieder auftauchen. Nur der Eigentümer darf löschen oder wiederherstellen.

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.trip_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- Tabellen

create table public.trips (
  id             text primary key check (id ~ '^t[A-Za-z0-9]{1,60}$'),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 80),
  date_mode      text not null check (date_mode in ('fix', 'flex', 'open')),
  start_date     date,
  end_date       date,
  status         text not null check (status in ('idee', 'planung', 'gebucht', 'vorbei')),
  schema_version integer not null check (schema_version = 2),
  data           jsonb not null,
  version        bigint not null default 1 check (version >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  constraint trips_dates_order check (end_date is null or start_date is null or end_date >= start_date),
  constraint trips_data_object check (jsonb_typeof(data) = 'object'),
  constraint trips_data_id check (data ->> 'id' = id),
  constraint trips_data_size check (pg_column_size(data) <= 1500000)
);
comment on table public.trips is 'Eine Reise je Zeile. data enthält das vollständige Reisedokument (Format schemaVersion 2 der App).';
comment on column public.trips.version is 'Wird bei jeder Änderung serverseitig erhöht (optimistische Sperre).';

create table public.trip_members (
  trip_id    text not null references public.trips (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.trip_role not null,
  added_by   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create unique index trip_members_one_owner on public.trip_members (trip_id) where role = 'owner';
create index trip_members_user on public.trip_members (user_id);

create table public.trip_invites (
  id         uuid primary key default gen_random_uuid(),
  trip_id    text not null references public.trips (id) on delete cascade,
  role       public.trip_role not null check (role in ('editor', 'viewer')),
  email      text check (email is null or email ~ '^[^@\s]+@[^@\s]+$'),
  token_hash text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_by    uuid references auth.users (id) on delete set null,
  used_at    timestamptz,
  constraint trip_invites_lifetime check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);
create index trip_invites_trip on public.trip_invites (trip_id);
comment on column public.trip_invites.token_hash is 'SHA-256 des Einladungstokens. Das Token selbst wird nie gespeichert.';
comment on column public.trip_invites.email is 'Optional: nur das angemeldete Konto mit genau dieser (bestätigten) E-Mail-Adresse darf annehmen.';

-- ---------------------------------------------------------------- Hilfsfunktionen

-- Rolle des angemeldeten Benutzers in einer Reise (oder null). security definer, damit die Policies
-- von trip_members nicht rekursiv auf sich selbst zugreifen.
create or replace function public.trip_role_of(p_trip text)
returns public.trip_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.trip_members m
  where m.trip_id = p_trip and m.user_id = (select auth.uid())
$$;

-- Felder aus dem Reisedokument ableiten und Serverwerte setzen.
create or replace function public.trips_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_start text := new.data ->> 'start';
  v_end   text := new.data ->> 'end';
  v_mode  text := coalesce(new.data ->> 'dateMode', 'open');
begin
  if (select auth.uid()) is null then
    raise exception 'Anmeldung erforderlich' using errcode = '42501';
  end if;
  new.title          := left(btrim(coalesce(new.data ->> 'title', '')), 80);
  if new.title = '' then new.title := 'Reise'; end if;
  new.date_mode      := v_mode;
  new.status         := coalesce(new.data ->> 'status', 'idee');
  new.schema_version := coalesce((new.data ->> 'schemaVersion')::int, 0);
  new.start_date     := case when v_start ~ '^\d{4}-\d{2}-\d{2}$' then v_start::date end;
  new.end_date       := case when v_end   ~ '^\d{4}-\d{2}-\d{2}$' then v_end::date end;
  if v_mode = 'fix' and (new.start_date is null or new.end_date is null) then
    raise exception 'Festes Datum braucht An- und Abreise' using errcode = '23514';
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());

  if tg_op = 'INSERT' then
    new.owner_id   := (select auth.uid());
    new.version    := 1;
    new.created_at := now();
    new.deleted_at := null;
  else
    if new.id <> old.id or new.owner_id <> old.owner_id or new.created_at <> old.created_at then
      raise exception 'id, Eigentümer und Erstellzeit sind unveränderlich' using errcode = '42501';
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      if public.trip_role_of(old.id) is distinct from 'owner' then
        raise exception 'Nur der Eigentümer darf löschen oder wiederherstellen' using errcode = '42501';
      end if;
      new.deleted_at := case when new.deleted_at is null then null else now() end;
    end if;
    new.version := old.version + 1;
  end if;
  return new;
end $$;

create trigger trips_before_write
before insert or update on public.trips
for each row execute function public.trips_before_write();

-- Eigentümer-Mitgliedschaft automatisch anlegen.
create or replace function public.trips_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, user_id, role, added_by)
  values (new.id, new.owner_id, 'owner', new.owner_id);
  return new;
end $$;

create trigger trips_after_insert
after insert on public.trips
for each row execute function public.trips_after_insert();

-- ---------------------------------------------------------------- Row Level Security

alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.trips        force row level security;
alter table public.trip_members force row level security;
alter table public.trip_invites force row level security;

-- Grundrechte: anon nichts, authenticated nur das Nötigste (Spalten-Grants verhindern z. B. das
-- Ändern von owner_id oder version über die API).
revoke all on public.trips, public.trip_members, public.trip_invites from anon, authenticated;
grant select, delete on public.trips to authenticated;
grant insert (id, data) on public.trips to authenticated;
grant update (data, deleted_at) on public.trips to authenticated;
grant select, delete on public.trip_members to authenticated;
grant update (role) on public.trip_members to authenticated;
grant select on public.trip_invites to authenticated;
grant update (revoked_at) on public.trip_invites to authenticated;

-- owner_id-Vergleich zusätzlich, weil INSERT ... RETURNING die Leseregel prüft, bevor der Trigger die
-- Eigentümer-Mitgliedschaft angelegt hat.
create policy trips_select on public.trips for select to authenticated
  using (owner_id = (select auth.uid()) or public.trip_role_of(id) is not null);
create policy trips_insert on public.trips for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy trips_update on public.trips for update to authenticated
  using (public.trip_role_of(id) in ('owner', 'editor'))
  with check (public.trip_role_of(id) in ('owner', 'editor'));
create policy trips_delete on public.trips for delete to authenticated
  using (public.trip_role_of(id) = 'owner');

create policy members_select on public.trip_members for select to authenticated
  using (public.trip_role_of(trip_id) is not null);
-- Kein insert-Policy: Mitglied wird man nur als Eigentümer (Trigger) oder über eine Einladung (Funktion).
create policy members_update on public.trip_members for update to authenticated
  using (public.trip_role_of(trip_id) = 'owner' and role <> 'owner')
  with check (role in ('editor', 'viewer'));
create policy members_delete on public.trip_members for delete to authenticated
  using (role <> 'owner' and (public.trip_role_of(trip_id) = 'owner' or user_id = (select auth.uid())));

create policy invites_select on public.trip_invites for select to authenticated
  using (public.trip_role_of(trip_id) = 'owner');
create policy invites_revoke on public.trip_invites for update to authenticated
  using (public.trip_role_of(trip_id) = 'owner')
  with check (public.trip_role_of(trip_id) = 'owner');

-- ---------------------------------------------------------------- Funktionen für Freigaben

-- Einladung erzeugen (nur Eigentümer). Gibt das Token genau einmal zurück; gespeichert wird nur der Hash.
create or replace function public.create_trip_invite(p_trip text, p_role public.trip_role, p_hours integer default 72, p_email text default null)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare v_token text; v_open integer;
begin
  if (select auth.uid()) is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  if public.trip_role_of(p_trip) is distinct from 'owner' then
    raise exception 'Nur der Eigentümer kann einladen' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then raise exception 'Rolle nicht erlaubt' using errcode = '22023'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 720 then raise exception 'Gültigkeit 1 bis 720 Stunden' using errcode = '22023'; end if;
  if exists (select 1 from public.trips t where t.id = p_trip and t.deleted_at is not null) then
    raise exception 'Reise ist gelöscht' using errcode = '22023';
  end if;
  select count(*) into v_open from public.trip_invites i
   where i.trip_id = p_trip and i.revoked_at is null and i.used_at is null and i.expires_at > now();
  if v_open >= 20 then raise exception 'Zu viele offene Einladungen' using errcode = '22023'; end if;
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.trip_invites (trip_id, role, email, token_hash, created_by, expires_at)
  values (p_trip, p_role, nullif(lower(btrim(p_email)), ''), encode(extensions.digest(v_token, 'sha256'), 'hex'), (select auth.uid()), now() + make_interval(hours => p_hours));
  return v_token;
end $$;

-- Einladung annehmen (einmalig, nicht abgelaufen, nicht widerrufen). Bestehende Rollen werden nicht
-- verändert, damit eine Einladung niemanden herabstufen oder zum Eigentümer machen kann.
create or replace function public.accept_trip_invite(p_token text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare v_inv public.trip_invites%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  select * into v_inv from public.trip_invites i
   where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found or v_inv.revoked_at is not null or v_inv.used_at is not null or v_inv.expires_at <= now()
     or exists (select 1 from public.trips t where t.id = v_inv.trip_id and t.deleted_at is not null) then
    raise exception 'Einladung ungültig, abgelaufen oder bereits verwendet' using errcode = '22023';
  end if;
  if v_inv.email is not null and not exists (
       select 1 from auth.users u where u.id = (select auth.uid()) and lower(u.email) = v_inv.email and u.email_confirmed_at is not null) then
    raise exception 'Diese Einladung gilt für eine andere E-Mail-Adresse' using errcode = '42501';
  end if;
  insert into public.trip_members (trip_id, user_id, role, added_by)
  values (v_inv.trip_id, (select auth.uid()), v_inv.role, v_inv.created_by)
  on conflict (trip_id, user_id) do nothing;
  update public.trip_invites set used_by = (select auth.uid()), used_at = now() where id = v_inv.id;
  return v_inv.trip_id;
end $$;

-- Mitglieder einer Reise mit E-Mail-Adresse (nur für Mitglieder dieser Reise).
create or replace function public.trip_member_list(p_trip text)
returns table (user_id uuid, role public.trip_role, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.trip_role_of(p_trip) is null then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  return query
    select m.user_id, m.role, u.email::text, m.created_at
    from public.trip_members m join auth.users u on u.id = m.user_id
    where m.trip_id = p_trip
    order by (m.role = 'owner') desc, m.created_at;
end $$;

revoke all on function public.trip_role_of(text) from public, anon;
revoke all on function public.create_trip_invite(text, public.trip_role, integer, text) from public, anon;
revoke all on function public.accept_trip_invite(text) from public, anon;
revoke all on function public.trip_member_list(text) from public, anon;
revoke all on function public.trips_before_write() from public, anon, authenticated;
revoke all on function public.trips_after_insert() from public, anon, authenticated;
grant execute on function public.trip_role_of(text) to authenticated;
grant execute on function public.create_trip_invite(text, public.trip_role, integer, text) to authenticated;
grant execute on function public.accept_trip_invite(text) to authenticated;
grant execute on function public.trip_member_list(text) to authenticated;
