import type { Player } from '../../domain/players/model.ts';
import type { TeamPlan } from '../../domain/team-rules/model.ts';
import type { LineupValidation } from '../../domain/team-rules/validate.ts';

/** Print-only view (shown via @media print). */
export function PrintLineup({ plan, players, validation, ruleSetLabel }: { plan: TeamPlan; players: readonly Player[]; validation: LineupValidation; ruleSetLabel: string }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const spv = new Set(validation.derivedSpv.map((d) => d.playerId));
  return (
    <div className="print-only print-doc">
      <h1>Mannschaftsmeldung {plan.name}</h1>
      <p>
        Saison {plan.season} · {plan.halfSeason === 'VR' ? 'Vorrunde' : 'Rückrunde'} · {ruleSetLabel} · Stand {new Date().toLocaleDateString('de-DE')} · Planungsentwurf (nicht die offizielle Meldung in click-TT)
      </p>
      {plan.teams.map((t, ti) => (
        <section key={t.id} className="print-team">
          <h2>
            {ti + 1}. {t.name}
            {t.league ? ` – ${t.league}` : ''}
          </h2>
          <table>
            <thead>
              <tr>
                <th>Pos.</th>
                <th>Name</th>
                <th>Q-TTR</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {t.slots.map((s, i) => {
                const p = byId.get(s.playerId);
                return (
                  <tr key={s.playerId}>
                    <td>{ti + 1}.{i + 1}</td>
                    <td>{p ? `${p.lastName}, ${p.firstName}` : '?'}</td>
                    <td>{p?.rules.qttr ?? '–'}</td>
                    <td>
                      {[s.role !== 'stamm' ? s.role : '', spv.has(s.playerId) ? 'SPV' : p?.rules.sperrvermerk && plan.halfSeason === 'RR' ? `SPV (M${p.rules.sperrvermerk.teamNumber})` : ''].filter(Boolean).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
      <p>
        Prüfung: {validation.errorCount} Fehler, {validation.warningCount} Hinweise.
      </p>
      {validation.findings
        .filter((f) => f.severity !== 'info')
        .map((f) => (
          <p key={f.id} className="print-finding">
            {f.severity === 'error' ? '✕' : '⚠'} {f.title}: {f.detail}
          </p>
        ))}
    </div>
  );
}
