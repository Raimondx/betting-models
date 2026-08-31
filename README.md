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
2. Ladda upp en lag-CSV (Understat, FootyStats eller liknande) via **Ladda upp lag-CSV**.
   Kolumnerna detekteras automatiskt; går det fel finns manuell kolumnkoppling.
3. Välj hemma- och bortalag, gå till **Snitt & Avancerat** och bokför spel.

Vill du köra apparna från flera enheter behöver de ligga på en https-adress
(GitHub Pages, Cloudflare Pages, Netlify). Se avsnittet om molnsynk.

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

Matchningen returnerar en **nivå** (5 exakt · 4 alias · 3 normaliserad · 2 lös · 1 teckenfel), och
`findTeamByName()` väljer den starkaste träffen och vägrar gissa om två lag träffar lika starkt.

---

## Lagring och synk

All data ligger i webbläsarens `localStorage`, med **prefix per app** (`football:` / `hockey:`).
Det är nödvändigt: webbläsaren behandlar alla `file://`-sidor som samma ursprung, så utan prefix
delade de två apparna en gemensam spelbok och skrev över varandras modellparametrar.

Nycklar: `betsHistory`, `oddsMatchLog`, `predictionsHistory`, `customPctStore`, `savedLeagues`,
`teamAliases`, `modelSettings`, `syncConfig`, kassa-inställningar.

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
- **Överspridning från tom-kasse-mål i hockey.** `tieBoost` fångar en del av effekten, men en
  negativ binomialfördelning vore den riktiga lösningen.
- **Sammanslagning per spel vid synkkonflikt.** Vald strategi är "senaste skrivning vinner" med
  bekräftelse, inte automatisk sammanslagning.
