import { navigate } from '../../app-shell/router.ts';
import { effectiveSystem, plannedRounds, type Tournament, type TournamentConfig } from '../../domain/tournament/model.ts';
import { checkSetup } from '../../domain/tournament/workflow.ts';
import { randomSeed } from '../../lib/rng.ts';
import { Badge, Callout, Field } from '../../shared-ui/components.tsx';
import { IconShuffle } from '../../shared-ui/icons.tsx';

export function SetupTab({ t, save }: { t: Tournament; save: (t: Tournament) => void }) {
  const started = t.rounds.length > 0;
  const c = t.config;
  const set = (patch: Partial<TournamentConfig>) => save({ ...t, config: { ...c, ...patch }, updatedAt: new Date().toISOString() });
  const setMeta = (patch: Partial<Tournament>) => save({ ...t, ...patch, updatedAt: new Date().toISOString() });
  const n = t.participants.length;
  const sys = effectiveSystem(t);
  const issues = checkSetup(t);

  return (
    <div className="grid-2">
      <section className="card stack gap-m">
        <h2>Turnierdaten</h2>
        <div className="form-grid">
          <Field label="Turniername">
            <input className="input" value={t.name} onChange={(e) => setMeta({ name: e.target.value })} />
          </Field>
          <Field label="Datum">
            <input className="input" type="date" value={t.date} onChange={(e) => setMeta({ date: e.target.value })} />
          </Field>
          <Field label="Ausrichter">
            <input className="input" value={t.organizer} onChange={(e) => setMeta({ organizer: e.target.value })} />
          </Field>
          <Field label="Spielort">
            <input className="input" value={t.venue ?? ''} onChange={(e) => setMeta({ venue: e.target.value || undefined })} />
          </Field>
        </div>

        <h2>
          TTVN-Race-Regeln <Badge tone="ok">MKTT Cup-System</Badge>
        </h2>
        <ul className="rules">
          <li>6 Runden (ideal 9–16 Teilnehmende); bei 7–8 Teilnehmenden „Jeder gegen Jeden“ mit 7 Runden.</li>
          <li>Runde 1, Setzung nach Q-TTR: jeder der oberen Hälfte gegen die gleiche Position der unteren Hälfte (1–9, 2–10 … bei 16). Bei ungerader Zahl Freilos für den Spieler in der Mitte.</li>
          <li>Runden 2–4: in jeder Ergebnisgruppe (gleiche Siegzahl) der Erste gegen den Letzten (1–8, 2–7 …). Ungerade Gruppen werden von unten ergänzt.</li>
          <li>Runden 5–6: direkte Tabellennachbarn (1–2, 3–4 …), sofern noch nicht gegeneinander gespielt.</li>
          <li>Freilos zählt als Sieg, höchstens eines pro Spieler; vergeben von der Mitte nach unten, sonst von der Mitte nach oben.</li>
          <li>Wertung: Siege → Buchholz → Feinbuchholz → Satzdifferenz → gewonnene Sätze.</li>
          <li>Aufgabe: Siege bleiben, jede weitere Runde zählt als kampflose Niederlage (nicht TTR-relevant).</li>
        </ul>
        <p className="small muted">
          Quelle: <a href="https://www.ttvn.de/turniere/ttvn-race/infos-spielsystem/" target="_blank" rel="noopener noreferrer">TTVN – TTVN-Race, Infos Spielsystem</a> (Dokument „MKTT Cup-System“). Offene Detailfragen stehen in docs/REGULATIONS.md.
        </p>
      </section>

      <section className="card stack gap-m">
        <h2>Spielsystem</h2>
        <p className="small">
          {n === 0 ? 'Noch keine Teilnehmenden.' : sys === 'round-robin' ? `${n} Teilnehmende → „Jeder gegen Jeden“ mit ${plannedRounds(t)} Runden.` : `${n} Teilnehmende → MKTT Cup-System mit ${plannedRounds(t)} Runden.`}
        </p>
        <div className="form-grid">
          <Field label="Gewinnsätze">
            <select className="input" value={c.bestOf} onChange={(e) => set({ bestOf: Number(e.target.value) as 3 | 5 | 7 })}>
              <option value={3}>Best of 3 (2 Gewinnsätze)</option>
              <option value={5}>Best of 5 (3 Gewinnsätze)</option>
              <option value={7}>Best of 7 (4 Gewinnsätze)</option>
            </select>
          </Field>
          <Field label="Tische" hint="optional, für die Tischzuteilung">
            <input className="input" type="number" min={0} value={c.tables ?? ''} onChange={(e) => set({ tables: Number(e.target.value) || undefined })} />
          </Field>
        </div>
        <details className="small">
          <summary>Für den Notfall</summary>
          <div className="stack gap-s pad">
          <label className="check">
            <input type="checkbox" checked={c.allowRepeatsIfUnavoidable} onChange={(e) => set({ allowRepeatsIfUnavoidable: e.target.checked })} />
            Wiederholungspaarung nur zulassen, wenn keine andere Auslosung möglich ist
          </label>
          <div className="row gap-s wrap">
            <span className="small">
              Auslosungs-Startwert: <code>{c.rngSeed}</code>
            </span>
            <button className="btn btn-s" disabled={started} onClick={() => set({ rngSeed: randomSeed() })}>
              <IconShuffle size={14} /> neu
            </button>
          </div>
          <p className="small muted">Der Startwert entscheidet nur bei Gleichstand (gleicher Q-TTR, komplett gleiche Wertung) und macht das reproduzierbar.</p>
          </div>
        </details>
        {issues.map((i, k) => (
          <Callout key={k} tone={i.severity === 'error' ? 'error' : 'warning'}>{i.message}</Callout>
        ))}
        <div>
          <button className="btn btn-primary" disabled={!t.confirmed} onClick={() => navigate('turniere', t.id, 'runden')}>
            Zu den Runden
          </button>
          {!t.confirmed && <span className="small muted"> Zuerst die Teilnehmerliste bestätigen.</span>}
        </div>
      </section>
    </div>
  );
}
