/**
 * SYNK-BACKEND FÖR FOTBOLLS- OCH HOCKEYMODELLERNA
 * ------------------------------------------------------------------------------------------------
 * Klistra in hela den här filen i ett Apps Script-projekt och deploya som webbapp.
 * Skriptet kör som DIG och skriver till DIN egen Drive - ingen tredjepartstjänst är inblandad.
 *
 * TVÅ SAKER SKAPAS AUTOMATISKT första gången du synkar:
 *   1. En mapp i din Drive ("Speldata modeller") med en JSON-fil per app. Det är den riktiga
 *      lagringen - inga storleksgränser att tala om, och det är den appen läser tillbaka.
 *   2. Ett kalkylark ("Speldata modeller") med en flik per app, där varje bokfört spel blir en rad.
 *      Det är bara till för dig att titta i, pivotera och grafa. Appen läser aldrig från arket, så
 *      du kan sortera och färglägga det hur du vill utan att något går sönder.
 *
 * INSTALLATION - steg för steg:
 *   1. Gå till https://script.google.com och välj "Nytt projekt".
 *   2. Radera exempelkoden och klistra in HELA den här filen.
 *   3. Byt ut HEMLIG_NYCKEL nedan mot en egen lång slumpsträng. Samma sträng skriver du in i appen.
 *   4. Spara (diskettikonen).
 *   5. Klicka "Kör" en gång på funktionen setup, och godkänn behörigheterna Google frågar om.
 *      (Google varnar för "overifierad app" - det är ditt eget skript; välj Avancerat -> Fortsätt.)
 *   6. Klicka "Distribuera" -> "Ny distribution" -> kugghjulet -> "Webbapp".
 *        Beskrivning:   valfri
 *        Kör som:       Jag (din adress)
 *        Vem har åtkomst: Alla                  <-- viktigt, annars kan appen inte nå den
 *   7. Kopiera webbapp-URL:en (slutar på /exec) och klistra in den i appen under
 *      "Molnsynk" -> "Inställningar för synk", tillsammans med din hemliga nyckel.
 *   8. Tryck "Testa anslutningen" i appen.
 *
 * OBS om "Vem har åtkomst: Alla": adressen är oåtkomlig utan den hemliga nyckeln, men den som får
 * tag på BÅDE adressen och nyckeln kan läsa och skriva din spelbok. Dela dem inte, och lägg inte
 * appen med ifylld nyckel på en publik webbadress.
 *
 * UPPDATERAR DU SKRIPTET SENARE: använd "Distribuera" -> "Hantera distributioner" -> pennan ->
 * Version: Ny, så behåller du samma URL. Skapar du en ny distribution får du en ny URL.
 */

// ================================================================================================
// BYT UT DEN HÄR STRÄNGEN. Samma värde skriver du in i appens synk-inställningar.
// ================================================================================================
var HEMLIG_NYCKEL = 'byt-ut-mig-mot-en-lang-slumpmassig-strang';

var MAPPNAMN = 'Speldata modeller';
var ARKNAMN = 'Speldata modeller';
var GILTIGA_APPAR = ['football', 'hockey'];

/**
 * Kör den här en gång från redigeraren för att godkänna behörigheterna innan du deployar.
 */
function setup() {
  var mapp = hamtaEllerSkapaMapp_();
  var ark = hamtaEllerSkapaArk_();
  Logger.log('Mapp: %s', mapp.getUrl());
  Logger.log('Kalkylark: %s', ark.getUrl());
  return 'Klart - mapp och kalkylark finns.';
}

/**
 * Enkel GET så att du kan öppna URL:en i en webbläsare och se att distributionen lever.
 */
function doGet() {
  return svara_({ ok: true, message: 'Synk-skriptet är igång. Appen använder POST.' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return svara_({ ok: false, error: 'Tom förfrågan' });
    }

    var req = JSON.parse(e.postData.contents);

    if (!HEMLIG_NYCKEL || HEMLIG_NYCKEL === 'byt-ut-mig-mot-en-lang-slumpmassig-strang') {
      return svara_({ ok: false, error: 'Skriptet har kvar standardnyckeln - byt ut HEMLIG_NYCKEL.' });
    }
    if (req.token !== HEMLIG_NYCKEL) {
      return svara_({ ok: false, error: 'Fel hemlig nyckel' });
    }

    var app = GILTIGA_APPAR.indexOf(req.app) !== -1 ? req.app : null;
    if (!app) {
      return svara_({ ok: false, error: 'Okänd app: ' + req.app });
    }

    // Ett lås gör att två enheter som skickar samtidigt inte kan skriva över varandra halvvägs.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (req.action === 'meta') {
        return svara_({ ok: true, updatedAt: lasMeta_(app) });
      }

      if (req.action === 'pull') {
        var lagrat = lasLagring_(app);
        return svara_({ ok: true, updatedAt: lagrat.updatedAt, payload: lagrat.payload });
      }

      if (req.action === 'push') {
        if (!req.payload || typeof req.payload !== 'object') {
          return svara_({ ok: false, error: 'Ingen payload att spara' });
        }
        var updatedAt = new Date().toISOString();
        skrivLagring_(app, req.payload, updatedAt);
        try {
          skrivArk_(app, req.payload);
        } catch (arkFel) {
          // Kalkylarket är bara en läsbar spegling. Misslyckas den ska synken ändå räknas som lyckad,
          // eftersom JSON-filen - den appen faktiskt läser tillbaka - redan är skriven.
          Logger.log('Kunde inte uppdatera kalkylarket: %s', arkFel);
        }
        return svara_({ ok: true, updatedAt: updatedAt });
      }

      return svara_({ ok: false, error: 'Okänd action: ' + req.action });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return svara_({ ok: false, error: String(err) });
  }
}

// ------------------------------------------------------------------------------------------------
// Lagring: en JSON-fil per app i en mapp i din Drive
// ------------------------------------------------------------------------------------------------

function filnamn_(app) {
  return 'speldata-' + app + '.json';
}

function hamtaEllerSkapaMapp_() {
  var traff = DriveApp.getFoldersByName(MAPPNAMN);
  return traff.hasNext() ? traff.next() : DriveApp.createFolder(MAPPNAMN);
}

function hamtaFil_(app) {
  var mapp = hamtaEllerSkapaMapp_();
  var traff = mapp.getFilesByName(filnamn_(app));
  return traff.hasNext() ? traff.next() : null;
}

function lasLagring_(app) {
  var fil = hamtaFil_(app);
  if (!fil) return { updatedAt: null, payload: null };
  try {
    var innehall = JSON.parse(fil.getBlob().getDataAsString('UTF-8'));
    return { updatedAt: innehall.updatedAt || null, payload: innehall.payload || null };
  } catch (e) {
    return { updatedAt: null, payload: null };
  }
}

function lasMeta_(app) {
  return lasLagring_(app).updatedAt;
}

function skrivLagring_(app, payload, updatedAt) {
  var mapp = hamtaEllerSkapaMapp_();
  var data = JSON.stringify({ app: app, updatedAt: updatedAt, payload: payload });
  var fil = hamtaFil_(app);
  if (fil) {
    fil.setContent(data);
  } else {
    mapp.createFile(filnamn_(app), data, MimeType.PLAIN_TEXT);
  }
}

// ------------------------------------------------------------------------------------------------
// Läsbar spegling i ett kalkylark (en flik per app, en rad per spel)
// ------------------------------------------------------------------------------------------------

function hamtaEllerSkapaArk_() {
  var mapp = hamtaEllerSkapaMapp_();
  var traff = mapp.getFilesByName(ARKNAMN);
  if (traff.hasNext()) {
    return SpreadsheetApp.open(traff.next());
  }
  var ark = SpreadsheetApp.create(ARKNAMN);
  // Flytta in det nyskapade arket i mappen så allt ligger samlat.
  var arkFil = DriveApp.getFileById(ark.getId());
  mapp.addFile(arkFil);
  DriveApp.getRootFolder().removeFile(arkFil);
  return ark;
}

var ARK_RUBRIKER = [
  'Datum', 'Liga', 'Match', 'Speltyp', 'Spelval', 'Odds', 'Modellodds', 'EV %',
  'Insats', 'Stängningsodds', 'CLV %', 'Utfall', 'Status', 'Netto'
];

function skrivArk_(app, payload) {
  var spel = (payload && payload.betsHistory) || [];
  var ark = hamtaEllerSkapaArk_();
  var flik = ark.getSheetByName(app);
  if (!flik) flik = ark.insertSheet(app);

  flik.clear();
  flik.getRange(1, 1, 1, ARK_RUBRIKER.length).setValues([ARK_RUBRIKER]).setFontWeight('bold');

  if (!spel.length) {
    // Ta bort den tomma standardfliken "Sheet1"/"Blad1" om den ligger kvar
    stadaStandardflik_(ark);
    return;
  }

  var rader = spel.map(function (b) {
    var clv = (b.closingOdds && b.closingOdds > 0) ? ((b.odds / b.closingOdds) - 1) * 100 : '';
    return [
      b.date || '',
      b.leagueLabel || 'Okänd',
      b.match || '',
      b.betType || '',
      b.displayVal || '',
      tal_(b.odds),
      tal_(b.modelOdds),
      b.ev === undefined || b.ev === null ? '' : Number((b.ev * 100).toFixed(2)),
      tal_(b.stake),
      b.closingOdds ? tal_(b.closingOdds) : '',
      clv === '' ? '' : Number(clv.toFixed(2)),
      b.actualOutcome || '',
      b.status || '',
      tal_(b.profit)
    ];
  });

  flik.getRange(2, 1, rader.length, ARK_RUBRIKER.length).setValues(rader);
  flik.autoResizeColumns(1, ARK_RUBRIKER.length);
  flik.setFrozenRows(1);
  stadaStandardflik_(ark);
}

function stadaStandardflik_(ark) {
  var flikar = ark.getSheets();
  if (flikar.length < 2) return;
  flikar.forEach(function (f) {
    var namn = f.getName();
    if ((namn === 'Sheet1' || namn === 'Blad1') && f.getLastRow() === 0) {
      ark.deleteSheet(f);
    }
  });
}

function tal_(v) {
  var n = Number(v);
  return isFinite(n) ? n : '';
}

// ------------------------------------------------------------------------------------------------

function svara_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
