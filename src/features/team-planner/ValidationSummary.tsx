import { useState } from 'react';
import type { TeamPlan } from '../../domain/team-rules/model.ts';
import type { LineupValidation, Severity } from '../../domain/team-rules/validate.ts';
import { Badge } from '../../shared-ui/components.tsx';
import { IconChevron } from '../../shared-ui/icons.tsx';
import { SeverityIcon } from './status.tsx';

export function ValidationSummary({ validation, plan, onHighlight }: { validation: LineupValidation; plan: TeamPlan; onHighlight: (ids: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  const infos = validation.findings.filter((f) => f.severity === 'info' && f.code !== 'empty-team').length;
  const assigned = plan.teams.reduce((s, t) => s + t.slots.length, 0);
  const tone = validation.errorCount ? 'error' : validation.warningCount ? 'warning' : 'ok';
  const list = validation.findings.filter((f) => f.code !== 'empty-team' && (filter === 'all' || f.severity === filter));
  const teamName = (id?: string) => plan.teams.find((t) => t.id === id)?.name;

  return (
    <section className={`summary card summary-${tone}`} aria-live="polite">
      <button className="summary-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <SeverityIcon s={tone} size={20} />
        <span className="summary-title">
          {assigned === 0
            ? 'Noch keine Spieler zugeordnet'
            : validation.errorCount
              ? 'Meldung so nicht zulässig'
              : validation.warningCount
                ? 'Meldung zulässig – Hinweise prüfen'
                : 'Meldung entspricht den hinterlegten Regeln'}
        </span>
        <span className="row gap-xs wrap">
          <Badge tone="error">{validation.errorCount} Fehler</Badge>
          <Badge tone="warning">{validation.warningCount} Hinweise</Badge>
          <Badge tone="info">{infos} Info</Badge>
        </span>
        <IconChevron className={`chev ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="summary-body">
          <div className="row gap-s wrap">
            {(['all', 'error', 'warning', 'info'] as const).map((s) => (
              <button key={s} className={`btn btn-s ${filter === s ? 'btn-primary' : ''}`} onClick={() => setFilter(s)}>
                {s === 'all' ? 'Alle' : s === 'error' ? 'Fehler' : s === 'warning' ? 'Hinweise' : 'Info'}
              </button>
            ))}
            <span className="muted small">Fahre über einen Eintrag, um die betroffenen Spieler hervorzuheben.</span>
          </div>
          <ul className="findings">
            {list.length === 0 && <li className="muted small">Keine Einträge.</li>}
            {list.map((f) => (
              <li
                key={f.id}
                className={`finding sev-${f.severity}`}
                onMouseEnter={() => onHighlight(new Set(f.playerIds))}
                onMouseLeave={() => onHighlight(new Set())}
                onFocus={() => onHighlight(new Set(f.playerIds))}
                onBlur={() => onHighlight(new Set())}
                tabIndex={0}
              >
                <SeverityIcon s={f.severity} size={15} />
                <span>
                  <strong>{f.title}</strong>
                  {teamName(f.teamId) && <span className="muted"> · {teamName(f.teamId)}</span>}
                  <br />
                  {f.detail}
                  {f.ruleRef && <span className="muted"> ({f.ruleRef})</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Die Prüfung ersetzt nicht die Genehmigung durch den Spielleiter. Sperrvermerke werden in click-TT vom Spielleiter vergeben.</p>
        </div>
      )}
    </section>
  );
}
