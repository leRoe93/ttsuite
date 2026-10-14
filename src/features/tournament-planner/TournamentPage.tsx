import { navigate } from '../../app-shell/router.ts';
import { plannedRounds } from '../../domain/tournament/model.ts';
import { roundComplete } from '../../domain/tournament/workflow.ts';
import { Badge, EmptyState, formatDate, Tabs, useConfirm } from '../../shared-ui/components.tsx';
import { useAppData } from '../../storage/AppDataProvider.tsx';
import { ExportTab } from './ExportTab.tsx';
import { ParticipantsTab } from './ParticipantsTab.tsx';
import { RoundsTab } from './RoundsTab.tsx';
import { SetupTab } from './SetupTab.tsx';
import { StandingsTab } from './StandingsTab.tsx';
import { useTournament } from './useTournament.ts';

type TabId = 'teilnehmer' | 'einstellungen' | 'runden' | 'tabelle' | 'export';

export function TournamentPage({ id, tab }: { id: string; tab?: string }) {
  const { t, save } = useTournament(id);
  const { update } = useAppData();
  const confirm = useConfirm();
  if (!t) return <EmptyState title="Turnier nicht gefunden" actions={<button className="btn" onClick={() => navigate('turniere')}>Zur Übersicht</button>} />;
  const active = (['teilnehmer', 'einstellungen', 'runden', 'tabelle', 'export'] as TabId[]).includes(tab as TabId) ? (tab as TabId) : t.rounds.length ? 'runden' : 'teilnehmer';
  const last = t.rounds[t.rounds.length - 1];
  const open = last ? last.matches.filter((m) => !m.result).length : 0;

  const remove = async () => {
    const ok = await confirm({
      title: 'Turnier löschen?',
      message: <p>„{t.name}“ mit allen Runden und Ergebnissen wird aus diesem Browser gelöscht. Tipp: vorher unter „Export“ eine Sicherung herunterladen.</p>,
      confirmLabel: 'Endgültig löschen',
      danger: true,
    });
    if (!ok) return;
    update((d) => ({ ...d, tournaments: d.tournaments.filter((x) => x.id !== t.id) }));
    navigate('turniere');
  };

  return (
    <div className="page">
      <header className="page-head">
        <div className="stack gap-xs">
          <a className="small muted back" href="#/turniere">← Alle Turniere</a>
          <div className="row gap-s wrap">
            <h1>{t.name}</h1>
            {t.finished ? <Badge tone="ok">abgeschlossen</Badge> : t.confirmed ? <Badge tone="info">läuft</Badge> : <Badge tone="neutral">Vorbereitung</Badge>}
          </div>
          <p className="muted small">
            {formatDate(t.date)}
            {t.organizer ? ` · ${t.organizer}` : ''}
            {t.venue ? ` · ${t.venue}` : ''} · {t.participants.length} Teilnehmer
            {t.rounds.length ? ` · Runde ${t.rounds.length}/${plannedRounds(t)}` : ''}
          </p>
        </div>
        <div className="toolbar">
          <button className="btn btn-ghost danger" onClick={remove}>Turnier löschen</button>
        </div>
      </header>
      <Tabs<TabId>
        label="Turnierbereiche"
        value={active}
        onChange={(v) => navigate('turniere', t.id, v)}
        items={[
          { id: 'teilnehmer', label: '1 Teilnehmer', badge: t.confirmed ? <Badge tone="ok">bestätigt</Badge> : undefined },
          { id: 'einstellungen', label: '2 Spielsystem' },
          { id: 'runden', label: '3 Runden', badge: last && !roundComplete(last) ? <Badge tone="warning">{open} offen</Badge> : undefined, disabled: !t.confirmed },
          { id: 'tabelle', label: '4 Tabelle', disabled: t.rounds.length === 0 },
          { id: 'export', label: '5 Export' },
        ]}
      />
      <div className="tab-panel">
        {active === 'teilnehmer' && <ParticipantsTab t={t} save={save} />}
        {active === 'einstellungen' && <SetupTab t={t} save={save} />}
        {active === 'runden' && <RoundsTab t={t} save={save} />}
        {active === 'tabelle' && <StandingsTab t={t} />}
        {active === 'export' && <ExportTab t={t} save={save} />}
      </div>
    </div>
  );
}
