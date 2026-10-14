import { useCallback } from 'react';
import type { Tournament } from '../../domain/tournament/model.ts';
import { useAppData } from '../../storage/AppDataProvider.tsx';

export function useTournament(id: string | undefined) {
  const { data, update } = useAppData();
  const t = data.tournaments.find((x) => x.id === id);
  const save = useCallback((next: Tournament) => update((d) => ({ ...d, tournaments: d.tournaments.map((x) => (x.id === next.id ? next : x)) })), [update]);
  return { t, save };
}

export const nameOf = (t: Tournament) => {
  const m = new Map(t.participants.map((p) => [p.id, p]));
  return (id: string | undefined) => {
    const p = id ? m.get(id) : undefined;
    return p ? `${p.player.firstName} ${p.player.lastName}`.trim() : '–';
  };
};
