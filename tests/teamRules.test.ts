import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLineup } from '../src/domain/team-rules/validate.ts';
import { DTTB_WO_2026 } from '../src/domain/team-rules/ruleSets.ts';
import { movePlayer } from '../src/domain/team-rules/model.ts';
import { player, plan } from './helpers.ts';

// Fixtures follow the published tolerances: 35 within a team, 50 across teams (adults);
// Nachwuchs in adult registrations 70/85; D-Kader 105/120 (HTTV-Infoblatt VR 2026/27, BeTTV 2023/24).

const rs = DTTB_WO_2026;
const codes = (v: ReturnType<typeof validateLineup>) => v.findings.map((f) => `${f.severity}:${f.code}`);

test('valid lineup in strength order has no errors', () => {
  const ps = [player('A', 1700), player('B', 1650), player('C', 1600), player('D', 1550)];
  const v = validateLineup(plan([[ps[0]!, ps[1]!], [ps[2]!, ps[3]!]]), ps, rs);
  assert.equal(v.errorCount, 0);
  assert.equal(v.warningCount, 0);
});

test('within team: exactly 35 is allowed, 36 is an error', () => {
  const a = player('A', 1600);
  const b = player('B', 1635);
  assert.equal(validateLineup(plan([[a, b]]), [a, b], rs).errorCount, 0);
  const c = player('C', 1636);
  const v = validateLineup(plan([[a, c]]), [a, c], rs);
  assert.deepEqual(codes(v).filter((x) => x.startsWith('error')), ['error:order-within-team']);
  assert.ok(v.byPlayer[c.id]?.length);
});

test('across teams: 50 allowed, 51 needs a Sperrvermerk (VR) → error until requested', () => {
  const a = player('A', 1600);
  const b = player('B', 1590);
  const ok = player('C', 1640);
  assert.equal(validateLineup(plan([[a, b], [ok]]), [a, b, ok], rs).errorCount, 0);
  const c = player('C', 1641);
  const v = validateLineup(plan([[a, b], [c]]), [a, b, c], rs);
  assert.ok(codes(v).includes('error:spv-required'));
  const f = v.findings.find((x) => x.code === 'spv-required')!;
  assert.match(f.detail, /51 Punkte/);
});

test('requested SPV (VR): deviation becomes a planned Sperrvermerk, no error', () => {
  const a = player('A', 1700);
  const b = player('B', 1600);
  const c = player('C', 1690);
  const d = player('D', 1500);
  const v = validateLineup(plan([[a, b], [c, d]], { spvRequested: [c.id] }), [a, b, c, d], rs);
  assert.equal(v.errorCount, 0, codes(v).join());
  assert.deepEqual(v.derivedSpv.map((x) => [x.playerId, x.kind]), [[c.id, 'deviation']]);
  assert.ok(codes(v).includes('warning:spv-planned'));
});

test('propagation to weaker player ranked above (WO H 2.4 / Infoblätter)', () => {
  const a = player('A', 1700);
  const b = player('B', 1600);
  const top2 = player('Top2', 1580);
  const spv = player('Spv', 1680);
  const v = validateLineup(plan([[a, b], [top2, spv]], { spvRequested: [spv.id] }), [a, b, top2, spv], rs);
  // spv (1680) is within team 2 behind top2 (1580): +100 > 35 → within-team error as well.
  assert.ok(codes(v).includes('error:order-within-team'));
  const sameTeamOk = player('Top2b', 1660);
  const v2 = validateLineup(plan([[a, b], [sameTeamOk, spv]], { spvRequested: [spv.id, sameTeamOk.id] }), [a, b, sameTeamOk, spv], rs);
  assert.equal(v2.errorCount, 0, codes(v2).join());
  const nearTop = player('NearTop', 1645); // 1645 vs 1600 = 45 ≤ 50 → no own deviation, but above SPV player
  const v3 = validateLineup(plan([[a, b], [nearTop, spv]], { spvRequested: [spv.id] }), [a, b, nearTop, spv], rs);
  assert.equal(v3.errorCount, 0, codes(v3).join());
  const d = Object.fromEntries(v3.derivedSpv.map((x) => [x.playerId, x.kind]));
  assert.equal(d[spv.id], 'deviation');
  assert.equal(d[nearTop.id], 'propagated');
  assert.ok(codes(v3).includes('info:spv-propagated'));
  assert.ok(codes(v3).includes('info:spv-ersatz-note'));
});

test('Rückrunde (TTVN): new deviation needs a request; with request → planned SPV with RR condition; existing SPV covers, no higher team', () => {
  const a = player('A', 1600);
  const c = player('C', 1700);
  const noReq = validateLineup(plan([[a], [c]], { halfSeason: 'RR' }), [a, c], rs);
  assert.ok(codes(noReq).includes('error:spv-required'));
  const req = validateLineup(plan([[a], [c]], { halfSeason: 'RR', spvRequested: [c.id] }), [a, c], rs);
  assert.equal(req.errorCount, 0, codes(req).join());
  assert.match(req.findings.find((f) => f.code === 'spv-planned')!.detail, /Rückrunde nur zulässig/);
  const cSpv = { ...c, rules: { ...c.rules, sperrvermerk: { teamNumber: 2 } } };
  const covered = validateLineup(plan([[a], [cSpv]], { halfSeason: 'RR' }), [a, cSpv], rs);
  assert.equal(covered.errorCount, 0);
  assert.ok(codes(covered).includes('info:spv-existing-covers'));
  const higher = validateLineup(plan([[cSpv], [a]], { halfSeason: 'RR' }), [a, cSpv], rs);
  assert.ok(codes(higher).includes('error:spv-existing-higher-team'));
});

test('TTVN: Q-TTR with * is not comparable → warning, no order errors', () => {
  const a = player('A', 1500);
  const star = player('S', 1700, { rules: { qttrProvisional: true } });
  const v = validateLineup(plan([[a, star], []]), [a, star], rs);
  assert.equal(v.errorCount, 0);
  assert.ok(v.findings.some((f) => f.title === 'Q-TTR mit *'));
  const b = player('B', 1690);
  const v2 = validateLineup(plan([[star], [b]]), [star, b], rs);
  assert.equal(v2.errorCount, 0, 'starred player above is not compared either');
});

test('TTVN: Landeskader tolerance applies to adult registrations only', () => {
  const a = player('A', 1200);
  const k = player('K', 1300, { rules: { kader: 'd-kader-plus' } });
  assert.equal(validateLineup(plan([[a], [k]]), [a, k], rs).errorCount, 0);
  const youth = validateLineup(plan([[a], [k]], { ageClass: 'nachwuchs' }), [a, k], rs);
  assert.ok(codes(youth).includes('error:spv-required'), '100 > 85 in Nachwuchs');
});

test('existing SPV in a new Vorrunde → warning to review', () => {
  const a = { ...player('A', 1600), rules: { qttr: 1600, sperrvermerk: { teamNumber: 2 } } };
  const v = validateLineup(plan([[a]]), [a], rs);
  assert.ok(codes(v).includes('warning:spv-existing-vr'));
});

test('Ergänzungsspieler may neither trigger nor receive a Sperrvermerk', () => {
  const a = player('A', 1600);
  const wes = player('W', 1700, { gender: 'w' });
  const trig = validateLineup(plan([[a], [[wes, 'WES']]], { spvRequested: [wes.id] }), [a, wes], rs);
  assert.ok(codes(trig).includes('error:spv-ergaenzung'));
  const nes = player('N', 1610);
  const spv = player('S', 1690);
  const recv = validateLineup(plan([[a], [[nes, 'NES'], spv]], { spvRequested: [spv.id] }), [a, nes, spv], rs);
  // NES (1610) would be propagated → error; spv also 80 > 35 within team → within error
  assert.ok(codes(recv).includes('error:spv-ergaenzung'));
});

test('Nachwuchs tolerance 70/85 in adult registrations, Kader 105/120', () => {
  const a = player('A', 1600);
  const y = player('Y', 1684, { rules: { nachwuchs: true } });
  assert.equal(validateLineup(plan([[a], [y]]), [a, y], rs).errorCount, 0);
  const y2 = player('Y2', 1686, { rules: { nachwuchs: true } });
  assert.ok(codes(validateLineup(plan([[a], [y2]]), [a, y2], rs)).includes('error:spv-required'));
  const yWithin = player('YW', 1670, { rules: { nachwuchs: true } });
  assert.equal(validateLineup(plan([[a, yWithin]]), [a, yWithin], rs).errorCount, 0);
  const k = player('K', 1720, { rules: { kader: 'd-kader-plus' } });
  assert.equal(validateLineup(plan([[a], [k]]), [a, k], rs).errorCount, 0);
  const kWithin = player('KW', 1705, { rules: { kader: 'd-kader-plus' } });
  assert.equal(validateLineup(plan([[a, kWithin]]), [a, kWithin], rs).errorCount, 0);
});

test('Nachwuchs age class uses 70/85 for everybody; RES is not allowed there', () => {
  const a = player('A', 1200);
  const b = player('B', 1265);
  const v = validateLineup(plan([[a, [b, 'RES']]], { ageClass: 'nachwuchs' }), [a, b], rs);
  assert.ok(!codes(v).includes('error:order-within-team'));
  assert.ok(codes(v).includes('error:reserve-youth'));
});

test('missing Q-TTR → warning (Spielleiter ordnet ein), no order check', () => {
  const a = player('A', 1500);
  const x = player('X', undefined);
  const v = validateLineup(plan([[a, x]]), [a, x], rs);
  assert.equal(v.errorCount, 0);
  assert.ok(codes(v).includes('warning:missing-qttr'));
});

test('ineligible player → error; Sollstärke counts only Stammspieler', () => {
  const a = player('A', 1500, { rules: { eligible: false, eligibilityNote: 'Sperre' } });
  const b = player('B', 1450);
  const p = plan([[a, [b, 'RES']]]);
  p.teams[0]!.sollstaerke = 2;
  const v = validateLineup(p, [a, b], rs);
  assert.ok(codes(v).includes('error:not-eligible'));
  assert.ok(codes(v).includes('warning:sollstaerke'));
});

test('unknown player id and duplicates are reported', () => {
  const a = player('A', 1500);
  const p = plan([[a], [a]]);
  p.teams[0]!.slots.push({ playerId: 'ghost', role: 'stamm' });
  const v = validateLineup(p, [a], rs);
  assert.ok(codes(v).includes('error:duplicate-assignment'));
  assert.ok(codes(v).includes('error:unknown-player'));
});

test('movePlayer: reorder within team, move across teams, unassign', () => {
  const ps = [player('A', 1), player('B', 2), player('C', 3)];
  let p = plan([[ps[0]!, ps[1]!], [ps[2]!]]);
  p = movePlayer(p, ps[0]!.id, 'team1', 2); // move A below B
  assert.deepEqual(p.teams[0]!.slots.map((s) => s.playerId), [ps[1]!.id, ps[0]!.id]);
  p = movePlayer(p, ps[2]!.id, 'team1', 0);
  assert.deepEqual(p.teams[0]!.slots.map((s) => s.playerId), [ps[2]!.id, ps[1]!.id, ps[0]!.id]);
  assert.equal(p.teams[1]!.slots.length, 0);
  p = movePlayer(p, ps[1]!.id, null, 0);
  assert.equal(p.teams[0]!.slots.length, 2);
});

test('validation is fast enough for a large club (100 players)', () => {
  const ps = Array.from({ length: 100 }, (_, i) => player(`P${i}`, 2000 - i * 7));
  const teams = Array.from({ length: 16 }, (_, t) => ps.slice(t * 6, t * 6 + 6));
  const t0 = performance.now();
  validateLineup(plan(teams), ps, rs);
  assert.ok(performance.now() - t0 < 200);
});
