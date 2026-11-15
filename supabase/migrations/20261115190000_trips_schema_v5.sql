-- Datenvertrag v5 (docs/SCHEMA_V5.md §8 Schritt 2): Reisedokumente im Format 5 zulassen (Felder aller Module, eine Version).
-- Freigabe Philipp 15.11.2026 („Ja, nach lokalem Test live“). Bestehende Zeilen bleiben unverändert; data bleibt durch
-- trips_data_size begrenzt. Der Rückstufungsschutz trips_no_downgrade (20261015160000) gilt auch für 5 → 4/3/2.
alter table public.trips drop constraint trips_schema_version_check;
alter table public.trips add constraint trips_schema_version_check check (schema_version in (2, 3, 4, 5));
comment on table public.trips is 'Eine Reise je Zeile. data enthält das vollständige Reisedokument (schemaVersion 2, 3, 4 oder 5 der App, siehe docs/SCHEMA_V3.md, docs/SCHEMA_V4.md und docs/SCHEMA_V5.md).';
