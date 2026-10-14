import { registerFeature, type FeatureProps } from '../../app-shell/registry.ts';
import { IconTeams } from '../../shared-ui/icons.tsx';
import { NewPlanPage, TeamPlannerPage } from './TeamPlannerPage.tsx';

function TeamPlannerRoute({ subpath }: FeatureProps) {
  if (subpath[0] === 'neu') return <NewPlanPage />;
  return <TeamPlannerPage subpath={subpath} />;
}

registerFeature({
  id: 'team-planner',
  path: 'mannschaften',
  title: 'Mannschaftsplaner',
  description: 'Meldung aus click-TT übernehmen, per Drag & Drop umstellen und nach den TTVN-Regeln prüfen: Q-TTR-Reihenfolge, Toleranzen, Sperrvermerk.',
  icon: <IconTeams size={22} />,
  component: TeamPlannerRoute,
  order: 10,
});
