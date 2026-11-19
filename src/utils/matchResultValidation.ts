import type { SportOption } from '../constants/sports.ts';

export type MatchResultStatus =
  | 'NOT_DECLARED'
  | 'DECLARED'
  | 'DRAW'
  | 'TIE'
  | 'NO_RESULT'
  | 'ABANDONED';

export type MatchResultType =
  | 'TEAM_A_WON'
  | 'TEAM_B_WON'
  | 'DRAW'
  | 'TIE'
  | 'NO_RESULT'
  | 'ABANDONED'
  | '';

export interface ResultValidationInput {
  sportType: SportOption;
  resultType: MatchResultType;
  teamAName: string;
  teamBName: string;
  teamAScore: number;
  teamBScore: number;
  sportSpecificDetails?: Record<string, any>;
}

export interface ResultValidationOutput {
  valid: boolean;
  error?: string;
  normalizedStatus: MatchResultStatus;
  winnerSide: 'A' | 'B' | null;
  winnerName: string;
}

export function deriveShortTeamName(name: string, fallback = 'TM'): string {
  const clean = (name || '').trim();
  if (!clean) return fallback;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');
  }
  return clean.slice(0, 3).toUpperCase();
}

export function validateMatchResult(input: ResultValidationInput): ResultValidationOutput {
  const {
    sportType,
    resultType,
    teamAName,
    teamBName,
    teamAScore,
    teamBScore,
    sportSpecificDetails = {},
  } = input;

  const labelA = teamAName?.trim() || 'Team A';
  const labelB = teamBName?.trim() || 'Team B';

  if (!resultType) {
    return {
      valid: false,
      error: 'Please explicitly select a match result before confirming.',
      normalizedStatus: 'NOT_DECLARED',
      winnerSide: null,
      winnerName: '',
    };
  }

  if (resultType === 'NO_RESULT') {
    return {
      valid: true,
      normalizedStatus: 'NO_RESULT',
      winnerSide: null,
      winnerName: '',
    };
  }

  if (resultType === 'ABANDONED') {
    return {
      valid: true,
      normalizedStatus: 'ABANDONED',
      winnerSide: null,
      winnerName: '',
    };
  }

  if (sportType === 'Cricket') {
    const isSuperOver = Boolean(sportSpecificDetails.isSuperOver);
    const soA = Number(sportSpecificDetails.superOverTeamARuns) || 0;
    const soB = Number(sportSpecificDetails.superOverTeamBRuns) || 0;

    if (resultType === 'DRAW') {
      return {
        valid: false,
        error: 'Cricket limited-overs matches use Tie or Super Over rather than Draw.',
        normalizedStatus: 'NOT_DECLARED',
        winnerSide: null,
        winnerName: '',
      };
    }

    if (resultType === 'TIE') {
      if (teamAScore !== teamBScore) {
        return {
          valid: false,
          error: `Cannot declare a Tie while scores differ (${teamAScore} vs ${teamBScore}).`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      if (isSuperOver && soA !== soB) {
        return {
          valid: false,
          error: `Super Over scores differ (${soA} vs ${soB}). Declare the Super Over winner instead.`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'TIE', winnerSide: null, winnerName: '' };
    }

    if (resultType === 'TEAM_A_WON') {
      const wonMain = teamAScore > teamBScore;
      const wonSuperOver = isSuperOver && teamAScore === teamBScore && soA > soB;
      if (!wonMain && !wonSuperOver) {
        return {
          valid: false,
          error: `${labelA} (${teamAScore}) does not lead ${labelB} (${teamBScore}), and no winning Super Over score is recorded.`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'A', winnerName: labelA };
    }

    if (resultType === 'TEAM_B_WON') {
      const wonMain = teamBScore > teamAScore;
      const wonSuperOver = isSuperOver && teamAScore === teamBScore && soB > soA;
      if (!wonMain && !wonSuperOver) {
        return {
          valid: false,
          error: `${labelB} (${teamBScore}) does not lead ${labelA} (${teamAScore}), and no winning Super Over score is recorded.`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'B', winnerName: labelB };
    }
  }

  if (sportType === 'Kabaddi') {
    const isTieBreaker = Boolean(sportSpecificDetails.isTieBreaker);
    const tbA = Number(sportSpecificDetails.tieBreakerScoreA) || 0;
    const tbB = Number(sportSpecificDetails.tieBreakerScoreB) || 0;

    if (resultType === 'DRAW') {
      return {
        valid: false,
        error: 'Kabaddi matches use Tie (or Tie-Breaker winner) instead of Draw.',
        normalizedStatus: 'NOT_DECLARED',
        winnerSide: null,
        winnerName: '',
      };
    }

    if (resultType === 'TIE') {
      if (teamAScore !== teamBScore) {
        return {
          valid: false,
          error: `Cannot declare a Tie when scores differ (${teamAScore} vs ${teamBScore}).`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      if (isTieBreaker && tbA !== tbB) {
        return {
          valid: false,
          error: `Tie-Breaker score is ${tbA}-${tbB}. Declare the Tie-Breaker winner instead.`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'TIE', winnerSide: null, winnerName: '' };
    }

    if (resultType === 'TEAM_A_WON') {
      const wonMain = teamAScore > teamBScore;
      const wonTb = isTieBreaker && teamAScore === teamBScore && tbA > tbB;
      if (!wonMain && !wonTb) {
        return {
          valid: false,
          error: `${labelA} (${teamAScore}) does not lead ${labelB} (${teamBScore}) and has not won a recorded Tie-Breaker.`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'A', winnerName: labelA };
    }

    if (resultType === 'TEAM_B_WON') {
      const wonMain = teamBScore > teamAScore;
      const wonTb = isTieBreaker && teamAScore === teamBScore && tbB > tbA;
      if (!wonMain && !wonTb) {
        return {
          valid: false,
          error: `${labelB} (${teamBScore}) does not lead ${labelA} (${teamAScore}) and has not won a recorded Tie-Breaker.`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'B', winnerName: labelB };
    }
  }

  if (sportType === 'Volleyball') {
    const setsA = Number(sportSpecificDetails.teamASetsWon) || 0;
    const setsB = Number(sportSpecificDetails.teamBSetsWon) || 0;

    if (resultType === 'DRAW' || resultType === 'TIE') {
      return {
        valid: false,
        error: 'Volleyball matches must conclude with a set-based winner, No Result, or Abandoned.',
        normalizedStatus: 'NOT_DECLARED',
        winnerSide: null,
        winnerName: '',
      };
    }

    if (resultType === 'TEAM_A_WON') {
      if (setsA <= setsB || setsA === 0) {
        return {
          valid: false,
          error: `${labelA} must have more completed sets won than ${labelB} (currently ${setsA}-${setsB}). Complete the final set first.`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'A', winnerName: labelA };
    }

    if (resultType === 'TEAM_B_WON') {
      if (setsB <= setsA || setsB === 0) {
        return {
          valid: false,
          error: `${labelB} must have more completed sets won than ${labelA} (currently ${setsA}-${setsB}). Complete the final set first.`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'B', winnerName: labelB };
    }
  }

  if (sportType === 'Football') {
    const pensA = Number(sportSpecificDetails.teamAPenalties) || 0;
    const pensB = Number(sportSpecificDetails.teamBPenalties) || 0;
    const hasShootoutWinner = teamAScore === teamBScore && pensA !== pensB;

    if (resultType === 'TIE') {
      return {
        valid: false,
        error: 'Football uses Draw (when goals & penalties are level) rather than Tie.',
        normalizedStatus: 'NOT_DECLARED',
        winnerSide: null,
        winnerName: '',
      };
    }

    if (resultType === 'DRAW') {
      if (teamAScore !== teamBScore) {
        return {
          valid: false,
          error: `Cannot declare a Draw while goals differ (${teamAScore}-${teamBScore}).`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      if (hasShootoutWinner) {
        return {
          valid: false,
          error: `Penalty shootout finished ${pensA}-${pensB}. Declare the shootout winner instead.`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'DRAW', winnerSide: null, winnerName: '' };
    }

    if (resultType === 'TEAM_A_WON') {
      const wonGoals = teamAScore > teamBScore;
      const wonPens = teamAScore === teamBScore && pensA > pensB;
      if (!wonGoals && !wonPens) {
        return {
          valid: false,
          error: `${labelA} (${teamAScore}) does not lead ${labelB} (${teamBScore}) in goals or penalty shootout (${pensA}-${pensB}).`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'A', winnerName: labelA };
    }

    if (resultType === 'TEAM_B_WON') {
      const wonGoals = teamBScore > teamAScore;
      const wonPens = teamAScore === teamBScore && pensB > pensA;
      if (!wonGoals && !wonPens) {
        return {
          valid: false,
          error: `${labelB} (${teamBScore}) does not lead ${labelA} (${teamAScore}) in goals or penalty shootout (${pensA}-${pensB}).`,
          normalizedStatus: 'NOT_DECLARED',
          winnerSide: null,
          winnerName: '',
        };
      }
      return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'B', winnerName: labelB };
    }
  }

  // Generic / Other sport
  if (resultType === 'DRAW' || resultType === 'TIE') {
    if (teamAScore !== teamBScore) {
      return {
        valid: false,
        error: `Scores are not equal (${teamAScore} vs ${teamBScore}).`,
        normalizedStatus: 'NOT_DECLARED',
        winnerSide: null,
        winnerName: '',
      };
    }
    return {
      valid: true,
      normalizedStatus: resultType === 'DRAW' ? 'DRAW' : 'TIE',
      winnerSide: null,
      winnerName: '',
    };
  }

  if (resultType === 'TEAM_A_WON') {
    if (teamAScore < teamBScore) {
      return {
        valid: false,
        error: `${labelA} (${teamAScore}) has a lower score than ${labelB} (${teamBScore}).`,
        normalizedStatus: 'NOT_DECLARED',
        winnerSide: null,
        winnerName: '',
      };
    }
    return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'A', winnerName: labelA };
  }

  if (resultType === 'TEAM_B_WON') {
    if (teamBScore < teamAScore) {
      return {
        valid: false,
        error: `${labelB} (${teamBScore}) has a lower score than ${labelA} (${teamAScore}).`,
        normalizedStatus: 'NOT_DECLARED',
        winnerSide: null,
        winnerName: '',
      };
    }
    return { valid: true, normalizedStatus: 'DECLARED', winnerSide: 'B', winnerName: labelB };
  }

  return {
    valid: false,
    error: 'Invalid match result selection.',
    normalizedStatus: 'NOT_DECLARED',
    winnerSide: null,
    winnerName: '',
  };
}
