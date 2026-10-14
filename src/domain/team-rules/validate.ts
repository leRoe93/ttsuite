import type { Player } from '../players/model.ts';
import { fullName } from '../players/model.ts';
import { isErgaenzung, type LineupRole, type TeamPlan } from './model.ts';
import { toleranceFor, type LineupRuleSet } from './ruleSets.ts';

/**
 * Lineup validation engine (Mannschaftsmeldung). Pure function: plan + players + rule set → findings.
 * Severity semantics:
 *  - error:   the registration would not be accepted as is (blocking)
 *  - warning: needs human review / a decision by the Spielleiter
 *  - info:    consequence worth knowing (e.g. derived Sperrvermerk)
 */

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  code: FindingCode;
  title: string;
  detail: string;
  ruleRef?: string;
  teamId?: string;
  playerIds: string[];
}

export type FindingCode =
  | 'unknown-player'
  | 'duplicate-assignment'
  | 'not-eligible'
  | 'missing-qttr'
  | 'order-within-team'
  | 'order-across-teams'
  | 'spv-required'
  | 'spv-planned'
  | 'spv-propagated'
  | 'spv-not-allowed-rr'
  | 'spv-ergaenzung'
  | 'spv-existing-higher-team'
  | 'spv-existing-covers'
  | 'spv-existing-vr'
  | 'spv-ersatz-note'
  | 'reserve-youth'
  | 'sollstaerke'
  | 'empty-team';

export interface DerivedSpv {
  playerId: string;
  /** 'deviation' = the player himself is placed below his strength; 'propagated' = ranked above such a player in the same team. */
  kind: 'deviation' | 'propagated';
  causedBy: string[];
}

export interface LineupValidation {
  findings: Finding[];
  byTeam: Record<string, Finding[]>;
  byPlayer: Record<string, Finding[]>;
  derivedSpv: DerivedSpv[];
  errorCount: number;
  warningCount: number;
}

interface Entry {
  player: Player;
  role: LineupRole;
  teamId: string;
  teamNumber: number;
  teamName: string;
  posInTeam: number;
}

/** SPV shown in click-TT for exactly the registration being planned (same season and half-season). */
const isCurrentSpv = (spv: NonNullable<Player['rules']['sperrvermerk']>, plan: TeamPlan) => spv.season === plan.season && spv.half === plan.halfSeason;

/** Q-TTR usable for strength-order checks (not missing, not marked with *). */
const comparable = (p: Player): number | undefined => (p.rules.qttrProvisional ? undefined : p.rules.qttr);

export function validateLineup(plan: TeamPlan, players: readonly Player[], rs: LineupRuleSet): LineupValidation {
  const byId = new Map(players.map((p) => [p.id, p]));
  const findings: Finding[] = [];
  let seq = 0;
  const add = (f: Omit<Finding, 'id'>) => findings.push({ ...f, id: `${f.code}-${++seq}` });
  const name = (p: Player) => fullName(p);

  // Flatten registration order (team 1 first, then positions).
  const entries: Entry[] = [];
  const seen = new Map<string, string>();
  plan.teams.forEach((team, ti) => {
    team.slots.forEach((slot, si) => {
      const player = byId.get(slot.playerId);
      if (!player) {
        add({ severity: 'error', code: 'unknown-player', title: 'Unbekannter Spieler', detail: `Eintrag ${si + 1} in ${team.name} verweist auf einen gelöschten Spieler.`, teamId: team.id, playerIds: [slot.playerId] });
        return;
      }
      if (seen.has(player.id)) {
        add({ severity: 'error', code: 'duplicate-assignment', title: 'Doppelt gemeldet', detail: `${name(player)} ist in mehreren Mannschaften derselben Meldung eingetragen.`, teamId: team.id, playerIds: [player.id] });
        return;
      }
      seen.set(player.id, team.id);
      entries.push({ player, role: slot.role, teamId: team.id, teamNumber: ti + 1, teamName: team.name, posInTeam: si + 1 });
    });
  });

  const fmtPos = (e: Entry) => `${e.teamName} Pos. ${e.posInTeam}`;
  const deviations = new Map<string, Entry[]>(); // playerId (placed too low) -> stronger-relation players above

  for (const e of entries) {
    const p = e.player;
    if (p.rules.eligible === false) {
      add({ severity: 'error', code: 'not-eligible', title: 'Keine Spielberechtigung', detail: `${name(p)} ist als nicht spielberechtigt markiert${p.rules.eligibilityNote ? ` (${p.rules.eligibilityNote})` : ''}.`, teamId: e.teamId, playerIds: [p.id] });
    }
    if (p.rules.qttr === undefined) {
      add({ severity: 'warning', code: 'missing-qttr', title: 'Kein Q-TTR-Wert', detail: `Für ${name(p)} liegt kein Q-TTR-Wert vor. Spieler ohne vergleichbaren Wert ordnet der Spielleiter ein; die Einordnung des Vereins gilt nur als Vorschlag. Die Reihenfolge-Prüfung entfällt für ihn.`, ruleRef: 'WO H 2.2', teamId: e.teamId, playerIds: [p.id] });
    } else if (p.rules.qttrProvisional) {
      add({ severity: 'warning', code: 'missing-qttr', title: 'Q-TTR mit *', detail: `Der Q-TTR-Wert von ${name(p)} (${p.rules.qttr}*) beruht auf weniger als 10 Einzeln und ist nicht vergleichbar. Der Spielleiter ordnet ein; die Einordnung des Vereins gilt nur als Vorschlag. Die Reihenfolge-Prüfung entfällt für ihn.`, ruleRef: 'WO H 2.2', teamId: e.teamId, playerIds: [p.id] });
    }
    if (e.role === 'RES' && plan.ageClass === 'nachwuchs') {
      add({ severity: 'error', code: 'reserve-youth', title: 'RES nur bei Erwachsenen', detail: `${name(p)} ist als Reservespieler markiert – Reservespieler gibt es nur in Meldungen der Altersklasse Erwachsene.`, ruleRef: 'WO A 5.3', teamId: e.teamId, playerIds: [p.id] });
    }
  }

  // Strength order checks: every later entry j against every earlier entry i.
  for (let j = 0; j < entries.length; j++) {
    const ej = entries[j]!;
    const qj = comparable(ej.player);
    if (qj === undefined) continue;
    const tol = toleranceFor(rs, plan.ageClass, ej.player.rules);
    let worstWithin: { e: Entry; diff: number } | undefined;
    const across: Entry[] = [];
    let worstAcross = 0;
    for (let i = 0; i < j; i++) {
      const ei = entries[i]!;
      const qi = comparable(ei.player);
      if (qi === undefined) continue;
      const diff = qj - qi;
      if (ei.teamId === ej.teamId) {
        if (diff > tol.withinTeam && (!worstWithin || diff > worstWithin.diff)) worstWithin = { e: ei, diff };
      } else if (diff > tol.acrossTeams) {
        across.push(ei);
        worstAcross = Math.max(worstAcross, diff);
      }
    }
    if (worstWithin) {
      add({
        severity: 'error',
        code: 'order-within-team',
        title: 'Reihenfolge innerhalb der Mannschaft',
        detail: `${name(ej.player)} (${qj}) steht hinter ${name(worstWithin.e.player)} (${worstWithin.e.player.rules.qttr}) – Differenz ${worstWithin.diff} Punkte, erlaubt sind innerhalb einer Mannschaft max. ${tol.withinTeam}. Bitte innerhalb von ${ej.teamName} umstellen.`,
        ruleRef: 'WO H 2.3',
        teamId: ej.teamId,
        playerIds: [ej.player.id, worstWithin.e.player.id],
      });
    }
    if (across.length > 0) deviations.set(ej.player.id, across);
    void worstAcross;
  }

  // Classify cross-team deviations: existing SPV, new SPV request, or error.
  const derived = new Map<string, DerivedSpv>();
  for (const [pid, above] of deviations) {
    const ej = entries.find((e) => e.player.id === pid)!;
    const p = ej.player;
    const strongest = above.reduce((a, b) => ((a.player.rules.qttr ?? 0) < (b.player.rules.qttr ?? 0) ? a : b));
    const diff = (p.rules.qttr ?? 0) - (strongest.player.rules.qttr ?? 0);
    const tol = toleranceFor(rs, plan.ageClass, p.rules);
    const ids = [p.id, ...above.map((a) => a.player.id)];
    const base = `${name(p)} (${p.rules.qttr}, ${fmtPos(ej)}) ist ${diff} Punkte stärker als ${name(strongest.player)} (${strongest.player.rules.qttr}, ${fmtPos(strongest)}); erlaubt sind über die Mannschaften hinweg ${tol.acrossTeams}.`;

    const triggeringErg = isErgaenzung(ej.role);
    if (triggeringErg) {
      add({ severity: 'error', code: 'spv-ergaenzung', title: 'Ergänzungsspieler außerhalb der Reihenfolge', detail: `${base} Ergänzungsspieler (${ej.role}) müssen nach Spielstärke gemeldet werden und dürfen keinen Sperrvermerk erhalten oder auslösen.`, ruleRef: 'WO H 1.4 / HTTV-Infoblatt', teamId: ej.teamId, playerIds: ids });
      continue;
    }
    const existing = p.rules.sperrvermerk;
    if (existing && (plan.halfSeason === 'RR' || isCurrentSpv(existing, plan))) {
      add({ severity: 'info', code: 'spv-existing-covers', title: 'Durch bestehenden Sperrvermerk gedeckt', detail: `${base} Die Abweichung ist durch den bestehenden Sperrvermerk (aus Mannschaft ${existing.teamNumber}) gedeckt.`, ruleRef: 'WO H 2.4', teamId: ej.teamId, playerIds: [p.id] });
      continue;
    }
    if (!rs.newSpvAllowedIn.includes(plan.halfSeason)) {
      add({ severity: 'error', code: 'spv-not-allowed-rr', title: 'Abweichung von der Spielstärke', detail: `${base} Ein neuer Sperrvermerk ist nur zu Beginn der Vorrunde möglich. Bitte die Aufstellung nach Q-TTR korrigieren.`, ruleRef: 'WO H 2.4', teamId: ej.teamId, playerIds: ids });
      continue;
    }
    if (!plan.spvRequested.includes(p.id)) {
      add({ severity: 'error', code: 'spv-required', title: 'Abweichung > Toleranz', detail: `${base} Entweder umstellen oder die Abweichung mit Sperrvermerk beantragen (Option beim Spieler).`, ruleRef: 'WO H 2.3/2.4', teamId: ej.teamId, playerIds: ids });
      continue;
    }
    derived.set(p.id, { playerId: p.id, kind: 'deviation', causedBy: above.map((a) => a.player.id) });
  }

  // Propagation: all players ranked above an SPV player in the same team also receive an SPV.
  for (const d of [...derived.values()]) {
    const ej = entries.find((e) => e.player.id === d.playerId)!;
    add({ severity: 'warning', code: 'spv-planned', title: 'Sperrvermerk beantragt', detail: `${name(ej.player)} wird unterhalb der Spielstärke in ${ej.teamName} gemeldet und erhält einen Sperrvermerk (Genehmigung durch den Spielleiter, gültig längstens bis Saisonende).${plan.halfSeason === 'RR' ? ' In der Rückrunde nur zulässig, damit der Spieler in seiner bisherigen Mannschaft bleibt (statt aufzurücken) oder zur Wiederherstellung der Sollstärke.' : ''}`, ruleRef: 'WO H 2.4', teamId: ej.teamId, playerIds: [ej.player.id] });
    for (const above of entries.filter((e) => e.teamId === ej.teamId && e.posInTeam < ej.posInTeam)) {
      if (isErgaenzung(above.role)) {
        add({ severity: 'error', code: 'spv-ergaenzung', title: 'Ergänzungsspieler würde Sperrvermerk erhalten', detail: `${name(above.player)} (${above.role}) steht in ${ej.teamName} vor ${name(ej.player)} und würde dadurch einen Sperrvermerk erhalten – für Ergänzungsspieler unzulässig.`, ruleRef: 'WO H 1.4', teamId: ej.teamId, playerIds: [above.player.id, ej.player.id] });
        continue;
      }
      const prev = derived.get(above.player.id);
      if (prev) {
        if (prev.kind === 'propagated') prev.causedBy.push(ej.player.id);
        continue;
      }
      derived.set(above.player.id, { playerId: above.player.id, kind: 'propagated', causedBy: [ej.player.id] });
    }
  }
  for (const d of derived.values()) {
    if (d.kind !== 'propagated') continue;
    const e = entries.find((x) => x.player.id === d.playerId)!;
    const causes = d.causedBy.map((id) => name(byId.get(id)!)).join(', ');
    add({ severity: 'info', code: 'spv-propagated', title: 'Sperrvermerk (Folge)', detail: `${name(e.player)} steht in ${e.teamName} vor ${causes} und erhält deshalb ebenfalls einen Sperrvermerk.`, ruleRef: 'WO H 2.4 / Infoblätter', teamId: e.teamId, playerIds: [e.player.id] });
  }

  // Existing SPVs: consequences.
  for (const e of entries) {
    const spv = e.player.rules.sperrvermerk;
    if (!spv) continue;
    if (isCurrentSpv(spv, plan)) continue; // granted in exactly this registration (read from click-TT)
    if (plan.halfSeason === 'VR') {
      add({ severity: 'warning', code: 'spv-existing-vr', title: 'Alter Sperrvermerk', detail: `Für ${name(e.player)} ist ein Sperrvermerk hinterlegt. Sperrvermerke gelten längstens bis zum Ende der Spielzeit – bitte prüfen, ob er noch gilt.`, ruleRef: 'WO H 2.4', teamId: e.teamId, playerIds: [e.player.id] });
      continue;
    }
    if (e.teamNumber < spv.teamNumber) {
      add({ severity: 'error', code: 'spv-existing-higher-team', title: 'Sperrvermerk: höhere Mannschaft', detail: `${name(e.player)} hat einen Sperrvermerk aus Mannschaft ${spv.teamNumber} und darf in der Rückrunde nicht in einer höheren Mannschaft (${e.teamName}) gemeldet werden – auch nicht, wenn der Sperrvermerk auf Antrag entfällt.`, ruleRef: 'WO H 2.4', teamId: e.teamId, playerIds: [e.player.id] });
    }
  }
  const allSpv = new Set([...derived.keys(), ...entries.filter((e) => e.player.rules.sperrvermerk && (plan.halfSeason === 'RR' || isCurrentSpv(e.player.rules.sperrvermerk, plan))).map((e) => e.player.id)]);
  if (allSpv.size > 0) {
    add({ severity: 'info', code: 'spv-ersatz-note', title: 'Folge des Sperrvermerks', detail: `Spieler mit Sperrvermerk (${[...allSpv].map((id) => name(byId.get(id)!)).join(', ')}) dürfen nicht als Ersatzspieler in höheren Mannschaften eingesetzt werden.`, ruleRef: 'WO I 4.3', playerIds: [...allSpv] });
  }

  // Team composition.
  plan.teams.forEach((team) => {
    const stamm = team.slots.filter((s) => s.role === 'stamm').length;
    if (team.slots.length === 0) {
      add({ severity: 'info', code: 'empty-team', title: 'Leere Mannschaft', detail: `${team.name} hat noch keine Spieler.`, teamId: team.id, playerIds: [] });
      return;
    }
    if (rs.sollstaerkeCheck !== 'off' && stamm < team.sollstaerke) {
      add({ severity: rs.sollstaerkeCheck, code: 'sollstaerke', title: 'Weniger Stammspieler als Sollstärke', detail: `${team.name}: ${stamm} Stammspieler, Sollstärke ${team.sollstaerke}. Reserve- und Ergänzungsspieler zählen nicht zur Sollstärke (WO A 5.3). Mindestanforderung bitte in der WO/Ausschreibung des Verbands prüfen.`, ruleRef: 'WO A 5.3', teamId: team.id, playerIds: [] });
    }
  });

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const byTeam: Record<string, Finding[]> = {};
  const byPlayer: Record<string, Finding[]> = {};
  for (const f of findings) {
    if (f.teamId) (byTeam[f.teamId] ??= []).push(f);
    for (const pid of f.playerIds) (byPlayer[pid] ??= []).push(f);
  }
  return {
    findings,
    byTeam,
    byPlayer,
    derivedSpv: [...derived.values()],
    errorCount: findings.filter((f) => f.severity === 'error').length,
    warningCount: findings.filter((f) => f.severity === 'warning').length,
  };
}
