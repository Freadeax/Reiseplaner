-- Reiseplaner · Gemeinsam planen G7: Abstimmungen und Kommentare (docs/PLAN_GEMEINSAM.md §9c, Planung M06.4/M06.5)
-- 16.11.2026 · Claude · Freigabe Philipp 16.11. („Beides nacheinander“: Migration lokal testen, dann live)
--
-- * trip_polls / trip_poll_votes: Abstimmung mit 2–8 Antworten, Einfach- oder Mehrfachwahl, optional an einen Tag oder eine
--   Unternehmung geheftet. Alle Mitglieder (auch Leser) legen an und stimmen ab. Stimmen nur über vote_poll (ersetzt die
--   eigenen Stimmen atomar). Schließen: Autor, Eigentümer, Bearbeiter. Zurückziehen: Autor oder Eigentümer. Frage und
--   Antworten ändert nur der Autor, und nur solange niemand abgestimmt hat.
-- * trip_comments: Kommentar an die Reise, einen Tag oder eine Unternehmung. Alle Mitglieder schreiben; ändern nur der Autor,
--   zurückziehen Autor oder Eigentümer. Kein hartes Löschen über die API.
-- * Realtime für alle drei Tabellen, Kontoexport Version 3 mit eigenen Abstimmungen und Kommentaren.
-- Kontolöschung: Stimmen weg, Abstimmungen und Kommentare bleiben ohne Autor. Ändert den Reiseplan nie selbst.

-- Ziel einer Abstimmung oder eines Kommentars: ganze Reise, ein Tag (Datum, bei Reisen ohne festes Datum die Tagesnummer)
-- oder eine Unternehmung im Tagesplan (items[].uid)
create or replace function public.trip_target_ok(p text)
returns boolean language sql immutable set search_path = ''
as $$ select p ~ '^(trip|day:(\d{4}-\d{2}-\d{2}|\d{1,3})|item:[A-Za-z0-9_-]{1,64})$' $$;

-- ---------------------------------------------------------------- Abstimmungen

create table public.trip_polls (
  id         uuid primary key default gen_random_uuid(),
  trip_id    text not null references public.trips (id) on delete cascade,
  author     uuid references auth.users (id) on delete set null default auth.uid(),
  question   text not null check (char_length(btrim(question)) between 1 and 200),
  options    text[] not null check (cardinality(options) between 2 and 8),
  multi      boolean not null default false,
  target     text not null default 'trip' check (public.trip_target_ok(target)),
  created_at timestamptz not null default now(),
  closed_at  timestamptz,
  closed_by  uuid references auth.users (id) on delete set null,
  deleted_at timestamptz
);
create index trip_polls_trip on public.trip_polls (trip_id, created_at);
comment on table public.trip_polls is 'Abstimmungen der Mitglieder einer Reise. Ändern den Reiseplan nie selbst.';

create table public.trip_poll_votes (
  poll_id    uuid not null references public.trip_polls (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  option     smallint not null check (option between 0 and 7),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option)
);
create index trip_poll_votes_user on public.trip_poll_votes (user_id);

create or replace function public.trip_polls_before_write()
returns trigger language plpgsql set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_role public.trip_role; v_n integer; v_opts text[] := '{}'; o text;
begin
  -- Kontolöschung: Fremdschlüssel setzt author/closed_by auf null, sonst ändert sich nichts.
  if tg_op = 'UPDATE' and (new.author is null or new.closed_by is null)
     and (new.author is not distinct from old.author or new.author is null)
     and (new.closed_by is not distinct from old.closed_by or new.closed_by is null)
     and (new.id, new.trip_id, new.question, new.options, new.multi, new.target, new.created_at, new.closed_at, new.deleted_at)
         is not distinct from (old.id, old.trip_id, old.question, old.options, old.multi, old.target, old.created_at, old.closed_at, old.deleted_at) then
    return new;
  end if;
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  v_role := public.trip_role_of(coalesce(new.trip_id, old.trip_id));
  if v_role is null then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  new.question := btrim(new.question);
  foreach o in array new.options loop
    o := btrim(coalesce(o, ''));
    if char_length(o) not between 1 and 80 then raise exception 'Antworten: je 1 bis 80 Zeichen' using errcode = '22023'; end if;
    if o = any (v_opts) then raise exception 'Antworten doppelt' using errcode = '22023'; end if;
    v_opts := v_opts || o;
  end loop;
  new.options := v_opts;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.trips t where t.id = new.trip_id and t.deleted_at is not null) then
      raise exception 'Reise ist gelöscht' using errcode = '22023';
    end if;
    select count(*) into v_n from public.trip_polls p where p.trip_id = new.trip_id and p.deleted_at is null;
    if v_n >= 50 then raise exception 'Höchstens 50 Abstimmungen je Reise' using errcode = '22023'; end if;
    new.author := v_me; new.created_at := now(); new.closed_at := null; new.closed_by := null; new.deleted_at := null;
    return new;
  end if;
  if new.id <> old.id or new.trip_id <> old.trip_id or new.author is distinct from old.author
     or new.created_at <> old.created_at or new.target <> old.target then
    raise exception 'Unveränderliche Felder' using errcode = '42501';
  end if;
  if old.deleted_at is not null then raise exception 'Abstimmung ist zurückgezogen' using errcode = '22023'; end if;
  if (new.question, new.options, new.multi) is distinct from (old.question, old.options, old.multi) then
    if old.author is distinct from v_me then
      raise exception 'Nur die Person, die die Abstimmung angelegt hat, kann sie ändern' using errcode = '42501';
    end if;
    if old.closed_at is not null then raise exception 'Abstimmung ist geschlossen' using errcode = '22023'; end if;
    if exists (select 1 from public.trip_poll_votes v where v.poll_id = old.id) then
      raise exception 'Nach der ersten Stimme lassen sich Frage und Antworten nicht mehr ändern' using errcode = '22023';
    end if;
  end if;
  if new.closed_at is distinct from old.closed_at then
    if old.author is distinct from v_me and v_role not in ('owner', 'editor') then
      raise exception 'Schließen dürfen Autor, Eigentümer und Bearbeiter' using errcode = '42501';
    end if;
    if new.closed_at is null then new.closed_by := null; else new.closed_at := now(); new.closed_by := v_me; end if;
  else
    new.closed_by := old.closed_by;
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if old.author is distinct from v_me and v_role <> 'owner' then
      raise exception 'Nur Autor oder Eigentümer können eine Abstimmung zurückziehen' using errcode = '42501';
    end if;
    new.deleted_at := now();
  end if;
  return new;
end $$;
create trigger trip_polls_before_write before insert or update on public.trip_polls
for each row execute function public.trip_polls_before_write();

-- Eigene Stimmen einer Abstimmung ersetzen. Leere Liste = Stimme zurücknehmen.
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
end $$;

-- ---------------------------------------------------------------- Kommentare

create table public.trip_comments (
  id         uuid primary key default gen_random_uuid(),
  trip_id    text not null references public.trips (id) on delete cascade,
  author     uuid references auth.users (id) on delete set null default auth.uid(),
  target     text not null default 'trip' check (public.trip_target_ok(target)),
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz
);
create index trip_comments_trip on public.trip_comments (trip_id, created_at);
comment on table public.trip_comments is 'Kommentare an Reise, Tag oder Unternehmung. Ändern den Reiseplan nie selbst.';

create or replace function public.trip_comments_before_write()
returns trigger language plpgsql set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_role public.trip_role; v_n integer;
begin
  if tg_op = 'UPDATE' and new.author is null and old.author is not null
     and (new.id, new.trip_id, new.target, new.body, new.created_at, new.edited_at, new.deleted_at)
         is not distinct from (old.id, old.trip_id, old.target, old.body, old.created_at, old.edited_at, old.deleted_at) then
    return new;
  end if;
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  v_role := public.trip_role_of(coalesce(new.trip_id, old.trip_id));
  if v_role is null then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  new.body := btrim(new.body);
  if tg_op = 'INSERT' then
    if exists (select 1 from public.trips t where t.id = new.trip_id and t.deleted_at is not null) then
      raise exception 'Reise ist gelöscht' using errcode = '22023';
    end if;
    select count(*) into v_n from public.trip_comments c where c.trip_id = new.trip_id and c.deleted_at is null;
    if v_n >= 2000 then raise exception 'Höchstens 2000 Kommentare je Reise' using errcode = '22023'; end if;
    new.author := v_me; new.created_at := now(); new.edited_at := null; new.deleted_at := null;
    return new;
  end if;
  if new.id <> old.id or new.trip_id <> old.trip_id or new.author is distinct from old.author
     or new.created_at <> old.created_at or new.target <> old.target then
    raise exception 'Unveränderliche Felder' using errcode = '42501';
  end if;
  if old.deleted_at is not null then raise exception 'Kommentar ist zurückgezogen' using errcode = '22023'; end if;
  if new.body is distinct from old.body then
    if old.author is distinct from v_me then
      raise exception 'Nur die Person, die den Kommentar geschrieben hat, kann ihn ändern' using errcode = '42501';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if old.author is distinct from v_me and v_role <> 'owner' then
      raise exception 'Nur Autor oder Eigentümer können einen Kommentar zurückziehen' using errcode = '42501';
    end if;
    new.deleted_at := now();
  end if;
  return new;
end $$;
create trigger trip_comments_before_write before insert or update on public.trip_comments
for each row execute function public.trip_comments_before_write();

-- ---------------------------------------------------------------- Rechte

alter table public.trip_polls      enable row level security;
alter table public.trip_poll_votes enable row level security;
alter table public.trip_comments   enable row level security;
alter table public.trip_polls      force row level security;
alter table public.trip_poll_votes force row level security;
alter table public.trip_comments   force row level security;
revoke all on public.trip_polls, public.trip_poll_votes, public.trip_comments from anon, authenticated;
grant select on public.trip_polls, public.trip_poll_votes, public.trip_comments to authenticated;
grant insert (trip_id, question, options, multi, target) on public.trip_polls to authenticated;
grant update (question, options, multi, closed_at, deleted_at) on public.trip_polls to authenticated;
grant insert (trip_id, target, body) on public.trip_comments to authenticated;
grant update (body, deleted_at) on public.trip_comments to authenticated;
-- trip_poll_votes: Schreiben nur über vote_poll.

create policy polls_select on public.trip_polls for select to authenticated
  using (public.trip_role_of(trip_id) is not null);
create policy polls_insert on public.trip_polls for insert to authenticated
  with check (public.trip_role_of(trip_id) is not null);
create policy polls_update on public.trip_polls for update to authenticated
  using (public.trip_role_of(trip_id) is not null)
  with check (public.trip_role_of(trip_id) is not null);
create policy poll_votes_select on public.trip_poll_votes for select to authenticated
  using (exists (select 1 from public.trip_polls p where p.id = poll_id));
create policy comments_select on public.trip_comments for select to authenticated
  using (public.trip_role_of(trip_id) is not null);
create policy comments_insert on public.trip_comments for insert to authenticated
  with check (public.trip_role_of(trip_id) is not null);
create policy comments_update on public.trip_comments for update to authenticated
  using (public.trip_role_of(trip_id) is not null)
  with check (public.trip_role_of(trip_id) is not null);

-- ---------------------------------------------------------------- Kontoexport Version 3

create or replace function public.export_my_account()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  return jsonb_build_object(
    'format', 'reiseplaner-kontoexport', 'version', 3, 'exported_at', now(),
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
      from public.trip_ideas d where d.author = v_me), '[]'::jsonb),
    'polls_created', coalesce((select jsonb_agg(jsonb_build_object('trip_id', p.trip_id, 'question', p.question, 'options', to_jsonb(p.options),
        'multi', p.multi, 'target', p.target, 'created_at', p.created_at, 'closed_at', p.closed_at, 'deleted_at', p.deleted_at) order by p.created_at)
      from public.trip_polls p where p.author = v_me), '[]'::jsonb),
    'poll_votes', coalesce((select jsonb_agg(jsonb_build_object('poll_id', v.poll_id, 'option', v.option, 'created_at', v.created_at) order by v.created_at)
      from public.trip_poll_votes v where v.user_id = v_me), '[]'::jsonb),
    'comments_created', coalesce((select jsonb_agg(jsonb_build_object('trip_id', c.trip_id, 'target', c.target, 'body', c.body,
        'created_at', c.created_at, 'edited_at', c.edited_at, 'deleted_at', c.deleted_at) order by c.created_at)
      from public.trip_comments c where c.author = v_me), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- Realtime

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trip_polls, public.trip_poll_votes, public.trip_comments;
  end if;
end $$;

-- ---------------------------------------------------------------- Rechte der Funktionen

revoke all on function public.vote_poll(uuid, integer[]) from public, anon;
grant execute on function public.vote_poll(uuid, integer[]) to authenticated;
revoke all on function public.trip_polls_before_write() from public, anon, authenticated;
revoke all on function public.trip_comments_before_write() from public, anon, authenticated;
