import { useMemo, useState } from 'react';
import { fullName, sortName, type Player } from '../../domain/players/model.ts';
import { normalizeName } from '../../domain/players/normalize.ts';
import { findSlot, type TeamPlan } from '../../domain/team-rules/model.ts';
import type { LineupValidation } from '../../domain/team-rules/validate.ts';
import { EmptyState, Menu } from '../../shared-ui/components.tsx';
import { useDnd } from '../../shared-ui/dnd.tsx';
import { IconGrip, IconSearch, IconUpload } from '../../shared-ui/icons.tsx';
import { findingText, SeverityIcon, SpvChip, spvState, worst } from './status.tsx';

type Filter = 'all' | 'unassigned' | 'problems' | string; // or team id
type Sort = 'qttr' | 'name' | 'team';

export function PlayerPool({
  plan,
  players,
  validation,
  highlight,
  onMove,
  onEdit,
  onDelete,
  onImport,
}: {
  plan: TeamPlan;
  players: readonly Player[];
  validation: LineupValidation;
  highlight: Set<string>;
  onMove: (playerId: string, teamId: string | null) => void;
  onEdit: (p: Player) => void;
  onDelete: (p: Player) => void;
  onImport: () => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('unassigned');
  const [sort, setSort] = useState<Sort>('qttr');
  const { drag, startDrag } = useDnd();

  const rows = useMemo(() => {
    const nq = normalizeName(q);
    const list = players
      .map((p) => ({ p, slot: findSlot(plan, p.id) }))
      .filter(({ p, slot }) => {
        if (nq && !normalizeName(`${p.firstName} ${p.lastName} ${p.club ?? ''}`).includes(nq)) return false;
        if (filter === 'unassigned') return !slot;
        if (filter === 'problems') return ['error', 'warning'].includes(worst(validation.byPlayer[p.id])) || p.rules.qttr === undefined;
        if (filter !== 'all') return slot?.team.id === filter;
        return true;
      });
    list.sort((a, b) => {
      if (sort === 'name') return sortName(a.p).localeCompare(sortName(b.p), 'de');
      if (sort === 'team') return (a.slot ? a.slot.teamIndex * 100 + a.slot.index : 9999) - (b.slot ? b.slot.teamIndex * 100 + b.slot.index : 9999);
      return (b.p.rules.qttr ?? -1) - (a.p.rules.qttr ?? -1);
    });
    return list;
  }, [players, plan, q, filter, sort, validation]);

  const unassignedCount = players.filter((p) => !findSlot(plan, p.id)).length;
  const isOver = drag?.over?.listId === 'pool';

  return (
    <aside className={`pool card ${isOver ? 'drop-active' : ''}`} aria-label="Spielerpool">
      <div className="pool-head">
        <h2>
          Spieler <span className="muted small">({unassignedCount} nicht zugeordnet / {players.length})</span>
        </h2>
        <div className="search">
          <IconSearch size={16} />
          <input className="input" type="search" placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Spieler suchen" />
        </div>
        <div className="row gap-s">
          <select className="input input-s" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
            <option value="unassigned">Nicht zugeordnet</option>
            <option value="all">Alle</option>
            <option value="problems">Mit Hinweisen/Fehlern</option>
            {plan.teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select className="input input-s" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortierung">
            <option value="qttr">nach Q-TTR</option>
            <option value="name">nach Name</option>
            <option value="team">nach Mannschaft</option>
          </select>
        </div>
      </div>
      <ul className="pool-list" data-drop-list="pool">
        {players.length === 0 && (
          <li>
            <EmptyState title="Noch keine Spieler" actions={<button className="btn btn-primary" onClick={onImport}><IconUpload /> Spieler importieren</button>}>
              Importiere eine Spielerliste (CSV) oder lege Spieler manuell an.
            </EmptyState>
          </li>
        )}
        {players.length > 0 && rows.length === 0 && <li className="muted small pad">Keine Spieler für diesen Filter.</li>}
        {rows.map(({ p, slot }) => {
          const sev = worst(validation.byPlayer[p.id]);
          return (
            <li
              key={p.id}
              className={`pool-item ${drag?.itemId === p.id ? 'is-dragged' : ''} ${highlight.has(p.id) ? 'is-highlight' : ''} ${p.rules.eligible === false ? 'is-ineligible' : ''}`}
              title={findingText(validation.byPlayer[p.id])}
            >
              <button className="drag-handle" aria-label={`${fullName(p)} ziehen`} onPointerDown={(e) => startDrag(e, p.id, `${fullName(p)} · ${p.rules.qttr ?? '–'}`)} tabIndex={-1}>
                <IconGrip size={16} />
              </button>
              <div className="pool-main">
                <button className="link-plain" onClick={() => onEdit(p)}>
                  {p.lastName}, {p.firstName}
                </button>
                <span className="muted small">
                  {slot ? `${slot.team.name} · Pos. ${slot.index + 1}` : 'nicht zugeordnet'}
                  {p.rules.nachwuchs ? ' · Nachwuchs' : ''}
                  {p.rules.eligible === false ? ' · keine Spielberechtigung' : ''}
                </span>
              </div>
              <SpvChip state={spvState(p, plan, validation)} />
              <span className="ttr num" title="Q-TTR">{p.rules.qttr ?? '–'}</span>
              {slot && sev !== 'ok' && <SeverityIcon s={sev} />}
              <Menu label={`Aktionen für ${fullName(p)}`} icon={<span aria-hidden>⋯</span>}>
                {(close) => (
                  <>
                    {plan.teams.map((t) => (
                      <button key={t.id} role="menuitem" disabled={slot?.team.id === t.id} onClick={() => { onMove(p.id, t.id); close(); }}>
                        → {t.name}
                      </button>
                    ))}
                    {slot && <button role="menuitem" onClick={() => { onMove(p.id, null); close(); }}>Aus Mannschaft entfernen</button>}
                    <button role="menuitem" onClick={() => { onEdit(p); close(); }}>Bearbeiten…</button>
                    <button role="menuitem" className="danger" onClick={() => { close(); onDelete(p); }}>Aus Spielerpool löschen</button>
                  </>
                )}
              </Menu>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
