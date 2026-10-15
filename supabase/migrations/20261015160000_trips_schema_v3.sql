-- Datenvertrag v3 vorbereiten (docs/SCHEMA_V3.md §5, Plan E2; Freigabe Philipp 15.10.2026, #8).
-- 1. Reisedokumente im Speicherformat 3 zulassen (zusätzlich zu 2).
-- 2. Keine Rückstufung: Eine Reise, die einmal in einem neueren Format gespeichert wurde, darf nicht mit einem
--    älteren Format überschrieben werden. Das schützt vor Datenverlust durch zwischengespeicherte ältere App-Versionen.
-- Bestehende Zeilen bleiben unverändert (alle schema_version = 2). Keine Daten werden migriert.

alter table public.trips drop constraint trips_schema_version_check;
alter table public.trips add constraint trips_schema_version_check check (schema_version in (2, 3));
comment on table public.trips is 'Eine Reise je Zeile. data enthält das vollständige Reisedokument (schemaVersion 2 oder 3 der App, siehe docs/SCHEMA_V3.md).';

create or replace function public.trips_no_downgrade()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.schema_version < old.schema_version then
    raise exception 'Diese Reise wurde mit einer neueren App-Version gespeichert (Format %). Bitte die App neu laden.', old.schema_version
      using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.trips_no_downgrade() is 'Verhindert, dass ein älteres Speicherformat ein neueres überschreibt (läuft nach trips_before_write, das schema_version aus data setzt).';

-- Name sortiert nach trips_before_write: Postgres führt gleichartige Trigger alphabetisch aus.
create trigger trips_before_write_version
  before update on public.trips
  for each row execute function public.trips_no_downgrade();
