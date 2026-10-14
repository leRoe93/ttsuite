import { Fragment } from 'react';
import { fullName, type Player } from '../../domain/players/model.ts';
import { movePlayer, ROLE_LABELS, setRole, type LineupRole, type Team, type TeamPlan } from '../../domain/team-rules/model.ts';
import type { LineupValidation } from '../../domain/team-rules/validate.ts';
import { Badge, Menu } from '../../shared-ui/components.tsx';
import { useDnd } from '../../shared-ui/dnd.tsx';
import { IconArrowDown, IconArrowUp, IconGrip, IconTrash } from '../../shared-ui/icons.tsx';
import { findingText, SeverityIcon, SpvChip, spvState, worst } from './status.tsx';

export function TeamPanel({
  plan,
  team,
  teamIndex,
  players,
  validation,
  highlight,
  onChange,
  onEditPlayer,
  onDeleteTeam,
}: {
  plan: TeamPlan;
  team: Team;
  teamIndex: number;
  players: readonly Player[];
  validation: LineupValidation;
  highlight: Set<string>;
  onChange: (p: TeamPlan) => void;
  onEditPlayer: (p: Player) => void;
  onDeleteTeam: () => void;
}) {
  const { drag, startDrag } = useDnd();
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamFindings = (validation.byTeam[team.id] ?? []).filter((f) => f.code !== 'empty-team');
  const errors = teamFindings.filter((f) => f.severity === 'error').length;
  const warnings = teamFindings.filter((f) => f.severity === 'warning').length;
  const stamm = team.slots.filter((s) => s.role === 'stamm').length;
  const over = drag?.over?.listId === team.id ? drag.over.index : null;
  const ratings = team.slots.map((s) => byId.get(s.playerId)?.rules.qttr).filter((x): x is number => x !== undefined);
  const avg = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : undefined;

  const updateTeam = (patch: Partial<Team>) => onChange({ ...plan, teams: plan.teams.map((t) => (t.id === team.id ? { ...t, ...patch } : t)) });
  const moveTeam = (dir: -1 | 1) => {
    const teams = [...plan.teams];
    const j = teamIndex + dir;
    if (j < 0 || j >= teams.length) return;
    [teams[teamIndex], teams[j]] = [teams[j]!, teams[teamIndex]!];
    onChange({ ...plan, teams });
  };

  return (
    <section className={`team card ${over !== null ? 'drop-active' : ''} team-${errors ? 'error' : warnings ? 'warning' : 'ok'}`} aria-label={team.name}>
      <header className="team-head">
        <span className="team-no" title="Mannschaftsnummer">{teamIndex + 1}</span>
        <input className="team-name input-plain" value={team.name} onChange={(e) => updateTeam({ name: e.target.value })} aria-label="Mannschaftsname" />
        {errors > 0 ? <Badge tone="error">{errors} Fehler</Badge> : warnings > 0 ? <Badge tone="warning">{warnings} Hinweis{warnings > 1 ? 'e' : ''}</Badge> : team.slots.length ? <Badge tone="ok">gültig</Badge> : null}
        <Menu label={`Einstellungen ${team.name}`} icon={<span aria-hidden>⋯</span>}>
          {(close) => (
            <>
              <label className="menu-field">
                Liga
                <input className="input input-s" value={team.league ?? ''} onChange={(e) => updateTeam({ league: e.target.value || undefined })} placeholder="z. B. Bezirksliga" />
              </label>
              <label className="menu-field">
                Sollstärke
                <select className="input input-s" value={team.sollstaerke} onChange={(e) => updateTeam({ sollstaerke: Number(e.target.value) })}>
                  {[2, 3, 4, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button role="menuitem" disabled={teamIndex === 0} onClick={() => { moveTeam(-1); close(); }}>Mannschaft nach oben</button>
              <button role="menuitem" disabled={teamIndex === plan.teams.length - 1} onClick={() => { moveTeam(1); close(); }}>Mannschaft nach unten</button>
              <button role="menuitem" className="danger" onClick={() => { close(); onDeleteTeam(); }}><IconTrash size={14} /> Mannschaft löschen</button>
            </>
          )}
        </Menu>
      </header>
      <p className="team-meta muted small">
        {team.league ? `${team.league} · ` : ''}
        {stamm}/{team.sollstaerke} Stammspieler{team.slots.length > stamm ? ` · ${team.slots.length - stamm} RES/Ergänzung` : ''}
        {avg ? ` · Ø Q-TTR ${avg}` : ''}
      </p>
      <ol className="slots" data-drop-list={team.id}>
        {team.slots.map((slot, i) => {
          const p = byId.get(slot.playerId);
          const fs = validation.byPlayer[slot.playerId]?.filter((f) => !f.teamId || f.teamId === team.id);
          const sev = worst(fs);
          const spvReq = plan.spvRequested.includes(slot.playerId);
          return (
            <Fragment key={slot.playerId}>
              {over === i && <li className="drop-line" aria-hidden />}
              <li
                data-drop-item
                className={`slot sev-${sev} ${drag?.itemId === slot.playerId ? 'is-dragged' : ''} ${highlight.has(slot.playerId) ? 'is-highlight' : ''}`}
                title={findingText(fs)}
              >
                <button className="drag-handle" aria-label={`${p ? fullName(p) : 'Spieler'} ziehen`} onPointerDown={(e) => p && startDrag(e, p.id, `${fullName(p)} · ${p.rules.qttr ?? '–'}`)} tabIndex={-1}>
                  <IconGrip size={16} />
                </button>
                <span className="pos num">{teamIndex + 1}.{i + 1}</span>
                <div className="slot-main">
                  {p ? (
                    <button className="link-plain" onClick={() => onEditPlayer(p)}>
                      {p.lastName}, {p.firstName}
                    </button>
                  ) : (
                    <span className="c-error">Unbekannter Spieler</span>
                  )}
                  <span className="row gap-xs wrap">
                    {slot.role !== 'stamm' && <span className="chip" title={ROLE_LABELS[slot.role]}>{slot.role}</span>}
                    {p && <SpvChip state={spvState(p, plan, validation)} />}
                    {p?.rules.nachwuchs && <span className="chip" title="Nachwuchsspieler (erhöhte Toleranz)">NW</span>}
                  </span>
                </div>
                <span className="ttr num">{p?.rules.qttr ?? '–'}</span>
                <SeverityIcon s={sev} />
                <div className="slot-actions">
                  <button className="btn-icon sm" aria-label="Nach oben" title="Nach oben" disabled={i === 0} onClick={() => onChange(movePlayer(plan, slot.playerId, team.id, i - 1))}>
                    <IconArrowUp size={14} />
                  </button>
                  <button className="btn-icon sm" aria-label="Nach unten" title="Nach unten" disabled={i === team.slots.length - 1} onClick={() => onChange(movePlayer(plan, slot.playerId, team.id, i + 2))}>
                    <IconArrowDown size={14} />
                  </button>
                  <Menu label="Weitere Aktionen" icon={<span aria-hidden>⋯</span>}>
                    {(close) => (
                      <>
                        <label className="menu-field">
                          Status
                          <select className="input input-s" value={slot.role} onChange={(e) => { onChange(setRole(plan, slot.playerId, e.target.value as LineupRole)); close(); }}>
                            {(Object.keys(ROLE_LABELS) as LineupRole[]).map((r) => (
                              <option key={r} value={r} disabled={r === 'RES' && plan.ageClass === 'nachwuchs'}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        </label>
                        {plan.halfSeason === 'VR' && (
                          <label className="menu-check">
                            <input
                              type="checkbox"
                              checked={spvReq}
                              onChange={(e) => {
                                onChange({ ...plan, spvRequested: e.target.checked ? [...plan.spvRequested, slot.playerId] : plan.spvRequested.filter((x) => x !== slot.playerId) });
                                close();
                              }}
                            />
                            Abweichung mit Sperrvermerk beantragen (WO H 2.4)
                          </label>
                        )}
                        {plan.teams.filter((t) => t.id !== team.id).map((t) => (
                          <button key={t.id} role="menuitem" onClick={() => { onChange(movePlayer(plan, slot.playerId, t.id, t.slots.length)); close(); }}>
                            → {t.name}
                          </button>
                        ))}
                        {p && <button role="menuitem" onClick={() => { onEditPlayer(p); close(); }}>Spieler bearbeiten…</button>}
                        <button role="menuitem" onClick={() => { onChange(movePlayer(plan, slot.playerId, null, 0)); close(); }}>Aus Mannschaft entfernen</button>
                      </>
                    )}
                  </Menu>
                </div>
              </li>
            </Fragment>
          );
        })}
        {over === team.slots.length && <li className="drop-line" aria-hidden />}
        {team.slots.length === 0 && <li className="slot-empty">Spieler hierher ziehen oder über „⋯ → {team.name}“ zuordnen</li>}
      </ol>
      {teamFindings.filter((f) => f.severity !== 'info').length > 0 && (
        <ul className="team-findings">
          {teamFindings
            .filter((f) => f.severity !== 'info')
            .slice(0, 4)
            .map((f) => (
              <li key={f.id} className={`finding sev-${f.severity}`}>
                <SeverityIcon s={f.severity} size={14} />
                <span>
                  <strong>{f.title}</strong> – {f.detail}
                  {f.ruleRef && <span className="muted"> ({f.ruleRef})</span>}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
