import { useState } from 'react';
import type { TeamPlan } from '../../domain/team-rules/model.ts';
import { clubOverviewUrl, clubSearchUrl, FEDERATIONS, parseClubInput, registrationUrl } from '../../imports/clickTtWeb.ts';
import { Field } from '../../shared-ui/components.tsx';
import { IconSearch } from '../../shared-ui/icons.tsx';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * Builds links to the club's public click-TT pages. The app does not load these pages itself;
 * the user opens them, copies the table and pastes it into the import.
 */
export function ClickTtLinks({ plan, onChange, compact }: { plan: TeamPlan; onChange: (p: TeamPlan) => void; compact?: boolean }) {
  const ref = plan.clickTt ?? { federation: 'ByTTV' };
  const [clubInput, setClubInput] = useState(ref.clubId ?? '');
  const [search, setSearch] = useState(ref.clubName ?? '');
  const clubId = parseClubInput(clubInput);
  const direct = clubId ? registrationUrl(clubId, { season: plan.season, half: plan.halfSeason, ageClass: plan.ageClass }) : null;
  const set = (patch: Partial<NonNullable<TeamPlan['clickTt']>>) => onChange({ ...plan, clickTt: { ...ref, ...patch } });

  return (
    <div className={`clicktt stack gap-s ${compact ? '' : 'card'}`}>
      <div className="form-grid">
        <Field label="Landesverband">
          <select id="ctt-fed" className="input" value={ref.federation} onChange={(e) => set({ federation: e.target.value })}>
            {FEDERATIONS.map((f) => (
              <option key={f.code} value={f.code}>{f.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Verein suchen" hint="Name oder Ort, öffnet die click-TT-Vereinssuche">
          <div className="row gap-xs">
            <input id="ctt-search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="z. B. TTC Musterstadt" />
            <a className="btn" href={clubSearchUrl(ref.federation, search)} {...ext} onClick={() => search && set({ clubName: search })}>
              <IconSearch size={16} /> Suchen
            </a>
          </div>
        </Field>
        <Field
          label="Verein in click-TT"
          hint="Vereinsseite in click-TT öffnen und deren Adresse hier einfügen (oder die Vereinsnummer aus „club=…“)"
          error={clubInput && !clubId ? 'Keine Vereinsnummer erkannt' : undefined}
        >
          <input
            id="ctt-club"
            className="input mono"
            value={clubInput}
            onChange={(e) => {
              setClubInput(e.target.value);
              const id = parseClubInput(e.target.value);
              if (id && id !== ref.clubId) set({ clubId: id });
            }}
            placeholder="https://…/clubInfoDisplay?club=12345"
          />
        </Field>
      </div>
      {clubId ? (
        <div className="row gap-s wrap">
          {direct && (
            <a className="btn btn-primary" href={direct} {...ext}>
              Mannschaftsmeldung {plan.season} {plan.halfSeason === 'VR' ? 'Vorrunde' : 'Rückrunde'} öffnen ↗
            </a>
          )}
          <a className={`btn ${direct ? '' : 'btn-primary'}`} href={clubOverviewUrl(clubId)} {...ext}>
            Alle Meldungen des Vereins ↗
          </a>
          {!direct && <span className="small muted">Für Nachwuchs-Meldungen dort die passende Altersklasse und Halbserie wählen.</span>}
        </div>
      ) : (
        <p className="small muted">Erst den Verein suchen, dann die Adresse der Vereinsseite oben einfügen. Danach erscheint der direkte Link zur Mannschaftsmeldung.</p>
      )}
      <ol className="small howto">
        <li>Link öffnen – click-TT zeigt die Meldung mit Rang, Q-TTR und Status öffentlich, ohne Login.</li>
        <li>Auf der Seite alles markieren (Strg+A bzw. ⌘A) und kopieren (Strg+C bzw. ⌘C).</li>
        <li>Hier unter „Import“ in das Textfeld einfügen – Mannschaften, Positionen, Q-TTR und Reservespieler werden übernommen.</li>
      </ol>
      <p className="small muted">TTSuite lädt keine Daten von click-TT; es werden nur Links erzeugt. Daten früherer Spielzeiten zeigt click-TT nur mit Login.</p>
    </div>
  );
}
