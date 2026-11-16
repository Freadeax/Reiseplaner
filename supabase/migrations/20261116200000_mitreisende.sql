-- Reiseplaner · Gemeinsam planen G6: „Ich bin Mitreisende/r X“ (docs/PLAN_GEMEINSAM.md §3 G6)
-- 16.11.2026 · Claude · Freigabe Philipp 16.11. („Beides nacheinander“: Migration lokal testen, dann live)
--
-- Ein Konto kann sich mit genau einem Eintrag der Reisegruppe (data.party[i].member, Format 5) verknüpfen, damit
-- „meine Ausgaben“ und „meine Aufgaben“ funktionieren. Die Verknüpfung setzt nur die Person selbst.
--
-- * trips_party_guard: schützt party[].member bei jedem Schreiben der Reise.
--     - Eine neue oder geänderte Verknüpfung darf nur auf das eigene Konto zeigen.
--     - Eine fremde Verknüpfung lösen dürfen die Person selbst und der Eigentümer; ist das Konto kein Mitglied mehr,
--       darf jeder Bearbeiter sie lösen.
--     - Unerlaubte Änderungen werden nicht abgelehnt, sondern auf den alten Stand zurückgesetzt (ein Abgleich mit
--       altem Stand soll nicht am Speichern scheitern). Der Client übernimmt die zurückgegebene Zeile.
--     - Wird ein Eintrag der Reisegruppe ganz gelöscht, verschwindet seine Verknüpfung mit ihm.
--     - Ein Konto zweimal in derselben Reise: Abbruch mit 23514.
-- * claim_party(p_trip, p_party, p_link): eigene Verknüpfung setzen oder lösen, auch für Leser. Atomar über die
--   aktuelle Zeile, ohne Versionsabgleich des Clients; die Version steigt wie bei jeder Änderung.
-- Bestehende Daten werden nicht verändert.

create or replace function public.trips_party_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_uid   text := (select auth.uid())::text;
  v_old   jsonb := '{}'::jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_seen  text[] := '{}';
  v_dirty boolean := false;
  e jsonb; v_id text; v_new text; v_was text; v_keep text;
begin
  if v_uid is null or jsonb_typeof(new.data -> 'party') is distinct from 'array' then
    return new;
  end if;
  if tg_op = 'UPDATE' and jsonb_typeof(old.data -> 'party') = 'array' then
    select coalesce(jsonb_object_agg(p ->> 'id', p ->> 'member'), '{}'::jsonb) into v_old
    from jsonb_array_elements(old.data -> 'party') p
    where jsonb_typeof(p) = 'object' and p ->> 'id' is not null and p ->> 'member' is not null;
  end if;
  for e in select x from jsonb_array_elements(new.data -> 'party') x loop
    if jsonb_typeof(e) = 'object' then
      v_id := e ->> 'id'; v_new := e ->> 'member'; v_was := v_old ->> v_id; v_keep := v_new;
      if v_new is distinct from v_was then
        if v_was is not null and v_was <> v_uid and (v_new is not null or new.owner_id::text <> v_uid)
           and exists (select 1 from public.trip_members m where m.trip_id = new.id and m.user_id::text = v_was) then
          v_keep := v_was;                       -- fremde Verknüpfung eines Mitglieds bleibt
        elsif v_new is not null and v_new <> v_uid then
          v_keep := v_was;                       -- auf ein anderes Konto darf niemand verknüpfen
        end if;
      end if;
      if v_keep is distinct from v_new then
        v_dirty := true;
        e := case when v_keep is null then e - 'member' else jsonb_set(e, '{member}', to_jsonb(v_keep)) end;
      end if;
      if v_keep is not null then
        if v_keep = any (v_seen) then
          raise exception 'Ein Konto ist mit zwei Mitreisenden verknüpft.' using errcode = '23514';
        end if;
        v_seen := v_seen || v_keep;
      end if;
    end if;
    v_out := v_out || jsonb_build_array(e);
  end loop;
  if v_dirty then
    new.data := jsonb_set(new.data, '{party}', v_out);
  end if;
  return new;
end $$;

-- Name nach trips_before_write (Trigger laufen alphabetisch): owner_id ist beim Anlegen schon gesetzt.
create trigger trips_party_guard
before insert or update of data on public.trips
for each row execute function public.trips_party_guard();

create or replace function public.claim_party(p_trip text, p_party text, p_link boolean)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_role public.trip_role;
  v_row  public.trips;
  v_out  jsonb := '[]'::jsonb;
  v_hit  boolean := false;
  e jsonb; v_m text;
begin
  if v_me is null then raise exception 'Anmeldung erforderlich' using errcode = '42501'; end if;
  v_role := public.trip_role_of(p_trip);
  if v_role is null then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_party is null or p_link is null then raise exception 'Angaben fehlen' using errcode = '22023'; end if;
  select * into v_row from public.trips t where t.id = p_trip for update;
  if v_row.deleted_at is not null then raise exception 'Reise ist gelöscht' using errcode = '22023'; end if;
  if v_row.schema_version < 5 then
    raise exception 'Die Reise muss zuerst auf die neue Version gehoben werden.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_row.data -> 'party') is distinct from 'array' then
    raise exception 'Person nicht gefunden' using errcode = '22023';
  end if;
  for e in select x from jsonb_array_elements(v_row.data -> 'party') x loop
    if jsonb_typeof(e) = 'object' then
      v_m := e ->> 'member';
      if e ->> 'id' = p_party then
        v_hit := true;
        if p_link then
          if v_m is not null and v_m <> v_me::text
             and exists (select 1 from public.trip_members m where m.trip_id = p_trip and m.user_id::text = v_m) then
            raise exception 'Diese Person ist schon mit einem anderen Konto verknüpft.' using errcode = '22023';
          end if;
          e := jsonb_set(e, '{member}', to_jsonb(v_me::text));
        else
          if v_m is null then null;
          elsif v_m <> v_me::text and v_role <> 'owner'
             and exists (select 1 from public.trip_members m where m.trip_id = p_trip and m.user_id::text = v_m) then
            raise exception 'Nur die Person selbst oder der Eigentümer kann die Verknüpfung lösen.' using errcode = '42501';
          end if;
          e := e - 'member';
        end if;
      elsif p_link and v_m = v_me::text then
        e := e - 'member';                       -- Wechsel: alte eigene Verknüpfung wird gelöst
      end if;
    end if;
    v_out := v_out || jsonb_build_array(e);
  end loop;
  if not v_hit then raise exception 'Person nicht gefunden' using errcode = '22023'; end if;
  if v_out = v_row.data -> 'party' then return v_row.version; end if;
  update public.trips set data = jsonb_set(data, '{party}', v_out) where id = p_trip
  returning version into v_row.version;
  return v_row.version;
end $$;

revoke all on function public.claim_party(text, text, boolean) from public, anon;
grant execute on function public.claim_party(text, text, boolean) to authenticated;
revoke all on function public.trips_party_guard() from public, anon, authenticated;
