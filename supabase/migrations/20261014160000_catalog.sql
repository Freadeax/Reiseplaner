-- Reiseplaner · Umkreis-Katalog (Issue #7)
-- Version 1 · 14.10.2026
-- Redaktionelle Planideen: Ziele (catalog_places) und Attraktionen (catalog_spots). Öffentlich nur lesbar,
-- auch ohne Anmeldung. Geschrieben wird ausschließlich über Migrationen (Seed aus catalog-data.js via
-- scripts/catalog-sql.mjs). Keine Preise, keine Öffnungszeiten, keine Nutzerdaten.
-- Entfernungsregel identisch mit catalog.js: Haversine (6371 km), geschätzte Straßen-km = Luftlinie × 1,3.

create table public.catalog_places (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 120),
  region text not null default '',
  country text not null check (country ~ '^[A-Z]{2}$'),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  kinds text[] not null default '{}',
  months smallint[] not null default '{}' check (months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  nights_min smallint not null default 0 check (nights_min between 0 and 60),
  nights_max smallint not null default 7 check (nights_max between nights_min and 60),
  summary text not null default '',
  angle text not null default '',
  catalog_version integer not null check (catalog_version > 0),
  updated_at timestamptz not null default now()
);

create table public.catalog_spots (
  id text primary key check (id ~ '^[a-z0-9-]{2,80}$'),
  place_id text not null references public.catalog_places(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  kind text not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  hours numeric(3,1) not null default 2 check (hours > 0 and hours <= 12),
  indoor boolean not null default false,
  family boolean not null default false,
  months smallint[] not null default '{}' check (months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  slot text not null default '' check (slot in ('', 'morgen', 'mittag', 'nachm', 'abend')),
  summary text not null default '',
  tip text not null default '',
  ord smallint not null default 0,
  catalog_version integer not null check (catalog_version > 0),
  updated_at timestamptz not null default now()
);
create index catalog_spots_place_idx on public.catalog_spots (place_id);

alter table public.catalog_places enable row level security;
alter table public.catalog_places force row level security;
alter table public.catalog_spots enable row level security;
alter table public.catalog_spots force row level security;
create policy catalog_places_read on public.catalog_places for select to anon, authenticated using (true);
create policy catalog_spots_read on public.catalog_spots for select to anon, authenticated using (true);
revoke all on public.catalog_places, public.catalog_spots from anon, authenticated;
grant select on public.catalog_places, public.catalog_spots to anon, authenticated;

create function public.catalog_air_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision
language sql immutable strict parallel safe
set search_path = ''
as $$
  select 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2))));
$$;

-- Ziele im Bereich [p_min_km, p_max_km] geschätzter Straßen-km, optional nach Themen, sortiert nach Luftlinie,
-- höchstens 80 Ziele, jeweils mit allen Attraktionen. Ergebnis: {version, places:[…]}.
create function public.catalog_search(
  p_lat double precision, p_lon double precision, p_max_km integer, p_min_km integer default 0, p_kinds text[] default null)
returns jsonb
language plpgsql stable
security invoker
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'Abfahrtsort ohne gültige Koordinaten' using errcode = '22023';
  end if;
  if p_max_km is null or p_max_km <= 0 or p_max_km > 2000 then
    raise exception 'Kilometerbereich: höchstens 2000 km' using errcode = '22023';
  end if;
  if coalesce(p_min_km, 0) < 0 or coalesce(p_min_km, 0) >= p_max_km then
    raise exception 'Kilometerbereich: ab muss kleiner als bis sein' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'version', coalesce((select max(catalog_version) from public.catalog_places), 0),
    'places', coalesce(jsonb_agg(x.place order by x.air, x.id), '[]'::jsonb))
  into v
  from (
    select p.id, d.air,
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'region', p.region, 'country', p.country, 'lat', p.lat, 'lon', p.lon,
        'kinds', to_jsonb(p.kinds), 'months', to_jsonb(p.months), 'nights_min', p.nights_min, 'nights_max', p.nights_max,
        'summary', p.summary, 'angle', p.angle, 'air_km', round(d.air::numeric, 1),
        'spots', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'name', s.name, 'kind', s.kind, 'lat', s.lat, 'lon', s.lon, 'hours', s.hours,
            'indoor', s.indoor, 'family', s.family, 'months', to_jsonb(s.months), 'slot', s.slot,
            'summary', s.summary, 'tip', s.tip) order by s.ord, s.id)
          from public.catalog_spots s where s.place_id = p.id), '[]'::jsonb)) as place
    from public.catalog_places p
    cross join lateral (select public.catalog_air_km(p_lat, p_lon, p.lat, p.lon) as air) d
    where d.air * 1.3 between coalesce(p_min_km, 0) and p_max_km
      and (p_kinds is null or cardinality(p_kinds) = 0 or p.kinds && p_kinds)
    order by d.air, p.id
    limit 80
  ) x;
  return v;
end;
$$;

revoke all on function public.catalog_air_km(double precision, double precision, double precision, double precision) from public;
revoke all on function public.catalog_search(double precision, double precision, integer, integer, text[]) from public;
grant execute on function public.catalog_air_km(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.catalog_search(double precision, double precision, integer, integer, text[]) to anon, authenticated;
