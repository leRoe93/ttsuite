// End-to-end smoke test of both workflows in a real browser (optional; needs `playwright`).
//   npm run build && node scripts/e2e-smoke.mjs [--shots <dir>]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const shotsIdx = process.argv.indexOf('--shots');
const shots = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (shots) await mkdir(shots, { recursive: true });
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml', '.csv': 'text/csv', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(root, p === '/' ? 'index.html' : p);
  try {
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const errors = [];
const check = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
};

async function run(viewport, label) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, locale: 'de-DE' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label} console: ${m.text()}`));
  const shot = async (name) => shots && page.screenshot({ path: `${shots}/${label}-${name}.png`, fullPage: true });

  console.log(`\n[${label}] Start`);
  await page.goto(base);
  await page.getByRole('heading', { name: /Werkzeuge für Tischtennis/ }).waitFor();
  await shot('home');

  // ---- Team planner: guided click-TT import ----
  await page.getByRole('link', { name: /Mannschaftsplaner/ }).first().click();
  await page.getByRole('button', { name: 'Planung anlegen' }).click();
  await page.locator('#club-url').fill('https://ttvn.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/clubInfoDisplay?club=4763');
  await page.getByRole('button', { name: 'Verein speichern' }).click();
  const qLink = await page.getByRole('link', { name: /Alle Spieler mit Q-TTR/ }).getAttribute('href');
  check(/ttvn\.click-tt\.de\/.*ttrFilter\?federation=TTVN&filterType=club&clubId=4763&date=\d{4}-(05|12)-11/.test(qLink), 'Eindeutiger Link zur Q-TTR-Liste des Vereins');
  const link = await page.getByRole('link', { name: /Aktuelle Meldung Erwachsene/ }).getAttribute('href');
  check(/clubPools\?displayTyp=(vorrunde|rueckrunde)&club=4763&contestType=Erwachsene/.test(link), 'Link zur aktuellen Meldung');
  const list = await readFile('sample-data/fiktive_clicktt_qttr_liste_kopiert.txt', 'utf8');
  await page.locator('#qi-paste').fill(list);
  await page.getByText('Q-TTR-Liste erkannt').waitFor();
  await shot('quick-import');
  await page.getByRole('button', { name: /15 Spieler übernehmen/ }).click();
  await page.getByRole('heading', { name: '2. Mannschaften bilden' }).waitFor();
  await page.locator('#dist-teams').fill('3');
  await page.locator('#dist-size').selectOption('4');
  await shot('distribute');
  await page.getByRole('button', { name: 'Vorschlag nach Q-TTR erstellen' }).click();
  await page.locator('.team').first().waitFor();
  check((await page.locator('.team').count()) === 3 && (await page.locator('.slot').count()) === 12, 'Vorschlag nach Q-TTR: 3 Mannschaften à 4');
  const copied = await readFile('sample-data/fiktive_clicktt_meldung_kopiert.txt', 'utf8');
  await page.getByRole('button', { name: /Aus click-TT laden/ }).click();
  await page.locator('dialog #qi-paste').fill(copied);
  await page.getByText('Mannschaftsmeldung erkannt').waitFor();
  check((await page.locator('dialog .qi-stats').innerText()).includes('12\naktualisiert'), 'Meldung erkennt die Spieler aus der Q-TTR-Liste wieder');
  await page.getByRole('button', { name: /12 Spieler übernehmen/ }).click();
  const teams = await page.locator('.team').count();
  check(teams === 3, `Aufstellung aus der Meldung übernommen (${teams} Mannschaften)`);
  const slots = await page.locator('.slot').count();
  check(slots === 12, `12 Spieler zugeordnet (${slots})`);
  const summary = await page.locator('.summary-title').innerText();
  console.log(`    Prüfergebnis: ${summary}`);
  await shot('team-planner');

  // Paste anywhere on the page opens the import with the pasted text (update run).
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, copied.replace('1712\tTestmeier', '1744\tTestmeier'));
  await page.getByText('Mannschaftsmeldung erkannt').waitFor();
  await page.getByRole('button', { name: /12 Spieler übernehmen/ }).click();
  check((await page.locator('.team').first().locator('.slot').first().innerText()).includes('1744'), 'Strg+V überall: Q-TTR aktualisiert');

  if (viewport.width > 900) {
    // Drag the strongest player of team 2 to the top of team 1
    const src = page.locator('.team').nth(1).locator('.slot').first().locator('.drag-handle');
    const dst = page.locator('.team').nth(0).locator('.slot').first();
    const name = await page.locator('.team').nth(1).locator('.slot').first().locator('.slot-main button').innerText();
    const a = await src.boundingBox();
    const b = await dst.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 20, a.y + 20, { steps: 4 });
    await page.mouse.move(b.x + 40, b.y + 4, { steps: 8 });
    await shot('dragging');
    await page.mouse.up();
    const first = await page.locator('.team').nth(0).locator('.slot').first().locator('.slot-main button').innerText();
    check(first === name, `Drag & Drop: ${name} steht jetzt in Mannschaft 1 vorne`);
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    const back = await page.locator('.team').nth(1).locator('.slot').first().locator('.slot-main button').innerText();
    check(back === name, 'Rückgängig stellt den alten Stand her');
  }

  // Make a rule violation: move the last player of team 4 to the top of team 1 via keyboard-accessible menu,
  // then move strongest of team 1 to team 4 → across-team deviation.
  const t1first = page.locator('.team').nth(0).locator('.slot').first();
  await t1first.locator('.slot-actions .menu > button').click();
  await page.getByRole('menuitem', { name: /→ .*III/ }).click();
  await page.locator('.summary-head').click();
  const errText = await page.locator('.summary').innerText();
  check(/Fehler/.test(errText) && /Abweichung|Reihenfolge/.test(errText), 'Regelverstoß wird erkannt und erklärt');
  await shot('team-violation');

  // ---- Tournament ----
  await page.getByRole('link', { name: /Turnierplaner/ }).first().click();
  await page.getByRole('button', { name: /Neues Turnier/ }).click();
  await page.getByRole('button', { name: 'Weiter zu den Teilnehmern' }).click();
  await page.locator('input[type=file]').first().setInputFiles('sample-data/fiktives_tt-race_clicktt_teilnehmer.xml');
  await page.locator('table tbody tr').nth(12).waitFor();
  check((await page.locator('table tbody tr').count()) === 13, '13 Teilnehmende aus click-TT-XML (ohne Assistent)');
  await page.locator('#qa-name').fill('Spontan Spieler');
  await page.locator('#qa-ttr').fill('1300');
  await page.locator('#qa-name').press('Enter');
  check((await page.locator('table tbody tr').count()) === 14, 'Schnelleingabe fügt Teilnehmenden hinzu');
  await page.getByRole('button', { name: /Spontan Spieler entfernen/ }).click();
  await page.getByRole('button', { name: 'Teilnehmerliste bestätigen' }).click();
  await page.getByRole('button', { name: 'Zu den Runden' }).click();
  await page.getByRole('button', { name: /Runde 1 auslosen/ }).first().click();
  for (let r = 1; r <= 6; r++) {
    const inputs = page.locator('table.matches input');
    const n = await inputs.count();
    check(n === 6, `Runde ${r}: 6 Spiele + Freilos`);
    for (let i = 0; i < n; i++) {
      await inputs.nth(i).fill(i % 2 ? '7 -9 5 8' : '-5 -8 -9');
      await inputs.nth(i).press('Enter');
    }
    if (r === 1) await shot('round1');
    if (r < 6) await page.getByRole('button', { name: new RegExp(`Runde ${r + 1} auslosen`) }).click();
  }
  await page.getByRole('button', { name: 'Turnier abschließen' }).click();
  await page.locator('table.standings').waitFor();
  const rows = await page.locator('table.standings tbody tr').count();
  check(rows === 13, 'Tabelle mit 13 Teilnehmern');
  await shot('standings');
  await page.getByRole('tab', { name: /Export/ }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /XML herunterladen/ }).click();
  const file = await dl;
  const xml = await readFile(await file.path(), 'utf8');
  check((xml.match(/<match /g) ?? []).length === 36, 'click-TT-XML enthält 36 Spiele');
  await shot('export');

  // ---- Persistence ----
  await page.reload();
  await page.goto(base + '#/turniere');
  check((await page.locator('.cards li').count()) === 1, 'Turnier nach Neuladen noch vorhanden');
  await ctx.close();
}

try {
  await run({ width: 1440, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
  if (errors.length) throw new Error('Browser-Fehler:\n' + errors.join('\n'));
  console.log('\nAlle E2E-Prüfungen bestanden.');
} finally {
  await browser.close();
  server.close();
}
