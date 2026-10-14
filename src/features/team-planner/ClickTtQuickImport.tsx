import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player } from '../../domain/players/model.ts';
import type { TeamPlan } from '../../domain/team-rules/model.ts';
import { registrationUrl, clubOverviewUrl } from '../../imports/clickTtWeb.ts';
import { Badge, Callout } from '../../shared-ui/components.tsx';
import { ClubPicker, ext, useClub } from '../shared/club.tsx';
import { applyClickTtRegistration, parseClickTtRegistration, type ClickTtPreview } from './clickTtImport.ts';

const HALF = { VR: 'Vorrunde', RR: 'Rückrunde' } as const;

/**
 * Guided import: open the club's registration in click-TT, copy the whole page, paste it here.
 * Recognised pages are applied in one click (players, Q-TTR, teams, positions, RES/WES/SPV).
 */
export function ClickTtQuickImport({
  plan,
  pool,
  initialText,
  onApply,
  onOtherFormat,
}: {
  plan: TeamPlan;
  pool: readonly Player[];
  initialText?: string;
  onApply: (r: { players: Player[]; plan: TeamPlan; added: number; updated: number }) => void;
  onOtherFormat: (text: string) => void;
}) {
  const { club, setClub } = useClub();
  const [text, setText] = useState(initialText ?? '');
  const [adopt, setAdopt] = useState(true);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText]);

  const parsed = useMemo(() => (text.trim() ? parseClickTtRegistration(text, pool, plan) : undefined), [text, pool, plan]);
  const direct = club?.clubId ? registrationUrl(club.clubId, { season: plan.season, half: plan.halfSeason, ageClass: plan.ageClass, contest: plan.contest }) : null;
  const assigned = plan.teams.reduce((s, t) => s + t.slots.length, 0);

  const apply = (p: ClickTtPreview) => {
    const r = applyClickTtRegistration(pool, plan, p, { adoptHeading: adopt });
    if (p.club && club && !club.clubName) setClub({ ...club, clubName: p.club });
    onApply(r);
    setText('');
  };

  return (
    <div className="quick-import stack gap-m">
      <ol className="qi-steps">
        <li>
          <span className="qi-no">1</span>
          <div className="stack gap-s">
            <strong>Mannschaftsmeldung in click-TT öffnen</strong>
            {club ? (
              <>
                <div className="row gap-s wrap">
                  {direct ? (
                    <a className="btn btn-primary" href={direct} {...ext}>
                      {plan.contest === 'Damen' ? 'Damen' : 'Erwachsene'} {plan.season} {HALF[plan.halfSeason]} öffnen ↗
                    </a>
                  ) : (
                    <a className="btn btn-primary" href={clubOverviewUrl(club.clubId!)} {...ext}>
                      Meldungen des Vereins öffnen ↗
                    </a>
                  )}
                </div>
                {!direct && <span className="small muted">Dort die passende Nachwuchs-Altersklasse und Halbserie wählen.</span>}
                <ClubPicker compact />
              </>
            ) : (
              <>
                <span className="small muted">Einmalig: deinen Verein festlegen. Danach führt dieser Schritt direkt zur richtigen Seite.</span>
                <ClubPicker />
              </>
            )}
          </div>
        </li>
        <li>
          <span className="qi-no">2</span>
          <div>
            <strong>Ganze Seite kopieren</strong>
            <p className="small muted">
              Auf der click-TT-Seite <kbd>Strg</kbd>+<kbd>A</kbd> und <kbd>Strg</kbd>+<kbd>C</kbd> drücken (Mac: <kbd>⌘</kbd>+<kbd>A</kbd>, <kbd>⌘</kbd>+<kbd>C</kbd>). Am Handy: lange tippen → „Alles auswählen“ → „Kopieren“.
            </p>
          </div>
        </li>
        <li>
          <span className="qi-no">3</span>
          <div className="stack gap-s grow">
            <strong>Hier einfügen</strong>
            <textarea
              ref={boxRef}
              id="qi-paste"
              className={`input paste-box ${parsed?.recognized ? 'is-ok' : parsed ? 'is-bad' : ''}`}
              rows={parsed ? 3 : 4}
              placeholder="Hier klicken und Strg+V drücken"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Kopierte click-TT-Seite einfügen"
            />
          </div>
        </li>
      </ol>

      {parsed && !parsed.recognized && (
        <Callout tone="warning" title="Das sieht nicht nach einer click-TT-Mannschaftsmeldung aus">
          <p>{parsed.reason}</p>
          <div className="row gap-s wrap">
            <button className="btn btn-s" onClick={() => onOtherFormat(text)}>
              Trotzdem mit Spaltenzuordnung importieren
            </button>
            <button className="btn btn-s" onClick={() => setText('')}>
              Leeren
            </button>
          </div>
        </Callout>
      )}

      {parsed?.recognized && (
        <div className="qi-result card">
          <div className="row gap-s wrap">
            <Badge tone="ok">click-TT-Meldung erkannt</Badge>
            {parsed.club && <strong>{parsed.club}</strong>}
            {parsed.heading.season && (
              <span className="muted small">
                {parsed.heading.contest} {parsed.heading.season} {parsed.heading.half && HALF[parsed.heading.half]}
              </span>
            )}
          </div>
          <div className="qi-stats">
            <div>
              <strong>{parsed.rows.length}</strong>
              <span>Spieler</span>
            </div>
            <div>
              <strong>{parsed.teamCount}</strong>
              <span>Mannschaften</span>
            </div>
            <div>
              <strong>{parsed.rows.filter((r) => !r.existing).length}</strong>
              <span>neu</span>
            </div>
            <div>
              <strong>{parsed.rows.filter((r) => r.existing).length}</strong>
              <span>aktualisiert</span>
            </div>
          </div>
          {(parsed.mismatch.season || parsed.mismatch.half || parsed.mismatch.contest) && (
            <label className="check">
              <input type="checkbox" checked={adopt} onChange={(e) => setAdopt(e.target.checked)} />
              Planung umstellen auf {[parsed.mismatch.contest?.[1], parsed.mismatch.season?.[1], parsed.mismatch.half && HALF[parsed.mismatch.half[1] as 'VR' | 'RR']].filter(Boolean).join(' · ')} (bisher{' '}
              {[parsed.mismatch.contest?.[0], parsed.mismatch.season?.[0], parsed.mismatch.half && HALF[parsed.mismatch.half[0] as 'VR' | 'RR']].filter(Boolean).join(' · ')})
            </label>
          )}
          {parsed.warnings.map((w) => (
            <p key={w} className="small muted">
              {w}
            </p>
          ))}
          {assigned > 0 && <p className="small">Die bisherige Aufstellung dieser Planung wird durch die Meldung ersetzt (rückgängig machbar).</p>}
          <div className="row gap-s">
            <button className="btn btn-primary" onClick={() => apply(parsed)}>
              {parsed.rows.length} Spieler übernehmen
            </button>
            <button className="btn" onClick={() => setText('')}>
              Verwerfen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
