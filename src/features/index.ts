// Every tool registers itself on import. To add a tool: create src/features/<tool>/index.tsx
// that calls registerFeature(...), then add one import line here.
import './team-planner/index.tsx';
import './tournament-planner/index.tsx';
import './data-manager/index.tsx';
