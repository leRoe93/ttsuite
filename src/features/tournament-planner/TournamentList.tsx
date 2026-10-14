import { useState } from 'react';
import { navigate } from '../../app-shell/router.ts';
import { createTournament } from '../../domain/tournament/workflow.ts';
import { readFileText } from '../../lib/download.ts';
import { parseBackup } from '../../storage/store.ts';
import { useAppData } from '../../storage/AppDataProvider.tsx';
import { Badge, Callout, EmptyState, Field, FileButton, formatDate, useConfirm, useToast } from '../../shared-ui/components.tsx';
import { IconPlus, IconTrophy, IconUpload } from '../../shared-ui/icons.tsx';
import { newId } from '../../domain/players/model.ts';

export function TournamentList() {
  const { data, update } = useAppData();
  const confirm = useConfirm();
  const toast = useToast();
  const sorted = [...data.tournaments].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

  const restore = async (f: File) => {
    try {
      const { text } = await readFileText(f, 10 * 1024 * 1024);
      const b = parseBackup(text);
      if (!b.ok) throw new Error(b.error);
      if (b.kind !== 'tournament') throw new Error('Das ist eine Gesamtsicherung – bitte unter „Daten & Sicherung“ wiederherstellen.');
      const exists = data.tournaments.some((t) => t.id === b.tournament.id);
      if (exists) {
        const ok = await confirm({
          title: 'Turnier bereits vorhanden',
          message: <p>„{b.tournament.name}“ existiert bereits. Als Kopie hinzufügen? (Der vorhandene Stand wird nicht überschrieben.)</p>,
          confirmLabel: 'Als Kopie hinzufügen',
        });
        if (!ok) return;
      }
      const t = exists ? { ...b.tournament, id: newId('t'), name: `${b.tournament.name} (Kopie)` } : b.tournament;
      update((d) => ({ ...d, tournaments: [...d.tournaments, t] }));
      toast('ok', `Turnier „${t.name}“ wiederhergestellt`);
      navigate('turniere', t.id);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Turnierplaner · TT-Race</h1>
          <p className="lead">Teilnehmer importieren, Runden im Schweizer System auslosen, Ergebnisse erfassen und für click-TT exportieren.</p>
        </div>
        <div className="toolbar">
          <FileButton accept=".json,application/json" onFile={restore}>
            <IconUpload /> Turnier wiederherstellen
          </FileButton>
          <button className="btn btn-primary" onClick={() => navigate('turniere', 'neu')}>
            <IconPlus /> Neues Turnier
          </button>
        </div>
      </header>
      {sorted.length === 0 ? (
        <EmptyState icon={<IconTrophy size={34} />} title="Noch kein Turnier" actions={<button className="btn btn-primary" onClick={() => navigate('turniere', 'neu')}>Turnier anlegen</button>}>
          Lege ein TT-Race an. Für den späteren Ergebnis-Export nach click-TT die Teilnehmer am besten als XML aus dem click-TT-Turnierportal importieren.
        </EmptyState>
      ) : (
        <ul className="cards">
          {sorted.map((t) => (
            <li key={t.id}>
              <a className="card card-link" href={`#/turniere/${t.id}`}>
                <div className="row gap-s wrap between">
                  <strong>{t.name}</strong>
                  {t.finished ? <Badge tone="ok">abgeschlossen</Badge> : t.rounds.length ? <Badge tone="info">Runde {t.rounds.length}</Badge> : <Badge tone="neutral">Vorbereitung</Badge>}
                </div>
                <span className="muted small">
                  {formatDate(t.date)} · {t.organizer} · {t.participants.length} Teilnehmer{t.clickTt ? ' · click-TT' : ''}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NewTournament() {
  const { update } = useAppData();
  const [name, setName] = useState('TT-Race');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [organizer, setOrganizer] = useState('');
  const [venue, setVenue] = useState('');
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Neues TT-Race</h1>
      </header>
      <form
        className="card stack gap-m"
        onSubmit={(e) => {
          e.preventDefault();
          const t = createTournament({ name: name.trim(), date, organizer: organizer.trim(), venue: venue.trim() || undefined });
          update((d) => ({ ...d, tournaments: [...d.tournaments, t] }));
          navigate('turniere', t.id, 'teilnehmer');
        }}
      >
        <div className="form-grid">
          <Field label="Turniername *">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Datum *">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Ausrichter (Verein)">
            <input className="input" value={organizer} onChange={(e) => setOrganizer(e.target.value)} />
          </Field>
          <Field label="Spielort">
            <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </Field>
        </div>
        <Callout tone="info">Spielsystem und Rundenzahl legst du nach dem Import der Teilnehmer fest. Sollen die Ergebnisse nach click-TT übertragen werden, muss das Turnier dort angelegt sein – Teilnehmerdatei und Ergebnis-Importer stammen aus dem click-TT-Turnierportal.</Callout>
        <div>
          <button className="btn btn-primary" type="submit">Weiter zu den Teilnehmern</button>
        </div>
      </form>
    </div>
  );
}
