-- Reiseplaner · Konto-Lebenszyklus: Eigentümerwechsel, Kontoexport, Kontolöschung
-- 16.10.2026 · Claude · Issue #8, docs/PLAN_IOS_APP.md P0.3 (App-Store-Pflicht: Konto in der App löschbar)
--
-- * transfer_trip_ownership: Eigentümer übergibt eine Reise atomar an ein bestehendes Mitglied; der bisherige
--   Eigentümer bleibt als Bearbeiter. trips.owner_id wandert mit, damit eine spätere Kontolöschung die Reise nicht
--   über "on delete cascade" mitnimmt.
-- * my_account_summary: was eine Löschung beträfe (eigene Reisen mit/ohne weitere Mitglieder, fremde Reisen).
-- * export_my_account: alle Reisen, auf die das Konto Zugriff hat, samt Rolle, plus selbst erstellte Einladungen.
-- * delete_my_account: löscht das Konto (auth.users) und damit alle eigenen Reisen, Mitgliedschaften und Einladungen.
--   Bestätigung über die eigene E-Mail-Adresse. Eigene Reisen mit weiteren Mitgliedern werden nur gelöscht, wenn das
--   ausdrücklich gewünscht ist; sonst bricht die Funktion ab, damit niemand still eine geteilte Reise verliert.
-- Bestehende Daten werden nicht verändert. Nur neue Funktionen und zwei Ausnahmen in trips_before_write
-- (Eigentümerwechsel über die Funktion, updated_by -> null über den Fremdschlüssel beim Löschen eines Kontos).

create or replace function public.trips_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_start text := new.data ->> 'start';
  v_end   text := new.data ->> 'end';
  v_mode  text := coalesce(new.data ->> 'dateMode', 'open');
begin
  -- Fremdschlüssel "on delete set null" (Konto gelöscht, das zuletzt geändert hat): nur updated_by wird leer. Das ist
  -- keine Bearbeitung; ohne diese Ausnahme setzte die Funktion updated_by wieder auf das gelöschte Konto.
  -- Clients haben kein Spaltenrecht auf updated_by, dieser Weg ist nur über den Fremdschlüssel erreichbar.
  if tg_op = 'UPDATE' and new.updated_by is null and old.updated_by is not null and new.data = old.data
     and new.owner_id = old.owner_id and new.deleted_at is not distinct from old.deleted_at and new.version = old.version then
    return new;
  end if;
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
    if new.id <> old.id or new.created_at <> old.created_at then
      raise exception 'id, Eigentümer und Erstellzeit sind unveränderlich' using errcode = '42501';
    end if;
    -- Eigentümerwechsel nur innerhalb von transfer_trip_ownership: Markierung für genau diese Reise in der laufenden
    -- Transaktion UND der neue Eigentümer ist dort bereits als 'owner' eingetragen. Clients haben ohnehin kein
    -- Spaltenrecht auf owner_id.
    if new.owner_id <> old.owner_id and not (
         coalesce(current_setting('rp.owner_transfer', true), '') = old.id
         and exists (select 1 from public.trip_members m where m.trip_id = old.id and m.user_id = new.owner_id and m.role = 'owner')) then
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


create or replace function public.transfer_trip_ownership(p_trip text, p_new_owner uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  if public.trip_role_of(p_trip) is distinct from 'owner' then
    raise exception 'Nur der Eigentümer kann die Reise übergeben' using errcode = '42501';
  end if;
  if p_new_owner is null or p_new_owner = v_me then raise exception 'Bitte ein anderes Mitglied wählen' using errcode = '22023'; end if;
  if exists (select 1 from public.trips t where t.id = p_trip and t.deleted_at is not null) then
    raise exception 'Reise ist gelöscht' using errcode = '22023';
  end if;
  perform 1 from public.trip_members m where m.trip_id = p_trip and m.user_id = p_new_owner and m.role in ('editor', 'viewer') for update;
  if not found then raise exception 'Neuer Eigentümer muss bereits Mitglied der Reise sein' using errcode = '22023'; end if;
  update public.trip_members set role = 'editor' where trip_id = p_trip and user_id = v_me;
  update public.trip_members set role = 'owner' where trip_id = p_trip and user_id = p_new_owner;
  perform set_config('rp.owner_transfer', p_trip, true);
  update public.trips set owner_id = p_new_owner where id = p_trip;
  perform set_config('rp.owner_transfer', '', true);
end $$;

create or replace function public.my_account_summary()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  return jsonb_build_object(
    'email', (select u.email from auth.users u where u.id = v_me),
    'created_at', (select u.created_at from auth.users u where u.id = v_me),
    'owned', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'deleted', t.deleted_at is not null,
        'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'email', u.email) order by m.created_at)
                             from public.trip_members m join auth.users u on u.id = m.user_id
                             where m.trip_id = t.id and m.user_id <> v_me), '[]'::jsonb)) order by t.created_at)
      from public.trips t where t.owner_id = v_me), '[]'::jsonb),
    'member_of', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'role', m.role) order by t.created_at)
      from public.trip_members m join public.trips t on t.id = m.trip_id
      where m.user_id = v_me and m.role <> 'owner'), '[]'::jsonb));
end $$;

create or replace function public.export_my_account()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  return jsonb_build_object(
    'format', 'reiseplaner-kontoexport', 'version', 1, 'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) from auth.users u where u.id = v_me),
    'trips', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'role', m.role, 'version', t.version, 'created_at', t.created_at,
        'updated_at', t.updated_at, 'deleted_at', t.deleted_at, 'data', t.data) order by t.created_at)
      from public.trip_members m join public.trips t on t.id = m.trip_id where m.user_id = v_me), '[]'::jsonb),
    'invites_created', coalesce((select jsonb_agg(jsonb_build_object('trip_id', i.trip_id, 'role', i.role, 'email', i.email,
        'created_at', i.created_at, 'expires_at', i.expires_at, 'revoked_at', i.revoked_at, 'used_at', i.used_at) order by i.created_at)
      from public.trip_invites i where i.created_by = v_me), '[]'::jsonb));
end $$;

create or replace function public.delete_my_account(p_confirm_email text, p_delete_shared boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_email text; v_shared integer; v_owned integer;
begin
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_me for update;
  if v_email is null or lower(btrim(coalesce(p_confirm_email, ''))) <> v_email then
    raise exception 'Zur Bestätigung bitte die E-Mail-Adresse dieses Kontos eingeben' using errcode = '22023';
  end if;
  select count(*) into v_owned from public.trips t where t.owner_id = v_me;
  select count(*) into v_shared from public.trips t where t.owner_id = v_me
    and exists (select 1 from public.trip_members m where m.trip_id = t.id and m.user_id <> v_me);
  if v_shared > 0 and not coalesce(p_delete_shared, false) then
    raise exception 'Noch % geteilte Reise(n) im Eigentum. Bitte vorher übergeben oder ausdrücklich mitlöschen.', v_shared using errcode = '22023';
  end if;
  -- Reisen, Mitgliedschaften und Einladungen hängen über "on delete cascade" an auth.users; updated_by/added_by/used_by
  -- fremder Zeilen werden zu null. Sitzungen und Anmeldedaten löscht Supabase Auth über dieselben Fremdschlüssel.
  delete from auth.users where id = v_me;
  return jsonb_build_object('deleted_trips', v_owned, 'deleted_shared_trips', v_shared);
end $$;

revoke all on function public.transfer_trip_ownership(text, uuid) from public, anon;
revoke all on function public.my_account_summary() from public, anon;
revoke all on function public.export_my_account() from public, anon;
revoke all on function public.delete_my_account(text, boolean) from public, anon;
grant execute on function public.transfer_trip_ownership(text, uuid) to authenticated;
grant execute on function public.my_account_summary() to authenticated;
grant execute on function public.export_my_account() to authenticated;
grant execute on function public.delete_my_account(text, boolean) to authenticated;
