import { useState } from 'react';
import { seedingRating } from '../../domain/players/model.ts';
import type { Tournament } from '../../domain/tournament/model.ts';
import { computeStandings, DECIDED_LABEL } from '../../domain/tournament/standings.ts';
import { Badge } from '../../shared-ui/components.tsx';
import { IconPrint } from '../../shared-ui/icons.tsx';
import { nameOf } from './useTournament.ts';

export function StandingsTab({ t }: { t: Tournament }) {
  const [upto, setUpto] = useState<number>(t.rounds.length);
  const rows = computeStandings(t, upto);
  const name = nameOf(t);
  const byId = new Map(t.participants.map((p) => [p.id, p]));
  const rankOf = new Map(rows.map((r) => [r.participantId, r.rank]));
  const rounds = t.rounds.filter((r) => r.number <= upto);

  const cell = (pid: string, rn: number) => {
    const r = t.rounds.find((x) => x.number === rn);
    if (!r) return null;
    if (r.bye === pid) return <span className="hist hist-win" title="Freilos">FL</span>;
    const m = r.matches.find((x) => x.a === pid || x.b === pid);
    if (!m) return <span className="hist hist-loss" title="nicht angetreten (kampflose Niederlage)">–</span>;
    const opp = m.a === pid ? m.b : m.a;
    if (!m.result) return <span className="hist" title={`gegen ${name(opp)} – offen`}>{rankOf.get(opp)}?</span>;
    const won = (m.result.winner === 'A') === (m.a === pid);
    const sets = m.a === pid ? `${m.result.setsA}:${m.result.setsB}` : `${m.result.setsB}:${m.result.setsA}`;
    return (
      <span className={`hist ${won ? 'hist-win' : 'hist-loss'}`} title={`gegen ${name(opp)} (Platz ${rankOf.get(opp)}) ${sets}${m.result.kind === 'walkover' ? ' w.o.' : ''}`}>
        {won ? '+' : '−'}
        {rankOf.get(opp)}
      </span>
    );
  };

  return (
    <div className="stack gap-m">
      <div className="row gap-s wrap between">
        <label className="row gap-s small">
          Stand nach
          <select className="input input-s" value={upto} onChange={(e) => setUpto(Number(e.target.value))}>
            {t.rounds.map((r) => (
              <option key={r.number} value={r.number}>Runde {r.number}</option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={() => window.print()}><IconPrint /> Drucken</button>
      </div>
      <div className="table-wrap print-keep">
        <h2 className="print-only">{t.name} – Tabelle nach Runde {upto}</h2>
        <table className="table standings">
          <thead>
            <tr>
              <th className="num">Pl.</th>
              <th>Name</th>
              <th className="hide-s">Verein</th>
              <th className="num">TTR</th>
              <th className="num" title="Siege">S</th>
              <th className="num" title="Niederlagen">N</th>
              <th className="num" title="Buchholz: Summe der Siege der Gegner">BH</th>
              <th className="num hide-s">Sätze</th>
              <th className="num hide-s">Bälle</th>
              {rounds.map((r) => (
                <th key={r.number} className="num hide-s" title={`Runde ${r.number}: + Sieg / − Niederlage gegen Platz …`}>R{r.number}</th>
              ))}
              <th className="hide-s">entschieden durch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = byId.get(r.participantId)!;
              return (
                <tr key={r.participantId} className={r.withdrawn ? 'muted' : ''}>
                  <td className="num"><strong>{r.rank}</strong></td>
                  <td>
                    {name(r.participantId)} {r.withdrawn && <Badge tone="neutral">abgemeldet</Badge>}
                  </td>
                  <td className="small hide-s">{p.player.club}</td>
                  <td className="num">{seedingRating(p.player) ?? '–'}</td>
                  <td className="num"><strong>{r.wins}</strong></td>
                  <td className="num">{r.losses}</td>
                  <td className="num">{r.buchholz}</td>
                  <td className="num hide-s">{r.setsWon}:{r.setsLost}</td>
                  <td className="num hide-s">{r.pointsWon}:{r.pointsLost}</td>
                  {rounds.map((rd) => (
                    <td key={rd.number} className="num hide-s">{cell(r.participantId, rd.number)}</td>
                  ))}
                  <td className="small muted hide-s">{r.decidedBy && r.decidedBy !== 'wins' ? `vor Pl. ${r.rank + 1}: ${DECIDED_LABEL[r.decidedBy]}` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Reihenfolge: Siege (Freilos = Sieg) → Buchholz (Freilos zählt mit den Siegen des Tabellenletzten) → direkter Vergleich → {t.config.finalTieBreak === 'lot' ? 'Los (automatisch, reproduzierbar)' : 'niedrigerer TTR-Wert, dann Los'}. Sätze und Bälle dienen nur der Information.
      </p>
    </div>
  );
}
