import { useCallback, useMemo, useState } from 'react';
import type { FeatureProps } from '../../app-shell/registry.ts';
import { navigate } from '../../app-shell/router.ts';
import { fullName, type Player } from '../../domain/players/model.ts';
import { assignedIds, findSlot, movePlayer, type TeamPlan } from '../../domain/team-rules/model.ts';
import { validateLineup } from '../../domain/team-rules/validate.ts';
import { lineupToCsv, lineupToJson } from '../../exports/general.ts';
import { downloadText, safeFileName } from '../../lib/download.ts';
import { useAppData } from '../../storage/AppDataProvider.tsx';
import { Callout, Dialog, EmptyState, Menu, useConfirm, useToast } from '../../shared-ui/components.tsx';
import { ClickTtLinks } from './ClickTtLinks.tsx';
import { DndProvider, type DropTarget } from '../../shared-ui/dnd.tsx';
import { IconDownload, IconPlus, IconPrint, IconRedo, IconTeams, IconUndo, IconUpload } from '../../shared-ui/icons.tsx';
import { PlayerEditor, blankPlayer } from '../shared/PlayerEditor.tsx';
import { PlayerImportWizard, type ImportOutcome } from '../shared/PlayerImportWizard.tsx';
import { NewPlanForm, PlanSettingsDialog } from './PlanDialogs.tsx';
import { PlayerPool } from './PlayerPool.tsx';
import { TeamPanel } from './TeamPanel.tsx';
import { ValidationSummary } from './ValidationSummary.tsx';
import { PrintLineup } from './PrintLineup.tsx';
import { applyLineupHints, newTeam, resolveRuleSet, usePlanHistory } from './state.ts';

export function TeamPlannerPage({ subpath }: FeatureProps) {
  const { data, update } = useAppData();
  const confirm = useConfirm();
  const toast = useToast();
  const planId = subpath[0];
  const plan = data.teamPlans.find((p) => p.id === planId) ?? (planId ? undefined : data.teamPlans[0]);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clickTtOpen, setClickTtOpen] = useState(false);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  const commitPlan = useCallback(
    (p: TeamPlan) => update((d) => ({ ...d, teamPlans: d.teamPlans.map((x) => (x.id === p.id ? p : x)) })),
    [update],
  );
  const history = usePlanHistory(plan, commitPlan);
  const ruleSet = plan ? resolveRuleSet(plan.ruleSetId, data.customRuleSets) : undefined;
  const validation = useMemo(() => (plan && ruleSet ? validateLineup(plan, data.players, ruleSet) : undefined), [plan, data.players, ruleSet]);

  const onDrop = useCallback(
    (playerId: string, target: DropTarget) => {
      if (!plan) return;
      if (target.listId === 'pool') {
        if (findSlot(plan, playerId)) history.apply(movePlayer(plan, playerId, null, 0));
        return;
      }
      const cur = findSlot(plan, playerId);
      if (cur && cur.team.id === target.listId && (cur.index === target.index || cur.index + 1 === target.index)) return;
      history.apply(movePlayer(plan, playerId, target.listId, target.index));
    },
    [plan, history],
  );

  const savePlayer = (p: Player) => {
    update((d) => ({ ...d, players: d.players.some((x) => x.id === p.id) ? d.players.map((x) => (x.id === p.id ? p : x)) : [...d.players, p] }));
    setEditing(null);
    toast('ok', `${fullName(p)} gespeichert`);
  };

  const applyImport = async (o: ImportOutcome) => {
    update((d) => {
      const upd = new Map(o.updated.map((p) => [p.id, p]));
      return { ...d, players: [...d.players.map((p) => upd.get(p.id) ?? p), ...o.added] };
    });
    toast('ok', `${o.added.length} Spieler neu, ${o.updated.length} aktualisiert`);
    if (!plan) return;
    const withTeam = [...o.hints.entries()].filter(([, h]) => h.team || h.teamNumber);
    if (withTeam.length === 0) return;
    const ok = await confirm({
      title: 'Mannschaften aus der Datei übernehmen?',
      message: (
        <p>
          {withTeam.length} Spieler haben eine Mannschaftsangabe ({[...new Set(withTeam.map(([, h]) => h.team ?? `Mannschaft ${h.teamNumber}`))].join(', ')}). Sollen sie in „{plan.name}“ entsprechend eingetragen werden? Fehlende Mannschaften werden angelegt;
          Kennzeichen RES/WES/NES/SES und SPV werden übernommen. Die bisherige Aufstellung dieser Spieler wird überschrieben (rückgängig machbar).
        </p>
      ),
      confirmLabel: 'Übernehmen',
    });
    if (!ok) return;
    const { plan: next, spv: spvUpdates } = applyLineupHints(plan, o.hints);
    history.apply(next);
    if (spvUpdates.size) {
      update((d) => ({ ...d, players: d.players.map((p) => (spvUpdates.has(p.id) ? { ...p, rules: { ...p.rules, sperrvermerk: { teamNumber: spvUpdates.get(p.id)!, note: 'aus Import' } } } : p)) }));
    }
  };

  const createPlan = (p: TeamPlan) => {
    update((d) => ({ ...d, teamPlans: [...d.teamPlans, p] }));
    navigate('mannschaften', p.id);
  };

  const deletePlan = async () => {
    if (!plan) return;
    const ok = await confirm({ title: 'Planung löschen?', message: <p>„{plan.name}“ wird gelöscht. Die Spieler bleiben im Spielerpool erhalten.</p>, confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    update((d) => ({ ...d, teamPlans: d.teamPlans.filter((x) => x.id !== plan.id) }));
    navigate('mannschaften');
  };

  const removePlayerFromPool = async (p: Player) => {
    const usedIn = data.teamPlans.filter((pl) => assignedIds(pl).has(p.id));
    const ok = await confirm({
      title: 'Spieler löschen?',
      message: <p>{fullName(p)} wird aus dem Spielerpool gelöscht{usedIn.length ? ` und aus ${usedIn.length} Planung(en) entfernt` : ''}.</p>,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    update((d) => ({
      ...d,
      players: d.players.filter((x) => x.id !== p.id),
      teamPlans: d.teamPlans.map((pl) => movePlayer(pl, p.id, null, 0)),
    }));
  };

  if (planId && !plan) {
    return <EmptyState title="Planung nicht gefunden" actions={<button className="btn" onClick={() => navigate('mannschaften')}>Zur Übersicht</button>} />;
  }

  if (!plan) {
    return (
      <div className="page narrow">
        <header className="page-head">
          <div>
            <h1>Mannschaftsplaner</h1>
            <p className="lead">Mannschaftsmeldung nach Q-TTR planen – mit Prüfung von Spielstärke-Reihenfolge, Toleranzen und Sperrvermerken.</p>
          </div>
        </header>
        <div className="card">
          <h2>Neue Planung anlegen</h2>
          <NewPlanForm onCreate={createPlan} />
        </div>
        <Callout tone="info" title="So geht's">
          1. Planung anlegen · 2. Über „click-TT ↗“ die öffentliche Mannschaftsmeldung des Vereins öffnen, kopieren und unter „Import“ einfügen (oder CSV/Excel) · 3. Spieler per Ziehen oder über das Menü den Mannschaften zuordnen · 4. Prüfergebnis beachten und exportieren.
        </Callout>
      </div>
    );
  }

  const exportBase = safeFileName(`Mannschaftsmeldung_${plan.name}_${plan.season}`);

  return (
    <DndProvider onDrop={onDrop}>
      <div className="page wide planner no-print">
        <header className="page-head">
          <div className="stack gap-xs">
            <div className="row gap-s wrap">
              <h1>{plan.name}</h1>
              {data.teamPlans.length > 1 && (
                <select className="input input-s" value={plan.id} onChange={(e) => navigate('mannschaften', e.target.value)} aria-label="Planung wechseln">
                  {data.teamPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.season})</option>
                  ))}
                </select>
              )}
            </div>
            <p className="muted small">
              Saison {plan.season} · {plan.halfSeason === 'VR' ? 'Vorrunde' : 'Rückrunde'} · {plan.ageClass === 'erwachsene' ? 'Erwachsene' : 'Nachwuchs'} · Q-TTR-Stichtag {ruleSet!.qttrCutoff[plan.halfSeason]} ·{' '}
              <button className="link" onClick={() => setSettingsOpen(true)}>{ruleSet!.label}</button>
            </p>
          </div>
          <div className="toolbar">
            <button className="btn-icon" onClick={history.undo} disabled={!history.canUndo} title="Rückgängig (Strg+Z)" aria-label="Rückgängig"><IconUndo /></button>
            <button className="btn-icon" onClick={history.redo} disabled={!history.canRedo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen"><IconRedo /></button>
            <button className="btn" onClick={() => setClickTtOpen(true)} title="Mannschaftsmeldung des Vereins in click-TT öffnen">click-TT ↗</button>
            <button className="btn" onClick={() => setImportOpen(true)}><IconUpload /> Import</button>
            <button className="btn" onClick={() => history.apply({ ...plan, teams: [...plan.teams, newTeam(`Mannschaft ${plan.teams.length + 1}`, plan.teams[plan.teams.length - 1]?.sollstaerke ?? 6)] })}>
              <IconPlus /> Mannschaft
            </button>
            <Menu label="Export" icon={<IconDownload />}>
              {(close) => (
                <>
                  <button role="menuitem" onClick={() => { downloadText(`${exportBase}.csv`, lineupToCsv(plan, data.players, validation), 'text/csv;charset=utf-8'); close(); }}>CSV (Excel)</button>
                  <button role="menuitem" onClick={() => { downloadText(`${exportBase}.json`, lineupToJson(plan, data.players), 'application/json'); close(); }}>JSON</button>
                  <button role="menuitem" onClick={() => { close(); setTimeout(() => window.print(), 50); }}><IconPrint size={16} /> Drucken / PDF</button>
                </>
              )}
            </Menu>
            <Menu label="Weitere Aktionen" icon={<span aria-hidden>⋯</span>}>
              {(close) => (
                <>
                  <button role="menuitem" onClick={() => { setSettingsOpen(true); close(); }}>Planung &amp; Regelwerk…</button>
                  <button role="menuitem" onClick={() => { setEditing(blankPlayer()); close(); }}>Spieler manuell anlegen…</button>
                  <button role="menuitem" onClick={() => { navigate('mannschaften', 'neu'); close(); }}>Neue Planung…</button>
                  <button role="menuitem" className="danger" onClick={() => { close(); void deletePlan(); }}>Planung löschen</button>
                </>
              )}
            </Menu>
          </div>
        </header>

        {validation && <ValidationSummary validation={validation} plan={plan} onHighlight={setHighlight} />}

        <div className="planner-grid">
          <PlayerPool
            plan={plan}
            players={data.players}
            validation={validation!}
            highlight={highlight}
            onMove={(pid, teamId) => {
              const t = plan.teams.find((x) => x.id === teamId);
              history.apply(movePlayer(plan, pid, teamId, t ? t.slots.length : 0));
            }}
            onEdit={setEditing}
            onDelete={removePlayerFromPool}
            onImport={() => setImportOpen(true)}
          />
          <div className="teams">
            {plan.teams.length === 0 && (
              <EmptyState icon={<IconTeams size={32} />} title="Noch keine Mannschaft" actions={<button className="btn btn-primary" onClick={() => history.apply({ ...plan, teams: [newTeam('Mannschaft 1')] })}>Mannschaft anlegen</button>} />
            )}
            {plan.teams.map((team, ti) => (
              <TeamPanel
                key={team.id}
                plan={plan}
                team={team}
                teamIndex={ti}
                players={data.players}
                validation={validation!}
                highlight={highlight}
                onChange={history.apply}
                onEditPlayer={setEditing}
                onDeleteTeam={async () => {
                  const ok = team.slots.length === 0 || (await confirm({ title: 'Mannschaft löschen?', message: <p>{team.name} mit {team.slots.length} Spielern löschen? Die Spieler werden wieder „nicht zugeordnet“.</p>, confirmLabel: 'Löschen', danger: true }));
                  if (ok) history.apply({ ...plan, teams: plan.teams.filter((t) => t.id !== team.id) });
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <PrintLineup plan={plan} players={data.players} validation={validation!} ruleSetLabel={ruleSet!.label} />
      <PlayerImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={applyImport}
        pool={data.players}
        allowXml
        defaultSource="click-tt-table"
        clickTtHelp={<ClickTtLinks plan={plan} onChange={commitPlan} compact />}
      />
      <Dialog open={clickTtOpen} onClose={() => setClickTtOpen(false)} title="Spieler aus click-TT holen" wide footer={<><button className="btn" onClick={() => setClickTtOpen(false)}>Schließen</button><button className="btn btn-primary" onClick={() => { setClickTtOpen(false); setImportOpen(true); }}>Weiter zum Einfügen</button></>}>
        <ClickTtLinks plan={plan} onChange={commitPlan} compact />
      </Dialog>
      <PlayerEditor player={editing} open={!!editing} onClose={() => setEditing(null)} onSave={savePlayer} />
      <PlanSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} plan={plan} onChange={history.apply} />
    </DndProvider>
  );
}

export function NewPlanPage() {
  const { update } = useAppData();
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Neue Planung</h1>
      </header>
      <div className="card">
        <NewPlanForm
          onCreate={(p) => {
            update((d) => ({ ...d, teamPlans: [...d.teamPlans, p] }));
            navigate('mannschaften', p.id);
          }}
        />
      </div>
    </div>
  );
}
