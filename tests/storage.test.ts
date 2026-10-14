import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, load, makeBackup, makeTournamentBackup, MemoryStore, parseBackup, save, STORAGE_KEY } from '../src/storage/store.ts';
import { createTournament } from '../src/domain/tournament/workflow.ts';
import { player } from './helpers.ts';

test('save and load round trip', () => {
  const kv = new MemoryStore();
  const d = emptyData();
  d.players.push(player('A', 1500));
  assert.ok(save(kv, d).ok);
  const l = load(kv);
  assert.ok(l.ok);
  if (l.ok) assert.equal(l.data.players[0]!.lastName, 'A');
});

test('corrupt storage is reported, not silently replaced', () => {
  const kv = new MemoryStore();
  kv.setItem(STORAGE_KEY, '{oops');
  const l = load(kv);
  assert.equal(l.ok, false);
  if (!l.ok) assert.equal(l.raw, '{oops');
});

test('quota errors are turned into a user message', () => {
  const kv = { getItem: () => null, removeItem() {}, setItem() { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } };
  const r = save(kv, emptyData());
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /voll/);
});

test('backup: full and single tournament, invalid files rejected', () => {
  const d = emptyData();
  d.players.push(player('A', 1500));
  const full = parseBackup(makeBackup(d, '0.1.0'));
  assert.ok(full.ok && full.kind === 'full');
  const t = createTournament({ name: 'T', date: '2026-01-01', organizer: 'O', seed: 1 });
  const one = parseBackup(makeTournamentBackup(t, '0.1.0'));
  assert.ok(one.ok && one.kind === 'tournament');
  assert.equal(parseBackup('nope').ok, false);
  assert.equal(parseBackup('{"format":"other"}').ok, false);
  assert.equal(parseBackup(JSON.stringify({ format: 'ttsuite-backup', kind: 'full', data: { schemaVersion: 99, players: [], teamPlans: [], tournaments: [], customRuleSets: [] } })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ format: 'ttsuite-backup', kind: 'full', data: { schemaVersion: 1, players: [{ id: 1 }], teamPlans: [], tournaments: [], customRuleSets: [] } })).ok, false);
});
