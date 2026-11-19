import { SportOption } from '../constants/sports.ts';

export interface AutoCommentaryInput {
  sport: SportOption;
  actionLabel: string;
  teamAName: string;
  teamBName: string;
  teamAScore: number;
  teamBScore: number;
  details?: Record<string, unknown>;
}

export function generateAutoCommentary(input: AutoCommentaryInput): string {
  const { sport, actionLabel, teamAName, teamBName, teamAScore, teamBScore, details = {} } = input;
  const lower = actionLabel.toLowerCase();

  if (sport === 'Cricket') {
    const battingTeam = details.battingTeam === 'B' ? teamBName : teamAName;
    const runs = details.battingTeam === 'B' ? Number(details.teamBRuns ?? teamBScore) : Number(details.teamARuns ?? teamAScore);
    const wkts = details.battingTeam === 'B' ? Number(details.teamBWickets ?? 0) : Number(details.teamAWickets ?? 0);
    const striker = typeof details.batsman1 === 'string' && details.batsman1 ? details.batsman1 : 'The batter';
    const bowler = typeof details.bowler === 'string' && details.bowler ? details.bowler : 'the bowler';

    if (lower.includes('wicket')) {
      return `WICKET! ${bowler} strikes — breakthrough for the fielding side! ${battingTeam} are ${runs}/${wkts}.`;
    }
    if (lower.includes('+6') || lower.includes('6 bat run')) {
      return `SIX! ${striker} sends it sailing over the rope off ${bowler}! ${battingTeam} move to ${runs}/${wkts}.`;
    }
    if (lower.includes('+4') || lower.includes('4 bat run')) {
      return `FOUR! Crisp boundary from ${striker} to the fence. ${battingTeam} ${runs}/${wkts}.`;
    }
    if (lower.includes('wide')) {
      return `Wide ball signalled by the umpire. Extra run added; ${battingTeam} at ${runs}/${wkts}.`;
    }
    if (lower.includes('no ball')) {
      return `No ball called! Free hit opportunity coming up. ${battingTeam} ${runs}/${wkts}.`;
    }
    if (lower.includes('end of over')) {
      return `End of the over. ${battingTeam} stand at ${runs}/${wkts}.`;
    }
    if (lower.includes('innings')) {
      return `Innings update: ${actionLabel}.`;
    }
    if (lower.includes('dot ball')) {
      return `Tight delivery from ${bowler}, dot ball to ${striker}. ${battingTeam} ${runs}/${wkts}.`;
    }
    return `${actionLabel}. ${battingTeam} move to ${runs}/${wkts}.`;
  }

  if (sport === 'Kabaddi') {
    if (lower.includes('super raid')) {
      return `SUPER RAID! Huge multi-point raid turns the momentum! Score: ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
    }
    if (lower.includes('super tackle')) {
      return `SUPER TACKLE! Clinical defensive hold worth 2 points! Score: ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
    }
    if (lower.includes('all-out') || lower.includes('all out')) {
      return `ALL OUT! Bonus 2 points awarded on the mat! Score: ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
    }
    if (lower.includes('bonus')) {
      return `Quick toe-touch across the bonus line! Score: ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
    }
    return `${actionLabel} · ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
  }

  if (sport === 'Football') {
    if (lower.includes('goal')) {
      return `GOAL! Back of the net! ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
    }
    if (lower.includes('red card')) {
      return `RED CARD! Player sent off! ${actionLabel}.`;
    }
    if (lower.includes('yellow card')) {
      return `Caution shown by the referee: ${actionLabel}.`;
    }
    if (lower.includes('penalty')) {
      return `Penalty shootout update: ${actionLabel}.`;
    }
    return `${actionLabel} · ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
  }

  if (sport === 'Volleyball') {
    if (lower.includes('set') && (lower.includes('won') || lower.includes('award'))) {
      return `Set won! ${actionLabel}.`;
    }
    if (lower.includes('ace')) {
      return `ACE! Unreturnable serve! Score: ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
    }
    return `${actionLabel} · ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
  }

  return `${actionLabel} · ${teamAName} ${teamAScore} - ${teamBScore} ${teamBName}.`;
}
