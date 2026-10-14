import { useEffect, useState } from 'react';
import { activeIn, plannedRounds, type Match, type Round, type Tournament } from '../../domain/tournament/model.ts';
import { formatResult, parseResult } from '../../domain/tournament/results.ts';
import { computeStandings } from '../../domain/tournament/standings.ts';
import { canGenerateNextRound, finishTournament, generateNextRound, regenerateRound, reopenTournament, roundComplete, setResult, undoWithdraw, withdraw } from '../../domain/tournament/workflow.ts';
import { navigate } from '../../app-shell/router.ts';
import { Badge, Callout, Dialog, useConfirm, useToast } from '../../shared-ui/components.tsx';
import { IconPrint, IconShuffle } from '../../shared-ui/icons.tsx';
import { nameOf } from './useTournament.ts';

export function RoundsTab({ t, save }: { t: Tournament; save: (t: Tournament) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [sel, setSel] = useState(t.rounds.length || 1);
  const [genError, setGenError] = useState<{ error: string; notes?: string[] }>();
  const [notes, setNotes] = useState<string[]>([]);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  useEffect(() => setSel((s) => Math.min(Math.max(s, 1), Math.max(t.rounds.length, 1))), [t.rounds.length]);

  const round = t.rounds.find((r) => r.number === sel);
  const can = canGenerateNextRound(t);
  const name = nameOf(t);
  const standings = computeStandings(t, sel - 1);
  const winsBefore = new Map(standings.map((s) => [s.participantId, s.wins]));

  const generate = () => {
    const r = generateNextRound(t);
    if (!r.ok) {
      setGenError({ error: r.error, notes: r.notes });
      return;
    }
    setGenError(undefined);
    save(r.tournament);
    setSel(r.tournament.rounds.length);
    toast('ok', `Runde ${r.tournament.rounds.length} ausgelost`);
  };

  const regenerate = async (n: number) => {
    const ok = await confirm({ title: `Runde ${n} neu auslosen?`, message: <p>Die Paarungen von Runde {n} werden verworfen und auf Basis des aktuellen Tabellenstands neu ausgelost.</p>, confirmLabel: 'Neu auslosen' });
    if (!ok) return;
    const r = regenerateRound(t, n);
    if (!r.ok) return toast('error', r.error);
    save(r.tournament);
    toast('ok', `Runde ${n} neu ausgelost`);
  };

  const commitResult = (m: Match, input: string): string | undefined => {
    if (!round) return;
    if (input.trim() === '') {
      const r = setResult(t, round.number, m.id, undefined);
      if (r.ok) save(r.tournament);
      return;
    }
    const parsed = parseResult(input, t.config.bestOf);
    if (!parsed.result) return parsed.errors.join(' · ');
    const r = setResult(t, round.number, m.id, parsed.result);
    if (!r.ok) return r.error;
    save(r.tournament);
    if (r.notes) setNotes(r.notes);
    return undefined;
  };

  const finish = () => {
    const r = finishTournament(t);
    if (!r.ok) return toast('error', r.error);
    save(r.tournament);
    navigate('turniere', t.id, 'tabelle');
  };

  const laterHaveNoResults = (n: number) => t.rounds.filter((r) => r.number >= n).every((r) => r.matches.every((m) => !m.result || m.result.kind === 'walkover'));

  return (
    <div className="stack gap-m">
      <div className="row gap-s wrap between">
        <div className="round-pills" role="tablist" aria-label="Runden">
          {t.rounds.map((r) => (
            <button key={r.number} role="tab" aria-selected={sel === r.number} className={`pill ${sel === r.number ? 'pill-active' : ''} ${roundComplete(r) ? 'pill-done' : ''}`} onClick={() => setSel(r.number)}>
              R{r.number}
              {!roundComplete(r) && <span className="dot" aria-label="offen" />}
            </button>
          ))}
          {t.rounds.length < plannedRounds(t) && <span className="muted small">… bis R{plannedRounds(t)}</span>}
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => setWithdrawOpen(true)}>Abmeldung…</button>
          {round && <button className="btn" onClick={() => window.print()}><IconPrint /> Spielzettel</button>}
          {t.finished ? (
            <button className="btn" onClick={() => save(reopenTournament(t))}>Wieder öffnen</button>
          ) : can.ok ? (
            <button className="btn btn-primary" onClick={generate}><IconShuffle /> Runde {t.rounds.length + 1} auslosen</button>
          ) : t.rounds.length >= plannedRounds(t) && t.rounds.length > 0 && roundComplete(t.rounds[t.rounds.length - 1]!) ? (
            <button className="btn btn-primary" onClick={finish}>Turnier abschließen</button>
          ) : (
            <button className="btn btn-primary" disabled title={can.reason}>Nächste Runde auslosen</button>
          )}
        </div>
      </div>
      {!can.ok && !t.finished && t.rounds.length > 0 && t.rounds.length < plannedRounds(t) && <p className="small muted">{can.reason}</p>}
      {genError && (
        <Callout tone="error" title="Keine gültige Auslosung möglich">
          {genError.error}
          {genError.notes?.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </Callout>
      )}
      {notes.length > 0 && (
        <Callout tone="warning" title="Ergebnis korrigiert">
          {notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
          <div className="row gap-s wrap">
            {t.rounds.filter((r) => r.number > 1 && r.number === t.rounds.length && laterHaveNoResults(r.number)).map((r) => (
              <button key={r.number} className="btn btn-s" onClick={() => { void regenerate(r.number); setNotes([]); }}>Runde {r.number} neu auslosen</button>
            ))}
            <button className="btn btn-s" onClick={() => setNotes([])}>Ausblenden</button>
          </div>
        </Callout>
      )}

      {!round ? (
        <div className="card stack gap-s center">
          <h3>Bereit für Runde 1</h3>
          <p className="muted">{t.participants.length} Teilnehmer · {plannedRounds(t)} Runden geplant</p>
          <div>
            <button className="btn btn-primary" onClick={generate} disabled={!can.ok}><IconShuffle /> Runde 1 auslosen</button>
          </div>
        </div>
      ) : (
        <section className="card stack gap-s">
          <div className="row gap-s wrap between">
            <h2>Runde {round.number}</h2>
            <span className="row gap-s">
              {roundComplete(round) ? <Badge tone="ok">vollständig</Badge> : <Badge tone="warning">{round.matches.filter((m) => !m.result).length} Ergebnis(se) offen</Badge>}
              {round.number === t.rounds.length && laterHaveNoResults(round.number) && !t.finished && (
                <button className="btn btn-s" onClick={() => regenerate(round.number)}><IconShuffle size={14} /> neu auslosen</button>
              )}
            </span>
          </div>
          <p className="small muted">
            Eingabe: Satzergebnisse „11:7 9:11 11:5 11:8“ oder kurz „7 -9 5 8“ (Minus = Satz für Spieler B) · nur Sätze „3:1“ · kampflos „wo A“ / „wo B“. Enter speichert.
          </p>
          <div className="table-wrap">
            <table className="table matches">
              <thead>
                <tr>
                  <th className="num">Tisch</th>
                  <th>Spieler A</th>
                  <th>Spieler B</th>
                  <th>Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {round.matches.map((m, i) => (
                  <tr key={m.id}>
                    <td className="num muted">{m.table ?? i + 1}</td>
                    <td className={m.result?.winner === 'A' ? 'winner' : ''}>
                      {name(m.a)} <span className="muted small">({winsBefore.get(m.a) ?? 0} S)</span>
                    </td>
                    <td className={m.result?.winner === 'B' ? 'winner' : ''}>
                      {name(m.b)} <span className="muted small">({winsBefore.get(m.b) ?? 0} S)</span>
                    </td>
                    <td>
                      <ResultInput match={m} disabled={t.finished} onCommit={(v) => commitResult(m, v)} />
                    </td>
                  </tr>
                ))}
                {round.bye && (
                  <tr className="bye">
                    <td className="num muted">–</td>
                    <td>{name(round.bye)}</td>
                    <td colSpan={2}>
                      <Badge tone="info">Freilos – zählt als Sieg</Badge>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {round.notes.length > 0 && (
            <details className="small">
              <summary>Wie wurde ausgelost?</summary>
              <ul>
                {round.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      {round && <PrintRound t={t} round={round} />}
      <WithdrawDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} t={t} save={save} />
    </div>
  );
}

function ResultInput({ match, onCommit, disabled }: { match: Match; onCommit: (v: string) => string | undefined; disabled: boolean }) {
  const display = match.result ? (match.result.kind === 'walkover' ? `wo ${match.result.winner}` : match.result.sets.length ? match.result.sets.map((s) => `${s.a}:${s.b}`).join(' ') : `${match.result.setsA}:${match.result.setsB}`) : '';
  const [v, setV] = useState(display);
  const [err, setErr] = useState<string>();
  useEffect(() => setV(display), [display]);
  const commit = () => {
    if (v === display) return;
    const e = onCommit(v);
    setErr(e);
  };
  return (
    <div className="result-cell">
      <input
        className={`input input-s mono ${err ? 'is-invalid' : ''}`}
        value={v}
        disabled={disabled}
        onChange={(e) => {
          setV(e.target.value);
          setErr(undefined);
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        aria-label="Ergebnis"
        aria-invalid={!!err}
        placeholder="z. B. 11:7 9:11 11:5 11:8"
      />
      {err ? (
        <span className="field-msg">{err}</span>
      ) : match.result ? (
        <span className="small">
          <Badge tone={match.result.kind === 'walkover' || match.result.sets.length === 0 ? 'warning' : 'ok'}>{formatResult(match.result).split(' (')[0]}</Badge>
          {match.result.kind === 'played' && match.result.sets.length === 0 && <span className="muted"> Satzergebnisse fehlen</span>}
        </span>
      ) : null}
    </div>
  );
}

function WithdrawDialog({ open, onClose, t, save }: { open: boolean; onClose: () => void; t: Tournament; save: (t: Tournament) => void }) {
  const name = nameOf(t);
  const current = t.rounds.length;
  return (
    <Dialog open={open} onClose={onClose} title="Abmeldung / Aufgabe" footer={<button className="btn btn-primary" onClick={onClose}>Fertig</button>}>
      <p className="small">
        Nach BTTV-Regeln behält ein Spieler, der aufgibt oder sich abmeldet, seine Siege; jede weitere Runde zählt als kampflose Niederlage. Ein noch offenes Spiel der laufenden Runde bitte als „wo A/B“ für den Gegner eintragen.
      </p>
      <ul className="pick-list">
        {t.participants.map((p) => {
          const out = !activeIn(p, current + 1);
          return (
            <li key={p.id} className="row gap-s between">
              <span>{name(p.id)}</span>
              {out ? (
                <span className="row gap-s">
                  <Badge tone="neutral">abgemeldet nach R{p.withdrawnAfterRound}</Badge>
                  <button className="btn btn-s" onClick={() => save(undoWithdraw(t, p.id))}>rückgängig</button>
                </span>
              ) : (
                <button className="btn btn-s" onClick={() => save(withdraw(t, p.id, current))}>nach Runde {current} abmelden</button>
              )}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

function PrintRound({ t, round }: { t: Tournament; round: Round }) {
  const name = nameOf(t);
  return (
    <div className="print-only print-doc">
      <h1>
        {t.name} – Runde {round.number}
      </h1>
      <table>
        <thead>
          <tr>
            <th>Tisch</th>
            <th>Spieler A</th>
            <th>Spieler B</th>
            <th>Sätze</th>
          </tr>
        </thead>
        <tbody>
          {round.matches.map((m, i) => (
            <tr key={m.id}>
              <td>{m.table ?? i + 1}</td>
              <td>{name(m.a)}</td>
              <td>{name(m.b)}</td>
              <td>{m.result ? formatResult(m.result) : '_____ _____ _____ _____ _____'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {round.bye && <p>Freilos: {name(round.bye)}</p>}
    </div>
  );
}
