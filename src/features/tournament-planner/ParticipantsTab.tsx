import { useMemo, useState } from 'react';
import { navigate } from '../../app-shell/router.ts';
import { fullName, newId, seedingRating, type Player } from '../../domain/players/model.ts';
import { normalizeName } from '../../domain/players/normalize.ts';
import type { Tournament } from '../../domain/tournament/model.ts';
import { addParticipants, checkSetup, confirmParticipants, removeParticipant, updateParticipant } from '../../domain/tournament/workflow.ts';
import { useAppData } from '../../storage/AppDataProvider.tsx';
import { Badge, Callout, Dialog, EmptyState, useConfirm, useToast } from '../../shared-ui/components.tsx';
import { IconEdit, IconPlus, IconTrash, IconUpload } from '../../shared-ui/icons.tsx';
import { PlayerEditor, blankPlayer } from '../shared/PlayerEditor.tsx';
import { PlayerImportWizard, type ImportOutcome } from '../shared/PlayerImportWizard.tsx';

export function ParticipantsTab({ t, save }: { t: Tournament; save: (t: Tournament) => void }) {
  const { data } = useAppData();
  const toast = useToast();
  const confirm = useConfirm();
  const [importOpen, setImportOpen] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const [editing, setEditing] = useState<{ pid?: string; player: Player } | null>(null);
  const started = t.rounds.length > 0;
  const issues = checkSetup(t);

  const sorted = useMemo(() => [...t.participants].sort((a, b) => (seedingRating(b.player) ?? -1) - (seedingRating(a.player) ?? -1)), [t.participants]);
  const dupKeys = useMemo(() => {
    const count = new Map<string, number>();
    const key = (p: Player) => p.licenceNr ?? `${normalizeName(p.lastName)}|${normalizeName(p.firstName)}|${p.birthYear ?? ''}`;
    t.participants.forEach((p) => count.set(key(p.player), (count.get(key(p.player)) ?? 0) + 1));
    return new Set(t.participants.filter((p) => (count.get(key(p.player)) ?? 0) > 1).map((p) => p.id));
  }, [t.participants]);

  const onImport = async (o: ImportOutcome) => {
    // Inside a tournament, "updated" means: already in the pool – we take the merged record as participant.
    const incoming = [...o.added, ...o.updated];
    if (o.clickTt) {
      if (t.participants.length > 0 && !t.clickTt) {
        const ok = await confirm({
          title: 'click-TT-Teilnehmerdatei',
          message: <p>Es gibt bereits Teilnehmer ohne click-TT-Zuordnung. Für den Ergebnis-Export müssen alle Teilnehmer aus der click-TT-Datei stammen. Bestehende Teilnehmer ersetzen?</p>,
          confirmLabel: 'Ersetzen',
        });
        if (!ok) return;
        save({ ...addParticipants({ ...t, participants: [] }, incoming.map(cloneForTournament)), clickTt: o.clickTt });
        toast('ok', `${incoming.length} Teilnehmer aus click-TT übernommen`);
        return;
      }
      if (t.clickTt && t.clickTt.tournament.attrs['tournament-id'] !== o.clickTt.tournament.attrs['tournament-id']) {
        toast('error', 'Die Datei gehört zu einem anderen click-TT-Turnier (tournament-id).');
        return;
      }
      // Re-import of the same click-TT file (e.g. late registrations): replace list, keep nothing stale.
      const ok = t.participants.length === 0 || (await confirm({ title: 'Teilnehmerliste aktualisieren?', message: <p>Die Teilnehmerliste wird durch die neue click-TT-Datei ersetzt (Spieler-IDs werden von click-TT bei jedem Download neu vergeben).</p>, confirmLabel: 'Aktualisieren' }));
      if (!ok) return;
      save({ ...addParticipants({ ...t, participants: [] }, incoming.map(cloneForTournament)), clickTt: o.clickTt });
      toast('ok', `${incoming.length} Teilnehmer aus click-TT übernommen`);
      return;
    }
    let next = t;
    for (const u of o.updated) {
      const part = t.participants.find((p) => p.player.id === u.id);
      if (part) next = updateParticipant(next, part.id, u);
    }
    save(addParticipants(next, o.added.map(cloneForTournament)));
    toast('ok', `${o.added.length} Teilnehmer hinzugefügt, ${o.updated.length} aktualisiert`);
  };

  const confirmList = () => {
    const r = confirmParticipants(t);
    if (!r.ok) return toast('error', r.error);
    save(r.tournament);
    toast('ok', 'Teilnehmerliste bestätigt');
    navigate('turniere', t.id, 'einstellungen');
  };

  return (
    <div className="stack gap-m">
      {t.clickTt && (
        <Callout tone="info" title="Verknüpft mit click-TT">
          {t.clickTt.tournament.attrs['name']} · {t.clickTt.tournament.competitions[t.clickTt.competitionIndex]?.label}. Teilnehmer, die nicht aus dieser Datei stammen, können nicht nach click-TT exportiert werden.
        </Callout>
      )}
      {started && <Callout tone="info">Das Turnier läuft – Teilnehmer können nicht mehr hinzugefügt oder entfernt werden. Abmeldungen über „Zurückziehen“ in der Rundenansicht.</Callout>}
      <div className="row gap-s wrap">
        {!started && (
          <>
            <button className="btn btn-primary" onClick={() => setImportOpen(true)}><IconUpload /> Importieren</button>
            <button className="btn" onClick={() => setPoolOpen(true)} disabled={data.players.length === 0}>Aus Spielerpool ({data.players.length})</button>
            <button className="btn" onClick={() => setEditing({ player: blankPlayer() })}><IconPlus /> Manuell</button>
          </>
        )}
      </div>

      {t.participants.length === 0 ? (
        <EmptyState title="Noch keine Teilnehmer">
          Am besten die Teilnehmerdatei (XML) aus dem click-TT-Turnierportal importieren – nur so ist ein Ergebnis-Export nach click-TT möglich. Alternativ CSV/Tabelle oder Spielerpool.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Name</th>
                <th>Verein</th>
                <th className="num">TTR</th>
                <th>Jg.</th>
                <th>Zuordnung</th>
                <th><span className="sr-only">Aktionen</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.id} className={dupKeys.has(p.id) ? 'row-warning' : ''}>
                  <td className="num muted">{i + 1}</td>
                  <td>
                    {fullName(p.player)}
                    {dupKeys.has(p.id) && <> <Badge tone="warning">möglicher Doppeleintrag</Badge></>}
                    {p.withdrawnAfterRound !== undefined && <> <Badge tone="neutral">zurückgezogen nach R{p.withdrawnAfterRound}</Badge></>}
                  </td>
                  <td className="small">{p.player.club}</td>
                  <td className="num">
                    {seedingRating(p.player) ?? <Badge tone="warning">fehlt</Badge>}
                  </td>
                  <td className="small">{p.player.birthYear ?? ''}</td>
                  <td className="small">{p.player.meta.sourceRef ? <Badge tone="ok">click-TT {p.player.meta.sourceRef}</Badge> : <span className="muted">lokal</span>}</td>
                  <td className="actions">
                    <button className="btn-icon sm" aria-label={`${fullName(p.player)} bearbeiten`} onClick={() => setEditing({ pid: p.id, player: p.player })}><IconEdit size={15} /></button>
                    {!started && (
                      <button className="btn-icon sm" aria-label={`${fullName(p.player)} entfernen`} onClick={() => save(removeParticipant(t, p.id))}><IconTrash size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!started && t.participants.length > 0 && (
        <div className="card stack gap-s">
          <h3>Teilnehmerliste prüfen &amp; bestätigen</h3>
          {issues.length === 0 && <Callout tone="ok">Keine Auffälligkeiten.</Callout>}
          {issues.map((i, k) => (
            <Callout key={k} tone={i.severity === 'error' ? 'error' : 'warning'}>{i.message}</Callout>
          ))}
          <p className="small muted">Bitte Identität und TTR-Werte der Teilnehmer vor Ort kontrollieren. Nach der Bestätigung können Spielsystem und Runden festgelegt werden; bis zur ersten Auslosung bleibt die Liste änderbar.</p>
          <div className="row gap-s">
            <button className="btn btn-primary" onClick={confirmList} disabled={issues.some((i) => i.severity === 'error')}>
              {t.confirmed ? 'Erneut bestätigen' : 'Teilnehmerliste bestätigen'}
            </button>
          </div>
        </div>
      )}

      <PlayerImportWizard open={importOpen} onClose={() => setImportOpen(false)} onConfirm={onImport} pool={t.participants.map((p) => p.player)} allowXml defaultSource="click-tt-xml" title="Teilnehmer importieren" />
      <PoolPicker open={poolOpen} onClose={() => setPoolOpen(false)} pool={data.players} existing={t.participants.map((p) => p.player)} onPick={(ps) => { save(addParticipants(t, ps.map(cloneForTournament))); setPoolOpen(false); }} />
      <PlayerEditor
        player={editing?.player ?? null}
        open={!!editing}
        showLineupRules={false}
        onClose={() => setEditing(null)}
        onSave={(p) => {
          if (editing?.pid) save(updateParticipant(t, editing.pid, p));
          else save(addParticipants(t, [p]));
          setEditing(null);
        }}
        title={editing?.pid ? 'Teilnehmer bearbeiten' : 'Teilnehmer anlegen'}
      />
    </div>
  );
}

/** Tournament participants are snapshots, decoupled from later pool edits. */
function cloneForTournament(p: Player): Player {
  return { ...structuredClone(p), id: newId('p') };
}

function PoolPicker({ open, onClose, pool, existing, onPick }: { open: boolean; onClose: () => void; pool: readonly Player[]; existing: readonly Player[]; onPick: (p: Player[]) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const taken = new Set(existing.map((p) => p.licenceNr ?? `${p.lastName}|${p.firstName}`));
  const list = pool.filter((p) => normalizeName(fullName(p)).includes(normalizeName(q))).sort((a, b) => (seedingRating(b) ?? -1) - (seedingRating(a) ?? -1));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Aus Spielerpool hinzufügen"
      footer={
        <>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={sel.size === 0} onClick={() => { onPick(pool.filter((p) => sel.has(p.id))); setSel(new Set()); }}>
            {sel.size} hinzufügen
          </button>
        </>
      }
    >
      <input className="input" type="search" placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Suchen" />
      <ul className="pick-list">
        {list.map((p) => {
          const dup = taken.has(p.licenceNr ?? `${p.lastName}|${p.firstName}`);
          return (
            <li key={p.id}>
              <label className="check">
                <input type="checkbox" disabled={dup} checked={sel.has(p.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                {p.lastName}, {p.firstName} <span className="muted small">{p.club} · {seedingRating(p) ?? '–'}</span>
                {dup && <Badge tone="neutral">bereits Teilnehmer</Badge>}
              </label>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
