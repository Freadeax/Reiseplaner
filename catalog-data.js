/* Reiseplaner · Umkreis-Katalog (Issue #7). Einzige Quelle der Katalogdaten.
   Daraus erzeugt scripts/catalog-sql.mjs die Seed-Migration für Supabase (catalog_places/catalog_spots).
   Redaktionelle Planideen: keine Preise, keine Öffnungszeiten, keine Verfügbarkeiten. Koordinaten sind
   ungefähre Lagepunkte für die Entfernungsrechnung. Monate sind typische Reisezeiten bzw. übliche
   Saison und für konkrete Daten nicht geprüft. Nach Änderungen: node scripts/catalog-sql.mjs */
window.RP_CATALOG = {
"version": 1,
"checked": "2026-10-14",
"places": [
{"id":"bad-urach","name":"Bad Urach & Schwäbische Alb","region":"Baden-Württemberg","country":"DE","lat":48.491,"lon":9.399,
 "kinds":["natur","berge","therme","familie","burg"],"months":[4,5,6,7,8,9,10],"nights":[0,2],
 "summary":"Albtrauf mit Wasserfällen, Burgruinen und Höhlen; zum Abschluss Thermalwasser.",
 "angle":"Wasserfall-Runde am Vormittag, nachmittags ins Thermalbad – bei Regen einfach umdrehen.",
 "spots":[
  {"id":"bad-urach-wasserfall","name":"Uracher Wasserfall","kind":"natur","lat":48.493,"lon":9.372,"hours":2,"family":true,"summary":"Kurze Wanderung durchs Brühltal zum Wasserfall über Tuffstein."},
  {"id":"bad-urach-hohenurach","name":"Burgruine Hohenurach","kind":"burg","lat":48.485,"lon":9.387,"hours":2,"family":true,"summary":"Ruine hoch über der Stadt, gut mit dem Wasserfall zu einer Runde verbunden."},
  {"id":"bad-urach-albthermen","name":"AlbThermen","kind":"therme","lat":48.494,"lon":9.396,"hours":3,"indoor":true,"summary":"Thermalbad im Ort, passt als Abschluss nach der Wanderung."},
  {"id":"bad-urach-lichtenstein","name":"Schloss Lichtenstein","kind":"burg","lat":48.407,"lon":9.258,"hours":2,"family":true,"summary":"Märchenschloss auf einem Felsen über dem Echaztal.","tip":"Vom Aussichtspunkt nebenan liegt das Schloss frei vor euch."},
  {"id":"bad-urach-baerenhoehle","name":"Bärenhöhle Sonnenbühl","kind":"unterwelt","lat":48.371,"lon":9.183,"hours":1.5,"indoor":true,"family":true,"months":[4,5,6,7,8,9,10],"summary":"Tropfsteinhöhle; übliche Saison im Sommerhalbjahr, Termine prüfen."}
 ]},
{"id":"blaubeuren","name":"Blaubeuren & Blautopf","region":"Baden-Württemberg","country":"DE","lat":48.412,"lon":9.785,
 "kinds":["natur","kultur","familie","unterwelt"],"months":[3,4,5,6,7,8,9,10,11],"nights":[0,1],
 "summary":"Die tiefblaue Karstquelle, ein Kloster und die ältesten Kunstwerke der Menschheit.",
 "angle":"Erst die Quelle, dann im Museum die Venus vom Hohle Fels – Eiszeit trifft Klosteridyll.",
 "spots":[
  {"id":"blaubeuren-blautopf","name":"Blautopf","kind":"natur","lat":48.418,"lon":9.785,"hours":1,"family":true,"summary":"Karstquelle mit leuchtend blauem Wasser, kurzer Rundweg."},
  {"id":"blaubeuren-kloster","name":"Kloster Blaubeuren","kind":"kultur","lat":48.416,"lon":9.786,"hours":1.5,"indoor":true,"summary":"Klosteranlage mit gotischem Hochaltar direkt am Blautopf."},
  {"id":"blaubeuren-urmu","name":"Urgeschichtliches Museum (urmu)","kind":"kultur","lat":48.412,"lon":9.784,"hours":1.5,"indoor":true,"family":true,"summary":"Eiszeitkunst von der Schwäbischen Alb, darunter die Venus vom Hohle Fels."},
  {"id":"blaubeuren-rusenschloss","name":"Rusenschloss & Felsenlabyrinth","kind":"natur","lat":48.412,"lon":9.800,"hours":2,"family":true,"summary":"Kurzer Aufstieg zu Ruine und Felsen mit Blick über das Blautal."}
 ]},
{"id":"bodensee-nord","name":"Bodensee-Nordufer (Meersburg)","region":"Baden-Württemberg","country":"DE","lat":47.694,"lon":9.271,
 "kinds":["wasser","kultur","familie","genuss","technik"],"months":[4,5,6,7,8,9,10],"nights":[1,4],
 "summary":"Seeufer mit Burg, Blumeninsel, Pfahlbauten und Zeppelin-Geschichte.",
 "angle":"Mit der Fähre nach Konstanz statt ums Ufer fahren – der See wird zur Abkürzung.",
 "spots":[
  {"id":"bodensee-nord-burg","name":"Burg Meersburg","kind":"burg","lat":47.694,"lon":9.272,"hours":1.5,"indoor":true,"family":true,"summary":"Bewohnte mittelalterliche Burg über der Unterstadt."},
  {"id":"bodensee-nord-pfahlbauten","name":"Pfahlbauten Unteruhldingen","kind":"kultur","lat":47.722,"lon":9.229,"hours":1.5,"family":true,"summary":"Freilichtmuseum mit rekonstruierten Pfahlbaudörfern im See."},
  {"id":"bodensee-nord-mainau","name":"Insel Mainau","kind":"natur","lat":47.705,"lon":9.195,"hours":4,"family":true,"summary":"Blumeninsel mit Park, Schmetterlingshaus und Schloss."},
  {"id":"bodensee-nord-zeppelin","name":"Zeppelin Museum Friedrichshafen","kind":"technik","lat":47.651,"lon":9.479,"hours":2,"indoor":true,"family":true,"summary":"Luftschiffgeschichte mit begehbarem Teilnachbau der Hindenburg."},
  {"id":"bodensee-nord-affenberg","name":"Affenberg Salem","kind":"familie","lat":47.747,"lon":9.293,"hours":2,"family":true,"months":[3,4,5,6,7,8,9,10,11],"summary":"Freigehege mit Berberaffen; übliche Saison Frühjahr bis Herbst, Termine prüfen."},
  {"id":"bodensee-nord-faehre","name":"Autofähre Meersburg–Konstanz","kind":"wasser","lat":47.690,"lon":9.265,"hours":1,"family":true,"summary":"Kurze Überfahrt quer über den See, auch zu Fuß möglich."}
 ]},
{"id":"triberg","name":"Triberg & mittlerer Schwarzwald","region":"Baden-Württemberg","country":"DE","lat":48.131,"lon":8.231,
 "kinds":["natur","kultur","familie","winter"],"months":[1,2,5,6,7,8,9,10,12],"nights":[0,3],
 "summary":"Wasserfälle, Kuckucksuhren und Schwarzwaldhöfe – das Klischee zum Anfassen.",
 "angle":"Kuckucksuhren-Tour: größte Uhr, Uhrenmuseum Furtwangen und abends Schwarzwälder Kirsch.",
 "spots":[
  {"id":"triberg-wasserfaelle","name":"Triberger Wasserfälle","kind":"natur","lat":48.128,"lon":8.229,"hours":1.5,"family":true,"summary":"Kaskaden im Wald direkt am Ort, mit Wegen auf beiden Seiten."},
  {"id":"triberg-museum","name":"Schwarzwaldmuseum Triberg","kind":"kultur","lat":48.130,"lon":8.231,"hours":1.5,"indoor":true,"family":true,"summary":"Trachten, Uhren und Orchestrien aus der Region."},
  {"id":"triberg-kuckucksuhr","name":"Weltgrößte Kuckucksuhr (Schonachbach)","kind":"kultur","lat":48.137,"lon":8.208,"hours":0.5,"indoor":true,"family":true,"summary":"Begehbare Riesen-Kuckucksuhr – kurzer, kurioser Halt."},
  {"id":"triberg-uhrenmuseum","name":"Deutsches Uhrenmuseum Furtwangen","kind":"technik","lat":48.049,"lon":8.207,"hours":2,"indoor":true,"summary":"Uhrengeschichte von der Sonnenuhr bis zur Funkuhr."},
  {"id":"triberg-vogtsbauernhof","name":"Freilichtmuseum Vogtsbauernhof","kind":"kultur","lat":48.264,"lon":8.183,"hours":3,"family":true,"months":[3,4,5,6,7,8,9,10,11],"summary":"Historische Schwarzwaldhöfe; übliche Saison Frühjahr bis Herbst, Termine prüfen."}
 ]},
{"id":"titisee-feldberg","name":"Titisee & Feldberg","region":"Baden-Württemberg","country":"DE","lat":47.898,"lon":8.150,
 "kinds":["natur","berge","wasser","winter","therme"],"months":[1,2,3,6,7,8,9,10,12],"nights":[1,5],
 "summary":"Höchster Gipfel im Schwarzwald, Seen und Schluchten; im Winter Schneesicherheit.",
 "angle":"Schluchten-Duo: morgens Ravennaschlucht, später die wilde Wutach – dazwischen Titisee.",
 "spots":[
  {"id":"titisee-feldberg-titisee","name":"Titisee (Ufer & Boot)","kind":"wasser","lat":47.896,"lon":8.150,"hours":2,"family":true,"summary":"Uferweg und Tretboote am bekanntesten See im Schwarzwald."},
  {"id":"titisee-feldberg-feldberg","name":"Feldberg-Gipfel","kind":"berge","lat":47.874,"lon":8.004,"hours":3,"family":true,"summary":"Rundweg über den Gipfel mit Weitblick bis zu den Alpen bei klarer Sicht."},
  {"id":"titisee-feldberg-ravenna","name":"Ravennaschlucht","kind":"natur","lat":47.950,"lon":8.110,"hours":2.5,"summary":"Schlucht mit Wasserfällen und dem Ravenna-Viadukt."},
  {"id":"titisee-feldberg-wutach","name":"Wutachschlucht","kind":"natur","lat":47.845,"lon":8.400,"hours":5,"summary":"Wilde Schluchtwanderung, Trittsicherheit nötig, Streckenwanderung planen."},
  {"id":"titisee-feldberg-badeparadies","name":"Badeparadies Schwarzwald","kind":"therme","lat":47.894,"lon":8.143,"hours":4,"indoor":true,"family":true,"summary":"Großes Spaß- und Palmenbad am Titisee, gut bei Schlechtwetter."}
 ]},
{"id":"freiburg","name":"Freiburg & Kaiserstuhl","region":"Baden-Württemberg","country":"DE","lat":47.995,"lon":7.850,
 "kinds":["stadt","genuss","berge","familie"],"months":[3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Sonnige Unistadt mit Bächle, Münster und Weinbergen vor der Tür.",
 "angle":"Vormittags Münstermarkt, nachmittags mit der Seilbahn auf den Schauinsland, abends Kaiserstühler Wein.",
 "spots":[
  {"id":"freiburg-muenster","name":"Freiburger Münster & Münstermarkt","kind":"stadt","lat":47.995,"lon":7.852,"hours":2,"family":true,"summary":"Gotisches Münster mit Turmaufstieg; Markt rund ums Münster."},
  {"id":"freiburg-schauinsland","name":"Schauinslandbahn","kind":"berge","lat":47.920,"lon":7.896,"hours":3,"family":true,"summary":"Seilbahn auf Freiburgs Hausberg mit Aussichtsturm."},
  {"id":"freiburg-kaiserstuhl","name":"Kaiserstuhl (Weinberge & Lösshohlwege)","kind":"genuss","lat":48.085,"lon":7.665,"hours":3,"summary":"Vulkanisches Weinbaugebiet mit Hohlwegen und Winzerhöfen."},
  {"id":"freiburg-europapark","name":"Europa-Park Rust","kind":"familie","lat":48.266,"lon":7.722,"hours":8,"family":true,"summary":"Großer Freizeitpark; Saison- und Öffnungstage beim Park prüfen."},
  {"id":"freiburg-schlossberg","name":"Schlossberg Freiburg","kind":"natur","lat":47.993,"lon":7.860,"hours":1.5,"family":true,"summary":"Kurzer Aufstieg oder Bahn mit Blick über die Altstadt."}
 ]},
{"id":"heidelberg","name":"Heidelberg & Kurpfalz","region":"Baden-Württemberg","country":"DE","lat":49.410,"lon":8.715,
 "kinds":["stadt","kultur","burg","technik"],"months":[3,4,5,6,7,8,9,10,11,12],"nights":[0,2],
 "summary":"Schlossruine, Altstadt am Neckar und Philosophenweg.",
 "angle":"Zwei Perspektiven: morgens vom Philosophenweg aufs Schloss schauen, nachmittags vom Schloss zurück.",
 "spots":[
  {"id":"heidelberg-schloss","name":"Heidelberger Schloss","kind":"burg","lat":49.410,"lon":8.715,"hours":2.5,"family":true,"summary":"Berühmte Ruine mit Großem Fass, per Bergbahn oder zu Fuß."},
  {"id":"heidelberg-philosophenweg","name":"Philosophenweg","kind":"natur","lat":49.416,"lon":8.700,"hours":1.5,"summary":"Hangweg mit dem klassischen Blick auf Altstadt und Schloss."},
  {"id":"heidelberg-altstadt","name":"Altstadt & Alte Brücke","kind":"stadt","lat":49.413,"lon":8.710,"hours":2,"family":true,"summary":"Hauptstraße, Brückentor und Neckarufer."},
  {"id":"heidelberg-koenigstuhl","name":"Königstuhl (Bergbahn)","kind":"berge","lat":49.399,"lon":8.727,"hours":2,"family":true,"summary":"Historische Bergbahn auf den Hausberg."},
  {"id":"heidelberg-speyer","name":"Technik Museum Speyer","kind":"technik","lat":49.312,"lon":8.446,"hours":4,"indoor":true,"family":true,"summary":"Flugzeuge, Raumfähre Buran, U-Boot – vieles begehbar."}
 ]},
{"id":"stuttgart","name":"Stuttgart","region":"Baden-Württemberg","country":"DE","lat":48.776,"lon":9.183,
 "kinds":["stadt","technik","familie","therme"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[0,2],
 "summary":"Autostadt mit zwei großen Automuseen, Zoo-Garten und Mineralbädern.",
 "angle":"Stäffele statt Stau: die Stadt über ihre Treppenwege erkunden, Schlussstein im Mineralbad.",
 "spots":[
  {"id":"stuttgart-mercedes","name":"Mercedes-Benz Museum","kind":"technik","lat":48.788,"lon":9.234,"hours":3,"indoor":true,"family":true,"summary":"Autogeschichte auf neun Ebenen."},
  {"id":"stuttgart-porsche","name":"Porsche Museum","kind":"technik","lat":48.834,"lon":9.152,"hours":2,"indoor":true,"summary":"Sportwagen in moderner Ausstellungshalle in Zuffenhausen."},
  {"id":"stuttgart-wilhelma","name":"Wilhelma","kind":"familie","lat":48.805,"lon":9.207,"hours":4,"family":true,"summary":"Zoologisch-botanischer Garten in historischer Anlage."},
  {"id":"stuttgart-leuze","name":"Mineralbad Leuze","kind":"therme","lat":48.789,"lon":9.219,"hours":3,"indoor":true,"family":true,"summary":"Mineralwasser-Bad am Neckar."},
  {"id":"stuttgart-fernsehturm","name":"Fernsehturm Stuttgart","kind":"berge","lat":48.756,"lon":9.190,"hours":1.5,"family":true,"summary":"Der erste Stahlbeton-Fernsehturm der Welt, Aussichtsplattform."}
 ]},
{"id":"rothenburg","name":"Rothenburg ob der Tauber","region":"Bayern","country":"DE","lat":49.377,"lon":10.179,
 "kinds":["stadt","kultur"],"months":[3,4,5,6,7,8,9,10,11,12],"nights":[0,2],
 "summary":"Mittelalterliche Stadt mit begehbarer Mauer und Fachwerk wie im Bilderbuch.",
 "angle":"Erst abends richtig schön: Tagesgäste sind weg, der Nachtwächter erzählt.",
 "spots":[
  {"id":"rothenburg-mauer","name":"Stadtmauer-Rundgang & Plönlein","kind":"stadt","lat":49.374,"lon":10.180,"hours":2,"family":true,"summary":"Überdachter Wehrgang einmal um die Altstadt."},
  {"id":"rothenburg-kriminalmuseum","name":"Mittelalterliches Kriminalmuseum","kind":"kultur","lat":49.376,"lon":10.178,"hours":1.5,"indoor":true,"summary":"Rechtsgeschichte von Folterwerkzeug bis Schandmaske."},
  {"id":"rothenburg-nachtwaechter","name":"Nachtwächter-Rundgang","kind":"kultur","lat":49.377,"lon":10.179,"hours":1,"slot":"abend","family":true,"summary":"Abendliche Führung am Marktplatz; Termine vor Ort prüfen."},
  {"id":"rothenburg-dinkelsbuehl","name":"Dinkelsbühl","kind":"stadt","lat":49.069,"lon":10.319,"hours":2,"family":true,"summary":"Weniger überlaufene Schwester an der Romantischen Straße."}
 ]},
{"id":"nuernberg","name":"Nürnberg","region":"Bayern","country":"DE","lat":49.454,"lon":11.077,
 "kinds":["stadt","kultur","technik","unterwelt"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Kaiserburg, große Museen und Geschichte, die man nicht vergessen sollte.",
 "angle":"Über und unter der Stadt: Kaiserburg oben, historische Felsengänge darunter.",
 "spots":[
  {"id":"nuernberg-kaiserburg","name":"Kaiserburg","kind":"burg","lat":49.458,"lon":11.076,"hours":2,"family":true,"summary":"Burg über der Altstadt mit Tiefem Brunnen."},
  {"id":"nuernberg-gnm","name":"Germanisches Nationalmuseum","kind":"kultur","lat":49.448,"lon":11.076,"hours":3,"indoor":true,"summary":"Größtes kulturhistorisches Museum im deutschsprachigen Raum."},
  {"id":"nuernberg-doku","name":"Dokumentationszentrum Reichsparteitagsgelände","kind":"kultur","lat":49.433,"lon":11.112,"hours":2.5,"indoor":true,"summary":"Ausstellung und Gelände zur NS-Geschichte."},
  {"id":"nuernberg-felsengaenge","name":"Historische Felsengänge","kind":"unterwelt","lat":49.457,"lon":11.075,"hours":1.5,"indoor":true,"summary":"Bierkeller unter der Altstadt, nur mit Führung."},
  {"id":"nuernberg-dbmuseum","name":"DB Museum","kind":"technik","lat":49.448,"lon":11.072,"hours":2,"indoor":true,"family":true,"summary":"Eisenbahngeschichte mit Adler-Nachbau."}
 ]},
{"id":"bamberg","name":"Bamberg & Fränkische Schweiz","region":"Bayern","country":"DE","lat":49.892,"lon":10.887,
 "kinds":["stadt","genuss","natur","unterwelt"],"months":[3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Welterbe-Altstadt mit Rauchbier, dazu Felsen, Burgen und Höhlen der Fränkischen Schweiz.",
 "angle":"Bierkeller-Saison: im Sommer sitzt Franken nicht in, sondern auf dem Keller.",
 "spots":[
  {"id":"bamberg-altstadt","name":"Altes Rathaus & Klein-Venedig","kind":"stadt","lat":49.892,"lon":10.887,"hours":2,"family":true,"summary":"Rathaus mitten in der Regnitz und Fischerhäuser am Ufer."},
  {"id":"bamberg-rauchbier","name":"Rauchbier in einer Altstadt-Brauerei","kind":"genuss","lat":49.892,"lon":10.885,"hours":1.5,"slot":"abend","indoor":true,"summary":"Bambergs Spezialität probieren."},
  {"id":"bamberg-dom","name":"Bamberger Dom & Domberg","kind":"kultur","lat":49.891,"lon":10.882,"hours":1.5,"indoor":true,"summary":"Kaiserdom mit dem Bamberger Reiter."},
  {"id":"bamberg-teufelshoehle","name":"Teufelshöhle Pottenstein","kind":"unterwelt","lat":49.771,"lon":11.418,"hours":1.5,"indoor":true,"family":true,"summary":"Große Tropfsteinhöhle; Führungszeiten prüfen."},
  {"id":"bamberg-walberla","name":"Walberla (Ehrenbürg)","kind":"natur","lat":49.705,"lon":11.120,"hours":2.5,"family":true,"summary":"Tafelberg mit Kapelle und weitem Blick."}
 ]},
{"id":"muenchen","name":"München","region":"Bayern","country":"DE","lat":48.137,"lon":11.575,
 "kinds":["stadt","kultur","technik","genuss"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[1,4],
 "summary":"Museen, Biergärten und Surfer mitten in der Stadt.",
 "angle":"Eisbachwelle zuschauen, Weißwurst vor zwölf, Deutsches Museum bei Regen.",
 "spots":[
  {"id":"muenchen-deutschesmuseum","name":"Deutsches Museum","kind":"technik","lat":48.130,"lon":11.583,"hours":4,"indoor":true,"family":true,"summary":"Eines der größten Technikmuseen der Welt."},
  {"id":"muenchen-englischergarten","name":"Englischer Garten & Eisbachwelle","kind":"natur","lat":48.143,"lon":11.588,"hours":2,"family":true,"summary":"Großer Stadtpark; an der Eisbachbrücke surfen Leute auf der stehenden Welle."},
  {"id":"muenchen-viktualienmarkt","name":"Viktualienmarkt","kind":"genuss","lat":48.135,"lon":11.576,"hours":1,"slot":"mittag","family":true,"summary":"Markt im Zentrum für einen Imbiss zwischendurch."},
  {"id":"muenchen-olympiapark","name":"Olympiapark & Olympiaturm","kind":"berge","lat":48.174,"lon":11.554,"hours":2,"family":true,"summary":"Park der Spiele von 1972 mit Aussichtsturm."},
  {"id":"muenchen-nymphenburg","name":"Schloss Nymphenburg","kind":"burg","lat":48.158,"lon":11.503,"hours":2.5,"family":true,"summary":"Barockes Schloss mit großem Park."}
 ]},
{"id":"berchtesgaden","name":"Berchtesgadener Land","region":"Bayern","country":"DE","lat":47.630,"lon":13.002,
 "kinds":["berge","wasser","natur","therme","winter","unterwelt"],"months":[1,2,5,6,7,8,9,10,12],"nights":[2,5],
 "summary":"Königssee, Watzmann und ein Salzbergwerk mit Rutschen.",
 "angle":"Im Salzbergwerk unterirdisch rutschen, am nächsten Tag mit dem Elektroboot zum Echo am Königssee.",
 "spots":[
  {"id":"berchtesgaden-koenigssee","name":"Königssee-Schifffahrt nach St. Bartholomä","kind":"wasser","lat":47.590,"lon":12.985,"hours":4,"family":true,"summary":"Elektroboote über den Fjord-artigen See; Fahrplan prüfen."},
  {"id":"berchtesgaden-salzbergwerk","name":"Salzbergwerk Berchtesgaden","kind":"unterwelt","lat":47.638,"lon":13.012,"hours":2,"indoor":true,"family":true,"summary":"Grubenbahn, Bergmannsrutschen und Salzsee im Berg."},
  {"id":"berchtesgaden-kehlstein","name":"Kehlsteinhaus","kind":"berge","lat":47.611,"lon":13.042,"hours":3,"months":[5,6,7,8,9,10],"summary":"Aussichtspunkt mit Geschichte; nur im Sommerhalbjahr mit Sonderbussen, Termine prüfen."},
  {"id":"berchtesgaden-watzmanntherme","name":"Watzmann Therme","kind":"therme","lat":47.628,"lon":13.007,"hours":3,"indoor":true,"family":true,"summary":"Therme mit Bergblick."},
  {"id":"berchtesgaden-almbachklamm","name":"Almbachklamm","kind":"natur","lat":47.676,"lon":13.042,"hours":3,"months":[5,6,7,8,9,10],"summary":"Klamm mit Steigen und Brücken; im Winter geschlossen, Saison prüfen."}
 ]},
{"id":"garmisch","name":"Garmisch-Partenkirchen & Zugspitzland","region":"Bayern","country":"DE","lat":47.492,"lon":11.096,
 "kinds":["berge","natur","winter","burg","kultur"],"months":[1,2,3,6,7,8,9,10,12],"nights":[2,5],
 "summary":"Deutschlands höchster Gipfel, Klammen, Bergseen und Königsschlösser.",
 "angle":"Eibsee am frühen Morgen spiegelglatt, mittags auf die Zugspitze, abends durch die Partnachklamm zurück.",
 "spots":[
  {"id":"garmisch-zugspitze","name":"Zugspitze","kind":"berge","lat":47.421,"lon":10.985,"hours":5,"family":true,"summary":"Per Zahnradbahn oder Seilbahn auf 2.962 m."},
  {"id":"garmisch-partnachklamm","name":"Partnachklamm","kind":"natur","lat":47.468,"lon":11.117,"hours":2,"family":true,"summary":"Tief eingeschnittene Klamm, im Winter mit Eiszapfen."},
  {"id":"garmisch-eibsee","name":"Eibsee","kind":"wasser","lat":47.457,"lon":10.973,"hours":2.5,"family":true,"summary":"Bergsee mit Rundweg unter der Zugspitze."},
  {"id":"garmisch-linderhof","name":"Schloss Linderhof","kind":"burg","lat":47.570,"lon":10.960,"hours":2,"family":true,"summary":"Kleinstes Königsschloss Ludwigs II. mit Park."},
  {"id":"garmisch-ettal","name":"Kloster Ettal","kind":"kultur","lat":47.569,"lon":11.094,"hours":1,"indoor":true,"summary":"Barockkirche und Klosterbrauerei."}
 ]},
{"id":"fuessen","name":"Füssen & Königswinkel","region":"Bayern","country":"DE","lat":47.570,"lon":10.700,
 "kinds":["burg","berge","wasser","natur"],"months":[4,5,6,7,8,9,10,12],"nights":[1,3],
 "summary":"Neuschwanstein, Seen und Lechfall am Alpenrand.",
 "angle":"Neuschwanstein von der Marienbrücke statt nur von innen – und abends am Forggensee ins Licht schauen.",
 "spots":[
  {"id":"fuessen-neuschwanstein","name":"Schloss Neuschwanstein","kind":"burg","lat":47.558,"lon":10.750,"hours":3,"family":true,"summary":"Märchenschloss; Innenbesichtigung nur mit Zeitticket, früh reservieren."},
  {"id":"fuessen-hohenschwangau","name":"Schloss Hohenschwangau & Alpsee","kind":"burg","lat":47.555,"lon":10.738,"hours":2,"family":true,"summary":"Elternschloss Ludwigs II. am Alpsee."},
  {"id":"fuessen-lechfall","name":"Lechfall","kind":"natur","lat":47.561,"lon":10.697,"hours":1,"family":true,"summary":"Wasserfall mit Klamm direkt am Stadtrand."},
  {"id":"fuessen-tegelberg","name":"Tegelbergbahn","kind":"berge","lat":47.567,"lon":10.773,"hours":3,"family":true,"summary":"Seilbahn mit Blick über das Voralpenland."},
  {"id":"fuessen-forggensee","name":"Forggensee","kind":"wasser","lat":47.600,"lon":10.720,"hours":2,"family":true,"months":[6,7,8,9,10],"summary":"Stausee mit Uferwegen; Schiffe nur im Sommer."}
 ]},
{"id":"chiemsee","name":"Chiemsee","region":"Bayern","country":"DE","lat":47.856,"lon":12.346,
 "kinds":["wasser","kultur","burg","berge"],"months":[4,5,6,7,8,9,10],"nights":[1,4],
 "summary":"„Bayerisches Meer“ mit Schlossinsel, Klosterinsel und Bergen im Rücken.",
 "angle":"Insel-Hopping: Herreninsel mit Spiegelsaal, Fraueninsel mit Räucherfisch.",
 "spots":[
  {"id":"chiemsee-herrenchiemsee","name":"Schloss Herrenchiemsee","kind":"burg","lat":47.862,"lon":12.401,"hours":3,"family":true,"summary":"Ludwigs Versailles-Kopie auf der Herreninsel, per Schiff."},
  {"id":"chiemsee-fraueninsel","name":"Fraueninsel","kind":"kultur","lat":47.874,"lon":12.423,"hours":2,"family":true,"summary":"Kleine Insel mit Kloster und Fischern."},
  {"id":"chiemsee-kampenwand","name":"Kampenwand","kind":"berge","lat":47.754,"lon":12.350,"hours":4,"summary":"Seilbahn und Gipfelweg mit Blick über den See."},
  {"id":"chiemsee-baden","name":"Baden am Chiemsee","kind":"wasser","lat":47.880,"lon":12.540,"hours":3,"family":true,"months":[6,7,8,9],"summary":"Mehrere Strandbäder rund um den See."}
 ]},
{"id":"bayerischer-wald","name":"Nationalpark Bayerischer Wald","region":"Bayern","country":"DE","lat":48.884,"lon":13.479,
 "kinds":["natur","familie","kultur"],"months":[1,2,4,5,6,7,8,9,10,12],"nights":[2,5],
 "summary":"Wilder Wald, Baumwipfelpfad und Tiere im Freigelände.",
 "angle":"Wildnis-Wochenende: Luchs im Freigelände suchen, Sonnenaufgang am Lusen.",
 "spots":[
  {"id":"bayerischer-wald-baumwipfelpfad","name":"Baumwipfelpfad Neuschönau","kind":"natur","lat":48.886,"lon":13.476,"hours":2,"family":true,"summary":"Pfad in den Baumkronen mit begehbarem Baum-Ei."},
  {"id":"bayerischer-wald-tierfreigelaende","name":"Tierfreigelände","kind":"familie","lat":48.885,"lon":13.474,"hours":3,"family":true,"summary":"Luchs, Wolf und Bär in großen Gehegen."},
  {"id":"bayerischer-wald-lusen","name":"Lusen","kind":"berge","lat":48.939,"lon":13.507,"hours":4,"family":true,"summary":"Gipfel mit Blockmeer aus Granit."},
  {"id":"bayerischer-wald-glasmuseum","name":"Glasmuseum Frauenau","kind":"kultur","lat":48.989,"lon":13.300,"hours":1.5,"indoor":true,"summary":"Glaskunst aus der Glasregion."},
  {"id":"bayerischer-wald-passau","name":"Passau, Stadt der drei Flüsse","kind":"stadt","lat":48.574,"lon":13.462,"hours":3,"family":true,"summary":"Dom mit großer Orgel und Zusammenfluss von Donau, Inn und Ilz."}
 ]},
{"id":"regensburg","name":"Regensburg & Altmühltal","region":"Bayern","country":"DE","lat":49.013,"lon":12.101,
 "kinds":["stadt","kultur","genuss","wasser"],"months":[3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Mittelalterliche Altstadt, Donau und ein Kloster in der Flussschlucht.",
 "angle":"Mit dem Schiff durch den Donaudurchbruch zum Kloster Weltenburg – Klosterbier inklusive Ausblick.",
 "spots":[
  {"id":"regensburg-bruecke","name":"Steinerne Brücke & Wurstkuchl","kind":"stadt","lat":49.022,"lon":12.097,"hours":1.5,"family":true,"summary":"Mittelalterliche Brücke und eine der ältesten Garküchen."},
  {"id":"regensburg-dom","name":"Regensburger Dom","kind":"kultur","lat":49.019,"lon":12.099,"hours":1,"indoor":true,"summary":"Gotischer Dom mit mittelalterlichen Glasfenstern."},
  {"id":"regensburg-walhalla","name":"Walhalla","kind":"kultur","lat":49.032,"lon":12.224,"hours":1.5,"summary":"Ruhmeshalle über der Donau."},
  {"id":"regensburg-weltenburg","name":"Donaudurchbruch & Kloster Weltenburg","kind":"wasser","lat":48.899,"lon":11.820,"hours":4,"family":true,"months":[4,5,6,7,8,9,10],"summary":"Schifffahrt durch die Schlucht; Schiffe nur in der Saison."}
 ]},
{"id":"mittelrhein","name":"Oberes Mittelrheintal (Loreley)","region":"Rheinland-Pfalz","country":"DE","lat":50.140,"lon":7.730,
 "kinds":["burg","genuss","wasser","kultur","natur"],"months":[4,5,6,7,8,9,10],"nights":[1,3],
 "summary":"Burgen im Minutentakt, Weinberge und der berühmte Loreley-Felsen.",
 "angle":"Burgen-Pingpong: mit den Rheinfähren hin und her statt über Brücken (es gibt hier keine).",
 "spots":[
  {"id":"mittelrhein-rheinfels","name":"Burg Rheinfels","kind":"burg","lat":50.157,"lon":7.708,"hours":2,"family":true,"summary":"Große Burgruine mit Minengängen."},
  {"id":"mittelrhein-loreley","name":"Loreley-Plateau","kind":"natur","lat":50.139,"lon":7.729,"hours":1.5,"family":true,"summary":"Aussicht über die enge Rheinschleife."},
  {"id":"mittelrhein-marksburg","name":"Marksburg","kind":"burg","lat":50.271,"lon":7.651,"hours":1.5,"indoor":true,"family":true,"summary":"Einzige nie zerstörte Höhenburg am Mittelrhein, nur mit Führung."},
  {"id":"mittelrhein-schiff","name":"Rheinschifffahrt Bingen–St. Goar","kind":"wasser","lat":50.000,"lon":7.860,"hours":3,"family":true,"months":[4,5,6,7,8,9,10],"summary":"Schiff durch das Welterbetal; Fahrplan der Saison prüfen."},
  {"id":"mittelrhein-bacharach","name":"Bacharach & Weinprobe","kind":"genuss","lat":50.058,"lon":7.769,"hours":2,"slot":"abend","summary":"Fachwerkstädtchen mit Weinstuben."}
 ]},
{"id":"cochem","name":"Cochem & Mosel","region":"Rheinland-Pfalz","country":"DE","lat":50.146,"lon":7.167,
 "kinds":["burg","genuss","natur","wasser","unterwelt"],"months":[4,5,6,7,8,9,10,11],"nights":[1,3],
 "summary":"Reichsburg über Weinbergen, Hängeseilbrücke und Burg Eltz in der Nähe.",
 "angle":"Ein Bunker voller Notgeld unter Weinbergen – Kalter Krieg trifft Moselromantik.",
 "spots":[
  {"id":"cochem-reichsburg","name":"Reichsburg Cochem","kind":"burg","lat":50.148,"lon":7.163,"hours":1.5,"family":true,"summary":"Burg über der Stadt, Besichtigung mit Führung."},
  {"id":"cochem-eltz","name":"Burg Eltz","kind":"burg","lat":50.205,"lon":7.336,"hours":2.5,"family":true,"months":[4,5,6,7,8,9,10],"summary":"Burg im Wald, nie zerstört; übliche Saison April bis Oktober, prüfen."},
  {"id":"cochem-geierlay","name":"Hängeseilbrücke Geierlay","kind":"natur","lat":50.083,"lon":7.330,"hours":2,"family":true,"summary":"Lange Hängeseilbrücke über ein Tal im Hunsrück."},
  {"id":"cochem-bunker","name":"Bundesbank-Bunker","kind":"unterwelt","lat":50.143,"lon":7.157,"hours":1.5,"indoor":true,"summary":"Ehemaliger Geheimbunker für Notgeld, Führungen."},
  {"id":"cochem-calmont","name":"Calmont-Klettersteig","kind":"natur","lat":50.090,"lon":7.110,"hours":3,"summary":"Steilster Weinberg Europas; Trittsicherheit nötig."}
 ]},
{"id":"pfalz","name":"Pfälzerwald & Weinstraße","region":"Rheinland-Pfalz","country":"DE","lat":49.408,"lon":8.185,
 "kinds":["genuss","natur","burg","familie"],"months":[3,4,5,6,7,8,9,10,11],"nights":[1,3],
 "summary":"Wandern zu Hütten, Burgen auf Sandsteinfelsen, Wein in jeder Gasse.",
 "angle":"Hüttentour: Pfälzerwaldvereins-Hütten als Etappenziele statt Gipfel.",
 "spots":[
  {"id":"pfalz-hambach","name":"Hambacher Schloss","kind":"kultur","lat":49.327,"lon":8.135,"hours":2,"family":true,"summary":"Wiege der deutschen Demokratie mit Ausstellung."},
  {"id":"pfalz-berwartstein","name":"Burg Berwartstein","kind":"burg","lat":49.096,"lon":7.865,"hours":1.5,"family":true,"summary":"Felsenburg im Dahner Felsenland."},
  {"id":"pfalz-weinstrasse","name":"Deidesheim & Weinprobe","kind":"genuss","lat":49.408,"lon":8.185,"hours":2,"slot":"abend","summary":"Weinort mit Winzerhöfen an der Deutschen Weinstraße."},
  {"id":"pfalz-holidaypark","name":"Holiday Park Haßloch","kind":"familie","lat":49.318,"lon":8.256,"hours":6,"family":true,"summary":"Freizeitpark; Öffnungstage prüfen."},
  {"id":"pfalz-trifels","name":"Reichsburg Trifels","kind":"burg","lat":49.197,"lon":7.987,"hours":2,"family":true,"summary":"Burg der Reichskleinodien über Annweiler."}
 ]},
{"id":"saarschleife","name":"Saarschleife & Saarland","region":"Saarland","country":"DE","lat":49.505,"lon":6.558,
 "kinds":["natur","technik","kultur"],"months":[4,5,6,7,8,9,10,11],"nights":[1,2],
 "summary":"Flussschleife von oben und Industrie-Welterbe.",
 "angle":"Natur gegen Hochofen: morgens Baumwipfelpfad, nachmittags durch die Völklinger Hütte.",
 "spots":[
  {"id":"saarschleife-baumwipfelpfad","name":"Baumwipfelpfad Saarschleife","kind":"natur","lat":49.505,"lon":6.553,"hours":2,"family":true,"summary":"Pfad mit Aussichtsturm über der Saarschleife."},
  {"id":"saarschleife-cloef","name":"Aussichtspunkt Cloef","kind":"natur","lat":49.506,"lon":6.556,"hours":1,"family":true,"summary":"Der klassische Blick auf die Schleife."},
  {"id":"saarschleife-voelklingen","name":"Weltkulturerbe Völklinger Hütte","kind":"technik","lat":49.247,"lon":6.844,"hours":3,"family":true,"summary":"Komplett erhaltenes Eisenwerk mit Ausstellungen."},
  {"id":"saarschleife-mettlach","name":"Villeroy & Boch Erlebniszentrum Mettlach","kind":"kultur","lat":49.494,"lon":6.596,"hours":1.5,"indoor":true,"summary":"Keramikgeschichte in der alten Abtei."}
 ]},
{"id":"koeln","name":"Köln & Rheinland","region":"Nordrhein-Westfalen","country":"DE","lat":50.938,"lon":6.958,
 "kinds":["stadt","kultur","familie","genuss"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Dom, Brauhaus und Rheinufer – plus Schokolade.",
 "angle":"Kölsch-Zählung per Bierdeckel und Domspitze von oben – 533 Stufen als Ausgleich.",
 "spots":[
  {"id":"koeln-dom","name":"Kölner Dom & Turmbesteigung","kind":"kultur","lat":50.941,"lon":6.958,"hours":1.5,"indoor":true,"family":true,"summary":"Gotische Kathedrale mit Aufstieg auf den Südturm."},
  {"id":"koeln-schokolade","name":"Schokoladenmuseum","kind":"familie","lat":50.932,"lon":6.964,"hours":2,"indoor":true,"family":true,"summary":"Schokoladenherstellung mit Brunnen zum Probieren."},
  {"id":"koeln-seilbahn","name":"Rheinseilbahn","kind":"wasser","lat":50.952,"lon":6.973,"hours":1,"family":true,"months":[4,5,6,7,8,9,10],"summary":"Gondel über den Rhein; Saisonbetrieb, prüfen."},
  {"id":"koeln-brauhaus","name":"Brauhaus in der Altstadt","kind":"genuss","lat":50.938,"lon":6.960,"hours":2,"slot":"abend","indoor":true,"summary":"Kölsch und rheinische Küche."},
  {"id":"koeln-phantasialand","name":"Phantasialand Brühl","kind":"familie","lat":50.799,"lon":6.879,"hours":8,"family":true,"summary":"Freizeitpark; Öffnungstage prüfen."}
 ]},
{"id":"ruhrgebiet","name":"Ruhrgebiet – Industriekultur","region":"Nordrhein-Westfalen","country":"DE","lat":51.486,"lon":7.044,
 "kinds":["technik","kultur","unterwelt"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[0,2],
 "summary":"Zechen, Hochöfen und Halden als Kulturorte.",
 "angle":"Nachtschicht: der Landschaftspark Duisburg-Nord wird nach Sonnenuntergang farbig beleuchtet.",
 "spots":[
  {"id":"ruhrgebiet-zollverein","name":"Zeche Zollverein","kind":"technik","lat":51.486,"lon":7.044,"hours":3,"family":true,"summary":"Welterbe-Zeche mit Ruhr Museum."},
  {"id":"ruhrgebiet-duisburgnord","name":"Landschaftspark Duisburg-Nord","kind":"technik","lat":51.481,"lon":6.782,"hours":2.5,"slot":"abend","family":true,"summary":"Stillgelegtes Hüttenwerk, Hochofen begehbar, abends beleuchtet."},
  {"id":"ruhrgebiet-gasometer","name":"Gasometer Oberhausen","kind":"kultur","lat":51.493,"lon":6.873,"hours":2,"indoor":true,"summary":"Ausstellungshalle im ehemaligen Gasspeicher mit Dachplattform."},
  {"id":"ruhrgebiet-tetraeder","name":"Halde Tetraeder Bottrop","kind":"natur","lat":51.517,"lon":6.941,"hours":1.5,"family":true,"summary":"Begehbare Stahlpyramide auf einer Halde."},
  {"id":"ruhrgebiet-bergbaumuseum","name":"Deutsches Bergbau-Museum Bochum","kind":"unterwelt","lat":51.489,"lon":7.217,"hours":3,"indoor":true,"family":true,"summary":"Anschauungsbergwerk unter dem Museum."}
 ]},
{"id":"eifel","name":"Monschau & Nordeifel","region":"Nordrhein-Westfalen","country":"DE","lat":50.555,"lon":6.240,
 "kinds":["natur","wasser","kultur"],"months":[4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Fachwerkstadt im Tal, Hohes Venn und Nationalpark mit Seen.",
 "angle":"Moor-Bohlenwege im Hohen Venn: ein Stück Skandinavien an der belgischen Grenze.",
 "spots":[
  {"id":"eifel-monschau","name":"Altstadt Monschau","kind":"stadt","lat":50.555,"lon":6.240,"hours":2,"family":true,"summary":"Fachwerkhäuser an der Rur."},
  {"id":"eifel-hohesvenn","name":"Hohes Venn","kind":"natur","lat":50.500,"lon":6.100,"hours":3,"family":true,"summary":"Hochmoor mit Bohlenstegen (Belgien)."},
  {"id":"eifel-rursee","name":"Rursee","kind":"wasser","lat":50.620,"lon":6.430,"hours":3,"family":true,"summary":"Stausee mit Schiffen und Badestellen in der Saison."},
  {"id":"eifel-vogelsang","name":"Vogelsang IP","kind":"kultur","lat":50.584,"lon":6.440,"hours":2.5,"indoor":true,"summary":"Ehemalige NS-Ordensburg mit Ausstellung und Nationalpark-Zentrum."}
 ]},
{"id":"winterberg","name":"Winterberg & Hochsauerland","region":"Nordrhein-Westfalen","country":"DE","lat":51.195,"lon":8.533,
 "kinds":["berge","winter","natur","familie","unterwelt"],"months":[1,2,3,5,6,7,8,9,10,12],"nights":[1,4],
 "summary":"Skigebiet im Winter, Rothaarsteig und Bikepark im Sommer.",
 "angle":"Tropfsteine in der Atta-Höhle als Schlechtwetter-Joker.",
 "spots":[
  {"id":"winterberg-kahlerasten","name":"Kahler Asten","kind":"berge","lat":51.180,"lon":8.488,"hours":2,"family":true,"summary":"Aussichtsturm auf einem der höchsten Berge NRWs."},
  {"id":"winterberg-skiliftkarussell","name":"Skiliftkarussell Winterberg","kind":"winter","lat":51.198,"lon":8.519,"hours":5,"family":true,"months":[12,1,2,3],"summary":"Skigebiet, Schneelage und Betrieb prüfen."},
  {"id":"winterberg-rothaarsteig","name":"Rothaarsteig-Etappe","kind":"natur","lat":51.170,"lon":8.450,"hours":4,"summary":"Fernwanderweg mit gut markierten Etappen."},
  {"id":"winterberg-atta","name":"Atta-Höhle Attendorn","kind":"unterwelt","lat":51.124,"lon":7.906,"hours":1.5,"indoor":true,"family":true,"summary":"Tropfsteinhöhle mit Führungen."}
 ]},
{"id":"harz","name":"Harz (Wernigerode)","region":"Sachsen-Anhalt","country":"DE","lat":51.835,"lon":10.785,
 "kinds":["berge","natur","kultur","technik","winter","unterwelt","burg"],"months":[1,2,4,5,6,7,8,9,10,12],"nights":[2,5],
 "summary":"Brocken, Dampfzüge, Hängebrücke und Fachwerkstädte.",
 "angle":"Mit der Dampflok auf den Brocken, zu Fuß zurück – und am nächsten Tag über die Titan-RT-Hängebrücke.",
 "spots":[
  {"id":"harz-brockenbahn","name":"Brockenbahn & Brocken","kind":"berge","lat":51.800,"lon":10.616,"hours":5,"family":true,"summary":"Dampfzug auf den höchsten Harzgipfel."},
  {"id":"harz-schloss","name":"Schloss Wernigerode","kind":"burg","lat":51.828,"lon":10.788,"hours":2,"indoor":true,"family":true,"summary":"Schloss über der bunten Fachwerkstadt."},
  {"id":"harz-titan","name":"Hängebrücke Titan RT","kind":"natur","lat":51.744,"lon":10.894,"hours":1.5,"family":true,"summary":"Lange Fußgänger-Hängebrücke an der Rappbodetalsperre."},
  {"id":"harz-baumannshoehle","name":"Baumannshöhle Rübeland","kind":"unterwelt","lat":51.756,"lon":10.846,"hours":1,"indoor":true,"family":true,"summary":"Tropfsteinhöhle mit Führungen."},
  {"id":"harz-bodetal","name":"Bodetal & Hexentanzplatz","kind":"natur","lat":51.738,"lon":11.022,"hours":4,"family":true,"summary":"Schlucht bei Thale mit Seilbahn und Sagen."},
  {"id":"harz-quedlinburg","name":"Quedlinburg","kind":"stadt","lat":51.789,"lon":11.142,"hours":2.5,"family":true,"summary":"Welterbe-Fachwerkstadt mit Stiftskirche."}
 ]},
{"id":"eisenach","name":"Eisenach & Thüringer Wald","region":"Thüringen","country":"DE","lat":50.975,"lon":10.320,
 "kinds":["burg","natur","kultur","technik","unterwelt"],"months":[3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Wartburg, Drachenschlucht und ein Bergwerk mit Kristallgrotte.",
 "angle":"Durch die Drachenschlucht, die an manchen Stellen nur schulterbreit ist, hinauf zur Wartburg.",
 "spots":[
  {"id":"eisenach-wartburg","name":"Wartburg","kind":"burg","lat":50.966,"lon":10.307,"hours":2.5,"family":true,"summary":"Welterbe-Burg, Lutherstube."},
  {"id":"eisenach-drachenschlucht","name":"Drachenschlucht","kind":"natur","lat":50.950,"lon":10.320,"hours":2.5,"family":true,"summary":"Enge Klamm auf Gitterrosten, bei Nässe rutschig."},
  {"id":"eisenach-merkers","name":"Erlebnis Bergwerk Merkers","kind":"unterwelt","lat":50.822,"lon":10.118,"hours":4,"indoor":true,"summary":"Grubenfahrt mit Kristallgrotte; Führungstermine prüfen."},
  {"id":"eisenach-bachhaus","name":"Bachhaus Eisenach","kind":"kultur","lat":50.973,"lon":10.321,"hours":1.5,"indoor":true,"family":true,"summary":"Museum zu Johann Sebastian Bach mit Instrumentenvorführungen."}
 ]},
{"id":"weimar","name":"Weimar & Erfurt","region":"Thüringen","country":"DE","lat":50.979,"lon":11.329,
 "kinds":["stadt","kultur"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Klassik, Bauhaus und die bewohnte Krämerbrücke.",
 "angle":"Zwei Städte, ein Ticket: Weimar und Erfurt liegen nur eine kurze Bahnfahrt auseinander.",
 "spots":[
  {"id":"weimar-goethehaus","name":"Goethes Wohnhaus","kind":"kultur","lat":50.977,"lon":11.329,"hours":1.5,"indoor":true,"summary":"Goethes Wohnhaus mit Nationalmuseum."},
  {"id":"weimar-bauhaus","name":"Bauhaus-Museum Weimar","kind":"kultur","lat":50.984,"lon":11.324,"hours":2,"indoor":true,"summary":"Gründungsort des Bauhauses."},
  {"id":"weimar-buchenwald","name":"Gedenkstätte Buchenwald","kind":"kultur","lat":51.020,"lon":11.248,"hours":3,"summary":"Ehemaliges Konzentrationslager, Gedenkort."},
  {"id":"weimar-kraemerbruecke","name":"Krämerbrücke Erfurt","kind":"stadt","lat":50.979,"lon":11.031,"hours":2,"family":true,"summary":"Bebaute Brücke mit kleinen Läden."}
 ]},
{"id":"saechsische-schweiz","name":"Sächsische Schweiz","region":"Sachsen","country":"DE","lat":50.917,"lon":14.155,
 "kinds":["natur","berge","burg","therme"],"months":[3,4,5,6,7,8,9,10,11],"nights":[2,5],
 "summary":"Tafelberge, Felsentürme und eine Festung über der Elbe.",
 "angle":"Schrammsteine statt Bastei-Rummel – oder die Bastei ganz früh, bevor die Busse kommen.",
 "spots":[
  {"id":"saechsische-schweiz-bastei","name":"Basteibrücke","kind":"natur","lat":50.962,"lon":14.073,"hours":2,"family":true,"summary":"Steinbrücke zwischen Felstürmen hoch über der Elbe."},
  {"id":"saechsische-schweiz-koenigstein","name":"Festung Königstein","kind":"burg","lat":50.919,"lon":14.071,"hours":3,"family":true,"summary":"Riesige Bergfestung auf einem Tafelberg."},
  {"id":"saechsische-schweiz-schrammsteine","name":"Schrammsteine","kind":"berge","lat":50.917,"lon":14.200,"hours":4,"summary":"Felsenrunde mit Leitern und Aussicht; Trittsicherheit nötig."},
  {"id":"saechsische-schweiz-kirnitzschtal","name":"Kirnitzschtalbahn & Lichtenhainer Wasserfall","kind":"natur","lat":50.937,"lon":14.226,"hours":2,"family":true,"summary":"Straßenbahn durchs Tal zum kleinen Wasserfall."},
  {"id":"saechsische-schweiz-toskana","name":"Toskana Therme Bad Schandau","kind":"therme","lat":50.917,"lon":14.153,"hours":3,"indoor":true,"summary":"Therme an der Elbe."}
 ]},
{"id":"dresden","name":"Dresden","region":"Sachsen","country":"DE","lat":51.050,"lon":13.738,
 "kinds":["stadt","kultur","burg","genuss"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Barockstadt mit Frauenkirche, Zwinger und Elbdampfern.",
 "angle":"Elbdampfer nach Pillnitz, zurück mit dem Bus – Schloss und Fluss in einem.",
 "spots":[
  {"id":"dresden-frauenkirche","name":"Frauenkirche","kind":"kultur","lat":51.052,"lon":13.742,"hours":1,"indoor":true,"summary":"Wiederaufgebaute Barockkirche mit Kuppelaufstieg."},
  {"id":"dresden-zwinger","name":"Zwinger & Gemäldegalerie","kind":"kultur","lat":51.053,"lon":13.734,"hours":3,"indoor":true,"summary":"Barocke Anlage mit Alten Meistern."},
  {"id":"dresden-gruenesgewoelbe","name":"Grünes Gewölbe","kind":"kultur","lat":51.053,"lon":13.737,"hours":2,"indoor":true,"summary":"Schatzkammer im Residenzschloss; Zeitfenster-Tickets."},
  {"id":"dresden-pillnitz","name":"Schloss Pillnitz","kind":"burg","lat":51.009,"lon":13.870,"hours":2,"family":true,"summary":"Lustschloss an der Elbe mit Park."},
  {"id":"dresden-pfunds","name":"Pfunds Molkerei","kind":"genuss","lat":51.065,"lon":13.754,"hours":0.5,"indoor":true,"family":true,"summary":"Milchladen mit handbemalten Fliesen."}
 ]},
{"id":"leipzig","name":"Leipzig & Neuseenland","region":"Sachsen","country":"DE","lat":51.340,"lon":12.375,
 "kinds":["stadt","kultur","wasser","familie"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Kreative Stadt mit Seen aus ehemaligen Tagebauen.",
 "angle":"Stadt am Strand: im Sommer vom Zentrum per Rad an den Cospudener See.",
 "spots":[
  {"id":"leipzig-voelkerschlacht","name":"Völkerschlachtdenkmal","kind":"kultur","lat":51.312,"lon":12.413,"hours":1.5,"family":true,"summary":"Monumentales Denkmal mit Aussichtsplattform."},
  {"id":"leipzig-zoo","name":"Zoo Leipzig","kind":"familie","lat":51.349,"lon":12.371,"hours":4,"family":true,"summary":"Großer Zoo mit Tropenhalle Gondwanaland."},
  {"id":"leipzig-spinnerei","name":"Baumwollspinnerei","kind":"kultur","lat":51.329,"lon":12.315,"hours":2,"indoor":true,"summary":"Kunstquartier in alter Fabrik."},
  {"id":"leipzig-cospudener","name":"Cospudener See","kind":"wasser","lat":51.270,"lon":12.340,"hours":3,"family":true,"months":[5,6,7,8,9],"summary":"Badesee mit Hafen am Stadtrand."},
  {"id":"leipzig-panometer","name":"Panometer","kind":"kultur","lat":51.318,"lon":12.402,"hours":1.5,"indoor":true,"family":true,"summary":"360°-Panorama im ehemaligen Gasometer."}
 ]},
{"id":"spreewald","name":"Spreewald","region":"Brandenburg","country":"DE","lat":51.867,"lon":13.966,
 "kinds":["wasser","natur","familie","therme","genuss"],"months":[4,5,6,7,8,9,10],"nights":[1,3],
 "summary":"Kahnfahrten durch Fließe, Gurken und sorbische Dörfer.",
 "angle":"Selbst paddeln statt Kahn: im Kajak durch die stillen Nebenfließe.",
 "spots":[
  {"id":"spreewald-kahn","name":"Kahnfahrt ab Lübbenau","kind":"wasser","lat":51.866,"lon":13.968,"hours":3,"family":true,"summary":"Gestakter Kahn durch die Fließe."},
  {"id":"spreewald-lehde","name":"Freilandmuseum Lehde","kind":"kultur","lat":51.874,"lon":13.989,"hours":1.5,"family":true,"months":[4,5,6,7,8,9,10],"summary":"Historische Spreewaldhöfe, per Boot oder zu Fuß."},
  {"id":"spreewald-paddeln","name":"Paddeln auf den Fließen","kind":"wasser","lat":51.860,"lon":13.950,"hours":3,"family":true,"months":[5,6,7,8,9],"summary":"Kajak oder Kanu beim Verleih vor Ort."},
  {"id":"spreewald-therme","name":"Spreewald Therme Burg","kind":"therme","lat":51.840,"lon":14.150,"hours":3,"indoor":true,"summary":"Solebad im Spreewald."},
  {"id":"spreewald-tropical","name":"Tropical Islands","kind":"familie","lat":52.039,"lon":13.750,"hours":6,"indoor":true,"family":true,"summary":"Tropenhalle in einer ehemaligen Luftschiffhalle."}
 ]},
{"id":"berlin","name":"Berlin & Potsdam","region":"Berlin","country":"DE","lat":52.520,"lon":13.405,
 "kinds":["stadt","kultur","genuss"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[2,5],
 "summary":"Geschichte an jeder Ecke, Museen und Kieze.",
 "angle":"Auf einem ehemaligen Flughafen Fahrrad fahren: das Tempelhofer Feld.",
 "spots":[
  {"id":"berlin-reichstag","name":"Reichstagskuppel","kind":"kultur","lat":52.519,"lon":13.376,"hours":1.5,"family":true,"summary":"Gläserne Kuppel, Online-Anmeldung vorab nötig."},
  {"id":"berlin-museumsinsel","name":"Museumsinsel","kind":"kultur","lat":52.521,"lon":13.397,"hours":4,"indoor":true,"summary":"Fünf Museen auf einer Spreeinsel."},
  {"id":"berlin-mauer","name":"Gedenkstätte Berliner Mauer","kind":"kultur","lat":52.535,"lon":13.390,"hours":2,"family":true,"summary":"Erhaltener Grenzstreifen an der Bernauer Straße."},
  {"id":"berlin-tempelhof","name":"Tempelhofer Feld","kind":"natur","lat":52.473,"lon":13.401,"hours":2,"family":true,"summary":"Ehemaliges Flugfeld als riesige Freifläche."},
  {"id":"berlin-sanssouci","name":"Park Sanssouci Potsdam","kind":"burg","lat":52.404,"lon":13.038,"hours":4,"family":true,"summary":"Schlösser und Gärten Friedrichs des Großen."}
 ]},
{"id":"mueritz","name":"Müritz & Mecklenburgische Seenplatte","region":"Mecklenburg-Vorpommern","country":"DE","lat":53.517,"lon":12.684,
 "kinds":["wasser","natur","familie"],"months":[5,6,7,8,9,10],"nights":[2,7],
 "summary":"Hunderte Seen, Kanutouren und Kraniche im Herbst.",
 "angle":"Hausboot ohne Führerschein auf ausgewiesenen Revieren – Bedingungen beim Vermieter prüfen.",
 "spots":[
  {"id":"mueritz-mueritzeum","name":"Müritzeum Waren","kind":"familie","lat":53.515,"lon":12.682,"hours":2,"indoor":true,"family":true,"summary":"Naturerlebniszentrum mit großem Süßwasseraquarium."},
  {"id":"mueritz-nationalpark","name":"Müritz-Nationalpark","kind":"natur","lat":53.420,"lon":12.820,"hours":4,"family":true,"summary":"Wälder und Seen; im Herbst Kranichrast, Beobachtungsstände."},
  {"id":"mueritz-kanu","name":"Kanutour auf der Seenplatte","kind":"wasser","lat":53.350,"lon":12.980,"hours":5,"family":true,"months":[5,6,7,8,9],"summary":"Mehrtages- oder Tagestouren über verbundene Seen."},
  {"id":"mueritz-baerenwald","name":"Bärenwald Müritz","kind":"familie","lat":53.360,"lon":12.450,"hours":2,"family":true,"summary":"Schutzgebiet für gerettete Bären."}
 ]},
{"id":"ruegen","name":"Rügen","region":"Mecklenburg-Vorpommern","country":"DE","lat":54.400,"lon":13.611,
 "kinds":["wasser","natur","kultur","familie"],"months":[5,6,7,8,9],"nights":[3,7],
 "summary":"Kreidefelsen, Bäderarchitektur und lange Strände.",
 "angle":"Rasender Roland: mit der Schmalspur-Dampfbahn von Seebad zu Seebad.",
 "spots":[
  {"id":"ruegen-koenigsstuhl","name":"Königsstuhl & Kreideküste","kind":"natur","lat":54.574,"lon":13.665,"hours":3,"family":true,"summary":"Kreidefelsen im Nationalpark Jasmund."},
  {"id":"ruegen-granitz","name":"Jagdschloss Granitz","kind":"burg","lat":54.383,"lon":13.625,"hours":1.5,"family":true,"summary":"Schloss im Wald mit Aussichtsturm."},
  {"id":"ruegen-arkona","name":"Kap Arkona","kind":"natur","lat":54.679,"lon":13.433,"hours":2.5,"family":true,"summary":"Nordspitze mit Leuchttürmen."},
  {"id":"ruegen-roland","name":"Rasender Roland","kind":"technik","lat":54.400,"lon":13.600,"hours":2,"family":true,"summary":"Schmalspur-Dampfbahn zwischen Putbus und Göhren."},
  {"id":"ruegen-binz","name":"Strand & Seebrücke Binz","kind":"wasser","lat":54.402,"lon":13.614,"hours":3,"family":true,"summary":"Bäderarchitektur und langer Sandstrand."}
 ]},
{"id":"hamburg","name":"Hamburg","region":"Hamburg","country":"DE","lat":53.550,"lon":9.993,
 "kinds":["stadt","kultur","technik","wasser"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[1,4],
 "summary":"Hafen, Speicherstadt und Elbphilharmonie.",
 "angle":"Hafenrundfahrt mit der Linienfähre: mit der Fähre 62 nach Finkenwerder.",
 "spots":[
  {"id":"hamburg-wunderland","name":"Miniatur Wunderland","kind":"familie","lat":53.544,"lon":9.989,"hours":3,"indoor":true,"family":true,"summary":"Größte Modelleisenbahn der Welt; Zeitfenster vorab buchen."},
  {"id":"hamburg-elphi","name":"Elbphilharmonie Plaza","kind":"kultur","lat":53.541,"lon":9.984,"hours":1,"family":true,"summary":"Öffentliche Aussichtsebene; Zeitfenster prüfen."},
  {"id":"hamburg-faehre62","name":"Hafenfähre Linie 62","kind":"wasser","lat":53.545,"lon":9.970,"hours":1.5,"family":true,"summary":"Linienfähre von den Landungsbrücken elbabwärts."},
  {"id":"hamburg-fischmarkt","name":"Fischmarkt","kind":"genuss","lat":53.545,"lon":9.951,"hours":1.5,"slot":"morgen","family":true,"summary":"Traditionsmarkt am Sonntag in aller Frühe."},
  {"id":"hamburg-speicherstadt","name":"Speicherstadt","kind":"kultur","lat":53.544,"lon":9.993,"hours":1.5,"family":true,"summary":"Backstein-Lagerhäuser an Fleeten, Welterbe."}
 ]},
{"id":"st-peter-ording","name":"Sankt Peter-Ording & Nordfriesland","region":"Schleswig-Holstein","country":"DE","lat":54.305,"lon":8.631,
 "kinds":["wasser","natur","therme","familie"],"months":[4,5,6,7,8,9,10],"nights":[2,7],
 "summary":"Riesiger Sandstrand, Pfahlbauten und Wattenmeer.",
 "angle":"Wattwanderung nur mit Führung und Tidenkalender – der Meeresboden als Wanderweg.",
 "spots":[
  {"id":"st-peter-ording-strand","name":"Strand & Pfahlbauten","kind":"wasser","lat":54.305,"lon":8.610,"hours":3,"family":true,"summary":"Kilometerbreiter Strand mit Pfahlbau-Restaurants."},
  {"id":"st-peter-ording-westerhever","name":"Leuchtturm Westerheversand","kind":"natur","lat":54.373,"lon":8.643,"hours":2,"family":true,"summary":"Bekanntester Leuchtturm Nordfrieslands, Fußweg über den Deich."},
  {"id":"st-peter-ording-watt","name":"Geführte Wattwanderung","kind":"natur","lat":54.320,"lon":8.650,"hours":2.5,"family":true,"months":[4,5,6,7,8,9,10],"summary":"Nur mit kundiger Führung, Termine nach Gezeiten."},
  {"id":"st-peter-ording-therme","name":"Dünen-Therme","kind":"therme","lat":54.318,"lon":8.604,"hours":3,"indoor":true,"family":true,"summary":"Erlebnisbad für Schlechtwetter."},
  {"id":"st-peter-ording-husum","name":"Husum & Hafen","kind":"stadt","lat":54.477,"lon":9.051,"hours":2,"family":true,"summary":"„Graue Stadt am Meer“, im Frühjahr Krokusblüte im Schlosspark."}
 ]},
{"id":"lueneburger-heide","name":"Lüneburger Heide","region":"Niedersachsen","country":"DE","lat":53.190,"lon":9.980,
 "kinds":["natur","familie","stadt"],"months":[5,6,7,8,9,10],"nights":[1,3],
 "summary":"Heideflächen mit Schafen, Kutschfahrten und Freizeitparks.",
 "angle":"Zur Heideblüte (meist August bis September) per Kutsche nach Wilsede – das Dorf ist autofrei.",
 "spots":[
  {"id":"lueneburger-heide-wilsede","name":"Wilsede & Wilseder Berg","kind":"natur","lat":53.170,"lon":9.940,"hours":4,"family":true,"summary":"Autofreies Heidedorf, zu Fuß oder per Kutsche."},
  {"id":"lueneburger-heide-heidepark","name":"Heide Park Soltau","kind":"familie","lat":53.024,"lon":9.877,"hours":7,"family":true,"summary":"Freizeitpark; Saison und Öffnungstage prüfen."},
  {"id":"lueneburger-heide-lueneburg","name":"Altstadt Lüneburg","kind":"stadt","lat":53.249,"lon":10.411,"hours":2.5,"family":true,"summary":"Salzstadt mit schiefen Backsteinhäusern."},
  {"id":"lueneburger-heide-wildpark","name":"Wildpark Lüneburger Heide","kind":"familie","lat":53.312,"lon":9.970,"hours":3,"family":true,"summary":"Großer Wildpark mit heimischen und nordischen Tieren."}
 ]},
{"id":"kassel","name":"Kassel & Edersee","region":"Hessen","country":"DE","lat":51.316,"lon":9.394,
 "kinds":["kultur","natur","wasser","burg"],"months":[4,5,6,7,8,9,10],"nights":[1,3],
 "summary":"Bergpark mit Herkules und Wasserspielen, dazu Stausee und Urwald.",
 "angle":"Den Wasserspielen bergab folgen – vom Herkules bis zur Fontäne, im Sommer an festen Tagen.",
 "spots":[
  {"id":"kassel-herkules","name":"Herkules & Bergpark Wilhelmshöhe","kind":"kultur","lat":51.316,"lon":9.394,"hours":3,"family":true,"summary":"Welterbe-Park mit Riesenfigur und Kaskaden."},
  {"id":"kassel-wasserspiele","name":"Wasserspiele Bergpark","kind":"kultur","lat":51.317,"lon":9.410,"hours":1.5,"family":true,"months":[5,6,7,8,9,10],"summary":"Nur an bestimmten Tagen in der Saison, Termine prüfen."},
  {"id":"kassel-grimmwelt","name":"Grimmwelt","kind":"kultur","lat":51.310,"lon":9.495,"hours":2,"indoor":true,"family":true,"summary":"Museum zu den Brüdern Grimm."},
  {"id":"kassel-edersee","name":"Edersee & Nationalpark Kellerwald","kind":"wasser","lat":51.180,"lon":9.050,"hours":4,"family":true,"summary":"Stausee mit Schloss Waldeck, alte Buchenwälder."}
 ]},
{"id":"luebeck","name":"Lübeck & Travemünde","region":"Schleswig-Holstein","country":"DE","lat":53.866,"lon":10.687,
 "kinds":["stadt","kultur","wasser","genuss"],"months":[4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Hansestadt mit Holstentor, Marzipan und Ostseestrand vor der Tür.",
 "angle":"Stadt am Vormittag, Strand am Nachmittag: Travemünde liegt nur eine kurze Fahrt entfernt.",
 "spots":[
  {"id":"luebeck-holstentor","name":"Holstentor & Altstadtinsel","kind":"stadt","lat":53.866,"lon":10.680,"hours":2,"family":true,"summary":"Wahrzeichen und Welterbe-Altstadt."},
  {"id":"luebeck-hansemuseum","name":"Europäisches Hansemuseum","kind":"kultur","lat":53.872,"lon":10.688,"hours":2.5,"indoor":true,"summary":"Geschichte der Hanse in Inszenierungen."},
  {"id":"luebeck-marzipan","name":"Marzipan-Café","kind":"genuss","lat":53.866,"lon":10.686,"hours":1,"indoor":true,"family":true,"summary":"Lübecker Marzipan probieren."},
  {"id":"luebeck-travemuende","name":"Travemünde & Passat","kind":"wasser","lat":53.962,"lon":10.871,"hours":3,"family":true,"summary":"Strand, Promenade und Viermastbark am Priwall."}
 ]},
{"id":"colmar","name":"Colmar & Elsässer Weinstraße","region":"Elsass","country":"FR","lat":48.079,"lon":7.358,
 "kinds":["stadt","genuss","burg","familie"],"months":[4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Fachwerkdörfer, Weinberge und eine Hochkönigsburg.",
 "angle":"Dorf-Hopping an der Weinstraße: Riquewihr, Eguisheim – und Flammkuchen statt Mittagessen.",
 "spots":[
  {"id":"colmar-petitevenise","name":"Petite Venise","kind":"stadt","lat":48.073,"lon":7.360,"hours":2,"family":true,"summary":"Kanalviertel mit Bootsfahrten."},
  {"id":"colmar-hautkoenigsbourg","name":"Hohkönigsburg (Haut-Kœnigsbourg)","kind":"burg","lat":48.249,"lon":7.345,"hours":2.5,"family":true,"summary":"Rekonstruierte Burg mit Blick über die Rheinebene."},
  {"id":"colmar-riquewihr","name":"Riquewihr","kind":"stadt","lat":48.167,"lon":7.297,"hours":2,"family":true,"summary":"Weinort mit vollständig erhaltener Altstadt."},
  {"id":"colmar-eguisheim","name":"Eguisheim","kind":"genuss","lat":48.043,"lon":7.306,"hours":2,"summary":"Runddorf mit Weinkellern."},
  {"id":"colmar-singes","name":"Montagne des Singes","kind":"familie","lat":48.260,"lon":7.380,"hours":2,"family":true,"months":[3,4,5,6,7,8,9,10,11],"summary":"Affenberg mit freilaufenden Berberaffen; Saison prüfen."}
 ]},
{"id":"strassburg","name":"Straßburg","region":"Elsass","country":"FR","lat":48.583,"lon":7.746,
 "kinds":["stadt","kultur","genuss"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[1,3],
 "summary":"Münster, Petite France und europäische Institutionen.",
 "angle":"Rundfahrt auf der Ill mit Schleusen – die Stadt vom Wasser aus.",
 "spots":[
  {"id":"strassburg-muenster","name":"Straßburger Münster","kind":"kultur","lat":48.582,"lon":7.751,"hours":1.5,"indoor":true,"summary":"Gotisches Münster mit astronomischer Uhr."},
  {"id":"strassburg-petitefrance","name":"Petite France","kind":"stadt","lat":48.581,"lon":7.740,"hours":1.5,"family":true,"summary":"Gerberviertel mit Fachwerk und Kanälen."},
  {"id":"strassburg-boot","name":"Bootsrundfahrt auf der Ill","kind":"wasser","lat":48.581,"lon":7.749,"hours":1.5,"family":true,"summary":"Rundfahrt mit Schleusen bis zum Europaviertel."},
  {"id":"strassburg-europa","name":"Europaviertel","kind":"kultur","lat":48.597,"lon":7.771,"hours":1.5,"summary":"Europaparlament und Europarat; Besuchsmöglichkeiten prüfen."}
 ]},
{"id":"schaffhausen","name":"Rheinfall & Schaffhausen","region":"Schweiz","country":"CH","lat":47.678,"lon":8.615,
 "kinds":["natur","wasser","stadt","burg"],"months":[3,4,5,6,7,8,9,10],"nights":[0,2],
 "summary":"Größter Wasserfall Mitteleuropas und mittelalterliche Städtchen.",
 "angle":"Mit dem Boot zum Felsen mitten im Rheinfall – nichts für Wasserscheue.",
 "spots":[
  {"id":"schaffhausen-rheinfall","name":"Rheinfall","kind":"natur","lat":47.678,"lon":8.615,"hours":2,"family":true,"summary":"Uferwege und Aussichtsplattformen."},
  {"id":"schaffhausen-felsen","name":"Bootsfahrt zum Rheinfallfelsen","kind":"wasser","lat":47.677,"lon":8.617,"hours":1,"family":true,"months":[4,5,6,7,8,9,10],"summary":"Boote nur in der Saison und bei passendem Wasserstand."},
  {"id":"schaffhausen-munot","name":"Munot Schaffhausen","kind":"burg","lat":47.696,"lon":8.638,"hours":1.5,"family":true,"summary":"Runde Festung über der Altstadt."},
  {"id":"schaffhausen-steinamrhein","name":"Stein am Rhein","kind":"stadt","lat":47.660,"lon":8.859,"hours":2,"family":true,"summary":"Bemalte Fassaden am Rathausplatz."}
 ]},
{"id":"luzern","name":"Luzern & Vierwaldstättersee","region":"Schweiz","country":"CH","lat":47.050,"lon":8.309,
 "kinds":["berge","wasser","stadt","technik"],"months":[4,5,6,7,8,9,10,12],"nights":[2,4],
 "summary":"Kapellbrücke, Dampfschiffe und Hausberge mit Zahnradbahnen.",
 "angle":"Goldene Runde: Schiff – steilste Zahnradbahn der Welt – Seilbahn; ein Kreis ohne Rückweg.",
 "spots":[
  {"id":"luzern-kapellbruecke","name":"Kapellbrücke & Altstadt","kind":"stadt","lat":47.052,"lon":8.308,"hours":2,"family":true,"summary":"Gedeckte Holzbrücke mit Wasserturm."},
  {"id":"luzern-verkehrshaus","name":"Verkehrshaus der Schweiz","kind":"technik","lat":47.053,"lon":8.336,"hours":4,"indoor":true,"family":true,"summary":"Großes Verkehrsmuseum mit Planetarium."},
  {"id":"luzern-pilatus","name":"Pilatus","kind":"berge","lat":46.979,"lon":8.255,"hours":5,"family":true,"summary":"Hausberg mit Zahnradbahn ab Alpnachstad (Sommer) und Seilbahn ab Kriens."},
  {"id":"luzern-rigi","name":"Rigi","kind":"berge","lat":47.057,"lon":8.485,"hours":5,"family":true,"summary":"Aussichtsberg mit Zahnradbahnen."},
  {"id":"luzern-schiff","name":"Dampfschiff auf dem Vierwaldstättersee","kind":"wasser","lat":47.050,"lon":8.311,"hours":2,"family":true,"summary":"Historische Raddampfer, Fahrplan prüfen."}
 ]},
{"id":"innsbruck","name":"Innsbruck","region":"Tirol","country":"AT","lat":47.269,"lon":11.404,
 "kinds":["stadt","berge","winter","kultur"],"months":[1,2,3,5,6,7,8,9,10,12],"nights":[1,4],
 "summary":"Alpenstadt, in der man aus der Altstadt direkt ins Hochgebirge fährt.",
 "angle":"Von der Altstadt in 30 Minuten auf über 2.000 m – mit Bahn und Seilbahn, ohne Auto.",
 "spots":[
  {"id":"innsbruck-nordkette","name":"Nordkettenbahnen","kind":"berge","lat":47.307,"lon":11.383,"hours":4,"family":true,"summary":"Standseilbahn und Seilbahn bis auf die Nordkette."},
  {"id":"innsbruck-goldenesdachl","name":"Goldenes Dachl & Altstadt","kind":"stadt","lat":47.269,"lon":11.393,"hours":1.5,"family":true,"summary":"Prunkerker mit vergoldeten Schindeln."},
  {"id":"innsbruck-bergisel","name":"Bergisel-Schanze","kind":"technik","lat":47.248,"lon":11.399,"hours":1.5,"family":true,"summary":"Sprungschanze von Zaha Hadid mit Aussicht."},
  {"id":"innsbruck-swarovski","name":"Swarovski Kristallwelten Wattens","kind":"kultur","lat":47.294,"lon":11.601,"hours":2.5,"indoor":true,"family":true,"summary":"Kunstwelten unter einem begrünten Riesenkopf."},
  {"id":"innsbruck-ambras","name":"Schloss Ambras","kind":"burg","lat":47.256,"lon":11.434,"hours":2,"family":true,"summary":"Renaissanceschloss mit Kunstkammer."}
 ]},
{"id":"salzburg","name":"Salzburg & Salzachtal","region":"Salzburg","country":"AT","lat":47.800,"lon":13.044,
 "kinds":["stadt","kultur","burg","berge","unterwelt"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[1,4],
 "summary":"Barockstadt mit Festung, Mozart und Eishöhle in der Nähe.",
 "angle":"Bei den Wasserspielen Hellbrunn wird man garantiert nass – ein fürstlicher Streich aus dem 17. Jahrhundert.",
 "spots":[
  {"id":"salzburg-festung","name":"Festung Hohensalzburg","kind":"burg","lat":47.795,"lon":13.047,"hours":2.5,"family":true,"summary":"Große Burganlage über der Altstadt, per Festungsbahn."},
  {"id":"salzburg-getreidegasse","name":"Getreidegasse & Mozarts Geburtshaus","kind":"stadt","lat":47.800,"lon":13.043,"hours":2,"family":true,"summary":"Einkaufsgasse mit Zunftschildern."},
  {"id":"salzburg-hellbrunn","name":"Schloss Hellbrunn & Wasserspiele","kind":"burg","lat":47.763,"lon":13.061,"hours":2,"family":true,"months":[4,5,6,7,8,9,10,11],"summary":"Trickbrunnen im Schlosspark; Saison prüfen."},
  {"id":"salzburg-untersberg","name":"Untersbergbahn","kind":"berge","lat":47.723,"lon":13.012,"hours":3,"family":true,"summary":"Seilbahn auf den Hausberg an der Grenze."},
  {"id":"salzburg-eisriesenwelt","name":"Eisriesenwelt Werfen","kind":"unterwelt","lat":47.503,"lon":13.190,"hours":4,"months":[5,6,7,8,9,10],"summary":"Große Eishöhle; nur im Sommerhalbjahr, warme Kleidung, Termine prüfen."}
 ]},
{"id":"zillertal","name":"Zillertal","region":"Tirol","country":"AT","lat":47.167,"lon":11.865,
 "kinds":["berge","winter","natur","genuss","familie"],"months":[1,2,3,4,6,7,8,9,10,12],"nights":[3,7],
 "summary":"Breites Alpental mit Gletscher, Almen und Dampfzug.",
 "angle":"Ganzjährig Schnee: am Hintertuxer Gletscher auch im Herbst noch Skifahren.",
 "spots":[
  {"id":"zillertal-hintertux","name":"Hintertuxer Gletscher","kind":"winter","lat":47.070,"lon":11.680,"hours":6,"family":true,"summary":"Ganzjahres-Skigebiet, Gletscherbahnen."},
  {"id":"zillertal-dampf","name":"Zillertalbahn (Dampfzug)","kind":"technik","lat":47.340,"lon":11.780,"hours":2,"family":true,"months":[5,6,7,8,9,10],"summary":"Dampfzug zwischen Jenbach und Mayrhofen; Fahrtage prüfen."},
  {"id":"zillertal-schlegeis","name":"Schlegeis-Stausee","kind":"wasser","lat":47.040,"lon":11.710,"hours":3,"family":true,"months":[6,7,8,9,10],"summary":"Hochalpenstraße (Maut) zum Stausee, Wanderungen."},
  {"id":"zillertal-sennerei","name":"Erlebnissennerei Zillertal","kind":"genuss","lat":47.181,"lon":11.856,"hours":1.5,"indoor":true,"family":true,"summary":"Schaukäserei mit Hofladen."}
 ]},
{"id":"bregenz","name":"Bregenz & Bregenzerwald","region":"Vorarlberg","country":"AT","lat":47.505,"lon":9.749,
 "kinds":["wasser","berge","kultur","genuss"],"months":[4,5,6,7,8,9,10,12],"nights":[1,3],
 "summary":"Seebühne, Pfänder und Käsedörfer mit moderner Holzarchitektur.",
 "angle":"Käsestraße Bregenzerwald: Sennereien als Stationen einer Genussroute.",
 "spots":[
  {"id":"bregenz-pfaender","name":"Pfänderbahn","kind":"berge","lat":47.509,"lon":9.776,"hours":2.5,"family":true,"summary":"Seilbahn mit Blick über den ganzen Bodensee."},
  {"id":"bregenz-seebuehne","name":"Seebühne & Kunsthaus","kind":"kultur","lat":47.507,"lon":9.739,"hours":2,"summary":"Festspielbühne im See und Kunsthaus von Peter Zumthor."},
  {"id":"bregenz-kaesestrasse","name":"KäseStrasse Bregenzerwald","kind":"genuss","lat":47.400,"lon":9.900,"hours":4,"summary":"Sennereien und Alpen mit Verkostung."},
  {"id":"bregenz-rappenloch","name":"Rappenlochschlucht","kind":"natur","lat":47.378,"lon":9.759,"hours":2,"family":true,"summary":"Schlucht bei Dornbirn; Wegsperrungen prüfen."}
 ]},
{"id":"wien","name":"Wien","region":"Wien","country":"AT","lat":48.208,"lon":16.373,
 "kinds":["stadt","kultur","genuss","burg"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[2,5],
 "summary":"Kaiserliche Prachtstadt mit Kaffeehäusern und Heurigen.",
 "angle":"Wien in drei Takten: Kaffeehaus am Morgen, Schönbrunn am Tag, Heuriger am Abend.",
 "spots":[
  {"id":"wien-schoenbrunn","name":"Schloss Schönbrunn","kind":"burg","lat":48.185,"lon":16.312,"hours":3.5,"family":true,"summary":"Sommerresidenz der Habsburger mit Park und Tiergarten."},
  {"id":"wien-stephansdom","name":"Stephansdom","kind":"kultur","lat":48.208,"lon":16.373,"hours":1,"indoor":true,"summary":"Gotischer Dom im Zentrum."},
  {"id":"wien-prater","name":"Prater & Riesenrad","kind":"familie","lat":48.217,"lon":16.396,"hours":2.5,"family":true,"summary":"Vergnügungspark mit historischem Riesenrad."},
  {"id":"wien-naschmarkt","name":"Naschmarkt","kind":"genuss","lat":48.199,"lon":16.364,"hours":1.5,"slot":"mittag","family":true,"summary":"Markt mit Ständen und Lokalen."},
  {"id":"wien-heuriger","name":"Heuriger in Grinzing","kind":"genuss","lat":48.257,"lon":16.349,"hours":2.5,"slot":"abend","summary":"Weinlokale am Stadtrand."}
 ]},
{"id":"riva","name":"Gardasee-Nord (Riva & Arco)","region":"Trentino","country":"IT","lat":45.886,"lon":10.842,
 "kinds":["wasser","berge","natur","familie"],"months":[4,5,6,7,8,9,10],"nights":[3,7],
 "summary":"Bergkulisse am Nordufer, Wind für Surfer und Wasserfälle.",
 "angle":"Mit der Seilbahn von Malcesine auf den Monte Baldo – oben Alpen, unten Palmen.",
 "spots":[
  {"id":"riva-varone","name":"Cascata del Varone","kind":"natur","lat":45.906,"lon":10.829,"hours":1,"family":true,"summary":"Wasserfall in einer engen Grotte."},
  {"id":"riva-tenno","name":"Lago di Tenno & Canale di Tenno","kind":"wasser","lat":45.937,"lon":10.836,"hours":2.5,"family":true,"summary":"Türkiser Bergsee und mittelalterliches Dorf."},
  {"id":"riva-baldo","name":"Monte Baldo (Seilbahn Malcesine)","kind":"berge","lat":45.764,"lon":10.809,"hours":4,"family":true,"summary":"Drehende Gondeln auf den Bergrücken über dem See."},
  {"id":"riva-arco","name":"Burg Arco","kind":"burg","lat":45.922,"lon":10.884,"hours":2,"family":true,"summary":"Burgruine über Olivenhainen."},
  {"id":"riva-gardaland","name":"Gardaland","kind":"familie","lat":45.455,"lon":10.714,"hours":8,"family":true,"summary":"Großer Freizeitpark am Südufer; Öffnungstage prüfen."}
 ]},
{"id":"meran","name":"Meran & Südtirol","region":"Südtirol","country":"IT","lat":46.671,"lon":11.159,
 "kinds":["natur","therme","genuss","kultur","berge"],"months":[3,4,5,6,7,8,9,10,11,12],"nights":[2,5],
 "summary":"Palmen vor Dreitausendern, Waalwege und Törggelen im Herbst.",
 "angle":"Waalweg-Wandern entlang alter Bewässerungskanäle – eben, schattig, mit Weinblick.",
 "spots":[
  {"id":"meran-trauttmansdorff","name":"Gärten von Schloss Trauttmansdorff","kind":"natur","lat":46.661,"lon":11.183,"hours":3,"family":true,"months":[4,5,6,7,8,9,10,11],"summary":"Botanische Gärten; übliche Saison Frühjahr bis Herbst, prüfen."},
  {"id":"meran-therme","name":"Therme Meran","kind":"therme","lat":46.669,"lon":11.162,"hours":3,"indoor":true,"family":true,"summary":"Therme mitten in der Stadt."},
  {"id":"meran-waalweg","name":"Algunder Waalweg","kind":"natur","lat":46.684,"lon":11.130,"hours":3,"family":true,"summary":"Ebener Weg entlang eines Bewässerungskanals."},
  {"id":"meran-schlosstirol","name":"Schloss Tirol","kind":"burg","lat":46.693,"lon":11.152,"hours":2,"family":true,"summary":"Stammburg Tirols mit Landesmuseum."},
  {"id":"meran-oetzi","name":"Südtiroler Archäologiemuseum (Ötzi)","kind":"kultur","lat":46.499,"lon":11.353,"hours":2,"indoor":true,"family":true,"summary":"Die Gletschermumie in Bozen."}
 ]},
{"id":"prag","name":"Prag","region":"Böhmen","country":"CZ","lat":50.087,"lon":14.421,
 "kinds":["stadt","kultur","burg","genuss"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[2,4],
 "summary":"Goldene Stadt mit Burg, Karlsbrücke und Bierkultur.",
 "angle":"Karlsbrücke bei Sonnenaufgang – fast leer – und zum Ausgleich abends ins Bierlokal.",
 "spots":[
  {"id":"prag-burg","name":"Prager Burg & Veitsdom","kind":"burg","lat":50.090,"lon":14.400,"hours":3,"family":true,"summary":"Größtes geschlossenes Burgareal der Welt."},
  {"id":"prag-karlsbruecke","name":"Karlsbrücke","kind":"stadt","lat":50.086,"lon":14.411,"hours":1,"slot":"morgen","family":true,"summary":"Steinbrücke mit Heiligenfiguren über die Moldau."},
  {"id":"prag-orloj","name":"Altstädter Ring & Astronomische Uhr","kind":"kultur","lat":50.087,"lon":14.421,"hours":1.5,"family":true,"summary":"Mittelalterliche Uhr mit Figurenumzug zur vollen Stunde."},
  {"id":"prag-petrin","name":"Petřín-Hügel","kind":"natur","lat":50.083,"lon":14.395,"hours":2,"family":true,"summary":"Park mit Aussichtsturm und Spiegellabyrinth."},
  {"id":"prag-vysehrad","name":"Vyšehrad","kind":"kultur","lat":50.064,"lon":14.418,"hours":1.5,"family":true,"summary":"Festungshügel mit Friedhof und Moldaublick."}
 ]},
{"id":"amsterdam","name":"Amsterdam","region":"Nordholland","country":"NL","lat":52.373,"lon":4.892,
 "kinds":["stadt","kultur","wasser"],"months":[1,2,3,4,5,6,7,8,9,10,11,12],"nights":[2,4],
 "summary":"Grachten, Museen und Fahrräder.",
 "angle":"Linienfähre hinter dem Hauptbahnhof nach Amsterdam-Noord – ein anderes Amsterdam in fünf Minuten.",
 "spots":[
  {"id":"amsterdam-rijksmuseum","name":"Rijksmuseum","kind":"kultur","lat":52.360,"lon":4.885,"hours":3,"indoor":true,"summary":"Niederländische Meister; Zeitfenster vorab buchen."},
  {"id":"amsterdam-grachten","name":"Grachtenfahrt","kind":"wasser","lat":52.374,"lon":4.900,"hours":1.5,"family":true,"summary":"Rundfahrt auf dem Grachtengürtel."},
  {"id":"amsterdam-noord","name":"Fähre nach Amsterdam-Noord","kind":"wasser","lat":52.379,"lon":4.900,"hours":2,"family":true,"summary":"Fähre über das IJ zu Kreativvierteln."},
  {"id":"amsterdam-zaanseschans","name":"Zaanse Schans","kind":"kultur","lat":52.474,"lon":4.817,"hours":2.5,"family":true,"summary":"Windmühlen und Holzhäuser."},
  {"id":"amsterdam-annefrank","name":"Anne Frank Huis","kind":"kultur","lat":52.375,"lon":4.884,"hours":1.5,"indoor":true,"summary":"Versteck der Familie Frank; nur mit Online-Ticket."}
 ]}
]
};
