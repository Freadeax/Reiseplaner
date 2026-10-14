-- NUR FALLS NÖTIG im Supabase-Dashboard unter "SQL Editor" ausführen: wenn die GitHub-Integration den Katalog
-- nicht eingespielt hat (REST meldet für catalog_search PGRST202 bzw. für catalog_places PGRST205).
-- ERZEUGT von scripts/catalog-sql.mjs. Läuft in einer Transaktion und trägt beide Migrationen in die Historie ein,
-- damit Integration und `supabase db push` sie nicht doppelt ausführen. Ist das Schema schon da, bricht die Datei
-- beim ersten create table ohne Änderung ab.

begin;

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

-- Reiseplaner · Umkreis-Katalog Version 1 (Stand 2026-10-14)
-- ERZEUGT von scripts/catalog-sql.mjs aus catalog-data.js. Nicht von Hand ändern.
-- 54 Ziele, 255 Attraktionen. Ältere Katalogversionen werden am Ende entfernt.

insert into public.catalog_places (id, name, region, country, lat, lon, kinds, months, nights_min, nights_max, summary, angle, catalog_version) values
  ('bad-urach', 'Bad Urach & Schwäbische Alb', 'Baden-Württemberg', 'DE', 48.491, 9.399, array['natur','berge','therme','familie','burg']::text[], array[4,5,6,7,8,9,10]::smallint[], 0, 2, 'Albtrauf mit Wasserfällen, Burgruinen und Höhlen; zum Abschluss Thermalwasser.', 'Wasserfall-Runde am Vormittag, nachmittags ins Thermalbad – bei Regen einfach umdrehen.', 1),
  ('blaubeuren', 'Blaubeuren & Blautopf', 'Baden-Württemberg', 'DE', 48.412, 9.785, array['natur','kultur','familie','unterwelt']::text[], array[3,4,5,6,7,8,9,10,11]::smallint[], 0, 1, 'Die tiefblaue Karstquelle, ein Kloster und die ältesten Kunstwerke der Menschheit.', 'Erst die Quelle, dann im Museum die Venus vom Hohle Fels – Eiszeit trifft Klosteridyll.', 1),
  ('bodensee-nord', 'Bodensee-Nordufer (Meersburg)', 'Baden-Württemberg', 'DE', 47.694, 9.271, array['wasser','kultur','familie','genuss','technik']::text[], array[4,5,6,7,8,9,10]::smallint[], 1, 4, 'Seeufer mit Burg, Blumeninsel, Pfahlbauten und Zeppelin-Geschichte.', 'Mit der Fähre nach Konstanz statt ums Ufer fahren – der See wird zur Abkürzung.', 1),
  ('triberg', 'Triberg & mittlerer Schwarzwald', 'Baden-Württemberg', 'DE', 48.131, 8.231, array['natur','kultur','familie','winter']::text[], array[1,2,5,6,7,8,9,10,12]::smallint[], 0, 3, 'Wasserfälle, Kuckucksuhren und Schwarzwaldhöfe – das Klischee zum Anfassen.', 'Kuckucksuhren-Tour: größte Uhr, Uhrenmuseum Furtwangen und abends Schwarzwälder Kirsch.', 1),
  ('titisee-feldberg', 'Titisee & Feldberg', 'Baden-Württemberg', 'DE', 47.898, 8.15, array['natur','berge','wasser','winter','therme']::text[], array[1,2,3,6,7,8,9,10,12]::smallint[], 1, 5, 'Höchster Gipfel im Schwarzwald, Seen und Schluchten; im Winter Schneesicherheit.', 'Schluchten-Duo: morgens Ravennaschlucht, später die wilde Wutach – dazwischen Titisee.', 1),
  ('freiburg', 'Freiburg & Kaiserstuhl', 'Baden-Württemberg', 'DE', 47.995, 7.85, array['stadt','genuss','berge','familie']::text[], array[3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Sonnige Unistadt mit Bächle, Münster und Weinbergen vor der Tür.', 'Vormittags Münstermarkt, nachmittags mit der Seilbahn auf den Schauinsland, abends Kaiserstühler Wein.', 1),
  ('heidelberg', 'Heidelberg & Kurpfalz', 'Baden-Württemberg', 'DE', 49.41, 8.715, array['stadt','kultur','burg','technik']::text[], array[3,4,5,6,7,8,9,10,11,12]::smallint[], 0, 2, 'Schlossruine, Altstadt am Neckar und Philosophenweg.', 'Zwei Perspektiven: morgens vom Philosophenweg aufs Schloss schauen, nachmittags vom Schloss zurück.', 1),
  ('stuttgart', 'Stuttgart', 'Baden-Württemberg', 'DE', 48.776, 9.183, array['stadt','technik','familie','therme']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 0, 2, 'Autostadt mit zwei großen Automuseen, Zoo-Garten und Mineralbädern.', 'Stäffele statt Stau: die Stadt über ihre Treppenwege erkunden, Schlussstein im Mineralbad.', 1),
  ('rothenburg', 'Rothenburg ob der Tauber', 'Bayern', 'DE', 49.377, 10.179, array['stadt','kultur']::text[], array[3,4,5,6,7,8,9,10,11,12]::smallint[], 0, 2, 'Mittelalterliche Stadt mit begehbarer Mauer und Fachwerk wie im Bilderbuch.', 'Erst abends richtig schön: Tagesgäste sind weg, der Nachtwächter erzählt.', 1),
  ('nuernberg', 'Nürnberg', 'Bayern', 'DE', 49.454, 11.077, array['stadt','kultur','technik','unterwelt']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Kaiserburg, große Museen und Geschichte, die man nicht vergessen sollte.', 'Über und unter der Stadt: Kaiserburg oben, historische Felsengänge darunter.', 1),
  ('bamberg', 'Bamberg & Fränkische Schweiz', 'Bayern', 'DE', 49.892, 10.887, array['stadt','genuss','natur','unterwelt']::text[], array[3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Welterbe-Altstadt mit Rauchbier, dazu Felsen, Burgen und Höhlen der Fränkischen Schweiz.', 'Bierkeller-Saison: im Sommer sitzt Franken nicht in, sondern auf dem Keller.', 1),
  ('muenchen', 'München', 'Bayern', 'DE', 48.137, 11.575, array['stadt','kultur','technik','genuss']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 4, 'Museen, Biergärten und Surfer mitten in der Stadt.', 'Eisbachwelle zuschauen, Weißwurst vor zwölf, Deutsches Museum bei Regen.', 1),
  ('berchtesgaden', 'Berchtesgadener Land', 'Bayern', 'DE', 47.63, 13.002, array['berge','wasser','natur','therme','winter','unterwelt']::text[], array[1,2,5,6,7,8,9,10,12]::smallint[], 2, 5, 'Königssee, Watzmann und ein Salzbergwerk mit Rutschen.', 'Im Salzbergwerk unterirdisch rutschen, am nächsten Tag mit dem Elektroboot zum Echo am Königssee.', 1),
  ('garmisch', 'Garmisch-Partenkirchen & Zugspitzland', 'Bayern', 'DE', 47.492, 11.096, array['berge','natur','winter','burg','kultur']::text[], array[1,2,3,6,7,8,9,10,12]::smallint[], 2, 5, 'Deutschlands höchster Gipfel, Klammen, Bergseen und Königsschlösser.', 'Eibsee am frühen Morgen spiegelglatt, mittags auf die Zugspitze, abends durch die Partnachklamm zurück.', 1),
  ('fuessen', 'Füssen & Königswinkel', 'Bayern', 'DE', 47.57, 10.7, array['burg','berge','wasser','natur']::text[], array[4,5,6,7,8,9,10,12]::smallint[], 1, 3, 'Neuschwanstein, Seen und Lechfall am Alpenrand.', 'Neuschwanstein von der Marienbrücke statt nur von innen – und abends am Forggensee ins Licht schauen.', 1),
  ('chiemsee', 'Chiemsee', 'Bayern', 'DE', 47.856, 12.346, array['wasser','kultur','burg','berge']::text[], array[4,5,6,7,8,9,10]::smallint[], 1, 4, '„Bayerisches Meer“ mit Schlossinsel, Klosterinsel und Bergen im Rücken.', 'Insel-Hopping: Herreninsel mit Spiegelsaal, Fraueninsel mit Räucherfisch.', 1),
  ('bayerischer-wald', 'Nationalpark Bayerischer Wald', 'Bayern', 'DE', 48.884, 13.479, array['natur','familie','kultur']::text[], array[1,2,4,5,6,7,8,9,10,12]::smallint[], 2, 5, 'Wilder Wald, Baumwipfelpfad und Tiere im Freigelände.', 'Wildnis-Wochenende: Luchs im Freigelände suchen, Sonnenaufgang am Lusen.', 1),
  ('regensburg', 'Regensburg & Altmühltal', 'Bayern', 'DE', 49.013, 12.101, array['stadt','kultur','genuss','wasser']::text[], array[3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Mittelalterliche Altstadt, Donau und ein Kloster in der Flussschlucht.', 'Mit dem Schiff durch den Donaudurchbruch zum Kloster Weltenburg – Klosterbier inklusive Ausblick.', 1),
  ('mittelrhein', 'Oberes Mittelrheintal (Loreley)', 'Rheinland-Pfalz', 'DE', 50.14, 7.73, array['burg','genuss','wasser','kultur','natur']::text[], array[4,5,6,7,8,9,10]::smallint[], 1, 3, 'Burgen im Minutentakt, Weinberge und der berühmte Loreley-Felsen.', 'Burgen-Pingpong: mit den Rheinfähren hin und her statt über Brücken (es gibt hier keine).', 1),
  ('cochem', 'Cochem & Mosel', 'Rheinland-Pfalz', 'DE', 50.146, 7.167, array['burg','genuss','natur','wasser','unterwelt']::text[], array[4,5,6,7,8,9,10,11]::smallint[], 1, 3, 'Reichsburg über Weinbergen, Hängeseilbrücke und Burg Eltz in der Nähe.', 'Ein Bunker voller Notgeld unter Weinbergen – Kalter Krieg trifft Moselromantik.', 1),
  ('pfalz', 'Pfälzerwald & Weinstraße', 'Rheinland-Pfalz', 'DE', 49.408, 8.185, array['genuss','natur','burg','familie']::text[], array[3,4,5,6,7,8,9,10,11]::smallint[], 1, 3, 'Wandern zu Hütten, Burgen auf Sandsteinfelsen, Wein in jeder Gasse.', 'Hüttentour: Pfälzerwaldvereins-Hütten als Etappenziele statt Gipfel.', 1),
  ('saarschleife', 'Saarschleife & Saarland', 'Saarland', 'DE', 49.505, 6.558, array['natur','technik','kultur']::text[], array[4,5,6,7,8,9,10,11]::smallint[], 1, 2, 'Flussschleife von oben und Industrie-Welterbe.', 'Natur gegen Hochofen: morgens Baumwipfelpfad, nachmittags durch die Völklinger Hütte.', 1),
  ('koeln', 'Köln & Rheinland', 'Nordrhein-Westfalen', 'DE', 50.938, 6.958, array['stadt','kultur','familie','genuss']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Dom, Brauhaus und Rheinufer – plus Schokolade.', 'Kölsch-Zählung per Bierdeckel und Domspitze von oben – 533 Stufen als Ausgleich.', 1),
  ('ruhrgebiet', 'Ruhrgebiet – Industriekultur', 'Nordrhein-Westfalen', 'DE', 51.486, 7.044, array['technik','kultur','unterwelt']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 0, 2, 'Zechen, Hochöfen und Halden als Kulturorte.', 'Nachtschicht: der Landschaftspark Duisburg-Nord wird nach Sonnenuntergang farbig beleuchtet.', 1),
  ('eifel', 'Monschau & Nordeifel', 'Nordrhein-Westfalen', 'DE', 50.555, 6.24, array['natur','wasser','kultur']::text[], array[4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Fachwerkstadt im Tal, Hohes Venn und Nationalpark mit Seen.', 'Moor-Bohlenwege im Hohen Venn: ein Stück Skandinavien an der belgischen Grenze.', 1),
  ('winterberg', 'Winterberg & Hochsauerland', 'Nordrhein-Westfalen', 'DE', 51.195, 8.533, array['berge','winter','natur','familie','unterwelt']::text[], array[1,2,3,5,6,7,8,9,10,12]::smallint[], 1, 4, 'Skigebiet im Winter, Rothaarsteig und Bikepark im Sommer.', 'Tropfsteine in der Atta-Höhle als Schlechtwetter-Joker.', 1),
  ('harz', 'Harz (Wernigerode)', 'Sachsen-Anhalt', 'DE', 51.835, 10.785, array['berge','natur','kultur','technik','winter','unterwelt','burg']::text[], array[1,2,4,5,6,7,8,9,10,12]::smallint[], 2, 5, 'Brocken, Dampfzüge, Hängebrücke und Fachwerkstädte.', 'Mit der Dampflok auf den Brocken, zu Fuß zurück – und am nächsten Tag über die Titan-RT-Hängebrücke.', 1),
  ('eisenach', 'Eisenach & Thüringer Wald', 'Thüringen', 'DE', 50.975, 10.32, array['burg','natur','kultur','technik','unterwelt']::text[], array[3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Wartburg, Drachenschlucht und ein Bergwerk mit Kristallgrotte.', 'Durch die Drachenschlucht, die an manchen Stellen nur schulterbreit ist, hinauf zur Wartburg.', 1),
  ('weimar', 'Weimar & Erfurt', 'Thüringen', 'DE', 50.979, 11.329, array['stadt','kultur']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Klassik, Bauhaus und die bewohnte Krämerbrücke.', 'Zwei Städte, ein Ticket: Weimar und Erfurt liegen nur eine kurze Bahnfahrt auseinander.', 1),
  ('saechsische-schweiz', 'Sächsische Schweiz', 'Sachsen', 'DE', 50.917, 14.155, array['natur','berge','burg','therme']::text[], array[3,4,5,6,7,8,9,10,11]::smallint[], 2, 5, 'Tafelberge, Felsentürme und eine Festung über der Elbe.', 'Schrammsteine statt Bastei-Rummel – oder die Bastei ganz früh, bevor die Busse kommen.', 1),
  ('dresden', 'Dresden', 'Sachsen', 'DE', 51.05, 13.738, array['stadt','kultur','burg','genuss']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Barockstadt mit Frauenkirche, Zwinger und Elbdampfern.', 'Elbdampfer nach Pillnitz, zurück mit dem Bus – Schloss und Fluss in einem.', 1),
  ('leipzig', 'Leipzig & Neuseenland', 'Sachsen', 'DE', 51.34, 12.375, array['stadt','kultur','wasser','familie']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Kreative Stadt mit Seen aus ehemaligen Tagebauen.', 'Stadt am Strand: im Sommer vom Zentrum per Rad an den Cospudener See.', 1),
  ('spreewald', 'Spreewald', 'Brandenburg', 'DE', 51.867, 13.966, array['wasser','natur','familie','therme','genuss']::text[], array[4,5,6,7,8,9,10]::smallint[], 1, 3, 'Kahnfahrten durch Fließe, Gurken und sorbische Dörfer.', 'Selbst paddeln statt Kahn: im Kajak durch die stillen Nebenfließe.', 1),
  ('berlin', 'Berlin & Potsdam', 'Berlin', 'DE', 52.52, 13.405, array['stadt','kultur','genuss']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 2, 5, 'Geschichte an jeder Ecke, Museen und Kieze.', 'Auf einem ehemaligen Flughafen Fahrrad fahren: das Tempelhofer Feld.', 1),
  ('mueritz', 'Müritz & Mecklenburgische Seenplatte', 'Mecklenburg-Vorpommern', 'DE', 53.517, 12.684, array['wasser','natur','familie']::text[], array[5,6,7,8,9,10]::smallint[], 2, 7, 'Hunderte Seen, Kanutouren und Kraniche im Herbst.', 'Hausboot ohne Führerschein auf ausgewiesenen Revieren – Bedingungen beim Vermieter prüfen.', 1),
  ('ruegen', 'Rügen', 'Mecklenburg-Vorpommern', 'DE', 54.4, 13.611, array['wasser','natur','kultur','familie']::text[], array[5,6,7,8,9]::smallint[], 3, 7, 'Kreidefelsen, Bäderarchitektur und lange Strände.', 'Rasender Roland: mit der Schmalspur-Dampfbahn von Seebad zu Seebad.', 1),
  ('hamburg', 'Hamburg', 'Hamburg', 'DE', 53.55, 9.993, array['stadt','kultur','technik','wasser']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 4, 'Hafen, Speicherstadt und Elbphilharmonie.', 'Hafenrundfahrt mit der Linienfähre: mit der Fähre 62 nach Finkenwerder.', 1),
  ('st-peter-ording', 'Sankt Peter-Ording & Nordfriesland', 'Schleswig-Holstein', 'DE', 54.305, 8.631, array['wasser','natur','therme','familie']::text[], array[4,5,6,7,8,9,10]::smallint[], 2, 7, 'Riesiger Sandstrand, Pfahlbauten und Wattenmeer.', 'Wattwanderung nur mit Führung und Tidenkalender – der Meeresboden als Wanderweg.', 1),
  ('lueneburger-heide', 'Lüneburger Heide', 'Niedersachsen', 'DE', 53.19, 9.98, array['natur','familie','stadt']::text[], array[5,6,7,8,9,10]::smallint[], 1, 3, 'Heideflächen mit Schafen, Kutschfahrten und Freizeitparks.', 'Zur Heideblüte (meist August bis September) per Kutsche nach Wilsede – das Dorf ist autofrei.', 1),
  ('kassel', 'Kassel & Edersee', 'Hessen', 'DE', 51.316, 9.394, array['kultur','natur','wasser','burg']::text[], array[4,5,6,7,8,9,10]::smallint[], 1, 3, 'Bergpark mit Herkules und Wasserspielen, dazu Stausee und Urwald.', 'Den Wasserspielen bergab folgen – vom Herkules bis zur Fontäne, im Sommer an festen Tagen.', 1),
  ('luebeck', 'Lübeck & Travemünde', 'Schleswig-Holstein', 'DE', 53.866, 10.687, array['stadt','kultur','wasser','genuss']::text[], array[4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Hansestadt mit Holstentor, Marzipan und Ostseestrand vor der Tür.', 'Stadt am Vormittag, Strand am Nachmittag: Travemünde liegt nur eine kurze Fahrt entfernt.', 1),
  ('colmar', 'Colmar & Elsässer Weinstraße', 'Elsass', 'FR', 48.079, 7.358, array['stadt','genuss','burg','familie']::text[], array[4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Fachwerkdörfer, Weinberge und eine Hochkönigsburg.', 'Dorf-Hopping an der Weinstraße: Riquewihr, Eguisheim – und Flammkuchen statt Mittagessen.', 1),
  ('strassburg', 'Straßburg', 'Elsass', 'FR', 48.583, 7.746, array['stadt','kultur','genuss']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 3, 'Münster, Petite France und europäische Institutionen.', 'Rundfahrt auf der Ill mit Schleusen – die Stadt vom Wasser aus.', 1),
  ('schaffhausen', 'Rheinfall & Schaffhausen', 'Schweiz', 'CH', 47.678, 8.615, array['natur','wasser','stadt','burg']::text[], array[3,4,5,6,7,8,9,10]::smallint[], 0, 2, 'Größter Wasserfall Mitteleuropas und mittelalterliche Städtchen.', 'Mit dem Boot zum Felsen mitten im Rheinfall – nichts für Wasserscheue.', 1),
  ('luzern', 'Luzern & Vierwaldstättersee', 'Schweiz', 'CH', 47.05, 8.309, array['berge','wasser','stadt','technik']::text[], array[4,5,6,7,8,9,10,12]::smallint[], 2, 4, 'Kapellbrücke, Dampfschiffe und Hausberge mit Zahnradbahnen.', 'Goldene Runde: Schiff – steilste Zahnradbahn der Welt – Seilbahn; ein Kreis ohne Rückweg.', 1),
  ('innsbruck', 'Innsbruck', 'Tirol', 'AT', 47.269, 11.404, array['stadt','berge','winter','kultur']::text[], array[1,2,3,5,6,7,8,9,10,12]::smallint[], 1, 4, 'Alpenstadt, in der man aus der Altstadt direkt ins Hochgebirge fährt.', 'Von der Altstadt in 30 Minuten auf über 2.000 m – mit Bahn und Seilbahn, ohne Auto.', 1),
  ('salzburg', 'Salzburg & Salzachtal', 'Salzburg', 'AT', 47.8, 13.044, array['stadt','kultur','burg','berge','unterwelt']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1, 4, 'Barockstadt mit Festung, Mozart und Eishöhle in der Nähe.', 'Bei den Wasserspielen Hellbrunn wird man garantiert nass – ein fürstlicher Streich aus dem 17. Jahrhundert.', 1),
  ('zillertal', 'Zillertal', 'Tirol', 'AT', 47.167, 11.865, array['berge','winter','natur','genuss','familie']::text[], array[1,2,3,4,6,7,8,9,10,12]::smallint[], 3, 7, 'Breites Alpental mit Gletscher, Almen und Dampfzug.', 'Ganzjährig Schnee: am Hintertuxer Gletscher auch im Herbst noch Skifahren.', 1),
  ('bregenz', 'Bregenz & Bregenzerwald', 'Vorarlberg', 'AT', 47.505, 9.749, array['wasser','berge','kultur','genuss']::text[], array[4,5,6,7,8,9,10,12]::smallint[], 1, 3, 'Seebühne, Pfänder und Käsedörfer mit moderner Holzarchitektur.', 'Käsestraße Bregenzerwald: Sennereien als Stationen einer Genussroute.', 1),
  ('wien', 'Wien', 'Wien', 'AT', 48.208, 16.373, array['stadt','kultur','genuss','burg']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 2, 5, 'Kaiserliche Prachtstadt mit Kaffeehäusern und Heurigen.', 'Wien in drei Takten: Kaffeehaus am Morgen, Schönbrunn am Tag, Heuriger am Abend.', 1),
  ('riva', 'Gardasee-Nord (Riva & Arco)', 'Trentino', 'IT', 45.886, 10.842, array['wasser','berge','natur','familie']::text[], array[4,5,6,7,8,9,10]::smallint[], 3, 7, 'Bergkulisse am Nordufer, Wind für Surfer und Wasserfälle.', 'Mit der Seilbahn von Malcesine auf den Monte Baldo – oben Alpen, unten Palmen.', 1),
  ('meran', 'Meran & Südtirol', 'Südtirol', 'IT', 46.671, 11.159, array['natur','therme','genuss','kultur','berge']::text[], array[3,4,5,6,7,8,9,10,11,12]::smallint[], 2, 5, 'Palmen vor Dreitausendern, Waalwege und Törggelen im Herbst.', 'Waalweg-Wandern entlang alter Bewässerungskanäle – eben, schattig, mit Weinblick.', 1),
  ('prag', 'Prag', 'Böhmen', 'CZ', 50.087, 14.421, array['stadt','kultur','burg','genuss']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 2, 4, 'Goldene Stadt mit Burg, Karlsbrücke und Bierkultur.', 'Karlsbrücke bei Sonnenaufgang – fast leer – und zum Ausgleich abends ins Bierlokal.', 1),
  ('amsterdam', 'Amsterdam', 'Nordholland', 'NL', 52.373, 4.892, array['stadt','kultur','wasser']::text[], array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 2, 4, 'Grachten, Museen und Fahrräder.', 'Linienfähre hinter dem Hauptbahnhof nach Amsterdam-Noord – ein anderes Amsterdam in fünf Minuten.', 1)
on conflict (id) do update set name = excluded.name, region = excluded.region, country = excluded.country, lat = excluded.lat, lon = excluded.lon, kinds = excluded.kinds, months = excluded.months, nights_min = excluded.nights_min, nights_max = excluded.nights_max, summary = excluded.summary, angle = excluded.angle, catalog_version = excluded.catalog_version, updated_at = now();

insert into public.catalog_spots (id, place_id, name, kind, lat, lon, hours, indoor, family, months, slot, summary, tip, ord, catalog_version) values
  ('bad-urach-wasserfall', 'bad-urach', 'Uracher Wasserfall', 'natur', 48.493, 9.372, 2, false, true, array[]::smallint[], '', 'Kurze Wanderung durchs Brühltal zum Wasserfall über Tuffstein.', '', 0, 1),
  ('bad-urach-hohenurach', 'bad-urach', 'Burgruine Hohenurach', 'burg', 48.485, 9.387, 2, false, true, array[]::smallint[], '', 'Ruine hoch über der Stadt, gut mit dem Wasserfall zu einer Runde verbunden.', '', 1, 1),
  ('bad-urach-albthermen', 'bad-urach', 'AlbThermen', 'therme', 48.494, 9.396, 3, true, false, array[]::smallint[], '', 'Thermalbad im Ort, passt als Abschluss nach der Wanderung.', '', 2, 1),
  ('bad-urach-lichtenstein', 'bad-urach', 'Schloss Lichtenstein', 'burg', 48.407, 9.258, 2, false, true, array[]::smallint[], '', 'Märchenschloss auf einem Felsen über dem Echaztal.', 'Vom Aussichtspunkt nebenan liegt das Schloss frei vor euch.', 3, 1),
  ('bad-urach-baerenhoehle', 'bad-urach', 'Bärenhöhle Sonnenbühl', 'unterwelt', 48.371, 9.183, 1.5, true, true, array[4,5,6,7,8,9,10]::smallint[], '', 'Tropfsteinhöhle; übliche Saison im Sommerhalbjahr, Termine prüfen.', '', 4, 1),
  ('blaubeuren-blautopf', 'blaubeuren', 'Blautopf', 'natur', 48.418, 9.785, 1, false, true, array[]::smallint[], '', 'Karstquelle mit leuchtend blauem Wasser, kurzer Rundweg.', '', 0, 1),
  ('blaubeuren-kloster', 'blaubeuren', 'Kloster Blaubeuren', 'kultur', 48.416, 9.786, 1.5, true, false, array[]::smallint[], '', 'Klosteranlage mit gotischem Hochaltar direkt am Blautopf.', '', 1, 1),
  ('blaubeuren-urmu', 'blaubeuren', 'Urgeschichtliches Museum (urmu)', 'kultur', 48.412, 9.784, 1.5, true, true, array[]::smallint[], '', 'Eiszeitkunst von der Schwäbischen Alb, darunter die Venus vom Hohle Fels.', '', 2, 1),
  ('blaubeuren-rusenschloss', 'blaubeuren', 'Rusenschloss & Felsenlabyrinth', 'natur', 48.412, 9.8, 2, false, true, array[]::smallint[], '', 'Kurzer Aufstieg zu Ruine und Felsen mit Blick über das Blautal.', '', 3, 1),
  ('bodensee-nord-burg', 'bodensee-nord', 'Burg Meersburg', 'burg', 47.694, 9.272, 1.5, true, true, array[]::smallint[], '', 'Bewohnte mittelalterliche Burg über der Unterstadt.', '', 0, 1),
  ('bodensee-nord-pfahlbauten', 'bodensee-nord', 'Pfahlbauten Unteruhldingen', 'kultur', 47.722, 9.229, 1.5, false, true, array[]::smallint[], '', 'Freilichtmuseum mit rekonstruierten Pfahlbaudörfern im See.', '', 1, 1),
  ('bodensee-nord-mainau', 'bodensee-nord', 'Insel Mainau', 'natur', 47.705, 9.195, 4, false, true, array[]::smallint[], '', 'Blumeninsel mit Park, Schmetterlingshaus und Schloss.', '', 2, 1),
  ('bodensee-nord-zeppelin', 'bodensee-nord', 'Zeppelin Museum Friedrichshafen', 'technik', 47.651, 9.479, 2, true, true, array[]::smallint[], '', 'Luftschiffgeschichte mit begehbarem Teilnachbau der Hindenburg.', '', 3, 1),
  ('bodensee-nord-affenberg', 'bodensee-nord', 'Affenberg Salem', 'familie', 47.747, 9.293, 2, false, true, array[3,4,5,6,7,8,9,10,11]::smallint[], '', 'Freigehege mit Berberaffen; übliche Saison Frühjahr bis Herbst, Termine prüfen.', '', 4, 1),
  ('bodensee-nord-faehre', 'bodensee-nord', 'Autofähre Meersburg–Konstanz', 'wasser', 47.69, 9.265, 1, false, true, array[]::smallint[], '', 'Kurze Überfahrt quer über den See, auch zu Fuß möglich.', '', 5, 1),
  ('triberg-wasserfaelle', 'triberg', 'Triberger Wasserfälle', 'natur', 48.128, 8.229, 1.5, false, true, array[]::smallint[], '', 'Kaskaden im Wald direkt am Ort, mit Wegen auf beiden Seiten.', '', 0, 1),
  ('triberg-museum', 'triberg', 'Schwarzwaldmuseum Triberg', 'kultur', 48.13, 8.231, 1.5, true, true, array[]::smallint[], '', 'Trachten, Uhren und Orchestrien aus der Region.', '', 1, 1),
  ('triberg-kuckucksuhr', 'triberg', 'Weltgrößte Kuckucksuhr (Schonachbach)', 'kultur', 48.137, 8.208, 0.5, true, true, array[]::smallint[], '', 'Begehbare Riesen-Kuckucksuhr – kurzer, kurioser Halt.', '', 2, 1),
  ('triberg-uhrenmuseum', 'triberg', 'Deutsches Uhrenmuseum Furtwangen', 'technik', 48.049, 8.207, 2, true, false, array[]::smallint[], '', 'Uhrengeschichte von der Sonnenuhr bis zur Funkuhr.', '', 3, 1),
  ('triberg-vogtsbauernhof', 'triberg', 'Freilichtmuseum Vogtsbauernhof', 'kultur', 48.264, 8.183, 3, false, true, array[3,4,5,6,7,8,9,10,11]::smallint[], '', 'Historische Schwarzwaldhöfe; übliche Saison Frühjahr bis Herbst, Termine prüfen.', '', 4, 1),
  ('titisee-feldberg-titisee', 'titisee-feldberg', 'Titisee (Ufer & Boot)', 'wasser', 47.896, 8.15, 2, false, true, array[]::smallint[], '', 'Uferweg und Tretboote am bekanntesten See im Schwarzwald.', '', 0, 1),
  ('titisee-feldberg-feldberg', 'titisee-feldberg', 'Feldberg-Gipfel', 'berge', 47.874, 8.004, 3, false, true, array[]::smallint[], '', 'Rundweg über den Gipfel mit Weitblick bis zu den Alpen bei klarer Sicht.', '', 1, 1),
  ('titisee-feldberg-ravenna', 'titisee-feldberg', 'Ravennaschlucht', 'natur', 47.95, 8.11, 2.5, false, false, array[]::smallint[], '', 'Schlucht mit Wasserfällen und dem Ravenna-Viadukt.', '', 2, 1),
  ('titisee-feldberg-wutach', 'titisee-feldberg', 'Wutachschlucht', 'natur', 47.845, 8.4, 5, false, false, array[]::smallint[], '', 'Wilde Schluchtwanderung, Trittsicherheit nötig, Streckenwanderung planen.', '', 3, 1),
  ('titisee-feldberg-badeparadies', 'titisee-feldberg', 'Badeparadies Schwarzwald', 'therme', 47.894, 8.143, 4, true, true, array[]::smallint[], '', 'Großes Spaß- und Palmenbad am Titisee, gut bei Schlechtwetter.', '', 4, 1),
  ('freiburg-muenster', 'freiburg', 'Freiburger Münster & Münstermarkt', 'stadt', 47.995, 7.852, 2, false, true, array[]::smallint[], '', 'Gotisches Münster mit Turmaufstieg; Markt rund ums Münster.', '', 0, 1),
  ('freiburg-schauinsland', 'freiburg', 'Schauinslandbahn', 'berge', 47.92, 7.896, 3, false, true, array[]::smallint[], '', 'Seilbahn auf Freiburgs Hausberg mit Aussichtsturm.', '', 1, 1),
  ('freiburg-kaiserstuhl', 'freiburg', 'Kaiserstuhl (Weinberge & Lösshohlwege)', 'genuss', 48.085, 7.665, 3, false, false, array[]::smallint[], '', 'Vulkanisches Weinbaugebiet mit Hohlwegen und Winzerhöfen.', '', 2, 1),
  ('freiburg-europapark', 'freiburg', 'Europa-Park Rust', 'familie', 48.266, 7.722, 8, false, true, array[]::smallint[], '', 'Großer Freizeitpark; Saison- und Öffnungstage beim Park prüfen.', '', 3, 1),
  ('freiburg-schlossberg', 'freiburg', 'Schlossberg Freiburg', 'natur', 47.993, 7.86, 1.5, false, true, array[]::smallint[], '', 'Kurzer Aufstieg oder Bahn mit Blick über die Altstadt.', '', 4, 1),
  ('heidelberg-schloss', 'heidelberg', 'Heidelberger Schloss', 'burg', 49.41, 8.715, 2.5, false, true, array[]::smallint[], '', 'Berühmte Ruine mit Großem Fass, per Bergbahn oder zu Fuß.', '', 0, 1),
  ('heidelberg-philosophenweg', 'heidelberg', 'Philosophenweg', 'natur', 49.416, 8.7, 1.5, false, false, array[]::smallint[], '', 'Hangweg mit dem klassischen Blick auf Altstadt und Schloss.', '', 1, 1),
  ('heidelberg-altstadt', 'heidelberg', 'Altstadt & Alte Brücke', 'stadt', 49.413, 8.71, 2, false, true, array[]::smallint[], '', 'Hauptstraße, Brückentor und Neckarufer.', '', 2, 1),
  ('heidelberg-koenigstuhl', 'heidelberg', 'Königstuhl (Bergbahn)', 'berge', 49.399, 8.727, 2, false, true, array[]::smallint[], '', 'Historische Bergbahn auf den Hausberg.', '', 3, 1),
  ('heidelberg-speyer', 'heidelberg', 'Technik Museum Speyer', 'technik', 49.312, 8.446, 4, true, true, array[]::smallint[], '', 'Flugzeuge, Raumfähre Buran, U-Boot – vieles begehbar.', '', 4, 1),
  ('stuttgart-mercedes', 'stuttgart', 'Mercedes-Benz Museum', 'technik', 48.788, 9.234, 3, true, true, array[]::smallint[], '', 'Autogeschichte auf neun Ebenen.', '', 0, 1),
  ('stuttgart-porsche', 'stuttgart', 'Porsche Museum', 'technik', 48.834, 9.152, 2, true, false, array[]::smallint[], '', 'Sportwagen in moderner Ausstellungshalle in Zuffenhausen.', '', 1, 1),
  ('stuttgart-wilhelma', 'stuttgart', 'Wilhelma', 'familie', 48.805, 9.207, 4, false, true, array[]::smallint[], '', 'Zoologisch-botanischer Garten in historischer Anlage.', '', 2, 1),
  ('stuttgart-leuze', 'stuttgart', 'Mineralbad Leuze', 'therme', 48.789, 9.219, 3, true, true, array[]::smallint[], '', 'Mineralwasser-Bad am Neckar.', '', 3, 1),
  ('stuttgart-fernsehturm', 'stuttgart', 'Fernsehturm Stuttgart', 'berge', 48.756, 9.19, 1.5, false, true, array[]::smallint[], '', 'Der erste Stahlbeton-Fernsehturm der Welt, Aussichtsplattform.', '', 4, 1),
  ('rothenburg-mauer', 'rothenburg', 'Stadtmauer-Rundgang & Plönlein', 'stadt', 49.374, 10.18, 2, false, true, array[]::smallint[], '', 'Überdachter Wehrgang einmal um die Altstadt.', '', 0, 1),
  ('rothenburg-kriminalmuseum', 'rothenburg', 'Mittelalterliches Kriminalmuseum', 'kultur', 49.376, 10.178, 1.5, true, false, array[]::smallint[], '', 'Rechtsgeschichte von Folterwerkzeug bis Schandmaske.', '', 1, 1),
  ('rothenburg-nachtwaechter', 'rothenburg', 'Nachtwächter-Rundgang', 'kultur', 49.377, 10.179, 1, false, true, array[]::smallint[], 'abend', 'Abendliche Führung am Marktplatz; Termine vor Ort prüfen.', '', 2, 1),
  ('rothenburg-dinkelsbuehl', 'rothenburg', 'Dinkelsbühl', 'stadt', 49.069, 10.319, 2, false, true, array[]::smallint[], '', 'Weniger überlaufene Schwester an der Romantischen Straße.', '', 3, 1),
  ('nuernberg-kaiserburg', 'nuernberg', 'Kaiserburg', 'burg', 49.458, 11.076, 2, false, true, array[]::smallint[], '', 'Burg über der Altstadt mit Tiefem Brunnen.', '', 0, 1),
  ('nuernberg-gnm', 'nuernberg', 'Germanisches Nationalmuseum', 'kultur', 49.448, 11.076, 3, true, false, array[]::smallint[], '', 'Größtes kulturhistorisches Museum im deutschsprachigen Raum.', '', 1, 1),
  ('nuernberg-doku', 'nuernberg', 'Dokumentationszentrum Reichsparteitagsgelände', 'kultur', 49.433, 11.112, 2.5, true, false, array[]::smallint[], '', 'Ausstellung und Gelände zur NS-Geschichte.', '', 2, 1),
  ('nuernberg-felsengaenge', 'nuernberg', 'Historische Felsengänge', 'unterwelt', 49.457, 11.075, 1.5, true, false, array[]::smallint[], '', 'Bierkeller unter der Altstadt, nur mit Führung.', '', 3, 1),
  ('nuernberg-dbmuseum', 'nuernberg', 'DB Museum', 'technik', 49.448, 11.072, 2, true, true, array[]::smallint[], '', 'Eisenbahngeschichte mit Adler-Nachbau.', '', 4, 1),
  ('bamberg-altstadt', 'bamberg', 'Altes Rathaus & Klein-Venedig', 'stadt', 49.892, 10.887, 2, false, true, array[]::smallint[], '', 'Rathaus mitten in der Regnitz und Fischerhäuser am Ufer.', '', 0, 1),
  ('bamberg-rauchbier', 'bamberg', 'Rauchbier in einer Altstadt-Brauerei', 'genuss', 49.892, 10.885, 1.5, true, false, array[]::smallint[], 'abend', 'Bambergs Spezialität probieren.', '', 1, 1),
  ('bamberg-dom', 'bamberg', 'Bamberger Dom & Domberg', 'kultur', 49.891, 10.882, 1.5, true, false, array[]::smallint[], '', 'Kaiserdom mit dem Bamberger Reiter.', '', 2, 1),
  ('bamberg-teufelshoehle', 'bamberg', 'Teufelshöhle Pottenstein', 'unterwelt', 49.771, 11.418, 1.5, true, true, array[]::smallint[], '', 'Große Tropfsteinhöhle; Führungszeiten prüfen.', '', 3, 1),
  ('bamberg-walberla', 'bamberg', 'Walberla (Ehrenbürg)', 'natur', 49.705, 11.12, 2.5, false, true, array[]::smallint[], '', 'Tafelberg mit Kapelle und weitem Blick.', '', 4, 1),
  ('muenchen-deutschesmuseum', 'muenchen', 'Deutsches Museum', 'technik', 48.13, 11.583, 4, true, true, array[]::smallint[], '', 'Eines der größten Technikmuseen der Welt.', '', 0, 1),
  ('muenchen-englischergarten', 'muenchen', 'Englischer Garten & Eisbachwelle', 'natur', 48.143, 11.588, 2, false, true, array[]::smallint[], '', 'Großer Stadtpark; an der Eisbachbrücke surfen Leute auf der stehenden Welle.', '', 1, 1),
  ('muenchen-viktualienmarkt', 'muenchen', 'Viktualienmarkt', 'genuss', 48.135, 11.576, 1, false, true, array[]::smallint[], 'mittag', 'Markt im Zentrum für einen Imbiss zwischendurch.', '', 2, 1),
  ('muenchen-olympiapark', 'muenchen', 'Olympiapark & Olympiaturm', 'berge', 48.174, 11.554, 2, false, true, array[]::smallint[], '', 'Park der Spiele von 1972 mit Aussichtsturm.', '', 3, 1),
  ('muenchen-nymphenburg', 'muenchen', 'Schloss Nymphenburg', 'burg', 48.158, 11.503, 2.5, false, true, array[]::smallint[], '', 'Barockes Schloss mit großem Park.', '', 4, 1),
  ('berchtesgaden-koenigssee', 'berchtesgaden', 'Königssee-Schifffahrt nach St. Bartholomä', 'wasser', 47.59, 12.985, 4, false, true, array[]::smallint[], '', 'Elektroboote über den Fjord-artigen See; Fahrplan prüfen.', '', 0, 1),
  ('berchtesgaden-salzbergwerk', 'berchtesgaden', 'Salzbergwerk Berchtesgaden', 'unterwelt', 47.638, 13.012, 2, true, true, array[]::smallint[], '', 'Grubenbahn, Bergmannsrutschen und Salzsee im Berg.', '', 1, 1),
  ('berchtesgaden-kehlstein', 'berchtesgaden', 'Kehlsteinhaus', 'berge', 47.611, 13.042, 3, false, false, array[5,6,7,8,9,10]::smallint[], '', 'Aussichtspunkt mit Geschichte; nur im Sommerhalbjahr mit Sonderbussen, Termine prüfen.', '', 2, 1),
  ('berchtesgaden-watzmanntherme', 'berchtesgaden', 'Watzmann Therme', 'therme', 47.628, 13.007, 3, true, true, array[]::smallint[], '', 'Therme mit Bergblick.', '', 3, 1),
  ('berchtesgaden-almbachklamm', 'berchtesgaden', 'Almbachklamm', 'natur', 47.676, 13.042, 3, false, false, array[5,6,7,8,9,10]::smallint[], '', 'Klamm mit Steigen und Brücken; im Winter geschlossen, Saison prüfen.', '', 4, 1),
  ('garmisch-zugspitze', 'garmisch', 'Zugspitze', 'berge', 47.421, 10.985, 5, false, true, array[]::smallint[], '', 'Per Zahnradbahn oder Seilbahn auf 2.962 m.', '', 0, 1),
  ('garmisch-partnachklamm', 'garmisch', 'Partnachklamm', 'natur', 47.468, 11.117, 2, false, true, array[]::smallint[], '', 'Tief eingeschnittene Klamm, im Winter mit Eiszapfen.', '', 1, 1),
  ('garmisch-eibsee', 'garmisch', 'Eibsee', 'wasser', 47.457, 10.973, 2.5, false, true, array[]::smallint[], '', 'Bergsee mit Rundweg unter der Zugspitze.', '', 2, 1),
  ('garmisch-linderhof', 'garmisch', 'Schloss Linderhof', 'burg', 47.57, 10.96, 2, false, true, array[]::smallint[], '', 'Kleinstes Königsschloss Ludwigs II. mit Park.', '', 3, 1),
  ('garmisch-ettal', 'garmisch', 'Kloster Ettal', 'kultur', 47.569, 11.094, 1, true, false, array[]::smallint[], '', 'Barockkirche und Klosterbrauerei.', '', 4, 1),
  ('fuessen-neuschwanstein', 'fuessen', 'Schloss Neuschwanstein', 'burg', 47.558, 10.75, 3, false, true, array[]::smallint[], '', 'Märchenschloss; Innenbesichtigung nur mit Zeitticket, früh reservieren.', '', 0, 1),
  ('fuessen-hohenschwangau', 'fuessen', 'Schloss Hohenschwangau & Alpsee', 'burg', 47.555, 10.738, 2, false, true, array[]::smallint[], '', 'Elternschloss Ludwigs II. am Alpsee.', '', 1, 1),
  ('fuessen-lechfall', 'fuessen', 'Lechfall', 'natur', 47.561, 10.697, 1, false, true, array[]::smallint[], '', 'Wasserfall mit Klamm direkt am Stadtrand.', '', 2, 1),
  ('fuessen-tegelberg', 'fuessen', 'Tegelbergbahn', 'berge', 47.567, 10.773, 3, false, true, array[]::smallint[], '', 'Seilbahn mit Blick über das Voralpenland.', '', 3, 1),
  ('fuessen-forggensee', 'fuessen', 'Forggensee', 'wasser', 47.6, 10.72, 2, false, true, array[6,7,8,9,10]::smallint[], '', 'Stausee mit Uferwegen; Schiffe nur im Sommer.', '', 4, 1),
  ('chiemsee-herrenchiemsee', 'chiemsee', 'Schloss Herrenchiemsee', 'burg', 47.862, 12.401, 3, false, true, array[]::smallint[], '', 'Ludwigs Versailles-Kopie auf der Herreninsel, per Schiff.', '', 0, 1),
  ('chiemsee-fraueninsel', 'chiemsee', 'Fraueninsel', 'kultur', 47.874, 12.423, 2, false, true, array[]::smallint[], '', 'Kleine Insel mit Kloster und Fischern.', '', 1, 1),
  ('chiemsee-kampenwand', 'chiemsee', 'Kampenwand', 'berge', 47.754, 12.35, 4, false, false, array[]::smallint[], '', 'Seilbahn und Gipfelweg mit Blick über den See.', '', 2, 1),
  ('chiemsee-baden', 'chiemsee', 'Baden am Chiemsee', 'wasser', 47.88, 12.54, 3, false, true, array[6,7,8,9]::smallint[], '', 'Mehrere Strandbäder rund um den See.', '', 3, 1),
  ('bayerischer-wald-baumwipfelpfad', 'bayerischer-wald', 'Baumwipfelpfad Neuschönau', 'natur', 48.886, 13.476, 2, false, true, array[]::smallint[], '', 'Pfad in den Baumkronen mit begehbarem Baum-Ei.', '', 0, 1),
  ('bayerischer-wald-tierfreigelaende', 'bayerischer-wald', 'Tierfreigelände', 'familie', 48.885, 13.474, 3, false, true, array[]::smallint[], '', 'Luchs, Wolf und Bär in großen Gehegen.', '', 1, 1),
  ('bayerischer-wald-lusen', 'bayerischer-wald', 'Lusen', 'berge', 48.939, 13.507, 4, false, true, array[]::smallint[], '', 'Gipfel mit Blockmeer aus Granit.', '', 2, 1),
  ('bayerischer-wald-glasmuseum', 'bayerischer-wald', 'Glasmuseum Frauenau', 'kultur', 48.989, 13.3, 1.5, true, false, array[]::smallint[], '', 'Glaskunst aus der Glasregion.', '', 3, 1),
  ('bayerischer-wald-passau', 'bayerischer-wald', 'Passau, Stadt der drei Flüsse', 'stadt', 48.574, 13.462, 3, false, true, array[]::smallint[], '', 'Dom mit großer Orgel und Zusammenfluss von Donau, Inn und Ilz.', '', 4, 1),
  ('regensburg-bruecke', 'regensburg', 'Steinerne Brücke & Wurstkuchl', 'stadt', 49.022, 12.097, 1.5, false, true, array[]::smallint[], '', 'Mittelalterliche Brücke und eine der ältesten Garküchen.', '', 0, 1),
  ('regensburg-dom', 'regensburg', 'Regensburger Dom', 'kultur', 49.019, 12.099, 1, true, false, array[]::smallint[], '', 'Gotischer Dom mit mittelalterlichen Glasfenstern.', '', 1, 1),
  ('regensburg-walhalla', 'regensburg', 'Walhalla', 'kultur', 49.032, 12.224, 1.5, false, false, array[]::smallint[], '', 'Ruhmeshalle über der Donau.', '', 2, 1),
  ('regensburg-weltenburg', 'regensburg', 'Donaudurchbruch & Kloster Weltenburg', 'wasser', 48.899, 11.82, 4, false, true, array[4,5,6,7,8,9,10]::smallint[], '', 'Schifffahrt durch die Schlucht; Schiffe nur in der Saison.', '', 3, 1),
  ('mittelrhein-rheinfels', 'mittelrhein', 'Burg Rheinfels', 'burg', 50.157, 7.708, 2, false, true, array[]::smallint[], '', 'Große Burgruine mit Minengängen.', '', 0, 1),
  ('mittelrhein-loreley', 'mittelrhein', 'Loreley-Plateau', 'natur', 50.139, 7.729, 1.5, false, true, array[]::smallint[], '', 'Aussicht über die enge Rheinschleife.', '', 1, 1),
  ('mittelrhein-marksburg', 'mittelrhein', 'Marksburg', 'burg', 50.271, 7.651, 1.5, true, true, array[]::smallint[], '', 'Einzige nie zerstörte Höhenburg am Mittelrhein, nur mit Führung.', '', 2, 1),
  ('mittelrhein-schiff', 'mittelrhein', 'Rheinschifffahrt Bingen–St. Goar', 'wasser', 50, 7.86, 3, false, true, array[4,5,6,7,8,9,10]::smallint[], '', 'Schiff durch das Welterbetal; Fahrplan der Saison prüfen.', '', 3, 1),
  ('mittelrhein-bacharach', 'mittelrhein', 'Bacharach & Weinprobe', 'genuss', 50.058, 7.769, 2, false, false, array[]::smallint[], 'abend', 'Fachwerkstädtchen mit Weinstuben.', '', 4, 1),
  ('cochem-reichsburg', 'cochem', 'Reichsburg Cochem', 'burg', 50.148, 7.163, 1.5, false, true, array[]::smallint[], '', 'Burg über der Stadt, Besichtigung mit Führung.', '', 0, 1),
  ('cochem-eltz', 'cochem', 'Burg Eltz', 'burg', 50.205, 7.336, 2.5, false, true, array[4,5,6,7,8,9,10]::smallint[], '', 'Burg im Wald, nie zerstört; übliche Saison April bis Oktober, prüfen.', '', 1, 1),
  ('cochem-geierlay', 'cochem', 'Hängeseilbrücke Geierlay', 'natur', 50.083, 7.33, 2, false, true, array[]::smallint[], '', 'Lange Hängeseilbrücke über ein Tal im Hunsrück.', '', 2, 1),
  ('cochem-bunker', 'cochem', 'Bundesbank-Bunker', 'unterwelt', 50.143, 7.157, 1.5, true, false, array[]::smallint[], '', 'Ehemaliger Geheimbunker für Notgeld, Führungen.', '', 3, 1),
  ('cochem-calmont', 'cochem', 'Calmont-Klettersteig', 'natur', 50.09, 7.11, 3, false, false, array[]::smallint[], '', 'Steilster Weinberg Europas; Trittsicherheit nötig.', '', 4, 1),
  ('pfalz-hambach', 'pfalz', 'Hambacher Schloss', 'kultur', 49.327, 8.135, 2, false, true, array[]::smallint[], '', 'Wiege der deutschen Demokratie mit Ausstellung.', '', 0, 1),
  ('pfalz-berwartstein', 'pfalz', 'Burg Berwartstein', 'burg', 49.096, 7.865, 1.5, false, true, array[]::smallint[], '', 'Felsenburg im Dahner Felsenland.', '', 1, 1),
  ('pfalz-weinstrasse', 'pfalz', 'Deidesheim & Weinprobe', 'genuss', 49.408, 8.185, 2, false, false, array[]::smallint[], 'abend', 'Weinort mit Winzerhöfen an der Deutschen Weinstraße.', '', 2, 1),
  ('pfalz-holidaypark', 'pfalz', 'Holiday Park Haßloch', 'familie', 49.318, 8.256, 6, false, true, array[]::smallint[], '', 'Freizeitpark; Öffnungstage prüfen.', '', 3, 1),
  ('pfalz-trifels', 'pfalz', 'Reichsburg Trifels', 'burg', 49.197, 7.987, 2, false, true, array[]::smallint[], '', 'Burg der Reichskleinodien über Annweiler.', '', 4, 1),
  ('saarschleife-baumwipfelpfad', 'saarschleife', 'Baumwipfelpfad Saarschleife', 'natur', 49.505, 6.553, 2, false, true, array[]::smallint[], '', 'Pfad mit Aussichtsturm über der Saarschleife.', '', 0, 1),
  ('saarschleife-cloef', 'saarschleife', 'Aussichtspunkt Cloef', 'natur', 49.506, 6.556, 1, false, true, array[]::smallint[], '', 'Der klassische Blick auf die Schleife.', '', 1, 1),
  ('saarschleife-voelklingen', 'saarschleife', 'Weltkulturerbe Völklinger Hütte', 'technik', 49.247, 6.844, 3, false, true, array[]::smallint[], '', 'Komplett erhaltenes Eisenwerk mit Ausstellungen.', '', 2, 1),
  ('saarschleife-mettlach', 'saarschleife', 'Villeroy & Boch Erlebniszentrum Mettlach', 'kultur', 49.494, 6.596, 1.5, true, false, array[]::smallint[], '', 'Keramikgeschichte in der alten Abtei.', '', 3, 1),
  ('koeln-dom', 'koeln', 'Kölner Dom & Turmbesteigung', 'kultur', 50.941, 6.958, 1.5, true, true, array[]::smallint[], '', 'Gotische Kathedrale mit Aufstieg auf den Südturm.', '', 0, 1),
  ('koeln-schokolade', 'koeln', 'Schokoladenmuseum', 'familie', 50.932, 6.964, 2, true, true, array[]::smallint[], '', 'Schokoladenherstellung mit Brunnen zum Probieren.', '', 1, 1),
  ('koeln-seilbahn', 'koeln', 'Rheinseilbahn', 'wasser', 50.952, 6.973, 1, false, true, array[4,5,6,7,8,9,10]::smallint[], '', 'Gondel über den Rhein; Saisonbetrieb, prüfen.', '', 2, 1),
  ('koeln-brauhaus', 'koeln', 'Brauhaus in der Altstadt', 'genuss', 50.938, 6.96, 2, true, false, array[]::smallint[], 'abend', 'Kölsch und rheinische Küche.', '', 3, 1),
  ('koeln-phantasialand', 'koeln', 'Phantasialand Brühl', 'familie', 50.799, 6.879, 8, false, true, array[]::smallint[], '', 'Freizeitpark; Öffnungstage prüfen.', '', 4, 1),
  ('ruhrgebiet-zollverein', 'ruhrgebiet', 'Zeche Zollverein', 'technik', 51.486, 7.044, 3, false, true, array[]::smallint[], '', 'Welterbe-Zeche mit Ruhr Museum.', '', 0, 1),
  ('ruhrgebiet-duisburgnord', 'ruhrgebiet', 'Landschaftspark Duisburg-Nord', 'technik', 51.481, 6.782, 2.5, false, true, array[]::smallint[], 'abend', 'Stillgelegtes Hüttenwerk, Hochofen begehbar, abends beleuchtet.', '', 1, 1),
  ('ruhrgebiet-gasometer', 'ruhrgebiet', 'Gasometer Oberhausen', 'kultur', 51.493, 6.873, 2, true, false, array[]::smallint[], '', 'Ausstellungshalle im ehemaligen Gasspeicher mit Dachplattform.', '', 2, 1),
  ('ruhrgebiet-tetraeder', 'ruhrgebiet', 'Halde Tetraeder Bottrop', 'natur', 51.517, 6.941, 1.5, false, true, array[]::smallint[], '', 'Begehbare Stahlpyramide auf einer Halde.', '', 3, 1),
  ('ruhrgebiet-bergbaumuseum', 'ruhrgebiet', 'Deutsches Bergbau-Museum Bochum', 'unterwelt', 51.489, 7.217, 3, true, true, array[]::smallint[], '', 'Anschauungsbergwerk unter dem Museum.', '', 4, 1),
  ('eifel-monschau', 'eifel', 'Altstadt Monschau', 'stadt', 50.555, 6.24, 2, false, true, array[]::smallint[], '', 'Fachwerkhäuser an der Rur.', '', 0, 1),
  ('eifel-hohesvenn', 'eifel', 'Hohes Venn', 'natur', 50.5, 6.1, 3, false, true, array[]::smallint[], '', 'Hochmoor mit Bohlenstegen (Belgien).', '', 1, 1),
  ('eifel-rursee', 'eifel', 'Rursee', 'wasser', 50.62, 6.43, 3, false, true, array[]::smallint[], '', 'Stausee mit Schiffen und Badestellen in der Saison.', '', 2, 1),
  ('eifel-vogelsang', 'eifel', 'Vogelsang IP', 'kultur', 50.584, 6.44, 2.5, true, false, array[]::smallint[], '', 'Ehemalige NS-Ordensburg mit Ausstellung und Nationalpark-Zentrum.', '', 3, 1),
  ('winterberg-kahlerasten', 'winterberg', 'Kahler Asten', 'berge', 51.18, 8.488, 2, false, true, array[]::smallint[], '', 'Aussichtsturm auf einem der höchsten Berge NRWs.', '', 0, 1),
  ('winterberg-skiliftkarussell', 'winterberg', 'Skiliftkarussell Winterberg', 'winter', 51.198, 8.519, 5, false, true, array[12,1,2,3]::smallint[], '', 'Skigebiet, Schneelage und Betrieb prüfen.', '', 1, 1),
  ('winterberg-rothaarsteig', 'winterberg', 'Rothaarsteig-Etappe', 'natur', 51.17, 8.45, 4, false, false, array[]::smallint[], '', 'Fernwanderweg mit gut markierten Etappen.', '', 2, 1),
  ('winterberg-atta', 'winterberg', 'Atta-Höhle Attendorn', 'unterwelt', 51.124, 7.906, 1.5, true, true, array[]::smallint[], '', 'Tropfsteinhöhle mit Führungen.', '', 3, 1),
  ('harz-brockenbahn', 'harz', 'Brockenbahn & Brocken', 'berge', 51.8, 10.616, 5, false, true, array[]::smallint[], '', 'Dampfzug auf den höchsten Harzgipfel.', '', 0, 1),
  ('harz-schloss', 'harz', 'Schloss Wernigerode', 'burg', 51.828, 10.788, 2, true, true, array[]::smallint[], '', 'Schloss über der bunten Fachwerkstadt.', '', 1, 1),
  ('harz-titan', 'harz', 'Hängebrücke Titan RT', 'natur', 51.744, 10.894, 1.5, false, true, array[]::smallint[], '', 'Lange Fußgänger-Hängebrücke an der Rappbodetalsperre.', '', 2, 1),
  ('harz-baumannshoehle', 'harz', 'Baumannshöhle Rübeland', 'unterwelt', 51.756, 10.846, 1, true, true, array[]::smallint[], '', 'Tropfsteinhöhle mit Führungen.', '', 3, 1),
  ('harz-bodetal', 'harz', 'Bodetal & Hexentanzplatz', 'natur', 51.738, 11.022, 4, false, true, array[]::smallint[], '', 'Schlucht bei Thale mit Seilbahn und Sagen.', '', 4, 1),
  ('harz-quedlinburg', 'harz', 'Quedlinburg', 'stadt', 51.789, 11.142, 2.5, false, true, array[]::smallint[], '', 'Welterbe-Fachwerkstadt mit Stiftskirche.', '', 5, 1),
  ('eisenach-wartburg', 'eisenach', 'Wartburg', 'burg', 50.966, 10.307, 2.5, false, true, array[]::smallint[], '', 'Welterbe-Burg, Lutherstube.', '', 0, 1),
  ('eisenach-drachenschlucht', 'eisenach', 'Drachenschlucht', 'natur', 50.95, 10.32, 2.5, false, true, array[]::smallint[], '', 'Enge Klamm auf Gitterrosten, bei Nässe rutschig.', '', 1, 1),
  ('eisenach-merkers', 'eisenach', 'Erlebnis Bergwerk Merkers', 'unterwelt', 50.822, 10.118, 4, true, false, array[]::smallint[], '', 'Grubenfahrt mit Kristallgrotte; Führungstermine prüfen.', '', 2, 1),
  ('eisenach-bachhaus', 'eisenach', 'Bachhaus Eisenach', 'kultur', 50.973, 10.321, 1.5, true, true, array[]::smallint[], '', 'Museum zu Johann Sebastian Bach mit Instrumentenvorführungen.', '', 3, 1),
  ('weimar-goethehaus', 'weimar', 'Goethes Wohnhaus', 'kultur', 50.977, 11.329, 1.5, true, false, array[]::smallint[], '', 'Goethes Wohnhaus mit Nationalmuseum.', '', 0, 1),
  ('weimar-bauhaus', 'weimar', 'Bauhaus-Museum Weimar', 'kultur', 50.984, 11.324, 2, true, false, array[]::smallint[], '', 'Gründungsort des Bauhauses.', '', 1, 1),
  ('weimar-buchenwald', 'weimar', 'Gedenkstätte Buchenwald', 'kultur', 51.02, 11.248, 3, false, false, array[]::smallint[], '', 'Ehemaliges Konzentrationslager, Gedenkort.', '', 2, 1),
  ('weimar-kraemerbruecke', 'weimar', 'Krämerbrücke Erfurt', 'stadt', 50.979, 11.031, 2, false, true, array[]::smallint[], '', 'Bebaute Brücke mit kleinen Läden.', '', 3, 1),
  ('saechsische-schweiz-bastei', 'saechsische-schweiz', 'Basteibrücke', 'natur', 50.962, 14.073, 2, false, true, array[]::smallint[], '', 'Steinbrücke zwischen Felstürmen hoch über der Elbe.', '', 0, 1),
  ('saechsische-schweiz-koenigstein', 'saechsische-schweiz', 'Festung Königstein', 'burg', 50.919, 14.071, 3, false, true, array[]::smallint[], '', 'Riesige Bergfestung auf einem Tafelberg.', '', 1, 1),
  ('saechsische-schweiz-schrammsteine', 'saechsische-schweiz', 'Schrammsteine', 'berge', 50.917, 14.2, 4, false, false, array[]::smallint[], '', 'Felsenrunde mit Leitern und Aussicht; Trittsicherheit nötig.', '', 2, 1),
  ('saechsische-schweiz-kirnitzschtal', 'saechsische-schweiz', 'Kirnitzschtalbahn & Lichtenhainer Wasserfall', 'natur', 50.937, 14.226, 2, false, true, array[]::smallint[], '', 'Straßenbahn durchs Tal zum kleinen Wasserfall.', '', 3, 1),
  ('saechsische-schweiz-toskana', 'saechsische-schweiz', 'Toskana Therme Bad Schandau', 'therme', 50.917, 14.153, 3, true, false, array[]::smallint[], '', 'Therme an der Elbe.', '', 4, 1),
  ('dresden-frauenkirche', 'dresden', 'Frauenkirche', 'kultur', 51.052, 13.742, 1, true, false, array[]::smallint[], '', 'Wiederaufgebaute Barockkirche mit Kuppelaufstieg.', '', 0, 1),
  ('dresden-zwinger', 'dresden', 'Zwinger & Gemäldegalerie', 'kultur', 51.053, 13.734, 3, true, false, array[]::smallint[], '', 'Barocke Anlage mit Alten Meistern.', '', 1, 1),
  ('dresden-gruenesgewoelbe', 'dresden', 'Grünes Gewölbe', 'kultur', 51.053, 13.737, 2, true, false, array[]::smallint[], '', 'Schatzkammer im Residenzschloss; Zeitfenster-Tickets.', '', 2, 1),
  ('dresden-pillnitz', 'dresden', 'Schloss Pillnitz', 'burg', 51.009, 13.87, 2, false, true, array[]::smallint[], '', 'Lustschloss an der Elbe mit Park.', '', 3, 1),
  ('dresden-pfunds', 'dresden', 'Pfunds Molkerei', 'genuss', 51.065, 13.754, 0.5, true, true, array[]::smallint[], '', 'Milchladen mit handbemalten Fliesen.', '', 4, 1),
  ('leipzig-voelkerschlacht', 'leipzig', 'Völkerschlachtdenkmal', 'kultur', 51.312, 12.413, 1.5, false, true, array[]::smallint[], '', 'Monumentales Denkmal mit Aussichtsplattform.', '', 0, 1),
  ('leipzig-zoo', 'leipzig', 'Zoo Leipzig', 'familie', 51.349, 12.371, 4, false, true, array[]::smallint[], '', 'Großer Zoo mit Tropenhalle Gondwanaland.', '', 1, 1),
  ('leipzig-spinnerei', 'leipzig', 'Baumwollspinnerei', 'kultur', 51.329, 12.315, 2, true, false, array[]::smallint[], '', 'Kunstquartier in alter Fabrik.', '', 2, 1),
  ('leipzig-cospudener', 'leipzig', 'Cospudener See', 'wasser', 51.27, 12.34, 3, false, true, array[5,6,7,8,9]::smallint[], '', 'Badesee mit Hafen am Stadtrand.', '', 3, 1),
  ('leipzig-panometer', 'leipzig', 'Panometer', 'kultur', 51.318, 12.402, 1.5, true, true, array[]::smallint[], '', '360°-Panorama im ehemaligen Gasometer.', '', 4, 1),
  ('spreewald-kahn', 'spreewald', 'Kahnfahrt ab Lübbenau', 'wasser', 51.866, 13.968, 3, false, true, array[]::smallint[], '', 'Gestakter Kahn durch die Fließe.', '', 0, 1),
  ('spreewald-lehde', 'spreewald', 'Freilandmuseum Lehde', 'kultur', 51.874, 13.989, 1.5, false, true, array[4,5,6,7,8,9,10]::smallint[], '', 'Historische Spreewaldhöfe, per Boot oder zu Fuß.', '', 1, 1),
  ('spreewald-paddeln', 'spreewald', 'Paddeln auf den Fließen', 'wasser', 51.86, 13.95, 3, false, true, array[5,6,7,8,9]::smallint[], '', 'Kajak oder Kanu beim Verleih vor Ort.', '', 2, 1),
  ('spreewald-therme', 'spreewald', 'Spreewald Therme Burg', 'therme', 51.84, 14.15, 3, true, false, array[]::smallint[], '', 'Solebad im Spreewald.', '', 3, 1),
  ('spreewald-tropical', 'spreewald', 'Tropical Islands', 'familie', 52.039, 13.75, 6, true, true, array[]::smallint[], '', 'Tropenhalle in einer ehemaligen Luftschiffhalle.', '', 4, 1),
  ('berlin-reichstag', 'berlin', 'Reichstagskuppel', 'kultur', 52.519, 13.376, 1.5, false, true, array[]::smallint[], '', 'Gläserne Kuppel, Online-Anmeldung vorab nötig.', '', 0, 1),
  ('berlin-museumsinsel', 'berlin', 'Museumsinsel', 'kultur', 52.521, 13.397, 4, true, false, array[]::smallint[], '', 'Fünf Museen auf einer Spreeinsel.', '', 1, 1),
  ('berlin-mauer', 'berlin', 'Gedenkstätte Berliner Mauer', 'kultur', 52.535, 13.39, 2, false, true, array[]::smallint[], '', 'Erhaltener Grenzstreifen an der Bernauer Straße.', '', 2, 1),
  ('berlin-tempelhof', 'berlin', 'Tempelhofer Feld', 'natur', 52.473, 13.401, 2, false, true, array[]::smallint[], '', 'Ehemaliges Flugfeld als riesige Freifläche.', '', 3, 1),
  ('berlin-sanssouci', 'berlin', 'Park Sanssouci Potsdam', 'burg', 52.404, 13.038, 4, false, true, array[]::smallint[], '', 'Schlösser und Gärten Friedrichs des Großen.', '', 4, 1),
  ('mueritz-mueritzeum', 'mueritz', 'Müritzeum Waren', 'familie', 53.515, 12.682, 2, true, true, array[]::smallint[], '', 'Naturerlebniszentrum mit großem Süßwasseraquarium.', '', 0, 1),
  ('mueritz-nationalpark', 'mueritz', 'Müritz-Nationalpark', 'natur', 53.42, 12.82, 4, false, true, array[]::smallint[], '', 'Wälder und Seen; im Herbst Kranichrast, Beobachtungsstände.', '', 1, 1),
  ('mueritz-kanu', 'mueritz', 'Kanutour auf der Seenplatte', 'wasser', 53.35, 12.98, 5, false, true, array[5,6,7,8,9]::smallint[], '', 'Mehrtages- oder Tagestouren über verbundene Seen.', '', 2, 1),
  ('mueritz-baerenwald', 'mueritz', 'Bärenwald Müritz', 'familie', 53.36, 12.45, 2, false, true, array[]::smallint[], '', 'Schutzgebiet für gerettete Bären.', '', 3, 1),
  ('ruegen-koenigsstuhl', 'ruegen', 'Königsstuhl & Kreideküste', 'natur', 54.574, 13.665, 3, false, true, array[]::smallint[], '', 'Kreidefelsen im Nationalpark Jasmund.', '', 0, 1),
  ('ruegen-granitz', 'ruegen', 'Jagdschloss Granitz', 'burg', 54.383, 13.625, 1.5, false, true, array[]::smallint[], '', 'Schloss im Wald mit Aussichtsturm.', '', 1, 1),
  ('ruegen-arkona', 'ruegen', 'Kap Arkona', 'natur', 54.679, 13.433, 2.5, false, true, array[]::smallint[], '', 'Nordspitze mit Leuchttürmen.', '', 2, 1),
  ('ruegen-roland', 'ruegen', 'Rasender Roland', 'technik', 54.4, 13.6, 2, false, true, array[]::smallint[], '', 'Schmalspur-Dampfbahn zwischen Putbus und Göhren.', '', 3, 1),
  ('ruegen-binz', 'ruegen', 'Strand & Seebrücke Binz', 'wasser', 54.402, 13.614, 3, false, true, array[]::smallint[], '', 'Bäderarchitektur und langer Sandstrand.', '', 4, 1),
  ('hamburg-wunderland', 'hamburg', 'Miniatur Wunderland', 'familie', 53.544, 9.989, 3, true, true, array[]::smallint[], '', 'Größte Modelleisenbahn der Welt; Zeitfenster vorab buchen.', '', 0, 1),
  ('hamburg-elphi', 'hamburg', 'Elbphilharmonie Plaza', 'kultur', 53.541, 9.984, 1, false, true, array[]::smallint[], '', 'Öffentliche Aussichtsebene; Zeitfenster prüfen.', '', 1, 1),
  ('hamburg-faehre62', 'hamburg', 'Hafenfähre Linie 62', 'wasser', 53.545, 9.97, 1.5, false, true, array[]::smallint[], '', 'Linienfähre von den Landungsbrücken elbabwärts.', '', 2, 1),
  ('hamburg-fischmarkt', 'hamburg', 'Fischmarkt', 'genuss', 53.545, 9.951, 1.5, false, true, array[]::smallint[], 'morgen', 'Traditionsmarkt am Sonntag in aller Frühe.', '', 3, 1),
  ('hamburg-speicherstadt', 'hamburg', 'Speicherstadt', 'kultur', 53.544, 9.993, 1.5, false, true, array[]::smallint[], '', 'Backstein-Lagerhäuser an Fleeten, Welterbe.', '', 4, 1),
  ('st-peter-ording-strand', 'st-peter-ording', 'Strand & Pfahlbauten', 'wasser', 54.305, 8.61, 3, false, true, array[]::smallint[], '', 'Kilometerbreiter Strand mit Pfahlbau-Restaurants.', '', 0, 1),
  ('st-peter-ording-westerhever', 'st-peter-ording', 'Leuchtturm Westerheversand', 'natur', 54.373, 8.643, 2, false, true, array[]::smallint[], '', 'Bekanntester Leuchtturm Nordfrieslands, Fußweg über den Deich.', '', 1, 1),
  ('st-peter-ording-watt', 'st-peter-ording', 'Geführte Wattwanderung', 'natur', 54.32, 8.65, 2.5, false, true, array[4,5,6,7,8,9,10]::smallint[], '', 'Nur mit kundiger Führung, Termine nach Gezeiten.', '', 2, 1),
  ('st-peter-ording-therme', 'st-peter-ording', 'Dünen-Therme', 'therme', 54.318, 8.604, 3, true, true, array[]::smallint[], '', 'Erlebnisbad für Schlechtwetter.', '', 3, 1),
  ('st-peter-ording-husum', 'st-peter-ording', 'Husum & Hafen', 'stadt', 54.477, 9.051, 2, false, true, array[]::smallint[], '', '„Graue Stadt am Meer“, im Frühjahr Krokusblüte im Schlosspark.', '', 4, 1),
  ('lueneburger-heide-wilsede', 'lueneburger-heide', 'Wilsede & Wilseder Berg', 'natur', 53.17, 9.94, 4, false, true, array[]::smallint[], '', 'Autofreies Heidedorf, zu Fuß oder per Kutsche.', '', 0, 1),
  ('lueneburger-heide-heidepark', 'lueneburger-heide', 'Heide Park Soltau', 'familie', 53.024, 9.877, 7, false, true, array[]::smallint[], '', 'Freizeitpark; Saison und Öffnungstage prüfen.', '', 1, 1),
  ('lueneburger-heide-lueneburg', 'lueneburger-heide', 'Altstadt Lüneburg', 'stadt', 53.249, 10.411, 2.5, false, true, array[]::smallint[], '', 'Salzstadt mit schiefen Backsteinhäusern.', '', 2, 1),
  ('lueneburger-heide-wildpark', 'lueneburger-heide', 'Wildpark Lüneburger Heide', 'familie', 53.312, 9.97, 3, false, true, array[]::smallint[], '', 'Großer Wildpark mit heimischen und nordischen Tieren.', '', 3, 1),
  ('kassel-herkules', 'kassel', 'Herkules & Bergpark Wilhelmshöhe', 'kultur', 51.316, 9.394, 3, false, true, array[]::smallint[], '', 'Welterbe-Park mit Riesenfigur und Kaskaden.', '', 0, 1),
  ('kassel-wasserspiele', 'kassel', 'Wasserspiele Bergpark', 'kultur', 51.317, 9.41, 1.5, false, true, array[5,6,7,8,9,10]::smallint[], '', 'Nur an bestimmten Tagen in der Saison, Termine prüfen.', '', 1, 1),
  ('kassel-grimmwelt', 'kassel', 'Grimmwelt', 'kultur', 51.31, 9.495, 2, true, true, array[]::smallint[], '', 'Museum zu den Brüdern Grimm.', '', 2, 1),
  ('kassel-edersee', 'kassel', 'Edersee & Nationalpark Kellerwald', 'wasser', 51.18, 9.05, 4, false, true, array[]::smallint[], '', 'Stausee mit Schloss Waldeck, alte Buchenwälder.', '', 3, 1),
  ('luebeck-holstentor', 'luebeck', 'Holstentor & Altstadtinsel', 'stadt', 53.866, 10.68, 2, false, true, array[]::smallint[], '', 'Wahrzeichen und Welterbe-Altstadt.', '', 0, 1),
  ('luebeck-hansemuseum', 'luebeck', 'Europäisches Hansemuseum', 'kultur', 53.872, 10.688, 2.5, true, false, array[]::smallint[], '', 'Geschichte der Hanse in Inszenierungen.', '', 1, 1),
  ('luebeck-marzipan', 'luebeck', 'Marzipan-Café', 'genuss', 53.866, 10.686, 1, true, true, array[]::smallint[], '', 'Lübecker Marzipan probieren.', '', 2, 1),
  ('luebeck-travemuende', 'luebeck', 'Travemünde & Passat', 'wasser', 53.962, 10.871, 3, false, true, array[]::smallint[], '', 'Strand, Promenade und Viermastbark am Priwall.', '', 3, 1),
  ('colmar-petitevenise', 'colmar', 'Petite Venise', 'stadt', 48.073, 7.36, 2, false, true, array[]::smallint[], '', 'Kanalviertel mit Bootsfahrten.', '', 0, 1),
  ('colmar-hautkoenigsbourg', 'colmar', 'Hohkönigsburg (Haut-Kœnigsbourg)', 'burg', 48.249, 7.345, 2.5, false, true, array[]::smallint[], '', 'Rekonstruierte Burg mit Blick über die Rheinebene.', '', 1, 1),
  ('colmar-riquewihr', 'colmar', 'Riquewihr', 'stadt', 48.167, 7.297, 2, false, true, array[]::smallint[], '', 'Weinort mit vollständig erhaltener Altstadt.', '', 2, 1),
  ('colmar-eguisheim', 'colmar', 'Eguisheim', 'genuss', 48.043, 7.306, 2, false, false, array[]::smallint[], '', 'Runddorf mit Weinkellern.', '', 3, 1),
  ('colmar-singes', 'colmar', 'Montagne des Singes', 'familie', 48.26, 7.38, 2, false, true, array[3,4,5,6,7,8,9,10,11]::smallint[], '', 'Affenberg mit freilaufenden Berberaffen; Saison prüfen.', '', 4, 1),
  ('strassburg-muenster', 'strassburg', 'Straßburger Münster', 'kultur', 48.582, 7.751, 1.5, true, false, array[]::smallint[], '', 'Gotisches Münster mit astronomischer Uhr.', '', 0, 1),
  ('strassburg-petitefrance', 'strassburg', 'Petite France', 'stadt', 48.581, 7.74, 1.5, false, true, array[]::smallint[], '', 'Gerberviertel mit Fachwerk und Kanälen.', '', 1, 1),
  ('strassburg-boot', 'strassburg', 'Bootsrundfahrt auf der Ill', 'wasser', 48.581, 7.749, 1.5, false, true, array[]::smallint[], '', 'Rundfahrt mit Schleusen bis zum Europaviertel.', '', 2, 1),
  ('strassburg-europa', 'strassburg', 'Europaviertel', 'kultur', 48.597, 7.771, 1.5, false, false, array[]::smallint[], '', 'Europaparlament und Europarat; Besuchsmöglichkeiten prüfen.', '', 3, 1),
  ('schaffhausen-rheinfall', 'schaffhausen', 'Rheinfall', 'natur', 47.678, 8.615, 2, false, true, array[]::smallint[], '', 'Uferwege und Aussichtsplattformen.', '', 0, 1),
  ('schaffhausen-felsen', 'schaffhausen', 'Bootsfahrt zum Rheinfallfelsen', 'wasser', 47.677, 8.617, 1, false, true, array[4,5,6,7,8,9,10]::smallint[], '', 'Boote nur in der Saison und bei passendem Wasserstand.', '', 1, 1),
  ('schaffhausen-munot', 'schaffhausen', 'Munot Schaffhausen', 'burg', 47.696, 8.638, 1.5, false, true, array[]::smallint[], '', 'Runde Festung über der Altstadt.', '', 2, 1),
  ('schaffhausen-steinamrhein', 'schaffhausen', 'Stein am Rhein', 'stadt', 47.66, 8.859, 2, false, true, array[]::smallint[], '', 'Bemalte Fassaden am Rathausplatz.', '', 3, 1),
  ('luzern-kapellbruecke', 'luzern', 'Kapellbrücke & Altstadt', 'stadt', 47.052, 8.308, 2, false, true, array[]::smallint[], '', 'Gedeckte Holzbrücke mit Wasserturm.', '', 0, 1),
  ('luzern-verkehrshaus', 'luzern', 'Verkehrshaus der Schweiz', 'technik', 47.053, 8.336, 4, true, true, array[]::smallint[], '', 'Großes Verkehrsmuseum mit Planetarium.', '', 1, 1),
  ('luzern-pilatus', 'luzern', 'Pilatus', 'berge', 46.979, 8.255, 5, false, true, array[]::smallint[], '', 'Hausberg mit Zahnradbahn ab Alpnachstad (Sommer) und Seilbahn ab Kriens.', '', 2, 1),
  ('luzern-rigi', 'luzern', 'Rigi', 'berge', 47.057, 8.485, 5, false, true, array[]::smallint[], '', 'Aussichtsberg mit Zahnradbahnen.', '', 3, 1),
  ('luzern-schiff', 'luzern', 'Dampfschiff auf dem Vierwaldstättersee', 'wasser', 47.05, 8.311, 2, false, true, array[]::smallint[], '', 'Historische Raddampfer, Fahrplan prüfen.', '', 4, 1),
  ('innsbruck-nordkette', 'innsbruck', 'Nordkettenbahnen', 'berge', 47.307, 11.383, 4, false, true, array[]::smallint[], '', 'Standseilbahn und Seilbahn bis auf die Nordkette.', '', 0, 1),
  ('innsbruck-goldenesdachl', 'innsbruck', 'Goldenes Dachl & Altstadt', 'stadt', 47.269, 11.393, 1.5, false, true, array[]::smallint[], '', 'Prunkerker mit vergoldeten Schindeln.', '', 1, 1),
  ('innsbruck-bergisel', 'innsbruck', 'Bergisel-Schanze', 'technik', 47.248, 11.399, 1.5, false, true, array[]::smallint[], '', 'Sprungschanze von Zaha Hadid mit Aussicht.', '', 2, 1),
  ('innsbruck-swarovski', 'innsbruck', 'Swarovski Kristallwelten Wattens', 'kultur', 47.294, 11.601, 2.5, true, true, array[]::smallint[], '', 'Kunstwelten unter einem begrünten Riesenkopf.', '', 3, 1),
  ('innsbruck-ambras', 'innsbruck', 'Schloss Ambras', 'burg', 47.256, 11.434, 2, false, true, array[]::smallint[], '', 'Renaissanceschloss mit Kunstkammer.', '', 4, 1),
  ('salzburg-festung', 'salzburg', 'Festung Hohensalzburg', 'burg', 47.795, 13.047, 2.5, false, true, array[]::smallint[], '', 'Große Burganlage über der Altstadt, per Festungsbahn.', '', 0, 1),
  ('salzburg-getreidegasse', 'salzburg', 'Getreidegasse & Mozarts Geburtshaus', 'stadt', 47.8, 13.043, 2, false, true, array[]::smallint[], '', 'Einkaufsgasse mit Zunftschildern.', '', 1, 1),
  ('salzburg-hellbrunn', 'salzburg', 'Schloss Hellbrunn & Wasserspiele', 'burg', 47.763, 13.061, 2, false, true, array[4,5,6,7,8,9,10,11]::smallint[], '', 'Trickbrunnen im Schlosspark; Saison prüfen.', '', 2, 1),
  ('salzburg-untersberg', 'salzburg', 'Untersbergbahn', 'berge', 47.723, 13.012, 3, false, true, array[]::smallint[], '', 'Seilbahn auf den Hausberg an der Grenze.', '', 3, 1),
  ('salzburg-eisriesenwelt', 'salzburg', 'Eisriesenwelt Werfen', 'unterwelt', 47.503, 13.19, 4, false, false, array[5,6,7,8,9,10]::smallint[], '', 'Große Eishöhle; nur im Sommerhalbjahr, warme Kleidung, Termine prüfen.', '', 4, 1),
  ('zillertal-hintertux', 'zillertal', 'Hintertuxer Gletscher', 'winter', 47.07, 11.68, 6, false, true, array[]::smallint[], '', 'Ganzjahres-Skigebiet, Gletscherbahnen.', '', 0, 1),
  ('zillertal-dampf', 'zillertal', 'Zillertalbahn (Dampfzug)', 'technik', 47.34, 11.78, 2, false, true, array[5,6,7,8,9,10]::smallint[], '', 'Dampfzug zwischen Jenbach und Mayrhofen; Fahrtage prüfen.', '', 1, 1),
  ('zillertal-schlegeis', 'zillertal', 'Schlegeis-Stausee', 'wasser', 47.04, 11.71, 3, false, true, array[6,7,8,9,10]::smallint[], '', 'Hochalpenstraße (Maut) zum Stausee, Wanderungen.', '', 2, 1),
  ('zillertal-sennerei', 'zillertal', 'Erlebnissennerei Zillertal', 'genuss', 47.181, 11.856, 1.5, true, true, array[]::smallint[], '', 'Schaukäserei mit Hofladen.', '', 3, 1),
  ('bregenz-pfaender', 'bregenz', 'Pfänderbahn', 'berge', 47.509, 9.776, 2.5, false, true, array[]::smallint[], '', 'Seilbahn mit Blick über den ganzen Bodensee.', '', 0, 1),
  ('bregenz-seebuehne', 'bregenz', 'Seebühne & Kunsthaus', 'kultur', 47.507, 9.739, 2, false, false, array[]::smallint[], '', 'Festspielbühne im See und Kunsthaus von Peter Zumthor.', '', 1, 1),
  ('bregenz-kaesestrasse', 'bregenz', 'KäseStrasse Bregenzerwald', 'genuss', 47.4, 9.9, 4, false, false, array[]::smallint[], '', 'Sennereien und Alpen mit Verkostung.', '', 2, 1),
  ('bregenz-rappenloch', 'bregenz', 'Rappenlochschlucht', 'natur', 47.378, 9.759, 2, false, true, array[]::smallint[], '', 'Schlucht bei Dornbirn; Wegsperrungen prüfen.', '', 3, 1),
  ('wien-schoenbrunn', 'wien', 'Schloss Schönbrunn', 'burg', 48.185, 16.312, 3.5, false, true, array[]::smallint[], '', 'Sommerresidenz der Habsburger mit Park und Tiergarten.', '', 0, 1),
  ('wien-stephansdom', 'wien', 'Stephansdom', 'kultur', 48.208, 16.373, 1, true, false, array[]::smallint[], '', 'Gotischer Dom im Zentrum.', '', 1, 1),
  ('wien-prater', 'wien', 'Prater & Riesenrad', 'familie', 48.217, 16.396, 2.5, false, true, array[]::smallint[], '', 'Vergnügungspark mit historischem Riesenrad.', '', 2, 1),
  ('wien-naschmarkt', 'wien', 'Naschmarkt', 'genuss', 48.199, 16.364, 1.5, false, true, array[]::smallint[], 'mittag', 'Markt mit Ständen und Lokalen.', '', 3, 1),
  ('wien-heuriger', 'wien', 'Heuriger in Grinzing', 'genuss', 48.257, 16.349, 2.5, false, false, array[]::smallint[], 'abend', 'Weinlokale am Stadtrand.', '', 4, 1),
  ('riva-varone', 'riva', 'Cascata del Varone', 'natur', 45.906, 10.829, 1, false, true, array[]::smallint[], '', 'Wasserfall in einer engen Grotte.', '', 0, 1),
  ('riva-tenno', 'riva', 'Lago di Tenno & Canale di Tenno', 'wasser', 45.937, 10.836, 2.5, false, true, array[]::smallint[], '', 'Türkiser Bergsee und mittelalterliches Dorf.', '', 1, 1),
  ('riva-baldo', 'riva', 'Monte Baldo (Seilbahn Malcesine)', 'berge', 45.764, 10.809, 4, false, true, array[]::smallint[], '', 'Drehende Gondeln auf den Bergrücken über dem See.', '', 2, 1),
  ('riva-arco', 'riva', 'Burg Arco', 'burg', 45.922, 10.884, 2, false, true, array[]::smallint[], '', 'Burgruine über Olivenhainen.', '', 3, 1),
  ('riva-gardaland', 'riva', 'Gardaland', 'familie', 45.455, 10.714, 8, false, true, array[]::smallint[], '', 'Großer Freizeitpark am Südufer; Öffnungstage prüfen.', '', 4, 1),
  ('meran-trauttmansdorff', 'meran', 'Gärten von Schloss Trauttmansdorff', 'natur', 46.661, 11.183, 3, false, true, array[4,5,6,7,8,9,10,11]::smallint[], '', 'Botanische Gärten; übliche Saison Frühjahr bis Herbst, prüfen.', '', 0, 1),
  ('meran-therme', 'meran', 'Therme Meran', 'therme', 46.669, 11.162, 3, true, true, array[]::smallint[], '', 'Therme mitten in der Stadt.', '', 1, 1),
  ('meran-waalweg', 'meran', 'Algunder Waalweg', 'natur', 46.684, 11.13, 3, false, true, array[]::smallint[], '', 'Ebener Weg entlang eines Bewässerungskanals.', '', 2, 1),
  ('meran-schlosstirol', 'meran', 'Schloss Tirol', 'burg', 46.693, 11.152, 2, false, true, array[]::smallint[], '', 'Stammburg Tirols mit Landesmuseum.', '', 3, 1),
  ('meran-oetzi', 'meran', 'Südtiroler Archäologiemuseum (Ötzi)', 'kultur', 46.499, 11.353, 2, true, true, array[]::smallint[], '', 'Die Gletschermumie in Bozen.', '', 4, 1),
  ('prag-burg', 'prag', 'Prager Burg & Veitsdom', 'burg', 50.09, 14.4, 3, false, true, array[]::smallint[], '', 'Größtes geschlossenes Burgareal der Welt.', '', 0, 1),
  ('prag-karlsbruecke', 'prag', 'Karlsbrücke', 'stadt', 50.086, 14.411, 1, false, true, array[]::smallint[], 'morgen', 'Steinbrücke mit Heiligenfiguren über die Moldau.', '', 1, 1),
  ('prag-orloj', 'prag', 'Altstädter Ring & Astronomische Uhr', 'kultur', 50.087, 14.421, 1.5, false, true, array[]::smallint[], '', 'Mittelalterliche Uhr mit Figurenumzug zur vollen Stunde.', '', 2, 1),
  ('prag-petrin', 'prag', 'Petřín-Hügel', 'natur', 50.083, 14.395, 2, false, true, array[]::smallint[], '', 'Park mit Aussichtsturm und Spiegellabyrinth.', '', 3, 1),
  ('prag-vysehrad', 'prag', 'Vyšehrad', 'kultur', 50.064, 14.418, 1.5, false, true, array[]::smallint[], '', 'Festungshügel mit Friedhof und Moldaublick.', '', 4, 1),
  ('amsterdam-rijksmuseum', 'amsterdam', 'Rijksmuseum', 'kultur', 52.36, 4.885, 3, true, false, array[]::smallint[], '', 'Niederländische Meister; Zeitfenster vorab buchen.', '', 0, 1),
  ('amsterdam-grachten', 'amsterdam', 'Grachtenfahrt', 'wasser', 52.374, 4.9, 1.5, false, true, array[]::smallint[], '', 'Rundfahrt auf dem Grachtengürtel.', '', 1, 1),
  ('amsterdam-noord', 'amsterdam', 'Fähre nach Amsterdam-Noord', 'wasser', 52.379, 4.9, 2, false, true, array[]::smallint[], '', 'Fähre über das IJ zu Kreativvierteln.', '', 2, 1),
  ('amsterdam-zaanseschans', 'amsterdam', 'Zaanse Schans', 'kultur', 52.474, 4.817, 2.5, false, true, array[]::smallint[], '', 'Windmühlen und Holzhäuser.', '', 3, 1),
  ('amsterdam-annefrank', 'amsterdam', 'Anne Frank Huis', 'kultur', 52.375, 4.884, 1.5, true, false, array[]::smallint[], '', 'Versteck der Familie Frank; nur mit Online-Ticket.', '', 4, 1)
on conflict (id) do update set place_id = excluded.place_id, name = excluded.name, kind = excluded.kind, lat = excluded.lat, lon = excluded.lon, hours = excluded.hours, indoor = excluded.indoor, family = excluded.family, months = excluded.months, slot = excluded.slot, summary = excluded.summary, tip = excluded.tip, ord = excluded.ord, catalog_version = excluded.catalog_version, updated_at = now();

delete from public.catalog_spots where catalog_version <> 1;
delete from public.catalog_places where catalog_version <> 1;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261014160000', 'catalog') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261014160100', 'catalog_seed_v1') on conflict (version) do nothing;

commit;
