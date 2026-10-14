import { registerFeature } from '../../app-shell/registry.ts';
import { APP_VERSION, downloadText, readFileText } from '../../lib/download.ts';
import { useAppData } from '../../storage/AppDataProvider.tsx';
import { emptyData, makeBackup, parseBackup } from '../../storage/store.ts';
import { Callout, FileButton, useConfirm, useToast } from '../../shared-ui/components.tsx';
import { IconDatabase, IconDownload, IconTrash, IconUpload } from '../../shared-ui/icons.tsx';

function DataManagerPage() {
  const { data, replaceAll, status, loadError } = useAppData();
  const confirm = useConfirm();
  const toast = useToast();
  const sizeKb = Math.round(JSON.stringify(data).length / 512); // UTF-16 ≈ 2 bytes/char

  const restore = async (f: File) => {
    try {
      const { text } = await readFileText(f, 20 * 1024 * 1024);
      const b = parseBackup(text);
      if (!b.ok) throw new Error(b.error);
      if (b.kind !== 'full') throw new Error('Das ist eine Turnier-Sicherung – bitte im Turnierplaner wiederherstellen.');
      const ok = await confirm({
        title: 'Sicherung wiederherstellen?',
        message: (
          <>
            <p>
              Sicherung vom {b.exportedAt ? new Date(b.exportedAt).toLocaleString('de-DE') : 'unbekannten Datum'}: {b.summary}.
            </p>
            <p>
              <strong>Alle aktuellen Daten in diesem Browser werden ersetzt</strong> ({data.players.length} Spieler, {data.teamPlans.length} Planungen, {data.tournaments.length} Turniere). Tipp: vorher eine aktuelle Sicherung herunterladen.
            </p>
          </>
        ),
        confirmLabel: 'Ersetzen',
        danger: true,
      });
      if (!ok) return;
      replaceAll(b.data);
      toast('ok', 'Sicherung wiederhergestellt');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };

  const resetAll = async () => {
    const ok = await confirm({
      title: 'Alle Daten löschen?',
      message: <p>Spielerpool, Mannschaftsplanungen und Turniere werden unwiderruflich aus diesem Browser gelöscht. Es gibt keine Kopie auf einem Server.</p>,
      confirmLabel: 'Alles löschen',
      danger: true,
    });
    if (ok) {
      replaceAll(emptyData());
      toast('ok', 'Alle Daten gelöscht');
    }
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Daten &amp; Sicherung</h1>
          <p className="lead">Alle Daten liegen ausschließlich in diesem Browser auf diesem Gerät.</p>
        </div>
      </header>
      {loadError && (
        <Callout tone="error" title="Gespeicherte Daten konnten nicht gelesen werden">
          {loadError.error} Die Rohdaten wurden nicht überschrieben.{' '}
          <button className="link" onClick={() => downloadText('ttsuite_rohdaten.json', loadError.raw, 'application/json')}>Rohdaten herunterladen</button>
        </Callout>
      )}
      <div className="grid-2">
        <section className="card stack gap-s">
          <h2>Bestand</h2>
          <ul className="kv">
            <li><span>Spieler im Pool</span><strong>{data.players.length}</strong></li>
            <li><span>Mannschaftsplanungen</span><strong>{data.teamPlans.length}</strong></li>
            <li><span>Turniere</span><strong>{data.tournaments.length}</strong></li>
            <li><span>Eigene Regelwerke</span><strong>{data.customRuleSets.length}</strong></li>
            <li><span>Speicherbedarf</span><strong>ca. {sizeKb} KB</strong></li>
            <li><span>Status</span><strong>{status.state === 'saved' ? 'gespeichert' : status.state === 'saving' ? 'speichert…' : status.state === 'error' ? 'Fehler' : 'nicht verfügbar'}</strong></li>
          </ul>
          {status.message && <Callout tone="error">{status.message}</Callout>}
        </section>
        <section className="card stack gap-s">
          <h2>Sichern &amp; Wiederherstellen</h2>
          <button className="btn btn-primary" onClick={() => downloadText(`ttsuite_sicherung_${new Date().toISOString().slice(0, 10)}.json`, makeBackup(data, APP_VERSION), 'application/json')}>
            <IconDownload /> Gesamtsicherung herunterladen
          </button>
          <FileButton accept=".json,application/json" onFile={restore}>
            <IconUpload /> Sicherung wiederherstellen…
          </FileButton>
          <button className="btn btn-danger" onClick={resetAll}>
            <IconTrash /> Alle Daten löschen…
          </button>
        </section>
      </div>
      <section className="card stack gap-s">
        <h2>Wichtig zum Browser-Speicher</h2>
        <ul className="small">
          <li>Gespeichert wird im <em>localStorage</em> dieses Browsers (typisch 5–10 MB). Andere Geräte, Browser oder private Fenster sehen diese Daten nicht.</li>
          <li>Beim Löschen der Browserdaten/Cookies, im privaten Modus oder bei Speicherknappheit (v. a. iOS/Safari nach längerer Nichtnutzung) können Daten verloren gehen.</li>
          <li>Deshalb: vor und nach jedem Turnier und nach jeder Meldungsplanung eine Sicherung herunterladen.</li>
          <li>Es werden keine Daten an Server oder Dritte übertragen; die App funktioniert nach dem ersten Laden auch offline.</li>
          <li>Personenbezogene Daten (Namen, Jahrgänge, Lizenznummern) nur für den Vereins-/Turnierzweck verwenden und Sicherungsdateien entsprechend vertraulich behandeln.</li>
        </ul>
      </section>
    </div>
  );
}

registerFeature({
  id: 'data-manager',
  path: 'daten',
  title: 'Daten & Sicherung',
  description: 'Sicherung, Wiederherstellung und Löschen aller lokal gespeicherten Daten.',
  icon: <IconDatabase size={22} />,
  component: DataManagerPage,
  order: 90,
  kind: 'utility',
});
