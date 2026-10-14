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
  title: 'Turnierplaner (TTVN-Race)',
  description: 'TTVN-Race nach MKTT Cup-System: Teilnehmende aus click-TT übernehmen, Runden auslosen, Ergebnisse erfassen, Tabelle mit Buchholz und Feinbuchholz, Export für click-TT.',
  icon: <IconTrophy size={22} />,
  component: TournamentRoute,
  order: 20,
});
