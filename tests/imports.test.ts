import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeText, detectDelimiter, parseDelimited, toCsv } from '../src/imports/csv.ts';
import { adoptTtrAsQttr, guessMapping, mapRows, parseFlags, readTable, TABLE_PRESETS } from '../src/imports/tabular.ts';
import { readClickTtXml } from '../src/imports/clickTtXml.ts';
import { findDuplicate, mergePlayer } from '../src/domain/players/duplicates.ts';
import { parseRating, splitFullName } from '../src/domain/players/normalize.ts';
import { parseXml } from '../src/lib/xml.ts';
import { player } from './helpers.ts';

test('CSV: semicolon, quotes, BOM, CRLF', () => {
  const rows = parseDelimited('﻿Name;Verein\r\n"Müller, Max";"TTC ""Grün"" Weiß"\r\n\r\n');
  assert.deepEqual(rows, [['Name', 'Verein'], ['Müller, Max', 'TTC "Grün" Weiß']]);
});

test('CSV: delimiter detection incl. pasted tab tables', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(detectDelimiter('Rang\tName\tTTR\n1\tMax\t1500'), '\t');
});

test('CSV round trip via toCsv', () => {
  const csv = toCsv([['a;b', 'c"d'], [1, '']]);
  assert.deepEqual(parseDelimited(csv), [['a;b', 'c"d'], ['1', '']]);
});

test('decodeText falls back to Windows-1252 for Excel CSVs', () => {
  const bytes = new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]); // "Müller" in cp1252
  const r = decodeText(bytes);
  assert.equal(r.encoding, 'windows-1252');
  assert.equal(r.text, 'Müller');
});

test('rating parsing rejects garbage, accepts thousands separator', () => {
  assert.equal(parseRating('1.534'), 1534);
  assert.equal(parseRating(' 1534 '), 1534);
  assert.equal(parseRating('1534*'), 1534);
  assert.equal(parseRating(''), undefined);
  assert.ok(Number.isNaN(parseRating('abc')));
  assert.ok(Number.isNaN(parseRating('99999')));
});

test('name splitting', () => {
  assert.deepEqual(splitFullName('Mustermann, Max'), { firstName: 'Max', lastName: 'Mustermann' });
  assert.deepEqual(splitFullName('Anna Lena Beispiel'), { firstName: 'Anna Lena', lastName: 'Beispiel' });
});

test('header guessing maps German column names', () => {
  const m = guessMapping(['Nachname', 'Vorname', 'Verein', 'Q-TTR', 'TTR', 'Geschlecht', 'Jahrgang', 'Lizenz-Nr', 'Mannschaft', 'Rang', 'Kennzeichen']);
  assert.deepEqual(m, ['lastName', 'firstName', 'club', 'qttr', 'ttr', 'gender', 'birthYear', 'licenceNr', 'team', 'position', 'flags']);
  // "Name" + "Vorname" → Name means last name
  assert.deepEqual(guessMapping(['Name', 'Vorname']), ['lastName', 'firstName']);
});

test('table import: sample file → candidates with hints and flags', () => {
  const text = readFileSync('sample-data/fiktive_spieler_mannschaftsmeldung.csv', 'utf8');
  const table = readTable(text);
  assert.equal(table.hasHeader, true);
  const preview = mapRows(table, guessMapping(table.headers, TABLE_PRESETS[0]), 'click-tt-table', { fileName: 'x.csv' });
  assert.equal(preview.globalIssues.filter((i) => i.severity === 'error').length, 0);
  assert.equal(preview.candidates.length, 22);
  const first = preview.candidates[0]!;
  assert.equal(first.player?.rules.qttr, 1712);
  assert.equal(first.hints?.team, 'Herren I');
  const sbem = preview.candidates.filter((c) => c.player?.rules.nachwuchs);
  assert.equal(sbem.length, 2);
  assert.ok(preview.candidates.some((c) => c.hints?.flags.includes('WES')));
});

test('table import: missing name is an error row, invalid TTR a warning', () => {
  const table = readTable('Nachname;Vorname;Q-TTR\n;Max;1500\nMuster;Eva;abc\n');
  const p = mapRows(table, guessMapping(table.headers), 'generic-table');
  assert.equal(p.candidates[0]!.player, undefined);
  assert.equal(p.candidates[0]!.issues[0]!.severity, 'error');
  assert.equal(p.candidates[1]!.player?.rules.qttr, undefined);
  assert.ok(p.candidates[1]!.issues.some((i) => i.field === 'qttr' && i.severity === 'warning'));
});

test('table import: no name column → global error; TTR-only → warning and adopt option', () => {
  const t = readTable('Verein;TTR\nA;1500\n');
  assert.ok(mapRows(t, guessMapping(t.headers), 'generic-table').globalIssues.some((i) => i.severity === 'error'));
  const t2 = readTable('Name;TTR\nMax Muster;1500\n');
  const p2 = mapRows(t2, guessMapping(t2.headers), 'mytischtennis-table');
  assert.ok(p2.globalIssues.some((i) => i.message.includes('Q-TTR')));
  assert.equal(p2.candidates[0]!.player?.rules.qttr, undefined);
  assert.equal(adoptTtrAsQttr(p2).candidates[0]!.player?.rules.qttr, 1500);
});

test('flag parsing', () => {
  assert.deepEqual(parseFlags('RES, spv'), ['RES', 'SPV']);
  assert.deepEqual(parseFlags('D-Kader SBEM'), ['DKADER', 'SBEM']);
});

test('XML parser: entities, comments, doctype, self-closing', () => {
  const el = parseXml('<?xml version="1.0"?><!DOCTYPE x SYSTEM "y"><!-- c --><a n="S &amp; M"><b k=\'1\'/><b k="2"></b></a>');
  assert.equal(el.name, 'a');
  assert.equal(el.attrs['n'], 'S & M');
  assert.equal(el.children.length, 2);
  assert.throws(() => parseXml('<a><b></a>'));
});

test('click-TT participant XML (fictional sample) is read with ids preserved', () => {
  const xml = readFileSync('sample-data/fiktives_tt-race_clicktt_teilnehmer.xml', 'utf8');
  const r = readClickTtXml(xml, { fileName: 's.xml' });
  assert.equal(r.globalIssues.length, 0);
  assert.equal(r.candidates.length, 13);
  const p = r.candidates[0]!.player!;
  assert.equal(p.meta.sourceRef, 'PLAYER1');
  assert.ok(p.licenceNr && p.internalNr?.startsWith('NU'));
  assert.equal(typeof p.ttr, 'number');
  assert.equal(r.tournament?.attrs['tournament-id'], 'FIKTIV0000000000000000000000000001');
  assert.equal(r.tournament?.competitions[0]?.attrs['type'], 'Einzel');
  assert.ok(p.clickTtPerson && p.clickTtPerson['club-federation-nickname'] === 'ByTTV');
});

test('click-TT XML: malformed and wrong root are rejected with a message', () => {
  assert.match(readClickTtXml('<tournament><competition>').globalIssues[0]!.message, /kein gültiges XML/);
  assert.match(readClickTtXml('<foo/>').globalIssues[0]!.message, /Wurzelelement/);
  const doubles = readClickTtXml('<tournament><competition type="Doppel"><players></players></competition></tournament>');
  assert.ok(doubles.globalIssues.some((i) => i.message.includes('Doppel')));
});

test('duplicates: licence = strong, name+year = weak, differing year = none; merge keeps id', () => {
  const a = player('Muster', 1500, { firstName: 'Max', licenceNr: '123', birthYear: 1990, club: 'TTC A' });
  const pool = [a];
  const byLic = findDuplicate(player('Anders', 1400, { licenceNr: '123' }), pool)!;
  assert.equal(byLic.strength, 'strong');
  const byName = findDuplicate(player('Muster', 1520, { firstName: 'Max', birthYear: 1990 }), pool)!;
  assert.equal(byName.reason, 'name-birthyear');
  assert.deepEqual(byName.conflicts.map((c) => c.field), ['qttr']);
  assert.equal(findDuplicate(player('Muster', 1520, { firstName: 'Max', birthYear: 1970 }), pool), undefined);
  const merged = mergePlayer(a, player('Muster', 1550, { firstName: 'Max', club: 'TTC B' }));
  assert.equal(merged.id, a.id);
  assert.equal(merged.rules.qttr, 1550);
  assert.equal(merged.club, 'TTC B');
  assert.equal(merged.licenceNr, '123');
});

test('demo data set: plan with 4 teams, valid tournament setup', async () => {
  const { buildDemo } = await import('../src/features/shared/demo.ts');
  const { checkSetup } = await import('../src/domain/tournament/workflow.ts');
  const d = buildDemo(readFileSync('sample-data/fiktive_spieler_mannschaftsmeldung.csv', 'utf8'), readFileSync('sample-data/fiktives_tt-race_clicktt_teilnehmer.xml', 'utf8'));
  assert.equal(d.players.length, 22);
  assert.equal(d.plan.teams.length, 4);
  assert.equal(d.plan.teams.reduce((s, t) => s + t.slots.length, 0), 22);
  assert.equal(d.tournament.participants.length, 13);
  assert.ok(d.tournament.clickTt);
  assert.equal(checkSetup(d.tournament).filter((i) => i.severity === 'error').length, 0);
});

test('click-TT page copy (Strg+A): header found below title lines, rank → team/position, status flags', async () => {
  const { applyLineupHints, newPlan } = await import('../src/features/team-planner/state.ts');
  const text = readFileSync('sample-data/fiktive_clicktt_meldung_kopiert.txt', 'utf8');
  const table = readTable(text);
  assert.equal(table.hasHeader, true);
  assert.equal(table.contextClub, 'TTC Musterstadt 1950 (fiktiv)');
  const mapping = guessMapping(table.headers, TABLE_PRESETS[0]);
  assert.deepEqual(mapping.slice(0, 3), ['position', 'qttr', 'lastName']);
  const p = mapRows(table, mapping, 'click-tt-table');
  assert.equal(p.candidates.length, 11);
  const c0 = p.candidates[0]!;
  assert.equal(c0.player?.lastName, 'Testmeier');
  assert.equal(c0.player?.firstName, 'Tim');
  assert.equal(c0.player?.rules.qttr, 1712);
  assert.equal(c0.player?.club, 'TTC Musterstadt 1950 (fiktiv)');
  assert.deepEqual([c0.hints?.teamNumber, c0.hints?.position], [1, 1]);
  assert.deepEqual(p.candidates[7]!.hints?.flags, ['RES']);
  assert.equal(p.candidates[8]!.player?.rules.nachwuchs, true);
  assert.equal(p.candidates[10]!.player?.rules.qttr, undefined);

  const hints = new Map(p.candidates.map((c) => [c.player!.id, c.hints!]));
  const plan = newPlan({ name: 'Herren', season: '2026/27', halfSeason: 'VR', ageClass: 'erwachsene', teamCount: 1, teamPrefix: 'Herren', sollstaerke: 4 });
  const r = applyLineupHints(plan, hints);
  assert.deepEqual(r.plan.teams.map((t) => [t.name, t.slots.length]), [['Herren I', 4], ['Herren II', 4], ['Herren III', 3]]);
  assert.equal(r.plan.teams[1]!.slots[3]!.role, 'RES');
  assert.equal(r.plan.teams[2]!.slots[1]!.role, 'RES');
});

test('click-TT links: club id parsing and registration URL', async () => {
  const { parseClubInput, registrationUrl, clubSearchUrl, clubOverviewUrl } = await import('../src/imports/clickTtWeb.ts');
  assert.equal(parseClubInput('https://bttv.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/clubInfoDisplay?club=24668'), '24668');
  assert.equal(parseClubInput(' 7412 '), '7412');
  assert.equal(parseClubInput('Pfaffenhofen'), undefined);
  assert.equal(
    registrationUrl('7412', { season: '2026/27', half: 'RR', ageClass: 'erwachsene' }),
    'https://bttv.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/clubPools?displayTyp=rueckrunde&club=7412&contestType=Erwachsene&seasonName=2026%2F27',
  );
  assert.equal(registrationUrl('7412', { season: '2026/27', half: 'VR', ageClass: 'nachwuchs' }), null);
  assert.match(clubSearchUrl('WTTV', 'Dortmund'), /clubSearch\?federation=WTTV&searchFor=Dortmund$/);
  assert.match(clubOverviewUrl('7412'), /clubPools\?club=7412$/);
});
