import { useState } from 'react';
import { clubOverviewUrl, clubSearchUrl, parseClubInput, type ClickTtClubRef } from '../../imports/clickTtWeb.ts';
import { useAppData } from '../../storage/AppDataProvider.tsx';
import { Field } from '../../shared-ui/components.tsx';
import { IconSearch } from '../../shared-ui/icons.tsx';

/** The user's club in click-TT (TTVN). Stored once for all tools in AppData.extensions.club. */
export function useClub(): { club: ClickTtClubRef | undefined; setClub: (c: ClickTtClubRef | undefined) => void } {
  const { data, update } = useAppData();
  const raw = data.extensions['club'] as ClickTtClubRef | undefined;
  // Plans from before 10/2026 stored the club per plan – use that as fallback.
  const legacy = data.teamPlans.find((p) => p.clickTt?.clubId)?.clickTt;
  const club = raw?.clubId ? raw : legacy?.clubId ? { clubId: legacy.clubId, clubName: legacy.clubName } : undefined;
  const setClub = (c: ClickTtClubRef | undefined) => update((d) => ({ ...d, extensions: { ...d.extensions, club: c } }));
  return { club, setClub };
}

export const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** Compact display of the chosen club, or a two-step setup (search in click-TT, paste the club page address). */
export function ClubPicker({ compact }: { compact?: boolean }) {
  const { club, setClub } = useClub();
  const [editing, setEditing] = useState(!club);
  const [name, setName] = useState(club?.clubName ?? '');
  const [addr, setAddr] = useState('');
  const id = parseClubInput(addr);

  if (club && !editing) {
    return (
      <div className={`club-chip ${compact ? 'small' : ''}`}>
        <span>
          Verein: <strong>{club.clubName || `click-TT-Nr. ${club.clubId}`}</strong>
        </span>
        <a href={clubOverviewUrl(club.clubId!)} {...ext} className="small">
          in click-TT ↗
        </a>
        <button className="link small" onClick={() => setEditing(true)}>
          ändern
        </button>
      </div>
    );
  }
  return (
    <div className="stack gap-s club-setup">
      <div className="form-grid">
        <Field label="1. Verein in click-TT suchen" hint="Name oder Ort – öffnet die TTVN-Vereinssuche in click-TT">
          <div className="row gap-xs">
            <input id="club-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. TSV Musterdorf" />
            <a className="btn" href={clubSearchUrl(name)} {...ext}>
              <IconSearch size={16} /> Suchen ↗
            </a>
          </div>
        </Field>
        <Field
          label="2. Adresse der Vereinsseite einfügen"
          hint="In click-TT auf deinen Verein klicken, die Adresse aus der Adresszeile kopieren und hier einfügen"
          error={addr && !id ? 'Darin steht keine Vereinsnummer („club=…“)' : undefined}
        >
          <input id="club-url" className="input mono" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="https://ttvn.click-tt.de/…clubInfoDisplay?club=1234" />
        </Field>
      </div>
      <div className="row gap-s">
        <button
          className="btn btn-primary"
          disabled={!id}
          onClick={() => {
            setClub({ clubId: id!, clubName: name.trim() || club?.clubName });
            setEditing(false);
            setAddr('');
          }}
        >
          Verein speichern
        </button>
        {club && (
          <button className="btn" onClick={() => setEditing(false)}>
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}
