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

  // ---- Team planner ----
  await page.getByRole('link', { name: /Mannschaftsplaner/ }).first().click();
  await page.getByRole('button', { name: 'Planung anlegen' }).click();
  await page.getByRole('button', { name: /Import/ }).first().click();
  await page.locator('input[type=file]').first().setInputFiles('sample-data/fiktive_spieler_mannschaftsmeldung.csv');
  await page.getByRole('button', { name: 'Vorschau prüfen' }).click();
  await page.getByRole('button', { name: /22 Spieler übernehmen/ }).click();
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.locator('.team').first().waitFor();
  const teams = await page.locator('.team').count();
  check(teams >= 4, `Mannschaften aus Datei übernommen (${teams})`);
  const slots = await page.locator('.slot').count();
  check(slots === 22, `22 Spieler zugeordnet (${slots})`);
  const summary = await page.locator('.summary-title').innerText();
  console.log(`    Prüfergebnis: ${summary}`);
  await shot('team-planner');

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
  await page.getByRole('menuitem', { name: /→ .*IV/ }).click();
  await page.locator('.summary-head').click();
  const errText = await page.locator('.summary').innerText();
  check(/Fehler/.test(errText) && /Abweichung|Reihenfolge/.test(errText), 'Regelverstoß wird erkannt und erklärt');
  await shot('team-violation');

  // ---- Tournament ----
  await page.getByRole('link', { name: /Turnierplaner/ }).first().click();
  await page.getByRole('button', { name: /Neues Turnier/ }).click();
  await page.getByRole('button', { name: 'Weiter zu den Teilnehmern' }).click();
  await page.getByRole('button', { name: /Importieren/ }).click();
  await page.locator('dialog input[type=file]').setInputFiles('sample-data/fiktives_tt-race_clicktt_teilnehmer.xml');
  await page.getByRole('button', { name: /13 Spieler übernehmen/ }).click();
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
