import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyClickTtRegistration, distributeByQttr, parseClickTtRegistration } from '../src/features/team-planner/clickTtImport.ts';
import { newPlan } from '../src/features/team-planner/state.ts';
import { validateLineup } from '../src/domain/team-rules/validate.ts';
import { TTVN_2026 } from '../src/domain/team-rules/ruleSets.ts';
import { player } from './helpers.ts';

const page = readFileSync('sample-data/fiktive_clicktt_meldung_kopiert.txt', 'utf8');
const mkPlan = (o: Partial<Parameters<typeof newPlan>[0]> = {}) =>
  newPlan({ name: 'Herren', season: '2026/27', halfSeason: 'VR', ageClass: 'erwachsene', teamCount: 0, teamPrefix: 'Herren', sollstaerke: 4, contest: 'Erwachsene', ...o });

test('one-step import of a copied click-TT page: players, teams, roles, SPV', () => {
  const plan = mkPlan();
  const parsed = parseClickTtRegistration(page, [], plan);
  assert.ok(parsed.recognized);
  if (!parsed.recognized) return;
  assert.equal(parsed.rows.length, 12);
  assert.equal(parsed.teamCount, 3);
  assert.equal(parsed.club, 'TTC Musterstadt 1950 (fiktiv)');
  assert.deepEqual(parsed.heading, { season: '2026/27', contest: 'Erwachsene', half: 'VR' });
  assert.deepEqual(parsed.mismatch, {});
  const r = applyClickTtRegistration([], plan, parsed, { adoptHeading: true });
  assert.equal(r.added, 12);
  assert.deepEqual(r.plan.teams.map((t) => [t.name, t.slots.length]), [['Herren I', 4], ['Herren II', 4], ['Herren III', 4]]);
  const byName = new Map(r.players.map((p) => [p.lastName + p.firstName, p]));
  const anna = byName.get('AttrappeAnna')!;
  assert.equal(r.plan.teams[1]!.slots.find((s) => s.playerId === anna.id)!.role, 'WES');
  const leon = byName.get('DemobergLeon')!;
  assert.equal(r.plan.teams[2]!.slots.find((s) => s.playerId === leon.id)!.role, 'RES');
  assert.equal(leon.rules.nachwuchs, true);
  const spv = byName.get('ErfundenErik')!;
  assert.deepEqual(spv.rules.sperrvermerk, { teamNumber: 3, season: '2026/27', half: 'VR', source: 'click-tt', note: 'click-TT VR 2026/27' });
  assert.equal(byName.get('StundeStella')!.rules.qttrProvisional, true);
  // An SPV from exactly this registration is current: no "old SPV" warning, and it covers the deviation.
  const v = validateLineup(r.plan, r.players, TTVN_2026);
  assert.ok(!v.findings.some((f) => f.code === 'spv-existing-vr'), v.findings.map((f) => f.code).join());
  assert.ok(!v.findings.some((f) => f.code === 'spv-required'), v.findings.map((f) => f.detail).join('\n'));
});

test('re-import updates existing players by name (Q-TTR), keeps ids, replaces lineup', () => {
  const plan = mkPlan();
  const first = parseClickTtRegistration(page, [], plan);
  if (!first.recognized) throw new Error('not recognised');
  const r1 = applyClickTtRegistration([], plan, first, { adoptHeading: true });
  const rrPage = page.replace('(VR)', '(RR)').replace('1712\tTestmeier', '1730\tTestmeier');
  const second = parseClickTtRegistration(rrPage, r1.players, r1.plan);
  if (!second.recognized) throw new Error('not recognised');
  assert.equal(second.rows.filter((x) => x.existing).length, 12);
  assert.deepEqual(second.mismatch.half, ['VR', 'RR']);
  const r2 = applyClickTtRegistration(r1.players, r1.plan, second, { adoptHeading: true });
  assert.equal(r2.added, 0);
  assert.equal(r2.updated, 12);
  assert.equal(r2.players.length, 12);
  assert.equal(r2.plan.halfSeason, 'RR');
  const tim = r2.players.find((p) => p.lastName === 'Testmeier')!;
  assert.equal(tim.id, r1.players.find((p) => p.lastName === 'Testmeier')!.id);
  assert.equal(tim.rules.qttr, 1730);
});

test('same name in another club is not merged; non-click-TT text is rejected with a reason', () => {
  const plan = mkPlan();
  const other = player('Testmeier', 1500, { firstName: 'Tim', club: 'SV Anderswo' });
  const parsed = parseClickTtRegistration(page, [other], plan);
  assert.ok(parsed.recognized && !parsed.rows[0]!.existing);
  const bad = parseClickTtRegistration('Name;Verein\nMax;TTC\n', [], plan);
  assert.equal(bad.recognized, false);
});

const list = readFileSync('sample-data/fiktive_clicktt_qttr_liste_kopiert.txt', 'utf8');

test('copied pages with menu text above the table (commas!) are read as tab tables', () => {
  const p = parseClickTtRegistration(page, [], mkPlan());
  assert.ok(p.recognized && p.kind === 'registration' && p.rows.length === 12);
  const q = parseClickTtRegistration(list, [], mkPlan());
  assert.ok(q.recognized && q.kind === 'qttr-list' && q.rows.length === 15);
});

test('Q-TTR list: all players into the pool, Q-TTR updated by name (titles ignored), lineup untouched', () => {
  const plan = mkPlan();
  const known = player('Muster', 1300, { firstName: 'Dr. Martin', club: 'TTC Musterstadt 1950 (fiktiv)' });
  const parsed = parseClickTtRegistration(list, [known], plan);
  if (!parsed.recognized) throw new Error(parsed.reason);
  assert.equal(parsed.rows.find((r) => r.incoming.lastName === 'Muster')!.existing?.id, known.id);
  const r = applyClickTtRegistration([known], plan, parsed, { adoptHeading: true, clubName: 'TTC Musterstadt 1950 (fiktiv)' });
  assert.equal(r.added, 14);
  assert.equal(r.updated, 1);
  assert.equal(r.players.find((p) => p.id === known.id)!.rules.qttr, 1355);
  assert.equal(r.players.find((p) => p.lastName === 'Zukunft')!.club, 'TTC Musterstadt 1950 (fiktiv)');
  assert.equal(r.players.find((p) => p.lastName === 'Stunde')!.rules.qttrProvisional, true);
  assert.equal(r.plan, plan, 'lineup untouched');
  // A registration pasted afterwards matches the same players instead of duplicating them.
  const reg = parseClickTtRegistration(page, r.players, plan);
  if (!reg.recognized) throw new Error(reg.reason);
  assert.equal(reg.rows.filter((x) => x.existing).length, 12);
});

test('distribute by Q-TTR: strongest first, teams of the chosen size, * and missing values stay in the pool', () => {
  const plan = mkPlan();
  const parsed = parseClickTtRegistration(list, [], plan);
  if (!parsed.recognized) throw new Error(parsed.reason);
  const { players } = applyClickTtRegistration([], plan, parsed, { adoptHeading: false });
  const p2 = distributeByQttr(plan, players, 3, 4);
  assert.deepEqual(p2.teams.map((t) => t.slots.length), [4, 4, 4]);
  const q = (id: string) => players.find((p) => p.id === id)!.rules.qttr!;
  const flat = p2.teams.flatMap((t) => t.slots.map((s) => q(s.playerId)));
  assert.deepEqual(flat, [...flat].sort((a, b) => b - a));
  assert.equal(flat[0], 1712);
  assert.ok(!p2.teams.flatMap((t) => t.slots).some((s) => players.find((p) => p.id === s.playerId)!.lastName === 'Stunde'));
  assert.equal(p2.teams[0]!.name, 'Herren I');
  assert.equal(validateLineup(p2, players, TTVN_2026).errorCount, 0);
});

test('Q-TTR list link uses the club id and the cut-off date', async () => {
  const { qttrListUrl, qttrCutoffDate } = await import('../src/imports/clickTtWeb.ts');
  assert.equal(qttrCutoffDate('2026/27', 'VR'), '2026-05-11');
  assert.equal(qttrCutoffDate('2026/27', 'RR'), '2026-12-11');
  assert.equal(
    qttrListUrl('4763', '2026-05-11'),
    'https://ttvn.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/ttrFilter?federation=TTVN&filterType=club&clubId=4763&date=2026-05-11&ttrFilter=suchen&WOSubmitAction=ttrFilter',
  );
});
