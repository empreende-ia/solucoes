export interface ProductTourStep {
  /** Stable across copy/layout changes. Never include a record ID or personal data. */
  id: string;
  target: string;
  title: string;
  description: string;
}

export interface ProductTourDefinition {
  id: string;
  version: number;
  path: string;
  title: string;
  description: string;
  steps: ProductTourStep[];
}

export interface TourScope { userId: string; orgId: string }
export type TourVisit =
  | { version: number; status: 'paused'; stepId: string }
  | { version: number; status: 'completed' | 'dismissed' };

export interface TourPreferences {
  version: 1;
  automatic: boolean;
  invitations: boolean;
  visits: Record<string, TourVisit>;
}
