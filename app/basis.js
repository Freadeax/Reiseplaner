/* Reiseplaner · Grundlagen, Katalog Allgäu & Tirol, Hilfen.
   Teil 1 von 17 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Grundlagen ================= */
const TYPES={winter:'Winter & Schnee',stadt:'Städtetrip',strand:'Bade- & Sommerurlaub',wochenende:'Wochenende',tag:'Tagesausflug',rund:'Rundreise'};
const STATUS={idee:'Idee',planung:'In Planung',gebucht:'Gebucht',vorbei:'Vorbei'};
const SLOTS=[['morgen','Vormittag'],['mittag','Mittag'],['nachm','Nachmittag'],['abend','Abend']];
const SLOTNAME=Object.fromEntries(SLOTS);
const CAT={schnee:'Schneesport',wellness:'Wellness',ausflug:'Ausflüge',genuss:'Genuss & Feiern',eigen:'Eigene'};
const CATCOL={schnee:'var(--c1)',wellness:'var(--c4)',ausflug:'var(--c5)',genuss:'var(--c6)',eigen:'var(--c7)'};
const COSTCAT={unterkunft:['Unterkunft','var(--c1)'],anreise:['Anreise','var(--c2)'],schnee:['Schneesport','var(--c3)'],wellness:['Wellness','var(--c4)'],ausflug:['Ausflüge','var(--c5)'],genuss:['Genuss & Feiern','var(--c6)'],essen:['Essen','var(--c7)'],gebuehren:['Kurtaxe & Gebühren','var(--c2)'],eigen:['Eigene Posten','var(--c7)'],puffer:['Puffer','var(--c7)']};
const FOOD={selbst:['Selbst kochen',20,'Einkauf, Snacks, 1× essen gehen'],gemischt:['Gemischt',30,'Frühstück selbst, abends oft auswärts'],auswaerts:['Meist auswärts',45,'Mittag und Abend im Gasthof']};
const RENT_SET={1:28,2:53,3:78,4:101,5:123}, RENT_HELM={1:4,2:8,3:12,4:16,5:20};
const WD=['So','Mo','Di','Mi','Do','Fr','Sa'];

/* ================= Katalog: Allgäu & Tirol Winter ================= */
const PLACES={
 oberjoch:{name:'Oberjoch / Bad Hindelang',region:'Allgäu · Bayern',km:195,min:120,time:'ca. 2 Std.',local:40,taxe:3,
   card:'Bad Hindelang PLUS',cardPass:true,passDay:52.5,passSrc:'Tageskarte 25/26',onlineRent:true,
   kurs:{1:60,2:115,3:150},kursSrc:'ok',school:'Skischule Iseler',
   short:'Höchster Skiort im Allgäu. Skipass, Rodelbahn-Gondel und Erlebnisbad in der Gästekarte.',
   pros:['Skipass in der Gästekarte','Skischule mit eigenem Übungsgelände','Tirol 5 Minuten entfernt'],cons:['Kleines Dorf, wenig Abendprogramm','Karte nur bei PLUS-Partnern'],
   route:'A8 → Ulm, A7 bis Oy-Mittelberg, B310 über Wertach (nicht über die kurvige Jochstraße)',map:'Oberjoch, Bad Hindelang',
   portal:[['Unterkunftssuche Bad Hindelang','https://www.badhindelang.de/buchen'],['FeWos Oberjoch (Holidu)','https://www.holidu.de/ferienwohnungen-orte/deutschland/oberjoch']]},
 oberstaufen:{name:'Oberstaufen / Steibis',region:'Allgäu · Bayern',km:180,min:115,time:'ca. 1 Std. 55',local:40,taxe:3,
   card:'Oberstaufen PLUS',cardPass:true,passDay:44,passSrc:'Hochgrat 25/26',onlineRent:false,
   kurs:{1:65,2:125,3:170},kursSrc:'est',school:'Skischule Steibis',
   short:'Wellness-Ort mit Aquaria. Skipass in der Gästekarte, aber nur eine Top-Leistung pro Tag.',
   pros:['Viele Wellnesshäuser, Aquaria mit Solebad','Lebendiger Ort'],cons:['Tiefer gelegen, Schnee unsicherer','Skipass oder Bad pro Tag'],
   route:'A8 → Ulm, A7 bis Dreieck Allgäu, B19 → Immenstadt, B308 → Oberstaufen',map:'Steibis, Oberstaufen',
   portal:[['Oberstaufen Tourismus','https://www.oberstaufen.de/'],['Lifte Imberg & Hündle','https://www.huendle-imberg.de/winter/imberg/']]},
 balder:{name:'Balderschwang',region:'Allgäu · Bayern',km:200,min:140,time:'ca. 2 Std. 20',local:30,taxe:3,
   card:'',cardPass:false,passTable:{1:49,2:94,3:135},passSrc:'26/27 (3 Tage geschätzt)',onlineRent:false,
   kurs:{1:60,2:110,3:150},kursSrc:'est',school:'Schneesportschule Balderschwang',
   short:'Ruhiges Bergdorf am Riedbergpass. Günstiger Skipass, viel Natur, Hütten in der Nähe.',
   pros:['Skipass 49 € / Tag','Sehr ruhig','Ferienwohnungen mit Sauna günstig'],cons:['Anfahrt über steilen Riedbergpass','Kaum Restaurants'],
   route:'A8 → Ulm, A7 bis Dreieck Allgäu, B19 → Fischen, über Obermaiselstein und den Riedbergpass (Ketten dabei)',map:'Balderschwang',
   portal:[['FeWos Balderschwang (Airbnb)','https://www.airbnb.de/balderschwang-germany/stays/apartments']]},
 tannheim:{name:'Tannheimer Tal',region:'Tirol · Österreich',km:210,min:135,time:'ca. 2 Std. 15',local:40,taxe:3,
   card:'',cardPass:false,passTable:{1:54,2:103,3:146},passSrc:'26/27',onlineRent:false,
   kurs:{1:65,2:125,3:170},kursSrc:'est',school:'Skischulen in Grän und Tannheim',
   short:'Weites Hochtal mit Seen und Loipen. Appartements mit Sauna, Skipass 54 € / Tag.',
   pros:['Haldensee, Vilsalpsee, Loipen','Appartements mit Sauna'],cons:['Skipass kostet extra','Gruppenkurspreise nicht online'],
   route:'A8 → Ulm, A7 bis Oy-Mittelberg, B310 über Wertach und Oberjoch nach Grän (Bundesstraße, keine Vignette)',map:'Tannheim, Tirol',
   portal:[['FeWos Tannheimer Tal (Liste)','https://www.alpen-guide.de/urlaub/tannheimertal/ferienwohnung'],['Tannheimer Tal Tourismus','https://www.tannheimertal.com/']]}
};
/* Unterkünfte: ab = Inseratspreis, plan = Planwert Silvester pro Nacht (Inserat +15 %, geschätzt) */
const STAYS=[
 {id:'oj-holidu',place:'oberjoch',name:'FeWo direkt am Skilift',ort:'Oberjoch',info:'66 m², moderne Ausstattung, Dorfladen nebenan',ab:'ab 129 € / Nacht (Wohnung)',plan:148,card:true,sauna:false,kitchen:true,breakfast:false,url:'https://www.holidu.de/d/52796337',map:'Oberjoch Bad Hindelang'},
 {id:'oj-fuegen',place:'oberjoch',name:'Fügenschuh’s Ferienwohnung 2',ort:'Bad Oberdorf',info:'61 m², bis 4 Gäste, Skibus nach Oberjoch',ab:'Preis erst nach Datum',plan:110,planEst:true,card:true,sauna:false,kitchen:true,breakfast:false,url:'https://www.traum-ferienwohnungen.de/98418/',map:'Bad Oberdorf, Bad Hindelang'},
 {id:'oj-haug',place:'oberjoch',name:'Haus Haug',ort:'Bad Hindelang',info:'Ferienwohnung, Lage an der Loipe',ab:'ab 29 € p. P. / Nacht',plan:67,card:'?',sauna:false,kitchen:true,breakfast:false,url:'https://www.schneehoehen.de/hotel/FERATEL-f1522ede-7a4e-4bbf-9efd-96c084f50b40',map:'Oberer Buigenweg 11, 87541 Bad Hindelang'},
 {id:'oj-berktold',place:'oberjoch',name:'Haus Berktold',ort:'Bad Hindelang',info:'3 Ferienwohnungen, zentrale Lage',ab:'ab 42,50 € p. P. / Nacht',plan:98,card:'?',sauna:false,kitchen:true,breakfast:false,url:'https://www.schneehoehen.de/hotel/FERATEL-4f72048e-78d3-4a71-aa9a-d53fd57fa76a',map:'Gerberweg 2, 87541 Bad Hindelang'},
 {id:'oj-schwanden',place:'oberjoch',name:'Schwandenhof Ferienwohnungen',ort:'Bad Hindelang',info:'5 Wohnungen, Brötchenservice, Skiraum, ≈ 4 km zum Lift',ab:'ab 95 € / Nacht (Wohnung)',plan:109,card:'?',sauna:false,kitchen:true,breakfast:false,url:'https://www.schneehoehen.de/hotel/FERATEL-9868dc68-77d3-4055-b507-9605749d40ee',map:'Schwandenhof Bad Hindelang'},
 {id:'oj-bergbuddies',place:'oberjoch',name:'BergBuddies Smarthotel',ort:'Oberjoch, Paßstraße 36',info:'Komfortstube, Sauna Cube, Hot Tub, 2 Gehminuten zum Lift, Frühstück',ab:'Komfortstube ab 94,90 € p. P.',plan:218,card:true,sauna:true,kitchen:false,breakfast:true,url:'https://www.schneehoehen.de/hotel/FERATEL-52193f5f-f7ec-434a-bd7e-ee0f1712186b',map:'BergBuddies Oberjoch'},
 {id:'os-holidu',place:'oberstaufen',name:'All-Inkl.-FeWo mit Sauna & Whirlpool',ort:'Oberstaufen',info:'49 m², Sauna, Whirlpool, beheizter Pool, direkt am Skilift',ab:'ab 101 € / Nacht (Wohnung)',plan:116,card:true,sauna:true,kitchen:true,breakfast:false,url:'https://www.holidu.de/d/46825651',map:'Oberstaufen'},
 {id:'os-schoen',place:'oberstaufen',name:'Ferienwohnung „Schön Hier“',ort:'Steibis',info:'42 m², 150 m zum Lift, Sauna gegen Gebühr',ab:'Preis erst nach Datum',plan:95,planEst:true,card:true,sauna:true,kitchen:true,breakfast:false,url:'https://www.traum-ferienwohnungen.de/ferienwohnung/275444/',map:'Steibis, Oberstaufen'},
 {id:'bs-waeldle',place:'balder',name:'Haus im Wäldle',ort:'Balderschwang, Wäldle 91',info:'2 Ferienwohnungen, Sauna, an der Loipe, Brötchenservice',ab:'ab 23,20 € p. P. / Nacht',plan:53,card:false,sauna:true,kitchen:true,breakfast:false,url:'https://www.schneehoehen.de/hotel/FERATEL-14ef3676-b1da-4578-8e0d-7871a63e4977',map:'Wäldle 91, 87538 Balderschwang'},
 {id:'bs-alpenroesle',place:'balder',name:'Alpenrösle Ferienwohnungen',ort:'Balderschwang, Oberberg 4',info:'48–62 m², Sauna, Dampfbad, Massagen',ab:'ab 95 € / Nacht (Wohnung)',plan:109,card:false,sauna:true,kitchen:true,breakfast:false,url:'https://www.schneehoehen.de/hotel/FERATEL-09bd43f5-c771-42a3-b850-0c8e0c5173b3',map:'Oberberg 4, 87538 Balderschwang'},
 {id:'tt-rosemarie',place:'tannheim',name:'Haus Rosemarie',ort:'Nesselwängle-Haller',info:'Appartements mit Sauna, am Haldensee',ab:'ab 76 € / Nacht',plan:87,card:false,sauna:true,kitchen:true,breakfast:false,url:'https://booking.alpen-guide.de/app/de/detail/6-72364',map:'Haus Rosemarie Nesselwängle'},
 {id:'tt-braito',place:'tannheim',name:'Gästehaus Apart Braito',ort:'Grän-Haldensee',info:'Appartement mit Sauna',ab:'ab 97 € / Nacht',plan:112,card:false,sauna:true,kitchen:true,breakfast:false,url:'https://booking.alpen-guide.de/app/de/detail/6-72312',map:'Apart Braito Grän'},
 {id:'tt-bilgeri',place:'tannheim',name:'Haus Bilgeri Appartements',ort:'Tannheim',info:'Appartements mit Sauna',ab:'ab 114 € / Nacht',plan:131,card:false,sauna:true,kitchen:true,breakfast:false,url:'https://booking.alpen-guide.de/app/de/detail/6-72044',map:'Haus Bilgeri Tannheim'}
];
/* Preisabfragen bei den Buchungsportalen (Live-Preis für konkrete Daten), Stand 14.10.2026.
   Je Eintrag: Anreise, Abreise, Gesamtpreis für 2 Erwachsene. Momentaufnahmen, keine Verfügbarkeits- oder Preiszusage.
   Nur exakte Portalpreise; Holidu (nur geschätzter Preis) und Deskline-Inserate (aus der Recherche-Umgebung nicht erreichbar) fehlen bewusst. */
const PRICE_CHECKED='2026-10-14';
const PRICE_SAMPLES={
 'oj-fuegen':{src:'https://www.traum-ferienwohnungen.de/98418/',incl:'inkl. Endreinigung, Bettwäsche, Handtücher; Kurbeitrag extra',
   s:[['2026-12-30','2027-01-03',680],['2027-01-11','2027-01-15',680],['2027-02-01','2027-02-05',680],['2027-03-08','2027-03-12',680],['2027-05-10','2027-05-14',680],['2027-08-02','2027-08-06',680],['2027-10-04','2027-10-08',680]]},
 'os-schoen':{src:'https://www.traum-ferienwohnungen.de/ferienwohnung/275444/',incl:'inkl. 60 € Endreinigung (vor Ort zu zahlen); Kurbeitrag extra; für 30.12.–03.01. kein Preis abrufbar',
   s:[['2027-01-11','2027-01-15',500],['2027-02-01','2027-02-05',500],['2027-03-08','2027-03-12',460],['2027-05-10','2027-05-14',500],['2027-08-02','2027-08-06',500],['2027-10-04','2027-10-08',460]]},
 'tt-rosemarie':{src:'https://booking.alpen-guide.de/app/de/detail/6-72364',incl:'Appartement 2 (30 m², 1–2 Pers.); Kurtaxe vor Ort; Endreinigung nicht gesondert ausgewiesen',
   s:[['2026-11-02','2026-11-06',467.23]]},
 'tt-braito':{src:'https://booking.alpen-guide.de/app/de/detail/6-72312',incl:'günstigstes Apartment (Nr. 2); Kurtaxe vor Ort; Endreinigung nicht gesondert ausgewiesen',
   s:[['2027-03-08','2027-03-12',543.29],['2027-05-10','2027-05-14',496.32],['2027-10-04','2027-10-08',496.32]]},
 'tt-bilgeri':{src:'https://booking.alpen-guide.de/app/de/detail/6-72044',incl:'günstigstes freies Appartement; Kurtaxe vor Ort; Endreinigung nicht gesondert ausgewiesen',
   s:[['2026-11-02','2026-11-06',514.2],['2027-03-08','2027-03-12',490.71],['2027-05-10','2027-05-14',514.2],['2027-07-12','2027-07-16',514.2],['2027-10-04','2027-10-08',514.2]]}
};
/* Inserate, die bei der Prüfung nicht mehr auffindbar waren (HTTP 404 auf allen hinterlegten Portalen). */
const STAY_GONE={'oj-haug':'2026-10-14'};
STAYS.forEach(st=>{const x=PRICE_SAMPLES[st.id];st.samples=x?x.s.map(r=>({from:r[0],to:r[1],total:r[2],adults:2,src:x.src,incl:x.incl,checked:PRICE_CHECKED})):[];if(STAY_GONE[st.id])st.gone=STAY_GONE[st.id]});
/* Unternehmungen */
const L=(l,u)=>[l,u];
const ACTS={};
function A(id,place,cat,t,o){ACTS[id]=Object.assign({id,place,cat,t,src:'est',slot:'nachm',dur:'',ort:'',s:'',steps:[],tips:[],bring:[],links:[],map:''},o)}
const WONNE_RULES=[{date:'12-31',bad:['abend'],msg:'Silvester nur 10–17 Uhr geöffnet'},{date:'01-01',bad:['morgen'],msg:'Neujahr erst ab 12 Uhr geöffnet'}];
const KURS=(place,school,addr,link,map,src)=>({kurs:true,gear:true,book:true,slot:'morgen',dur:'3 Std.',ort:school,src,hours:'vormittags, täglich',s:'Gruppe mit max. 6–8 Personen, Ski oder Snowboard zum gleichen Preis',
  steps:['Rund 45 Minuten vor Kursbeginn an der Skischule sein'+(addr?' ('+addr+')':''),'Ausrüstung im Verleih abholen: Ski bzw. Board, Schuhe, Helm','Kurs in der Gruppe, Anfänger starten auf dem Übungsgelände','Danach Mittagspause, nachmittags frei'],
  tips:['Anfänger brauchen am 1. Kurstag meist keinen Skipass','Kurstage möglichst am Stück buchen','Früh buchen, Weihnachtsferien sind gefragt'],bring:['Skihose, Jacke, Handschuhe, Mütze','Skibrille','Sonnencreme'],links:link,map});
A('oj-kurs','oberjoch','schnee','Gruppenkurs Ski oder Snowboard',Object.assign(KURS('oberjoch','Skischule Iseler','Passstraße 22, direkt an der Piste',[L('Kurs online buchen','https://www.skischule-iseler.de/angebote.html'),L('Preise','https://www.skischule-iseler.de/preise.html')],'Skischule Iseler Oberjoch','ok'),{hours:'10–13 Uhr, täglich'}));
A('oj-ueben','oberjoch','schnee','Übungstag ohne Lehrer',{gear:true,pass:true,slot:'morgen',dur:'halber Tag',ort:'Anfängerpisten Oberjoch',src:'plus',s:'Gelerntes festigen, Skipass über die Gästekarte',steps:['Ausrüstung einen Tag länger behalten','Auf der Übungswiese warmfahren','Leichte Pisten mit den Übungen aus dem Kurs','Mittags Schluss, nachmittags Wellness'],tips:['Nach dem Kurs am besten direkt am nächsten Tag üben'],links:[L('Bergbahnen Oberjoch','https://www.bergbahnen-hindelang-oberjoch.de/')],map:'Iselerbahn Oberjoch'});
A('oj-privat','oberjoch','schnee','Privatstunde in der anderen Sportart',{gear:true,book:true,grp:85,slot:'mittag',dur:'1 Std.',ort:'Skischule Iseler',src:'ok',s:'Snowboard bzw. Ski zu zweit mit Lehrer testen',steps:['Termin bei der Skischule anfragen','1 Stunde zu zweit: 75 € + 10 € für die zweite Person','Danach wisst ihr, was euch mehr liegt'],tips:['Einzelstunden buchbar 08:45–09:45 und 12:00–14:00 Uhr'],links:[L('Skischule Iseler','https://www.skischule-iseler.de/privat.html')],map:'Skischule Iseler Oberjoch'});
A('oj-langlauf','oberjoch','schnee','Langlauf ausprobieren',{pp:15,slot:'morgen',dur:'2–3 Std.',ort:'Loipen rund um Oberjoch',s:'Ohne Kurs, ohne Lift, sanfter Einstieg in den Wintersport',steps:['Langlaufski leihen (≈ 15 € p. P., geschätzt)','Auf einer flachen Loipe starten','Kurze Etappen mit Pausen'],tips:['Über 100 km gespurte Loipen','Ist anstrengender als es aussieht, Wasser mitnehmen'],links:[L('Skischule Iseler: Langlauf','https://www.skischule-iseler.de/langlauf.html')],map:'Loipe Oberjoch'});
A('oj-schneeschuh','oberjoch','schnee','Geführte Schneeschuh-Tour',{pp:40,ppKurs:35,book:true,slot:'nachm',dur:'2 Std.',ort:'Skischule Iseler',src:'ok',dow:[4],hours:'donnerstags 14–16 Uhr',s:'Mit Guide durch den Winterwald, Material inklusive',steps:['Bei der Skischule anmelden','14:00 Treffpunkt Skischule Iseler','2 Stunden Tour, Schneeschuhe und Stöcke inklusive'],tips:['Kursteilnehmer zahlen 35 € statt 40 €','Läuft nur donnerstags, 31.12.2026 ist ein Donnerstag'],bring:['Wasserdichte Winterschuhe','Thermoskanne'],links:[L('Schneeschuh-Infos','https://www.skischule-iseler.de/schneeschuhe.html')],map:'Skischule Iseler Oberjoch'});
A('oj-rodeln','oberjoch','ausflug','Rodeln an der Hornbahn',{pp:15,cardPp:5,slot:'nachm',dur:'2–3 Std.',ort:'Hornbahn Bad Hindelang',src:'plus',km:16,s:'Gondel hoch, drei Rodelbahnen runter',steps:['Schlitten leihen (5 € p. P. bei der Skischule)','Mit der Hornbahn hochfahren, mit PLUS frei','Abfahrt über eine der Rodelbahnen','Oben Panorama-Winterweg anhängen'],tips:['Ohne Gästekarte kostet die Bahn extra (geschätzt)'],bring:['Wasserdichte Handschuhe'],links:[L('Bergbahnen','https://www.bergbahnen-hindelang-oberjoch.de/')],map:'Hornbahn Bad Hindelang'});
A('oj-panorama','oberjoch','ausflug','Panorama-Winterweg',{pp:10,cardPp:0,slot:'morgen',dur:'1–2 Std.',ort:'Hornbahn-Bergstation',src:'plus',km:16,s:'Flacher, geräumter Weg mit Blick ins Ostrachtal',steps:['Mit der Hornbahn hoch','Winterweg in eurem Tempo','Einkehr an der Bergstation'],links:[L('Bergbahnen','https://www.bergbahnen-hindelang-oberjoch.de/')],map:'Hornbahn Bergstation Bad Hindelang'});
A('oj-plus','oberjoch','ausflug','PLUS-Erlebnis mit Guide',{pp:0,slot:'morgen',dur:'je nach Angebot',ort:'Bad Hindelang',src:'plus',book:true,s:'Geführte Schneeschuhwanderung, Skitour oder Slalom aus dem Gästekarten-Programm',steps:['Programm der Woche auf der PLUS-Seite ansehen','Platz reservieren','Mit Gästekarte teilnehmen'],tips:['Termine wechseln wöchentlich'],links:[L('PLUS-Erlebnisse','https://www.badhindelang.de/bad-hindelang-plus/exklusive-erlebnisse/erlebnisse')]});
A('oj-tannheim','oberjoch','ausflug','Winterwanderung Haldensee',{pp:0,slot:'morgen',dur:'2 Std.',ort:'Tannheimer Tal (AT), 10 Min.',km:30,s:'Flache Seerunde in Tirol, ohne Autobahn und Vignette',steps:['Über Oberjoch nach Grän fahren','Parken am Haldensee','Runde um den See, Einkehr am Ufer'],links:[L('Tannheimer Tal','https://www.tannheimertal.com/')],map:'Haldensee Tirol'});
A('oj-hinterstein','oberjoch','ausflug','Spaziergang Hintersteiner Tal',{pp:0,slot:'nachm',dur:'2 Std.',ort:'Hinterstein, 20 Min.',km:20,s:'Stilles Seitental, im Ort das Kutschenmuseum',steps:['Nach Hinterstein fahren','Talweg spazieren','Rückweg mit Einkehr'],map:'Hinterstein Bad Hindelang'});
A('oj-ort','oberjoch','genuss','Kaffee & Kuchen in Bad Hindelang',{pp:9,indoor:true,slot:'nachm',dur:'1,5 Std.',ort:'Ortskern Bad Hindelang',km:16,s:'Bummel durchs Dorf mit dem Dreikugelhaus von 1671',steps:['Ortskern ansehen','In ein Café einkehren'],map:'Dreikugelhaus Bad Hindelang'});
A('oj-fuessen','oberjoch','ausflug','Füssen & Neuschwanstein von außen',{pp:8,slot:'nachm',dur:'halber Tag',ort:'Füssen, ≈ 45 Min.',km:90,s:'Altstadt, Lechfall und Blick auf die Königsschlösser',steps:['Nach Füssen fahren','Altstadt und Lechfall','Optional zum Aussichtspunkt bei Schwangau'],map:'Altstadt Füssen'});
A('oj-klamm','oberjoch','ausflug','Breitachklamm im Eis',{pp:7.5,grp:5,slot:'morgen',dur:'2 Std.',ort:'Oberstdorf, ≈ 40 Min.',km:76,src:'ok',hours:'täglich 9–16 Uhr, wetterabhängig',s:'Eisvorhänge in der tiefsten Felsschlucht Mitteleuropas',steps:['Parken P1 Tiefenbach (5 €)','Eintritt 7,50 € p. P.','Durch die Klamm und zurück, ≈ 2 Std.'],tips:['Fackelwanderung dienstags und freitags 19 Uhr, 1.1.2027 ist ein Freitag','Bei Tauwetter kurzfristig gesperrt'],bring:['Grödel oder Spikes','Wasserfeste Jacke'],links:[L('Breitachklamm','https://www.breitachklamm.com/')],map:'Breitachklamm Oberstdorf'});
A('oj-wbad','oberjoch','wellness','Wonnemar: Erlebnisbad',{pp:22.9,cardPp:0,indoor:true,slot:'nachm',dur:'3–4 Std.',ort:'Sonthofen, ≈ 25 Min.',km:50,src:'plus',rules:WONNE_RULES,hours:'10–21 Uhr · Silvester 10–17 · Neujahr 12–22',s:'Wellenbecken, Thermalbereich, mit PLUS-Karte frei',steps:['Gästekarte an der Kasse zeigen','Bad, Wellenbecken, Whirlpool'],tips:['Saunawelt ist nicht inklusive, siehe „Wonnemar: Saunawelt“'],bring:['Badesachen','Handtuch (Leihe 5 €)'],links:[L('Eintrittspreise','https://www.wonnemar.de/sonthofen/wonnemar/eintrittspreise/')],map:'Wonnemar Sonthofen'});
A('oj-wsauna','oberjoch','wellness','Wonnemar: Saunawelt',{pp:27.9,indoor:true,slot:'nachm',dur:'4 Std.',ort:'Sonthofen, ≈ 25 Min.',km:50,src:'ok',rules:WONNE_RULES,hours:'10–21 Uhr · Silvester 10–17 · Neujahr 12–22',s:'Panorama-, Erd- und Blockhaussauna, 4 Std. 25,90 € + 2 € Ferienzuschlag',steps:['4-Stunden-Karte Saunawelt kaufen','Saunagänge mit Ruhepausen','Optional Thermalbereich +11,90 €'],tips:['Bademantel leihen 8 €','Parken 4 €, an der Kasse 1,50 € zurück'],bring:['Bademantel, 2 Handtücher','Schlappen'],links:[L('Eintrittspreise','https://www.wonnemar.de/sonthofen/wonnemar/eintrittspreise/')],map:'Wonnemar Sonthofen'});
A('oj-kristall','oberjoch','wellness','Kristall-Therme Schwangau',{pp:36,indoor:true,slot:'nachm',dur:'4 Std.',ort:'Schwangau, ≈ 45 Min.',km:90,src:'est',warn:'Website meldet derzeit „vorübergehend geschlossen“. Vorher anrufen: 08362 92694-0',hours:'laut Plan Silvester 9–18 · Neujahr 10–22',s:'Thermalsole und Saunalandschaft, 4 Std. mit Sauna 36 € p. P.',steps:['Vorher Öffnung telefonisch prüfen','4-Stunden-Karte mit Sauna'],links:[L('Kristall-Therme','https://www.kristalltherme-schwangau.de/')],map:'Kristalltherme Schwangau'});
/* Oberstaufen */
A('os-kurs','oberstaufen','schnee','Gruppenkurs Ski oder Snowboard',KURS('oberstaufen','Skischule Steibis','Anfänger an den Starenliften Schindelberg',[L('Skischule Steibis','https://www.checkyeti.com/de/d/1906/14201'),L('Skischule Oberstaufen','https://www.skischule-oberstaufen.de/')],'Starenlifte Schindelberg Oberstaufen','est'));
A('os-ueben','oberstaufen','schnee','Übungstag ohne Lehrer',{gear:true,pass:true,slot:'morgen',dur:'halber Tag',ort:'Skiarena Steibis',src:'plus',s:'Skipass über Oberstaufen PLUS, zählt als Top-Leistung des Tages',steps:['Ausrüstung einen Tag länger leihen','Leichte Pisten in Steibis'],links:[L('Imberg & Hündle','https://www.huendle-imberg.de/winter/imberg/')],map:'Imbergbahn Steibis'});
A('os-aquaria','oberstaufen','wellness','Aquaria: Saunen & Solebad',{pp:33,cardPp:0,top:true,indoor:true,slot:'nachm',dur:'3–4 Std.',ort:'Oberstaufen',src:'plus',hours:'täglich 9–22 Uhr',s:'3 Aufgusssaunen, 34 °C Solebad draußen, Sauna nur für Erwachsene',steps:['Gästekarte zeigen (an Tagen ohne Skipass frei)','Solebad draußen, dann Saunagänge'],tips:['An Skitagen zählt der Skipass als Top-Leistung, dann zahlt ihr 33 € p. P.'],bring:['Badesachen, Bademantel'],links:[L('Aquaria','https://www.alpen-guide.de/reisefuehrer/poi/erlebnisbad-aquaria-oberstaufen')],map:'Aquaria Oberstaufen'});
A('os-eis','oberstaufen','ausflug','Eislaufen im Ortspark',{pp:10,cardPp:6,slot:'nachm',dur:'1–2 Std.',ort:'Oberstaufen PARK',src:'plus',s:'Kunsteisplatz mit PLUS frei, samstags Eisdisco',steps:['Schlittschuhe leihen (geschätzt 6 €)','Eislaufen, danach Glühwein'],links:[L('Eislaufen','https://www.oberstaufen.de/eislaufen')],map:'Oberstaufen Park'});
A('os-hochgrat','oberstaufen','ausflug','Hochgrat-Panoramaweg',{pp:20,cardPp:0,top:true,slot:'morgen',dur:'2–3 Std.',ort:'Hochgratbahn',src:'plus',km:15,s:'Mit der Gondel hoch, Winterweg mit Weitblick',steps:['Hochgratbahn hoch (mit PLUS frei, zählt als Top-Leistung)','Winter-Panoramaweg','Einkehr oben'],links:[L('Hochgratbahn','http://hochgrat.de/')],map:'Hochgratbahn Oberstaufen'});
A('os-alpsee','oberstaufen','ausflug','Spaziergang Großer Alpsee',{pp:0,slot:'morgen',dur:'2 Std.',ort:'bei Immenstadt, 15 Min.',km:30,s:'Winterspaziergang am größten Natursee des Allgäus',steps:['Nach Bühl am Alpsee fahren','Uferweg spazieren'],map:'Großer Alpsee Bühl'});
A('os-langlauf','oberstaufen','schnee','Flutlicht-Langlauf',{pp:15,slot:'nachm',dur:'2 Std.',ort:'Loipe Kalzhofer, Oberstaufen',s:'Langlauf ohne Kurs, abends auf beleuchteter Loipe',steps:['Langlaufski leihen (geschätzt 15 € p. P.)','Flache Runden auf der Flutlichtloipe'],links:[L('Langlauf Oberstaufen','https://www.oberstaufen.de/langlaufen')],map:'Kalzhofer Loipe Oberstaufen'});
A('os-wsauna','oberstaufen','wellness','Wonnemar: Saunawelt',Object.assign({},ACTS['oj-wsauna'],{id:'os-wsauna',place:'oberstaufen',ort:'Sonthofen, ≈ 30 Min.',km:60}));
/* Balderschwang */
A('bs-kurs','balder','schnee','Gruppenkurs Ski oder Snowboard',KURS('balder','Schneesportschule Balderschwang','',[L('Schneesportschule','https://www.checkyeti.com/de/d/1164/8220')],'Balderschwang Skilift','est'));
A('bs-ueben','balder','schnee','Übungstag ohne Lehrer',{gear:true,pass:true,slot:'morgen',dur:'halber Tag',ort:'Lifte Balderschwang',src:'ok',s:'Skipass 49 € / Tag',steps:['Tageskarte an der Kasse','Leichte Pisten'],links:[L('Skipass','https://www.schneehoehen.de/skigebiete/preise/balderschwang')],map:'Balderschwang Skilift'});
A('bs-riedberg','balder','ausflug','Winterwanderung Riedberger Horn',{pp:0,slot:'morgen',dur:'2–3 Std.',ort:'Riedbergpass, 10 Min.',km:10,s:'Aussichtsberg mit Einkehr in der Grasgehren-Hütte',steps:['Parken am Riedbergpass','Aufstieg mit Grödeln','Einkehr Grasgehren'],bring:['Grödel','Stirnlampe für den Rückweg'],map:'Grasgehren Riedbergpass'});
A('bs-langlauf','balder','schnee','Langlauf im Hochtal',{pp:15,slot:'morgen',dur:'2–3 Std.',ort:'Loipe Balderschwang',s:'Loipen direkt am Ort, ohne Kurs',steps:['Langlaufski leihen (geschätzt 15 € p. P.)','Flache Talloipe'],map:'Loipe Balderschwang'});
A('bs-wsauna','balder','wellness','Wonnemar: Saunawelt',Object.assign({},ACTS['oj-wsauna'],{id:'bs-wsauna',place:'balder',ort:'Sonthofen, ≈ 35 Min.',km:70}));
A('bs-therme','balder','wellness','Therme Oberstdorf',{pp:25,grp:10,indoor:true,slot:'nachm',dur:'3 Std.',ort:'Oberstdorf, ≈ 40 Min.',km:70,src:'ok',hours:'10–22 Uhr · Silvester 10–17',rules:[{date:'12-31',bad:['abend'],msg:'Silvester nur bis 17 Uhr'}],s:'Neue Therme seit Januar 2026, 3 Std. 25 € p. P.',steps:['3-Stunden-Karte','Parken 10 € pro Tag'],tips:['Saunapreise auf der Website prüfen'],links:[L('Therme Oberstdorf','https://www.therme-oberstdorf.de/')],map:'Therme Oberstdorf'});
A('bs-klamm','balder','ausflug','Breitachklamm im Eis',Object.assign({},ACTS['oj-klamm'],{id:'bs-klamm',place:'balder',ort:'Oberstdorf, ≈ 35 Min.',km:60}));
/* Tannheimer Tal */
A('tt-kurs','tannheim','schnee','Gruppenkurs Ski oder Snowboard',KURS('tannheim','Skischule im Tal','',[L('Skischulen Tannheimer Tal','https://www.checkyeti.com/de/winter/oesterreich/tannheimer-tal/zertifizierte-skischulen-skilehrer')],'Füssener Jöchle Grän','est'));
A('tt-ueben','tannheim','schnee','Übungstag ohne Lehrer',{gear:true,pass:true,slot:'morgen',dur:'halber Tag',ort:'Lifte im Tal',src:'ok',s:'Skipass 54 € / Tag',steps:['Tageskarte kaufen','Leichte Pisten'],links:[L('Skipass','https://www.schneehoehen.de/skigebiete/preise/tannheimer-tal')],map:'Füssener Jöchle Grän'});
A('tt-vilsalp','tannheim','ausflug','Winterweg zum Vilsalpsee',{pp:0,slot:'morgen',dur:'2–3 Std.',ort:'Tannheim',s:'Geräumter Weg zum Bergsee im Naturschutzgebiet',steps:['Start in Tannheim','Weg zum See, Einkehr'],map:'Vilsalpsee'});
A('tt-halden','tannheim','ausflug','Haldensee-Runde',{pp:0,slot:'nachm',dur:'1,5 Std.',ort:'Grän-Haldensee',s:'Flache Runde, ideal nach dem Kurs',steps:['Rund um den See'],map:'Haldensee'});
A('tt-langlauf','tannheim','schnee','Langlauf im Tannheimer Tal',{pp:15,slot:'morgen',dur:'2–3 Std.',ort:'Loipen im Tal',s:'Das Tal ist ein Langlauf-Klassiker, ohne Kurs machbar',steps:['Langlaufski leihen (geschätzt 15 € p. P.)','Flache Talloipe'],links:[L('Tannheimer Tal','https://www.tannheimertal.com/')],map:'Tannheim Tirol'});
A('tt-wsauna','tannheim','wellness','Wonnemar: Saunawelt',Object.assign({},ACTS['oj-wsauna'],{id:'tt-wsauna',place:'tannheim',ort:'Sonthofen, ≈ 40 Min.',km:80}));
A('tt-fuessen','tannheim','ausflug','Füssen Altstadt',{pp:8,slot:'nachm',dur:'halber Tag',ort:'Füssen, ≈ 40 Min.',km:70,s:'Gassen, Cafés, Lechfall',steps:['Nach Füssen','Altstadt und Café'],map:'Altstadt Füssen'});
/* Für alle Orte */
A('sauna-haus','*','wellness','Sauna in der Unterkunft',{pp:0,needSauna:true,indoor:true,slot:'nachm',dur:'1–2 Std.',ort:'eure Unterkunft',s:'Entspannen ohne Fahrt',steps:['Saunazeiten beim Gastgeber erfragen','Gänge mit Pausen, danach früh essen'],bring:['Bademantel, Handtücher']});
A('silv-raclette','*','genuss','Silvester: Raclette zu zweit',{grp:40,kitchen:true,indoor:true,slot:'abend',dur:'Abend',ort:'eure Unterkunft',onlyDate:'12-31',s:'Gemütlich, günstig, um Mitternacht raus in den Schnee',steps:['Raclette-Grill beim Gastgeber anfragen oder mitbringen','Käse, Kartoffeln, Beilagen einkaufen (≈ 40 €)','Um Mitternacht raus, Feuerwerk im Tal ansehen']});
A('silv-menu','*','genuss','Silvestermenü im Gasthof',{pp:75,book:true,indoor:true,slot:'abend',dur:'Abend',ort:'im Ort',onlyDate:'12-31',s:'Festes Menü, Plätze im November reservieren',steps:['Im Oktober/November Gasthöfe anfragen','Tisch reservieren','Nach dem Essen zum Feuerwerk']});
A('silv-huette','oberjoch|balder','genuss','Hütten-Silvester Grasgehren',{pp:80,book:true,slot:'abend',dur:'Abend',ort:'Riedbergpass',kmBy:{oberjoch:70,balder:20},onlyDate:'12-31',s:'Im Vorjahr gab es dort ein Silvesterbuffet, danach mit Stirnlampe aufs Riedberger Horn',steps:['Hütte für 2026 anfragen (Programm und Preis)','Anfahrt und Rückweg klären, kein Alkohol am Steuer','Stirnlampe, Grödel'],tips:['Preis geschätzt']});
A('silv-draussen','*','genuss','Mitternacht draußen',{pp:0,slot:'abend',dur:'1 Std.',ort:'am Ort',onlyDate:'12-31',s:'Mit Thermoskanne auf eine Anhöhe, Feuerwerke im Tal ansehen',steps:['Warme Getränke in die Thermoskanne','Kurz vor Mitternacht raus']});
A('essen-gehen','*','genuss','Abendessen im Gasthof',{pp:28,indoor:true,slot:'abend',dur:'Abend',ort:'im Ort',s:'Allgäuer bzw. Tiroler Küche',steps:['Über Silvester reservieren']});

/* Angebote (Vorlagen) – Tag 0 = Anreisetag */
const PKGS=[
 {id:'oj-spar',place:'oberjoch',stay:'oj-fuegen',kurs:true,name:'Oberjoch Sparfuchs',focus:['guenstig','ski'],food:'selbst',pitch:'1 Kurstag, danach selbst üben. Wohnung mit PLUS-Karte, Raclette an Silvester.',
  items:[['oj-panorama',0,'nachm'],['oj-kurs',1,'morgen'],['oj-wbad',1,'nachm'],['silv-raclette',1,'abend'],['oj-rodeln',2,'nachm'],['oj-ueben',3,'morgen'],['oj-tannheim',3,'nachm']]},
 {id:'oj-skiwell',place:'oberjoch',stay:'oj-fuegen',kurs:true,name:'Oberjoch Ski & Wellness',focus:['ski','well'],food:'selbst',pitch:'2 Kurstage, Saunatag im Wonnemar, Rodeln an Neujahr. Skipass über die PLUS-Karte.',
  items:[['oj-kurs',0,'morgen'],['oj-panorama',0,'nachm'],['oj-kurs',1,'morgen'],['oj-wbad',1,'nachm'],['silv-raclette',1,'abend'],['oj-rodeln',2,'nachm'],['oj-ueben',3,'morgen'],['oj-wsauna',3,'nachm']]},
 {id:'os-well',place:'oberstaufen',stay:'os-holidu',kurs:true,name:'Oberstaufen Wellness',focus:['well','ski'],food:'selbst',pitch:'Wohnung mit eigener Sauna, 2 Kurstage, Aquaria an den Tagen ohne Skipass.',
  items:[['os-kurs',0,'morgen'],['sauna-haus',0,'nachm'],['os-kurs',1,'morgen'],['silv-raclette',1,'abend'],['os-hochgrat',2,'morgen'],['os-aquaria',2,'nachm'],['os-eis',3,'nachm'],['os-aquaria',4,'mittag']]},
 {id:'bs-ruhe',place:'balder',stay:'bs-waeldle',kurs:true,name:'Balderschwang Ruhe & Natur',focus:['ruhe','ski','guenstig'],food:'selbst',pitch:'Ferienwohnung mit Sauna, 2 Kurstage, Winterwandern am Riedbergpass.',
  items:[['bs-kurs',0,'morgen'],['bs-kurs',1,'morgen'],['sauna-haus',1,'nachm'],['silv-raclette',1,'abend'],['bs-riedberg',2,'morgen'],['sauna-haus',2,'nachm'],['bs-langlauf',3,'morgen']]},
 {id:'tt-tirol',place:'tannheim',stay:'tt-braito',kurs:true,name:'Tannheimer Tal Tirol',focus:['ruhe','well','ski'],food:'selbst',pitch:'Tiroler Appartement mit Sauna, 2 Kurstage, Seen und Loipen.',
  items:[['tt-kurs',0,'morgen'],['tt-kurs',1,'morgen'],['sauna-haus',1,'nachm'],['silv-raclette',1,'abend'],['tt-vilsalp',2,'morgen'],['sauna-haus',2,'nachm'],['tt-halden',3,'nachm']]},
 {id:'oj-ohne',place:'oberjoch',stay:'oj-holidu',kurs:false,name:'Winterzauber ohne Ski',focus:['guenstig','well','ruhe'],food:'selbst',pitch:'Rodeln, Schneeschuh-Tour an Silvester, Saunatag, Eisklamm. Kein Kurs, kein Verleih.',
  items:[['oj-rodeln',0,'nachm'],['oj-tannheim',1,'morgen'],['oj-schneeschuh',1,'nachm'],['silv-raclette',1,'abend'],['oj-wsauna',2,'nachm'],['oj-klamm',3,'morgen'],['oj-ort',3,'nachm']]},
 {id:'os-pur',place:'oberstaufen',stay:'os-holidu',kurs:false,name:'Wellness pur Oberstaufen',focus:['well','guenstig'],food:'selbst',pitch:'Eigene Sauna, jeden Tag Aquaria mit Solebad frei, Eislaufen und Gipfelweg.',
  items:[['os-aquaria',0,'nachm'],['os-hochgrat',1,'morgen'],['sauna-haus',1,'nachm'],['silv-raclette',1,'abend'],['os-aquaria',2,'nachm'],['os-alpsee',3,'morgen'],['os-eis',3,'nachm']]},
 {id:'tt-langlauf',place:'tannheim',stay:'tt-rosemarie',kurs:false,name:'Langlauf & Sauna in Tirol',focus:['ruhe','guenstig','well'],food:'selbst',pitch:'Langlauf statt Alpin, Seen-Wanderungen, Sauna im Haus.',
  items:[['tt-halden',0,'nachm'],['tt-langlauf',1,'morgen'],['sauna-haus',1,'nachm'],['silv-raclette',1,'abend'],['tt-vilsalp',2,'morgen'],['tt-langlauf',3,'morgen'],['tt-fuessen',3,'nachm']]},
 {id:'bs-huette',place:'balder',stay:'bs-alpenroesle',kurs:false,name:'Hütten & Stille Balderschwang',focus:['ruhe','well'],food:'selbst',pitch:'Sauna und Dampfbad im Haus, Hütten-Silvester, Therme Oberstdorf, Langlauf.',
  items:[['sauna-haus',0,'nachm'],['bs-langlauf',1,'morgen'],['silv-huette',1,'abend'],['bs-therme',2,'nachm'],['bs-riedberg',3,'morgen'],['sauna-haus',3,'nachm']]}
];
const FOCUS={guenstig:'Günstig',ski:'Ski lernen',well:'Wellness',ruhe:'Ruhe & Natur'};

/* Packlisten */
const PACK={
 winter:{'Kleidung':['Skiunterwäsche','Skihose & Jacke','Handschuhe, Mütze, Schal','Skibrille','Warme Schuhe'],'Wellness':['Badesachen','Bademantel & Saunatücher','Schlappen'],'Auto':['Winterreifen prüfen','Schneeketten','Eiskratzer & Frostschutz','Abends vorher volltanken'],'Sonstiges':['Sonnencreme & Lippenpflege','Grödel für vereiste Wege','Thermoskanne','Ausweis & Krankenkassenkarte']},
 stadt:{'Kleidung':['Bequeme Schuhe','Regenjacke'],'Technik':['Powerbank','Ladekabel','Offline-Karten laden'],'Dokumente':['Tickets & Reservierungen','Ausweis']},
 strand:{'Kleidung':['Badesachen','Sonnenhut','Sandalen'],'Pflege':['Sonnencreme','After-Sun'],'Dokumente':['Reisepass/Ausweis','Auslandskrankenversicherung']},
 standard:{'Kleidung':['Wetterpassende Kleidung','Bequeme Schuhe'],'Sonstiges':['Ladekabel','Ausweis','Snacks für die Fahrt']}
};

/* ================= Hilfen ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eur=v=>Math.round(v||0).toLocaleString('de-DE')+' €';
const dec=(v,n)=>(+v||0).toFixed(n).replace('.',',');
const num=(v,d)=>{const x=parseFloat(String(v).replace(',','.'));return isFinite(x)?x:d};
const uid=p=>(p||'x')+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const clone=o=>JSON.parse(JSON.stringify(o));
const lk=(u,l)=>u?'<a class="lnk" href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(l)+' ↗</a>':'';
const mp=q=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q);
const route=(a,b)=>'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(a)+'&destination='+encodeURIComponent(b)+'&travelmode=driving';
const srcBadge=s=>s==='ok'?'<span class="badge est">Angabe · nachprüfen</span>':s==='plus'?'<span class="badge plus">Gästekarte</span>':'<span class="badge est">Richtwert</span>';
const pd=s=>{if(!s||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const [y,m,d]=s.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));return dt.toISOString().slice(0,10)===s?dt:null};
const iso=d=>d.toISOString().slice(0,10);
const fmtD=d=>WD[d.getUTCDay()]+' '+String(d.getUTCDate()).padStart(2,'0')+'.'+String(d.getUTCMonth()+1).padStart(2,'0')+'.';
const fmtLong=d=>String(d.getUTCDate()).padStart(2,'0')+'.'+String(d.getUTCMonth()+1).padStart(2,'0')+'.'+d.getUTCFullYear();
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const opt=(act,val,label,sub,on,extra)=>'<button type="button" class="opt" data-act="'+act+'" data-val="'+esc(val)+'" aria-pressed="'+(on?'true':'false')+'"'+(extra||'')+'>'+label+(sub?'<small>'+sub+'</small>':'')+'</button>';
const chipb=(act,val,label,on)=>'<button type="button" class="chipbtn" data-act="'+act+'" data-val="'+esc(val)+'" aria-pressed="'+(on?'true':'false')+'">'+label+'</button>';

