import type { Player } from '../../domain/players/model.ts';
import type { TeamPlan } from '../../domain/team-rules/model.ts';
import type { Finding, LineupValidation, Severity } from '../../domain/team-rules/validate.ts';
import { IconAlert, IconCheck, IconError, IconInfo, IconLock } from '../../shared-ui/icons.tsx';

export function worst(findings: readonly Finding[] | undefined, ignore: Finding['code'][] = ['spv-ersatz-note']): Severity | 'ok' {
  const f = (findings ?? []).filter((x) => !ignore.includes(x.code));
  if (f.some((x) => x.severity === 'error')) return 'error';
  if (f.some((x) => x.severity === 'warning')) return 'warning';
  if (f.some((x) => x.severity === 'info')) return 'info';
  return 'ok';
}

export function SeverityIcon({ s, size = 15 }: { s: Severity | 'ok'; size?: number }) {
  if (s === 'error') return <IconError size={size} className="c-error" aria-label="Fehler" />;
  if (s === 'warning') return <IconAlert size={size} className="c-warning" aria-label="Hinweis" />;
  if (s === 'info') return <IconInfo size={size} className="c-info" aria-label="Info" />;
  return <IconCheck size={size} className="c-ok" aria-label="OK" />;
}

export type SpvState = { label: string; title: string } | undefined;

export function spvState(p: Player, plan: TeamPlan, v: LineupValidation): SpvState {
  const d = v.derivedSpv.find((x) => x.playerId === p.id);
  if (d?.kind === 'deviation') return { label: 'SPV', title: 'Sperrvermerk beantragt (Abweichung von der Spielstärke)' };
  if (d?.kind === 'propagated') return { label: 'SPV', title: 'Sperrvermerk als Folge (steht vor einem Spieler mit SPV)' };
  if (p.rules.sperrvermerk && plan.halfSeason === 'RR') return { label: `SPV M${p.rules.sperrvermerk.teamNumber}`, title: `Bestehender Sperrvermerk aus Mannschaft ${p.rules.sperrvermerk.teamNumber}` };
  if (p.rules.sperrvermerk) return { label: 'SPV?', title: 'Alter Sperrvermerk hinterlegt – gilt längstens bis Saisonende' };
  return undefined;
}

export function SpvChip({ state }: { state: SpvState }) {
  if (!state) return null;
  return (
    <span className="chip chip-spv" title={state.title}>
      <IconLock size={12} /> {state.label}
    </span>
  );
}

export function findingText(fs: readonly Finding[] | undefined): string {
  return (fs ?? []).filter((f) => f.code !== 'spv-ersatz-note').map((f) => `${f.severity === 'error' ? '✕' : f.severity === 'warning' ? '⚠' : 'ℹ'} ${f.title}: ${f.detail}`).join('\n');
}
