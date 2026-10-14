import type { ComponentType, ReactNode } from 'react';

/**
 * Feature registry: every tool registers itself here (see src/features/<tool>/index.ts).
 * The shell renders navigation and routes from this list only, so a new tool is added by
 * creating its folder and one import line in src/features/index.ts – nothing else changes.
 */

export interface FeatureProps {
  /** Route segments after the feature's own path segment. */
  subpath: string[];
}

export interface FeatureDefinition {
  id: string;
  /** URL segment, e.g. "mannschaften" → #/mannschaften */
  path: string;
  title: string;
  /** One sentence for the start page. */
  description: string;
  icon: ReactNode;
  component: ComponentType<FeatureProps>;
  order: number;
  /** Utility pages (e.g. data management) are shown in the nav but not as a start tile. */
  kind?: 'tool' | 'utility';
}

const features: FeatureDefinition[] = [];

export function registerFeature(f: FeatureDefinition): void {
  if (features.some((x) => x.id === f.id || x.path === f.path)) throw new Error(`Feature ${f.id} doppelt registriert`);
  features.push(f);
  features.sort((a, b) => a.order - b.order);
}

export function listFeatures(): readonly FeatureDefinition[] {
  return features;
}

export function featureByPath(path: string | undefined): FeatureDefinition | undefined {
  return features.find((f) => f.path === path);
}
