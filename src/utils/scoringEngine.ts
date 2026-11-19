import { createInitialCricketDetails } from './cricketScoring.ts';
import { createInitialKabaddiDetails } from './kabaddiScoring.ts';
import { createInitialFootballDetails } from './footballScoring.ts';
import { createInitialVolleyballDetails } from './volleyballScoring.ts';

export type SportType = 'Cricket' | 'Kabaddi' | 'Football' | 'Volleyball' | 'Other';

export function getInitialSportDetails(
  sportType: SportType,
  options?: { oversLimit?: number; playersPerSide?: number }
): Record<string, unknown> {
  switch (sportType) {
    case 'Cricket':
      return createInitialCricketDetails(
        options?.oversLimit,
        options?.playersPerSide
      ) as unknown as Record<string, unknown>;
    case 'Kabaddi':
      return createInitialKabaddiDetails() as unknown as Record<string, unknown>;
    case 'Football':
      return createInitialFootballDetails() as unknown as Record<string, unknown>;
    case 'Volleyball':
      return createInitialVolleyballDetails() as unknown as Record<string, unknown>;
    default:
      return { periodLabel: '', notes: '' };
  }
}
