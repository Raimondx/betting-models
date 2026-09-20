# Fotbolls- och hockeymodeller

Två fristående oddsmodeller för egen vadslagning, byggda som varsin självförsörjande HTML-fil.
Ingen server, inget byggsteg, inga beroenden utöver tre CDN-länkar (Tailwind, FontAwesome, Chart.js).
Öppna filen i en webbläsare så körs appen.

| Fil | App | Sport |
|---|---|---|
| `The machine.html` | Fotbollsmodeller | Fotboll (1X2) |
| `The Hockeymachine.html` | Hockeymodeller | Ishockey (moneyline + 60 min) |
| `Synk-skript (Apps Script).gs` | Synk-backend | Klistras in i Google Apps Script |

Apparna delar arkitektur och det mesta av koden, men är **inte** identiska — se avsnittet om
hockeyspecifika skillnader. En ändring i den ena behöver oftast göras i båda, men sällan
ordagrant likadant.

---

## Kom igång

1. Öppna HTML-filen i en webbläsare.
2. Få in lagdata, antingen genom att ladda upp en lag-CSV (Understat, FootyStats eller liknande) via
   **Ladda upp lag-CSV**, eller genom att markera tabellen på sajten och klistra in den i **Klistra in
   tabell från webben**. Kolumnerna detekteras automatiskt; går det fel finns manuell kolumnkoppling.
3. Välj hemma- och bortalag, gå till **Snitt & Avancerat** och bokför spel.

Vill du köra apparna från flera enheter behöver de ligga på en https-adress
(GitHub Pages, Cloudflare Pages, Netlify). Se avsnittet om molnsynk.

### Klistra in tabell från webben

Vägen via ett kalkylblad är den vanligaste källan till trasig data: ett svenskt eller finskt Google
Sheets läser `3.32` som klockslaget 3:32 och `+1.47` som en formel, så siffrorna är förstörda innan
appen ser dem. Klistrar man in tabellen direkt i appen passerar texten aldrig ett kalkylblad.

Rutan tar emot det man faktiskt får när man kopierar en webbtabell: kolumner avgränsade med tabbar
eller med flera mellanslag i rad, med eller utan rubrikrad, med punkt eller komma som decimaltecken,
och med hårda mellanslag och tomrader kvar. Enkla mellanslag går däremot inte att tolka — lagnamn
innehåller dem (`K-Espoo`, `Brighton & Hove Albion`), så en sådan tabell går till manuell koppling.

**FootyStats.org** (fotboll) har rubriker som känns igen automatiskt och importeras direkt.
**liigaxg.online** (hockey) levererar tabellen *utan* rubrikrad, så den känns igen på formen i stället:
nio kolumner där den första är ett tal, den andra text och den tredje ett rimligt matchantal. Då fylls
kopplingen i efter sajtens kolumnordning (`placering · lag · matcher · xGF · xGA · xG-diff · GF · GA ·
måldiff`) och "snitt per match" förkryssas, eftersom siffrorna är per match och inte säsongstotaler.
Kopplingen importeras aldrig rakt av — panelen öppnas ifylld så att du ser vad appen tror innan något
läses in.

Att kolumn 7/8 är riktiga mål och 4/5 är xG kontrolleras mot datan i stället för att antas: mål per
match gånger antal matcher måste landa på ett heltal, vilket xG inte gör. Testet avgör dock inte om
layouten godtas — med ett par inklistrade rader är utfallet brus — utan varnar bara när det över
tillräckligt många rader tydligt säger emot kolumnordningen.

I rutan finns också ett **namnfält** och en kryssruta för **snitt per match**. Namnet sparar ligan i
webbläsaren och följer med på bokförda spel, så spelboken går att filtrera per liga i efterhand; utan
namn bokförs spelen som "Uppladdad CSV-fil".

### Snitt per match kontra totaler

Appen räknar på säsongstotaler. FootyStats visar beroende på vy `1.62 mål per match` i stället för
`49 mål på säsongen`, och läses det som en totalsumma blir varje lag ungefär trettio gånger för svagt.
Ingenting ser trasigt ut i gränssnittet — modellen räknar bara på fel baslinje.

Därför kontrolleras kvoten `gf/mp` efter varje import, oavsett om datan kom från en fil eller
inklistringsrutan och oavsett hur kryssrutan stod. Hamnar den utanför det rimliga (fotboll ca 1.0–1.8
mål per lag och match, hockey ca 2.5–3.5) stoppas importen: kopplingspanelen öppnas med kryssrutan
rättad och en förklaring av vad som såg fel ut. Kontrollen går åt båda hållen — totaler som råkat
kryssas som snitt fångas likaväl — och frågar bara en gång per import, så ett medvetet udda dataset
går att importera ändå.

---

## De fyra modellerna

Alla fyra räknas ut parallellt och vägs ihop till ett snitt i fliken **Snitt & Avancerat**.

**Modell 1 – Poisson med Dixon-Coles.** Lagens mål och xG normaliseras mot ligasnittet till
anfalls- och försvarsstyrka, som multipliceras ihop till förväntade mål (λ) för matchen. Ur λ byggs
en 13×13-målmatris som allt annat härleds från: 1X2, Över/Under, handikapp och exakta resultat.
Använder hemma/borta-specifik data när sådan finns, annars kombinerad data plus ett manuellt
hemmaplansreglage.

**Modell 2 – Förväntade poäng (xPts).** Fördelar vinstsannolikheten proportionellt mot lagens xPts.
Kan matas antingen med xPts från statistikkällan eller med marknadsbaserade xPts räknade ur din
egen oddslogg.

**Modell 3 – Egen %.** Samma matematik som Modell 2, men på en procentsats du sätter själv per lag.
Auto-värdet är `xPts / (poäng per match × spelade matcher)`.

**Modell 4 – Marknadsimplicerad Poisson.** Löser baklänges vilka λ marknaden prisar in, utifrån
loggade stängningsodds för både 1X2 och Över/Under. Bygger en egen "statistikbok" per lag av lösta
λ-värden och projicerar matchen med samma styrkelogik som Modell 1. Kräver att du loggat matcher
med Ö/U-odds. Räknas bara om när du trycker på knappen, inte vid varje omräkning.

### Så vägs de ihop

Vikterna kommer från uppmätt träffsäkerhet (Brier Score) på avgjorda matcher i **både**
prediktionsloggen och spelboken. Prediktionsloggen är det opartiska urvalet — spelboken innehåller
bara matcher du valde att spela på, alltså just de där modellerna avvek mest från marknaden.

Vikterna krymps mot lika vikt med `WEIGHT_PRIOR_STRENGTH = 40` pseudomatcher, så de glider mjukt
från 1/n mot uppmätt träffsäkerhet i takt med att historiken växer. Under
`MIN_RESOLVED_FOR_WEIGHTING = 10` matcher används enbart lika vikt.

Kryssrutorna **Med i snittet** utesluter en modell ur snittet helt (modellen räknas fortfarande ut och
visas i sin egen flik). Valet sparas i `modelSettings`, alltså per enhet. Modell 4 tvingas alltid av
vid start: den räknas bara ut på knapptryck, så dess sannolikheter är noll tills du beräknat den.

### Klistra in oddstabell

Oddsloggen (som driver marknads-xPts i Modell 2) har en egen inklistringsruta för resultattabeller från
**betexplorer.com** och **oddsportal.com**. Raderna tolkas på innehåll, inte på kolumnposition: sajterna
lägger kolumnerna olika, och en tabell kopierad som text tappar tomma celler så att kolumnnumren glider.

- Lagparet är den del som innehåller ` - ` med text på båda sidor. Omgångs- och rubrikrader saknar det
  och hoppas över tyst.
- Oddsen är tal med decimaltecken. Heltal ignoreras — oddsportal visar antalet bookmakers i samma rad,
  och det är inte ett odds. Resultat (`0:1`), klockslag (`20:00`) och datum (`16.09.`, `13/09`) rensas
  bort först; datumen är farligast, eftersom `16.09` är ett giltigt decimaltal.
- Rätt tre odds hittas genom att pröva löpande trippel och behålla den första vars overround är rimlig.
  Fönstret (0.80–1.60) är medvetet vitt: sajterna visar ofta *bästa* odds över flera bookmakers, och då
  kan summan hamna under 1.00 — mätt över 169 allsvenska matcher låg den mellan 0.91 och 1.08. Fönstret
  ska sålla bort trippel som plockat upp ett datum, inte avgöra om oddsen är rimliga. Marginalen visas
  per match i granskningen.

Lagnamnen matchas mot den inlästa ligan med samma nivåbaserade matchning som resten av appen, så
`Goteborg` hittar rätt lag även om tabellen stavar det annorlunda. Rader vars lag inte går att matcha
listas i stället för att tyst försvinna. Inget läses in förrän du granskat listan, och matcher som redan
finns i loggen läggs inte till igen — annars skulle de vägas dubbelt i Modell 2.

Bara 1X2 läses in. Modell 4 behöver dessutom Ö/U-odds, som de här tabellerna inte innehåller; de fylls i
för hand per match. I hockeyappen ska oddsen vara 1X2 **efter ordinarie tid**, inte moneyline.

---

## Modellbeslut som inte är uppenbara

Det här avsnittet är det viktigaste i dokumentet. Flera av besluten ser ut som egenheter tills man
känner till motivet.

**Modell 2 och 3 slås ihop till en modellplats när de ger samma svar.** Modell 3:s Auto% är
`xPts/(poäng × matcher)`, så när båda lagen spelat lika många matcher blir kvoten mellan lagen
identisk med kvoten mellan deras xPts — modellerna är då matematiskt samma sak. Utan hopslagning
fick den synen 2/3 av snittet medan gränssnittet visade den som två oberoende modeller. En gul
varning visas när det inträffar.

**Shins metod, inte proportionell, för att räkna bort bookmakerns marginal.** Att bara dela med
overrounden antar att marginalen är jämnt utspridd, vilket den inte är: bookmakers lägger mer
marginal på skrällarna. Proportionell avvigning överskattar därför systematiskt skrällar och
underskattar favoriter — och eftersom Modell 4 och marknads-xPts byggs helt på avvigade priser gick
den snedvridningen rakt in i det appen kallade "marknadens sanna sannolikhet".

**Push hanteras explicit på alla linjer.** En heltalslinje (Ö/U 2.0, handikapp 0 eller ±1) kan
träffas exakt, och då betalas insatsen tillbaka. Att räkna `P(under) = 1 − P(över)` räknar push som
vinst. Vid λ 1.5/1.2 blev "Under 2.0" redovisat som 49.4% när det i verkligheten vinner rakt av i
23.3% av fallen och pushar i 26.1%. Hela kedjan går via `evaluateSelection()`, som returnerar hur
stor **andel av insatsen** som vinner respektive förlorar — push är resten. Kvartslinjer delar
insatsen i två halvor på de närliggande halvlinjerna.

**EV räknas som `W·(odds−1) − L`, inte `odds × p − 1`.** Den gamla formen överskattade EV med en
faktor `1/(1−push)`. Ett DNB-spel på 2.00 med 28.6% pushrisk visades som +19.3% när det verkliga
värdet är +13.8%.

**Kelly löses numeriskt.** Den klassiska formeln `f* = (p·b − q)/b` gäller bara för rena
tvåutfallsspel. Med push eller halv vinst maximeras `E[ln(1 + f·avkastning)]` direkt över spelvalets
faktiska utfallsprofil. För ett vanligt 1X2-spel ger det exakt samma svar som formeln.

**Kelly räknar på tillgänglig kassa**, alltså saldot minus insatser som redan ligger ute i oavgjorda
spel. Annars blir insatserna systematiskt för stora när flera spel är öppna samtidigt.

**ρ klipps till sitt giltiga intervall per match.** Dixon-Coles τ är bara giltig när
`1 + λ·ρ ≥ 0` med flera villkor. Utanför det blir enskilda resultat negativa, vilket normaliseringen
sedan döljer i stället för att larma om. I hockey är det ett skarpt problem: vid λ 4.25 bryter
reglagets lägen från ca −0.24 och nedåt.

**ρ/k-optimeringen är korsvaliderad.** Att välja parametrar på hela historiken och sedan mäta
förbättringen på samma matcher hittar nästan alltid en falsk vinst. Urvalet delas i 5 delar,
parametrarna väljs på 4 och betygsätts på den femte, och nya värden rekommenderas bara om de är
bättre på data de inte valdes på. Måttet är log loss, som straffar självsäkra felsägningar hårdare
än Brier — precis den sortens fel som gör mest skada när siffrorna går vidare in i Kelly.

**Ligasnittet är poolat (Σmål/Σmatcher), inte ett oviktat snitt av lagens per-match-snitt.** Mitt i
en säsong har lagen olika många spelade matcher, och ett oviktat snitt drar då baslinjen mot de lag
som spelat färre.

---

## Hockeyspecifikt

**Två målmatriser.** En hockeymatch kan inte sluta oavgjort. Modellen bygger därför en matris för
ordinarie tid (60 minuter, där oavgjort finns) och en för slutresultatet, där varje oavgjort
resultat k–k flyttas till (k+1)–k eller k–(k+1) beroende på vem som vinner avgörandet.

- **1X2** läses ur 60-minutersmatrisen — det är "60 minuter"-marknaden.
- **Moneyline** läses ur slutresultatmatrisen.
- **Ö/U** styrs av `ouIncludeOT` (standard: inklusive förlängning, som hos bookmakers).
- **Handikapp/puckline** styrs av `ahIncludeOT` (standard: 60 minuter).

De två marknaderna har **varsin** inställning, inte en gemensam. Tidsrymden betyder mycket mer för
handikappet än för totalen: inklusive förlängning slutar varje match som stod lika på exakt ±1 mål, så
pushen på 0 (DNB) försvinner helt och massa flyttas till ±1-linjerna, medan totalen bara skiftar med
P(oavgjort) mål. Vid λ 2.9/2.7 blir DNB 69.1% med 16.1% push efter 60 minuter, men 67.2% helt utan
push inklusive förlängning. En sparad `ouAhIncludeOT` från den gemensamma tiden migreras till
`ouIncludeOT`, så totalen beter sig som förut.

Procenten i tabellerna är det **rättvisa** (break-even) värdet `W/(W+L)`, inte den råa
vinstsannolikheten — push är utbruten och står i linjekolumnen. På puckline ±1.5 finns ingen push och
de sammanfaller; på 0 och ±1 gör de det inte.

Invarianter värda att känna till vid ändringar: massan bevaras exakt, slutresultatmatrisens diagonal
är noll, `moneyline = h + d × P(hemmavinst i förlängning)`, och förväntade totalmål ökar med **exakt**
P(oavgjort) — ett extra mål i precis de matcher som stod lika.

**λ justeras nedåt för förlängningsmålet.** Publicerad hockeystatistik räknar in det avgörande målet
från förlängning eller straffar. Det målet finns per definition bara i matcher som stod lika efter 60
minuter, så det måste bort innan matrisen kan beskriva ordinarie tid. Stäng av `dataIncludesOT` om
din källa redan ger regeltidsmål.

**Dixon-Coles är nästan verkningslös i hockey** och standardvärdet är därför nära noll (−0.02). De
fyra celler ρ rör utgör ca 37% av sannolikhetsmassan i fotboll men bara ca 3% vid hockey-λ. Använd i
stället **oavgjort-justeringen** (`tieBoost`), som verkar på hela oavgjort-diagonalen. Behovet är
verkligt: tom-kasse-mål görs nästan bara i redan avgjorda matcher, vilket gör verkliga resultat
mindre jämna än en ren Poisson — och därmed underskattar Poisson hur ofta matcher står lika efter 60
minuter. Hockeyns sweep optimerar därför `k × tieBoost`, inte `ρ × k`.

**Poängsystem är inställbart** (NHL 2 poäng/match, SHL/Liiga/KHL 3), eftersom Modell 3:s Auto%
annars får fel nämnare.

---

## Manuell matchjustering

Fyra reglage (anfall/försvar per lag, ±40%) för skador och laguppställning. Justeringen görs på
**lagstyrka**, inte direkt på slutsannolikheten — ändrar man bara 1X2-siffran fortsätter Ö/U och
handikapp räknas på den ojusterade målfördelningen, och man sitter med motstridiga priser i samma
match. Genom att flytta λ räknas allt om konsekvent.

- Positivt = bättre än statistiken antyder. λ_hemma × anfall_hemma / försvar_borta.
- Modell 2 och 3 får en samlad styrkefaktor per lag (geometriskt medelvärde av anfall och försvar).
- Modell 4 påverkas **inte** som standard: marknaden har normalt redan prisat in en känd skada.
- Nollställs när matchen byts, och visas med en röd AKTIV-markering så länge den är på.
- Sparas med bokförda spel (`snapshotAdjustments`) så att backtestet använder den justering som
  gällde då, inte den som råkar stå inställd nu.

---

## Lagnamn från olika källor

Två separata problem, med varsin mekanism.

**Teckenfel (`Djurg�rdens IF`).** Uppstår när en fil sparad i Windows-1252 läses som UTF-8. Byten är
förlorade och går inte att avkoda tillbaka — men de går att rekonstruera ur sammanhanget, eftersom
bara en bokstav passar. `decodeUploadedBytes()` känner av kodningen vid import så att det inte
uppstår igen, och ett reparationsverktyg föreslår rätt namn och skriver om dem i all sparad data.

**Namnkonventioner (`Liverpool` vs `Liverpool FC`).** En "lös" jämförelseform tar bort generiska
klubbtyps-ord (FC, AFC, BK, IF, IFK, HC, HF, AIK, SK …). Ord som **skiljer** klubbar åt — United,
City, Wednesday, Wanderers — rörs aldrig. Blir två olika lag i tabellen identiska efter strippning
stängs mekanismen av för den ligan och en varning visas; hellre missa en koppling än slå ihop två
klubbar. Allt som inte är en ren suffixskillnad (`Brighton` vs `Brighton & Hove Albion FC`) hanteras
med en sparad aliaslista.

**Förkortade namn (`Dortmund` vs `Borussia Dortmund`).** Oddssajter kortar ner samma klubb olika
mycket, och det är varken en ren suffixskillnad eller något en aliaslista borde behöva fyllas med.
Namnen jämförs därför också som **ordmängder**, men bara på bärande ord (minst fyra tecken — `05`, `B`
och `M` säger ingenting om vilken klubb det är). De matchar om det ena namnets bärande ord i sin helhet
ryms i det andra: `Dortmund` ligger helt i `Borussia Dortmund`, `RB Leipzig` i `RasenBallsport Leipzig`,
`Mainz` i `Mainz 05`. Delade ord räcker inte — hela sidans uppsättning måste rymmas — så `Manchester
United` och `Manchester City` matchar inte varandra, och `Manchester` ensamt matchar ingen av dem
eftersom två lag träffar lika starkt.

Matchningen returnerar en **nivå** (5 exakt · 4 alias · 3 normaliserad · 2 lös/delmängd · 1 teckenfel),
och `findTeamByName()` väljer den starkaste träffen och vägrar gissa om två lag träffar lika starkt.

Kvar blir de skillnader ingen regel kan härleda: `FC Koln` mot `FC Cologne` är en språkskillnad, och
`B. Monchengladbach` mot `Borussia M.Gladbach` en förkortning inne i ordet. Dem kopplar man för hand —
och det görs direkt i oddsgranskningen, där okopplade namn listas med ligans lag sorterade efter likhet
(sorterade, inte förvalda: appen gissar inte åt dig här). Kopplingen sparas som ett alias och gäller
även nästa gång du klistrar in från samma sajt. På fjolårets Bundesliga föll 5 av 18 lagnamn utanför
innan ordmängdsjämförelsen fanns, vilket slog ut ungefär halva säsongen; nu är det 2, och efter att de
kopplats en gång läses alla 306 matcher in.

---

## Lagring och synk

All data ligger i webbläsarens `localStorage`, med **prefix per app** (`football:` / `hockey:`).
Det är nödvändigt: webbläsaren behandlar alla `file://`-sidor som samma ursprung, så utan prefix
delade de två apparna en gemensam spelbok och skrev över varandras modellparametrar.

Nycklar: `betsHistory`, `oddsMatchLog`, `predictionsHistory`, `customPctStore`, `savedLeagues`,
`teamAliases`, `modelSettings`, `syncConfig`, kassa-inställningar.

**Slutresultat per match.** Båda loggarna sparar målsiffror (`score: {h, a, ot}`) utöver utfallet.
Det som lagras är slutresultatet plus en flagga för förlängning/straffar; regeltidsresultatet härleds
(4–3 efter förlängning var 3–3 efter 60 minuter), så de två kan aldrig hamna i konflikt. Fylls
målrutorna i sätts utfallet automatiskt för 1X2 (regeltid) och moneyline (slutresultat), och
utfallslistan låses så att det bara finns en sanning. Ö/U och handikapp rättas fortsatt för hand:
utfallet beror på vilken tidsrymd linjen avgörs i, och en kvartslinje kan ge halv vinst/halv förlust
som listan inte kan uttrycka. Ett resultat som påstås ha avgjorts i förlängning utan att skilja exakt
ett mål flaggas som ogiltigt i stället för att tyst bli fel historik.

Poängen med att samla in siffrorna: utfallet `'1'`/`'X'`/`'2'` räcker för att mäta om
1X2-sannolikheterna pekade rätt, men säger nästan ingenting om målfördelningens *form*. Spridning och
beroende går bara att skatta mot faktiska målsiffror — och historik går inte att rekonstruera i
efterhand, så insamlingen måste ligga före analysen.

**Molnsynk** mot en JSON-fil i din egen Google Drive via ett Apps Script du deployar själv. Allt går
via `lsSet()`, vilket gör den till den enda inhakningspunkten för synken — ändras något synkbart
schemaläggs en fördröjd skickning automatiskt. `modelSettings` och `syncConfig` synkas **inte**: de
är per enhet.

Konfliktstrategin är "senaste skrivning vinner", men aldrig tyst — innan appen skriver över molnet
kontrolleras molnets tidsstämpel, och har en annan enhet hunnit skriva emellan stoppas skickningen
och du får välja riktning.

---

## Fallgropar vid redigering

Läs det här innan du ändrar i filerna. Varje punkt har orsakat en verklig bugg i projektet.

**Teckenkodning.** Filerna är UTF-8 med svensk text och tecken som ρ och λ. Ett `perl -0pi -e`-anrop
där ersättningssträngen innehåller ett tecken utanför Latin-1 uppgraderar hela strängen internt och
skriver ut filen dubbelkodad — alla å/ä/ö blir `Ã¥`/`Ã¤`/`Ã¶`. Det hände i det här projektet och
drabbade båda filerna. Kontrollera efter varje batch-redigering:

```
grep -c 'Ã¥\|Ã¤\|Ã¶' fil.html      # ska vara 3 (den avsiktliga reparationstabellen)
```

Skadan är reversibel: varje kodpunkt ≤ U+00FF motsvarar en originalbyte, så en mappning tillbaka via
ISO-8859-1 återställer filen. Föredra hellre riktade `Edit`-ersättningar än regex över hela filen.

**Temporal dead zone.** Uppstartskoden ligger sist i filen men anropar funktioner som är deklarerade
längre ned. Funktionsdeklarationer hissas — `const` och `let` gör det inte. En `const` som deklareras
efter anropsstället kastar `Cannot access before initialization`. Använd `var` för flaggor som läses
tidigt (se `syncReady`), eller lägg konstanten inuti funktionen.

**Webbläsarens formuläråterställning.** Vid omladdning återställer webbläsaren reglagens lägen
*efter* att sidans script kört, vilket skriver över de sparade inställningarna. Alla reglage **och
kryssrutor** som speglar sparat tillstånd måste ha `autocomplete="off"` **i markupen** — att sätta
attributet från JS är för sent. Kryssrutorna för "Med i snittet" saknade det, och `modelToggles`
sparades inte alls: efter en omladdning slogs alla modeller på igen medan kryssrutorna kunde stå kvar
som de lämnats. Gränssnittet visade då "bara Modell 3" medan snittet i själva verket vägde ihop
Modell 1, 2 och 3 — X i **Snitt & Avancerat** skilde sig från Modell 3:s egen siffra utan synlig
orsak. Ett tillstånd som styr en beräkning måste både sparas och speglas tillbaka till gränssnittet;
bara det ena räcker inte.

**Halvfärdiga ändringar.** Projektet har vid två tillfällen innehållit kod som såg komplett ut men
aldrig var inkopplad: hjälpfunktioner utan anropare, och ett `renderTeamRepairNotice()` som skrev
till ett `<div>` som inte fanns i HTML:en. Kontrollera alltid att nya funktioner faktiskt anropas och
att element-id:n existerar.

**Argumentordning skiljer mellan apparna.** `computePoissonProbs()` har en extra parameter i
hockeyversionen (`skipOvertimeLayer`). Ett anrop som kopieras rakt av mellan filerna hamnar fel.

**Snapshots i spelboken.** Bokförda spel sparar lagstatistik, ligasnitt och parametrar så att
backtestet kan räkna om historiskt. Lägger du till en ny parameter som påverkar sannolikheterna ska
den också sparas i snapshotet — annars räknar sweepen om historiska matcher med dagens inställning.

---

## Testning

Ingen testsvit finns. Verifieringen har gjorts genom att köra apparna i en riktig webbläsare och
kontrollera invarianter direkt i konsolen:

- sannolikheter summerar till 1
- `W + L + push = 1` för varje marknad
- matrissummor = 1, inga negativa celler
- hockey: slutresultatets diagonal ≈ 0, totalmålen ökar med exakt P(oavgjort)
- Kelly sammanfaller med den klassiska formeln för rena tvåutfallsspel

Notera att `localStorage` är blockerat på `data:`-URL:er och att appen då inte ens startar — testa
via en riktig webbserver, inte en snapshot-förhandsvisning.

---

## Medvetet inte gjort

- **Maximum likelihood-anpassning av anfalls-/försvarskoefficienter** på matchnivå. Det är den
  enskilt största träffsäkerhetsvinsten som återstår, men kräver matchdata i stället för
  säsongsaggregat.
- **Tidsviktning av lagstatistiken.** Oddsloggen har recency-viktning; säsongstabellen har inte det,
  av samma skäl som ovan.
- **Överspridning från tom-kasse-mål i hockey.** `tieBoost` gör faktiskt inte det här jobbet: vid
  λ 3.05/2.75 höjer 1.20 oavgjort från 16.9% till 19.7% medan marginalfördelningarnas varians/medelvärde
  ligger kvar på ~0.99. Det är ett *beroende*-reglage, inte ett spridningsreglage. En negativ
  binomialfördelning — eller Weibull-räknemodellens formparameter, som klarar spridning åt båda håll
  (Boshnakov, Kharrat & McHale, *IJF* 33(2), 2017) — vore den riktiga lösningen. Förutsätter loggade
  målsiffror, som nu samlas in.
- **Sammanslagning per spel vid synkkonflikt.** Vald strategi är "senaste skrivning vinner" med
  bekräftelse, inte automatisk sammanslagning.
