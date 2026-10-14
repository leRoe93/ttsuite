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
  description: 'Mannschaftsmeldung nach Q-TTR planen, per Drag & Drop aufstellen und gegen WO-Toleranzen und Sperrvermerk-Regeln prüfen.',
  icon: <IconTeams size={22} />,
  component: TeamPlannerRoute,
  order: 10,
});
