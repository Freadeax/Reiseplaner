-- Reiseplaner · Umkreis-Katalog skalierbar (Claude, #8, Katalog K2). Nur Katalogtabellen (öffentlich lesbar, nicht schreibbar).
-- 1. Indizes: Lage (Bounding-Box-Vorfilter) und Arten.
-- 2. catalog_search_v2: wie catalog_search (gleiche Entfernungsregel, gleiche Reihenfolge), aber mit Vorfilter, Seiten
--    (p_limit/p_offset) und Gesamtzahl. catalog_search bleibt unverändert für zwischengespeicherte Clients.
-- 3. catalog_place: ein Ziel mit Attraktionen (Direktlink). 4. catalog_find: Namens-/Regionssuche ohne Attraktionen.
-- Keine Datenänderung.

create index if not exists catalog_places_lat_lon_idx on public.catalog_places (lat, lon);
create index if not exists catalog_places_kinds_idx on public.catalog_places using gin (kinds);

-- Ein Ziel als JSON, gleiches Format wie in catalog_search
create function public.catalog_place_json(p public.catalog_places, p_air double precision)
returns jsonb
language sql stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'region', p.region, 'country', p.country, 'lat', p.lat, 'lon', p.lon,
    'kinds', to_jsonb(p.kinds), 'months', to_jsonb(p.months), 'nights_min', p.nights_min, 'nights_max', p.nights_max,
    'summary', p.summary, 'angle', p.angle, 'air_km', case when p_air is null then null else round(p_air::numeric, 1) end,
    'spots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'kind', s.kind, 'lat', s.lat, 'lon', s.lon, 'hours', s.hours,
        'indoor', s.indoor, 'family', s.family, 'months', to_jsonb(s.months), 'slot', s.slot,
        'summary', s.summary, 'tip', s.tip) order by s.ord, s.id)
      from public.catalog_spots s where s.place_id = p.id), '[]'::jsonb));
$$;

create function public.catalog_search_v2(
  p_lat double precision, p_lon double precision, p_max_km integer, p_min_km integer default 0, p_kinds text[] default null,
  p_limit integer default 80, p_offset integer default 0)
returns jsonb
language plpgsql stable
security invoker
set search_path = ''
as $$
declare
  v jsonb;
  r double precision;      -- größte mögliche Luftlinie in Bogenmaß
  dlat double precision;
  dlon double precision;
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
  if p_limit is null or p_limit not between 1 and 200 or p_offset is null or p_offset not between 0 and 5000 then
    raise exception 'Seite: limit 1–200, offset 0–5000' using errcode = '22023';
  end if;
  -- Bounding-Box, die jeden Punkt innerhalb der Luftlinie sicher enthält (+1 % Rand); bei Polnähe ganze Länge
  r := (p_max_km / 1.3) / 6371.0 * 1.01;
  dlat := degrees(r);
  dlon := case when sin(r) >= cos(radians(p_lat)) then 360 else degrees(asin(sin(r) / cos(radians(p_lat)))) end;

  with hits as (
    select p, d.air
    from public.catalog_places p
    cross join lateral (select public.catalog_air_km(p_lat, p_lon, p.lat, p.lon) as air) d
    where p.lat between p_lat - dlat and p_lat + dlat
      and (dlon >= 180 or p.lon between p_lon - dlon and p_lon + dlon
           or p.lon between p_lon - dlon + 360 and p_lon + dlon + 360 or p.lon between p_lon - dlon - 360 and p_lon + dlon - 360)
      and d.air * 1.3 between coalesce(p_min_km, 0) and p_max_km
      and (p_kinds is null or cardinality(p_kinds) = 0 or p.kinds && p_kinds)
  ), page as (
    select h.p, h.air from hits h order by h.air, (h.p).id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'version', coalesce((select max(catalog_version) from public.catalog_places), 0),
    'total', (select count(*) from hits), 'limit', p_limit, 'offset', p_offset,
    'places', coalesce((select jsonb_agg(public.catalog_place_json(pg.p, pg.air) order by pg.air, (pg.p).id) from page pg), '[]'::jsonb))
  into v;
  return v;
end;
$$;

create function public.catalog_place(p_id text)
returns jsonb
language sql stable
security invoker
set search_path = ''
as $$
  select case when p_id is null or p_id !~ '^[a-z0-9-]{2,40}$' then null else
    (select jsonb_build_object('version', coalesce((select max(catalog_version) from public.catalog_places), 0),
       'place', public.catalog_place_json(p, null))
     from public.catalog_places p where p.id = p_id) end;
$$;

-- Namens-/Regionssuche: Anfang des Namens zuerst, dann enthalten; Platzhalterzeichen werden wörtlich gesucht
create function public.catalog_find(p_q text, p_limit integer default 12)
returns jsonb
language plpgsql stable
security invoker
set search_path = ''
as $$
declare
  q text := lower(btrim(coalesce(p_q, '')));
  esc text;
  pat text;
  pre text;
  v jsonb;
begin
  if char_length(q) < 2 or char_length(q) > 60 then
    raise exception 'Suchbegriff: 2–60 Zeichen' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'limit 1–50' using errcode = '22023';
  end if;
  esc := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  pat := '%' || esc || '%';
  pre := esc || '%';
  select jsonb_build_object('version', coalesce((select max(catalog_version) from public.catalog_places), 0),
    'places', coalesce(jsonb_agg(x.j order by x.rank, x.name, x.id), '[]'::jsonb))
  into v
  from (
    select p.id, p.name,
      case when lower(p.name) like pre escape '\' then 0 when lower(p.name) like pat escape '\' then 1 else 2 end as rank,
      jsonb_build_object('id', p.id, 'name', p.name, 'region', p.region, 'country', p.country, 'lat', p.lat, 'lon', p.lon,
        'kinds', to_jsonb(p.kinds), 'summary', p.summary) as j
    from public.catalog_places p
    where lower(p.name) like pat escape '\' or lower(p.region) like pat escape '\'
       or exists (select 1 from public.catalog_spots s where s.place_id = p.id and lower(s.name) like pat escape '\')
    order by 3, p.name, p.id
    limit p_limit
  ) x;
  return v;
end;
$$;

revoke all on function public.catalog_place_json(public.catalog_places, double precision) from public;
revoke all on function public.catalog_search_v2(double precision, double precision, integer, integer, text[], integer, integer) from public;
revoke all on function public.catalog_place(text) from public;
revoke all on function public.catalog_find(text, integer) from public;
grant execute on function public.catalog_place_json(public.catalog_places, double precision) to anon, authenticated;
grant execute on function public.catalog_search_v2(double precision, double precision, integer, integer, text[], integer, integer) to anon, authenticated;
grant execute on function public.catalog_place(text) to anon, authenticated;
grant execute on function public.catalog_find(text, integer) to anon, authenticated;
