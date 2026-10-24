-- Datenvertrag v4 (docs/SCHEMA_V4.md §1, §6 Schritt 3): Reisedokumente im Format 4 (Fotos als Einträge, Reisebücher) zulassen.
-- Freigabe Philipp 24.10.2026 nach lokalen Tests. Bilddateien liegen nicht in der Tabelle; data bleibt durch trips_data_size begrenzt.
-- Bestehende Zeilen bleiben unverändert. Der Rückstufungsschutz trips_no_downgrade (20261015160000) gilt auch für 4 → 3/2.
alter table public.trips drop constraint trips_schema_version_check;
alter table public.trips add constraint trips_schema_version_check check (schema_version in (2, 3, 4));
comment on table public.trips is 'Eine Reise je Zeile. data enthält das vollständige Reisedokument (schemaVersion 2, 3 oder 4 der App, siehe docs/SCHEMA_V3.md und docs/SCHEMA_V4.md).';
