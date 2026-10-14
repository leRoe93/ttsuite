import { useEffect, useState } from 'react';
import { newId, type Player } from '../../domain/players/model.ts';
import { Dialog, Field } from '../../shared-ui/components.tsx';

const numOrUndef = (s: string) => (s.trim() === '' ? undefined : Number(s));

export function blankPlayer(): Player {
  return { id: newId(), firstName: '', lastName: '', rules: {}, meta: { source: 'manual', importedAt: new Date().toISOString() } };
}

/** Edit dialog for the shared player model. `showLineupRules` adds the rule-relevant lineup attributes. */
export function PlayerEditor({
  player,
  open,
  onClose,
  onSave,
  showLineupRules = true,
  title,
}: {
  player: Player | null;
  open: boolean;
  onClose: () => void;
  onSave: (p: Player) => void;
  showLineupRules?: boolean;
  title?: string;
}) {
  const [p, setP] = useState<Player | null>(player);
  useEffect(() => setP(player), [player]);
  if (!p) return null;
  const set = (patch: Partial<Player>) => setP({ ...p, ...patch });
  const setRules = (patch: Partial<Player['rules']>) => setP({ ...p, rules: { ...p.rules, ...patch } });
  const ratingErr = (v: number | undefined) => (v !== undefined && (!Number.isInteger(v) || v < 0 || v > 3500) ? 'Ganze Zahl zwischen 0 und 3500' : undefined);
  const errors = {
    lastName: p.lastName.trim() ? undefined : 'Pflichtfeld',
    qttr: ratingErr(p.rules.qttr),
    ttr: ratingErr(p.ttr),
    birthYear: p.birthYear !== undefined && (p.birthYear < 1900 || p.birthYear > 2100) ? 'Jahr ungültig' : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title ?? (p.lastName ? `${p.firstName} ${p.lastName}` : 'Spieler anlegen')}
      footer={
        <>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onSave({ ...p, firstName: p.firstName.trim(), lastName: p.lastName.trim() })}>
            Speichern
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Vorname">
          <input className="input" value={p.firstName} onChange={(e) => set({ firstName: e.target.value })} autoFocus />
        </Field>
        <Field label="Nachname *" error={errors.lastName}>
          <input className="input" value={p.lastName} onChange={(e) => set({ lastName: e.target.value })} />
        </Field>
        <Field label="Verein">
          <input className="input" value={p.club ?? ''} onChange={(e) => set({ club: e.target.value || undefined })} />
        </Field>
        <Field label="Lizenz-/Spieler-Nr.">
          <input className="input" value={p.licenceNr ?? ''} onChange={(e) => set({ licenceNr: e.target.value || undefined })} />
        </Field>
        <Field label="Q-TTR (Stichtag)" hint="Maßgeblich für die Mannschaftsmeldung" error={errors.qttr}>
          <input className="input" inputMode="numeric" value={p.rules.qttr ?? ''} onChange={(e) => setRules({ qttr: numOrUndef(e.target.value) })} />
        </Field>
        <Field label="TTR (aktuell)" error={errors.ttr}>
          <input className="input" inputMode="numeric" value={p.ttr ?? ''} onChange={(e) => set({ ttr: numOrUndef(e.target.value) })} />
        </Field>
        <Field label="Geschlecht">
          <select className="input" value={p.gender ?? ''} onChange={(e) => set({ gender: (e.target.value || undefined) as Player['gender'] })}>
            <option value="">– unbekannt –</option>
            <option value="m">männlich</option>
            <option value="w">weiblich</option>
            <option value="d">divers</option>
          </select>
        </Field>
        <Field label="Geburtsjahr" error={errors.birthYear}>
          <input className="input" inputMode="numeric" value={p.birthYear ?? ''} onChange={(e) => set({ birthYear: numOrUndef(e.target.value) })} />
        </Field>
      </div>
      {showLineupRules && (
        <fieldset className="fieldset">
          <legend>Regelrelevante Angaben</legend>
          <div className="stack gap-s">
            <label className="check">
              <input type="checkbox" checked={!!p.rules.nachwuchs} onChange={(e) => setRules({ nachwuchs: e.target.checked || undefined })} />
              Nachwuchsspieler in Erwachsenen-Meldung (SBEM/JES) – erhöhte Toleranz 70/85
            </label>
            <label className="check">
              <input type="checkbox" checked={p.rules.kader === 'd-kader-plus'} onChange={(e) => setRules({ kader: e.target.checked ? 'd-kader-plus' : undefined })} />
              Landeskader oder höher – erhöhte Toleranz 105/120 (nur Erwachsene)
            </label>
            <label className="check">
              <input type="checkbox" checked={!!p.rules.qttrProvisional} onChange={(e) => setRules({ qttrProvisional: e.target.checked || undefined })} />
              Q-TTR mit * (weniger als 10 Einzel) – der Spielleiter ordnet ein
            </label>
            <label className="check">
              <input type="checkbox" checked={p.rules.eligible === false} onChange={(e) => setRules({ eligible: e.target.checked ? false : undefined })} />
              Keine Spielberechtigung für diese Meldung
            </label>
            {p.rules.eligible === false && (
              <Field label="Grund (optional)">
                <input className="input" value={p.rules.eligibilityNote ?? ''} onChange={(e) => setRules({ eligibilityNote: e.target.value || undefined })} />
              </Field>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={!!p.rules.sperrvermerk}
                onChange={(e) => setRules({ sperrvermerk: e.target.checked ? { teamNumber: 1 } : undefined })}
              />
              Bestehender Sperrvermerk (z. B. aus der Vorrunde)
            </label>
            {p.rules.sperrvermerk && (
              <div className="form-grid">
                <Field label="Gemeldet in Mannschaft Nr." hint="Mannschaft, in der der SPV vergeben wurde">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={p.rules.sperrvermerk.teamNumber}
                    onChange={(e) => setRules({ sperrvermerk: { ...p.rules.sperrvermerk!, teamNumber: Math.max(1, Number(e.target.value) || 1) } })}
                  />
                </Field>
                <Field label="Notiz">
                  <input className="input" value={p.rules.sperrvermerk.note ?? ''} onChange={(e) => setRules({ sperrvermerk: { ...p.rules.sperrvermerk!, note: e.target.value || undefined } })} />
                </Field>
              </div>
            )}
          </div>
        </fieldset>
      )}
      <p className="muted small">
        Quelle: {p.meta.source}
        {p.meta.fileName ? ` · ${p.meta.fileName}` : ''} · {new Date(p.meta.importedAt).toLocaleString('de-DE')}
      </p>
    </Dialog>
  );
}
