import type { LiveScoreData } from '../types/index.ts';
import { applyCricketAction, type CricketDetails } from './cricketScoring.ts';
import { applyFootballAction, createInitialFootballDetails, type FootballDetails } from './footballScoring.ts';
import {
  applyKabaddiAction,
  applyKabaddiEngineAction,
  normalizeKabaddiDetails,
  type KabaddiEngineActionPayload,
} from './kabaddiScoring.ts';
import { applyVolleyballAction, type VolleyballActionPayload } from './volleyballScoring.ts';

export function makeClientEventId(prefix = 'evt'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function applyOptimisticPatch(
  currentScore: LiveScoreData | null,
  patch: {
    teamAScore?: number;
    teamBScore?: number;
    sportSpecificDetails?: Record<string, unknown>;
    matchStatus?: string;
    sportType?: string;
    tossWinner?: 'A' | 'B' | '';
    tossDecision?: string;
  }
): LiveScoreData | null {
  if (!currentScore) return null;
  return {
    ...currentScore,
    teamAScore: patch.teamAScore !== undefined ? patch.teamAScore : currentScore.teamAScore,
    teamBScore: patch.teamBScore !== undefined ? patch.teamBScore : currentScore.teamBScore,
    sportSpecificDetails:
      patch.sportSpecificDetails !== undefined
        ? patch.sportSpecificDetails
        : currentScore.sportSpecificDetails,
    matchStatus: patch.matchStatus !== undefined ? patch.matchStatus : currentScore.matchStatus,
    sportType: (patch.sportType ?? currentScore.sportType) as LiveScoreData['sportType'],
    tossWinner: patch.tossWinner !== undefined ? patch.tossWinner : currentScore.tossWinner,
    tossDecision: patch.tossDecision !== undefined ? patch.tossDecision : currentScore.tossDecision,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function applyOptimisticStructuredEvent(
  currentScore: LiveScoreData | null,
  sportType: string,
  action: Record<string, unknown>
): LiveScoreData | null {
  if (!currentScore || !action || typeof action !== 'object') return currentScore;
  const nowIso = new Date().toISOString();

  try {
    if (sportType === 'Cricket') {
      const applied = applyCricketAction(
        (currentScore.sportSpecificDetails || {}) as Partial<CricketDetails>,
        action as any
      );
      const nextStatus = applied.autoCompletedMatch
        ? 'Completed'
        : applied.autoCompletedInnings1
          ? 'Innings Break'
          : currentScore.matchStatus === 'Upcoming'
            ? 'Live'
            : currentScore.matchStatus;
      return {
        ...currentScore,
        sportType: 'Cricket',
        teamAScore: applied.teamAScore,
        teamBScore: applied.teamBScore,
        matchStatus: nextStatus,
        sportSpecificDetails: applied.details as unknown as Record<string, unknown>,
        lastUpdatedAt: nowIso,
      };
    }

    if (sportType === 'Volleyball') {
      const applied = applyVolleyballAction(
        currentScore.sportSpecificDetails,
        currentScore.teamAScore,
        currentScore.teamBScore,
        action as unknown as VolleyballActionPayload
      );
      if (applied.blockedReason) return currentScore;
      return {
        ...currentScore,
        sportType: 'Volleyball',
        teamAScore: applied.teamAScore,
        teamBScore: applied.teamBScore,
        matchStatus: applied.autoCompletedMatch
          ? 'Completed'
          : currentScore.matchStatus === 'Upcoming'
            ? 'Live'
            : currentScore.matchStatus,
        sportSpecificDetails: applied.details as unknown as Record<string, unknown>,
        lastUpdatedAt: nowIso,
      };
    }

    if (sportType === 'Football') {
      const baseDetails: FootballDetails = {
        ...createInitialFootballDetails(),
        ...((currentScore.sportSpecificDetails || {}) as Partial<FootballDetails>),
      };
      const applied = applyFootballAction(
        baseDetails,
        currentScore.teamAScore,
        currentScore.teamBScore,
        action as any
      );
      return {
        ...currentScore,
        sportType: 'Football',
        teamAScore: applied.teamAScore,
        teamBScore: applied.teamBScore,
        matchStatus:
          currentScore.matchStatus === 'Upcoming' ? 'Live' : currentScore.matchStatus,
        sportSpecificDetails: applied.details as unknown as Record<string, unknown>,
        lastUpdatedAt: nowIso,
      };
    }

    if (sportType === 'Kabaddi') {
      const applied = applyKabaddiAction(
        normalizeKabaddiDetails(currentScore.sportSpecificDetails),
        currentScore.teamAScore,
        currentScore.teamBScore,
        action as any
      );
      return {
        ...currentScore,
        sportType: 'Kabaddi',
        teamAScore: applied.teamAScore,
        teamBScore: applied.teamBScore,
        matchStatus:
          currentScore.matchStatus === 'Upcoming' ? 'Live' : currentScore.matchStatus,
        sportSpecificDetails: applied.details as unknown as Record<string, unknown>,
        lastUpdatedAt: nowIso,
      };
    }
  } catch {
    return currentScore;
  }

  return currentScore;
}

export function applyOptimisticKabaddiEngineEvent(
  currentScore: LiveScoreData | null,
  action: KabaddiEngineActionPayload
): LiveScoreData | null {
  if (!currentScore) return null;
  try {
    const norm = normalizeKabaddiDetails(currentScore.sportSpecificDetails);
    const applied = applyKabaddiEngineAction(
      norm,
      currentScore.teamAScore,
      currentScore.teamBScore,
      action,
      Date.now()
    );
    return {
      ...currentScore,
      sportType: 'Kabaddi',
      teamAScore: applied.teamAScore,
      teamBScore: applied.teamBScore,
      matchStatus:
        currentScore.matchStatus === 'Upcoming' ? 'Live' : currentScore.matchStatus,
      sportSpecificDetails: applied.details as unknown as Record<string, unknown>,
      lastUpdatedAt: new Date().toISOString(),
    };
  } catch {
    return currentScore;
  }
}
