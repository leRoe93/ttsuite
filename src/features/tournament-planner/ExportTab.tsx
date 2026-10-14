import { useMemo, useState } from 'react';
import type { Tournament } from '../../domain/tournament/model.ts';
import { buildClickTtResultXml } from '../../exports/clickTtResults.ts';
import { matchesToCsv, standingsToCsv } from '../../exports/general.ts';
import { APP_VERSION, downloadText, safeFileName } from '../../lib/download.ts';
import { makeTournamentBackup } from '../../storage/store.ts';
import { Badge, Callout } from '../../shared-ui/components.tsx';
import { IconDownload } from '../../shared-ui/icons.tsx';

export function ExportTab({ t }: { t: Tournament; save: (t: Tournament) => void }) {
  const exp = useMemo(() => buildClickTtResultXml(t), [t]);
  const [ack, setAck] = useState(false);
  const [showXml, setShowXml] = useState(false);
  const base = safeFileName(`${t.date}_${t.name}`);
  const errors = exp.checks.filter((c) => c.severity === 'error');

  return (
    <div className="grid-2">
      <section className="card stack gap-m">
        <div className="row gap-s wrap">
          <h2>Ergebnisse für click-TT</h2>
          <Badge tone="warning">Format nachgebildet</Badge>
        </div>
        <p className="small">
          Erzeugt eine Ergebnisdatei im Aufbau der click-TT-Turnierschnittstelle (XML, UTF-8) mit den Spieler-IDs aus der importierten Teilnehmerdatei. Upload im click-TT-Turnierportal über den <strong>Ergebnis-Importer</strong>; danach Satzergebnisse kontrollieren und das Turnier in click-TT abschließen.
        </p>
        <div className="row gap-s wrap">
          <Badge tone="ok">{exp.exportedMatches} Spiele exportierbar</Badge>
          {exp.skippedMatches > 0 && <Badge tone="warning">{exp.skippedMatches} nicht exportiert</Badge>}
        </div>
        <ul className="checks">
          {exp.checks.map((c, i) => (
            <li key={i}>
              <Callout tone={c.severity === 'error' ? 'error' : c.severity === 'warning' ? 'warning' : 'info'}>{c.message}</Callout>
            </li>
          ))}
        </ul>
        {exp.xml && errors.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Ich habe die Fehler gelesen und exportiere nur die vollständigen Spiele.
          </label>
        )}
        <div className="row gap-s wrap">
          <button className="btn btn-primary" disabled={!exp.xml || (errors.length > 0 && !ack)} onClick={() => exp.xml && downloadText(`${base}_click-tt-ergebnisse.xml`, exp.xml, 'application/xml;charset=utf-8')}>
            <IconDownload /> XML herunterladen
          </button>
          {exp.xml && <button className="btn" onClick={() => setShowXml((s) => !s)}>{showXml ? 'Vorschau ausblenden' : 'Vorschau anzeigen'}</button>}
        </div>
        {showXml && exp.xml && <pre className="code">{exp.xml.split('\n').slice(0, 60).join('\n')}{exp.xml.split('\n').length > 60 ? '\n…' : ''}</pre>}
        <p className="small muted">Datei nicht per E-Mail weiterleiten oder in Editoren speichern – manche Programme verändern Zeichensatz oder Zeilenumbrüche.</p>
      </section>

      <section className="card stack gap-m">
        <h2>Weitere Exporte</h2>
        <div className="stack gap-s">
          <button className="btn" onClick={() => downloadText(`${base}_tabelle.csv`, standingsToCsv(t), 'text/csv;charset=utf-8')} disabled={!t.rounds.length}>
            <IconDownload /> Tabelle (CSV)
          </button>
          <button className="btn" onClick={() => downloadText(`${base}_spiele.csv`, matchesToCsv(t), 'text/csv;charset=utf-8')} disabled={!t.rounds.length}>
            <IconDownload /> Alle Spiele (CSV)
          </button>
        </div>
        <h2>Sicherung</h2>
        <p className="small">Vollständiger Turnierstand (Teilnehmer, Einstellungen, Runden, Ergebnisse) als Datei. Damit lässt sich das Turnier auf einem anderen Gerät oder nach dem Löschen der Browserdaten fortsetzen.</p>
        <div>
          <button className="btn btn-primary" onClick={() => downloadText(`${base}_sicherung.json`, makeTournamentBackup(t, APP_VERSION), 'application/json')}>
            <IconDownload /> Turnier sichern (JSON)
          </button>
        </div>
      </section>
    </div>
  );
}
