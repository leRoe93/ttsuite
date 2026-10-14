import { registerFeature, type FeatureProps } from '../../app-shell/registry.ts';
import { IconTrophy } from '../../shared-ui/icons.tsx';
import { NewTournament, TournamentList } from './TournamentList.tsx';
import { TournamentPage } from './TournamentPage.tsx';

function TournamentRoute({ subpath }: FeatureProps) {
  const [id, tab] = subpath;
  if (!id) return <TournamentList />;
  if (id === 'neu') return <NewTournament />;
  return <TournamentPage id={id} tab={tab} />;
}

registerFeature({
  id: 'tournament-planner',
  path: 'turniere',
  title: 'Turnierplaner (TT-Race)',
  description: 'TT-Race im Schweizer System: Teilnehmer aus click-TT importieren, Runden auslosen, Ergebnisse erfassen, Tabelle mit Buchholz, Export für click-TT.',
  icon: <IconTrophy size={22} />,
  component: TournamentRoute,
  order: 20,
});
