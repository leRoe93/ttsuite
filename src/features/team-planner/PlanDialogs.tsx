import { useState } from 'react';
import type { AgeClass, HalfSeason, TeamPlan } from '../../domain/team-rules/model.ts';
import { BUILTIN_RULE_SETS, cloneAsCustom, type LineupRuleSet, type Tolerance } from '../../domain/team-rules/ruleSets.ts';
import { useAppData } from '../../storage/AppDataProvider.tsx';
import { Badge, Callout, Dialog, Field } from '../../shared-ui/components.tsx';
import { defaultSeason, newPlan, resolveRuleSet } from './state.ts';

type Kind = 'Erwachsene' | 'Damen' | 'Nachwuchs';
const KIND_NAME: Record<Kind, string> = { Erwachsene: 'Herren', Damen: 'Damen', Nachwuchs: 'Jugend' };

export function NewPlanForm({ onCreate }: { onCreate: (p: TeamPlan) => void }) {
  const d = defaultSeason();
  const [kind, setKind] = useState<Kind>('Erwachsene');
  const [season, setSeason] = useState(d.season);
  const [half, setHalf] = useState<HalfSeason>(d.half);
  return (
    <form
      className="stack gap-m"
      onSubmit={(e) => {
        e.preventDefault();
        const name = KIND_NAME[kind];
        onCreate(
          newPlan({
            name,
            season,
            halfSeason: half,
            ageClass: kind === 'Nachwuchs' ? 'nachwuchs' : 'erwachsene',
            contest: kind === 'Nachwuchs' ? undefined : kind,
            teamCount: 0,
            teamPrefix: name,
            sollstaerke: kind === 'Erwachsene' ? 6 : 4,
          }),
        );
      }}
    >
      <div className="form-grid">
        <Field label="Meldung" hint="wie in click-TT">
          <select id="np-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="Erwachsene">Erwachsene (Herren)</option>
            <option value="Damen">Damen</option>
            <option value="Nachwuchs">Nachwuchs</option>
          </select>
        </Field>
        <Field label="Saison">
          <input id="np-season" className="input" value={season} onChange={(e) => setSeason(e.target.value)} pattern="\d{4}/\d{2}" title="Format 2026/27" />
        </Field>
        <Field label="Halbserie">
          <select id="np-half" className="input" value={half} onChange={(e) => setHalf(e.target.value as HalfSeason)}>
            <option value="VR">Vorrunde (Q-TTR vom 11.05.)</option>
            <option value="RR">Rückrunde (Q-TTR vom 11.12.)</option>
          </select>
        </Field>
      </div>
      <p className="small muted">Mannschaften legst du nicht von Hand an – sie kommen im nächsten Schritt mit der click-TT-Meldung.</p>
      <div>
        <button className="btn btn-primary" type="submit">Planung anlegen</button>
      </div>
    </form>
  );
}

function ToleranceRow({ label, value, onChange, disabled }: { label: string; value: Tolerance; onChange: (t: Tolerance) => void; disabled: boolean }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>
        <input className="input input-s num" type="number" disabled={disabled} value={value.withinTeam} onChange={(e) => onChange({ ...value, withinTeam: Number(e.target.value) })} aria-label={`${label} innerhalb`} />
      </td>
      <td>
        <input className="input input-s num" type="number" disabled={disabled} value={value.acrossTeams} onChange={(e) => onChange({ ...value, acrossTeams: Number(e.target.value) })} aria-label={`${label} übergreifend`} />
      </td>
    </tr>
  );
}

export function PlanSettingsDialog({ open, onClose, plan, onChange }: { open: boolean; onClose: () => void; plan: TeamPlan; onChange: (p: TeamPlan) => void }) {
  const { data, update } = useAppData();
  const rs = resolveRuleSet(plan.ruleSetId, data.customRuleSets);
  const isCustom = rs.scope === 'custom';
  const allSets = [...BUILTIN_RULE_SETS, ...data.customRuleSets];
  const saveRs = (next: LineupRuleSet) => update((d) => ({ ...d, customRuleSets: d.customRuleSets.map((r) => (r.id === next.id ? next : r)) }));
  const setTol = (key: keyof LineupRuleSet['tolerances'], t: Tolerance) => saveRs({ ...rs, tolerances: { ...rs.tolerances, [key]: t } });

  return (
    <Dialog open={open} onClose={onClose} title="Planung & Regelwerk" wide footer={<button className="btn btn-primary" onClick={onClose}>Fertig</button>}>
      <div className="form-grid">
        <Field label="Bezeichnung">
          <input className="input" value={plan.name} onChange={(e) => onChange({ ...plan, name: e.target.value })} />
        </Field>
        <Field label="Saison">
          <input className="input" value={plan.season} onChange={(e) => onChange({ ...plan, season: e.target.value })} />
        </Field>
        <Field label="Halbserie" hint="Neue Sperrvermerke sind nur zur Vorrunde möglich">
          <select className="input" value={plan.halfSeason} onChange={(e) => onChange({ ...plan, halfSeason: e.target.value as HalfSeason })}>
            <option value="VR">Vorrunde</option>
            <option value="RR">Rückrunde</option>
          </select>
        </Field>
        <Field label="Meldung">
          <select
            className="input"
            value={plan.ageClass === 'nachwuchs' ? 'Nachwuchs' : plan.contest ?? 'Erwachsene'}
            onChange={(e) => {
              const v = e.target.value as Kind;
              onChange({ ...plan, ageClass: v === 'Nachwuchs' ? 'nachwuchs' : 'erwachsene', contest: v === 'Nachwuchs' ? undefined : v });
            }}
          >
            <option value="Erwachsene">Erwachsene (Herren)</option>
            <option value="Damen">Damen</option>
            <option value="Nachwuchs">Nachwuchs</option>
          </select>
        </Field>
      </div>

      <section className="stack gap-s">
        <div className="row gap-s wrap">
          <h3>{rs.label}</h3>
          <Badge tone="info">TTVN</Badge>
        </div>
        <p className="small">{rs.description}</p>
        <table className="table compact narrow-table">
          <thead>
            <tr>
              <th>Toleranz (Q-TTR-Punkte)</th>
              <th className="num">innerhalb Mannschaft</th>
              <th className="num">über Mannschaften</th>
            </tr>
          </thead>
          <tbody>
            <ToleranceRow label="Erwachsene" value={rs.tolerances.adults} disabled={!isCustom} onChange={(t) => setTol('adults', t)} />
            <ToleranceRow label="Nachwuchs in Erw.-Meldung" value={rs.tolerances.nachwuchsInAdults} disabled={!isCustom} onChange={(t) => setTol('nachwuchsInAdults', t)} />
            <ToleranceRow label="Altersklasse Nachwuchs" value={rs.tolerances.nachwuchsAgeClass} disabled={!isCustom} onChange={(t) => setTol('nachwuchsAgeClass', t)} />
            <ToleranceRow label="D-Kader und höher" value={rs.tolerances.kader} disabled={!isCustom} onChange={(t) => setTol('kader', t)} />
          </tbody>
        </table>
        {isCustom && (
          <Field label="Sollstärke-Prüfung">
            <select className="input" value={rs.sollstaerkeCheck} onChange={(e) => saveRs({ ...rs, sollstaerkeCheck: e.target.value as LineupRuleSet['sollstaerkeCheck'] })}>
              <option value="error">als Fehler</option>
              <option value="warning">als Hinweis</option>
              <option value="off">aus</option>
            </select>
          </Field>
        )}
        <ul className="verif">
          {Object.entries(rs.verification).map(([k, v]) => (
            <li key={k}>
              <Badge tone={v === 'verified' ? 'ok' : 'warning'}>{v === 'verified' ? 'belegt' : 'Annahme'}</Badge> {VERIF_LABEL[k] ?? k}
            </li>
          ))}
        </ul>
        <div className="small">
          <strong>Quellen:</strong>
          <ul>
            {rs.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
              </li>
            ))}
          </ul>
        </div>
        <Callout tone="info">TTSuite ist auf die Regeln des TTVN ausgelegt. In anderen Verbänden können Toleranzen und Sperrvermerk-Regeln abweichen.</Callout>
      </section>
    </Dialog>
  );
}

const VERIF_LABEL: Record<string, string> = {
  tolerances: 'Toleranzwerte 35/50, Nachwuchs 70/85, Landeskader (nur Erwachsene) 105/120',
  spvPropagation: 'SPV-Folge: alle davor gemeldeten Spieler der Mannschaft erhalten ebenfalls einen SPV',
  spvErgaenzung: 'Ergänzungsspieler (WES/NES/SES) erhalten/verursachen keinen SPV',
  spvTiming: 'SPV zu Beginn der Vorrunde oder Rückrunde bzw. auf Antrag; gültig längstens bis Saisonende',
  spvConsequence: 'SPV: kein Ersatzeinsatz in höheren Mannschaften (WO I 4.3); kein Aufrücken in der Rückrunde (WO H 2.4)',
  reserveAdultsOnly: 'Reservespieler (RES) nur bei Erwachsenen (WO A 5.3)',
  sollstaerke: 'Mindestanzahl Stammspieler = Sollstärke (nicht abschließend belegt)',
};
