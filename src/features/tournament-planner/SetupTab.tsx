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
          Offizielle Regeln <Badge tone="ok">BTTV TT-Race / WO D 7.6</Badge>
        </h2>
        <ul className="rules">
          <li>Schweizer System über <strong>6 Runden</strong> (ideal 9–16 Teilnehmer); bei 7–8 Teilnehmern „Jeder gegen Jeden“.</li>
          <li>Runde 1: die stärksten Spieler werden gesetzt, die übrigen gelost.</li>
          <li>Ab Runde 2: Auslosung innerhalb gleicher Siegzahl (nach Buchholz sortiert); wer in seiner Gruppe keinen neuen Gegner hat, rutscht in die nächsttiefere Gruppe.</li>
          <li>Keine Paarung zweimal. Bei ungerader Zahl ein Freilos (zählt als Sieg), niemand erhält zwei Freilose.</li>
          <li>Wertung: Siege → Buchholz (Freilos = Siege des Tabellenletzten) → direkter Vergleich → Los.</li>
          <li>Aufgabe/Abmeldung: Siege bleiben, jede weitere Runde zählt als kampflose Niederlage.</li>
        </ul>
        <p className="small muted">
          Quelle: <a href="https://www.bttv.de/sport/bavarian-tt-race/infos-spielsystem/" target="_blank" rel="noopener noreferrer">BTTV – Bavarian TT-Race, Infos Spielsystem</a>. Interpretationen sind in der Dokumentation (docs/REGULATIONS.md) beschrieben.
        </p>
      </section>

      <section className="card stack gap-m">
        <h2>Spielsystem</h2>
        <div className="form-grid">
          <Field label="System" hint={`Automatisch: bis ${c.roundRobinMax} Teilnehmer „Jeder gegen Jeden“, sonst Schweizer System`}>
            <select className="input" value={c.system} disabled={started} onChange={(e) => set({ system: e.target.value as TournamentConfig['system'] })}>
              <option value="auto">Automatisch (empfohlen)</option>
              <option value="swiss">Schweizer System</option>
              <option value="round-robin">Jeder gegen Jeden</option>
            </select>
          </Field>
          <Field label="Runden (Schweizer System)" hint={`Gewählt: ${sys === 'swiss' ? 'Schweizer System' : 'Jeder gegen Jeden'} · ${plannedRounds(t)} Runden`}>
            <input
              className="input"
              type="number"
              min={Math.max(1, t.rounds.length)}
              max={Math.max(1, n - 1)}
              disabled={sys !== 'swiss'}
              value={c.rounds}
              onChange={(e) => set({ rounds: Math.max(t.rounds.length || 1, Number(e.target.value) || 1) })}
            />
          </Field>
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

        <h2>
          Ausrichter-Optionen <Badge tone="warning">nicht Teil der offiziellen Regeln</Badge>
        </h2>
        <div className="stack gap-s">
          <Field label="Letztes Entscheidungskriterium">
            <select className="input" value={c.finalTieBreak} onChange={(e) => set({ finalTieBreak: e.target.value as TournamentConfig['finalTieBreak'] })}>
              <option value="lot">Los (laut BTTV-Seite „Infos Spielsystem“)</option>
              <option value="lower-rating">niedrigerer TTR-Wert vorne (laut BTTV-Präsentation/BEMSen)</option>
            </select>
          </Field>
          <Field label="Gegnerwahl innerhalb einer Siegesgruppe">
            <select className="input" value={c.withinGroupPairing} disabled={started} onChange={(e) => set({ withinGroupPairing: e.target.value as TournamentConfig['withinGroupPairing'] })}>
              <option value="draw">gelost (empfohlen)</option>
              <option value="adjacent">nach Tabellenplatz (1–2, 3–4 …)</option>
            </select>
          </Field>
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
          <p className="small muted">Der Startwert macht jede Auslosung reproduzierbar: gleiche Daten + gleicher Startwert = gleiche Paarungen.</p>
        </div>
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
