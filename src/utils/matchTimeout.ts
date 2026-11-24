import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../types/index.ts';
import {
  computeEffectiveKabaddiClock,
  KabaddiDetails,
  normalizeKabaddiDetails,
} from './kabaddiScoring.ts';

export interface MatchTimeoutInfo {
  isTimeout: boolean;
  teamSide: 'A' | 'B' | '';
  teamName: string;
  remainingSec: number | null;
  label: string;
}

export interface TimeoutOverlayDecision {
  showFullScoreboard: boolean;
  showFullscreenSponsorAd: boolean;
  isAnyTakeoverActive: boolean;
}

export function resolveMatchTimeoutState(
  stream: Pick<LiveStreamData, 'teamAName' | 'teamBName' | 'gameName' | 'status'> | null | undefined,
  score: LiveScoreData | null | undefined,
  nowMs: number = Date.now()
): MatchTimeoutInfo {
  const empty: MatchTimeoutInfo = {
    isTimeout: false,
    teamSide: '',
    teamName: '',
    remainingSec: null,
    label: '',
  };

  if (!stream || stream.status === 'ENDED') return empty;

  const sport = score?.sportType || stream.gameName || 'Other';
  const teamAName = stream.teamAName || 'Team A';
  const teamBName = stream.teamBName || 'Team B';

  if (sport === 'Kabaddi' && score?.sportSpecificDetails) {
    const kd = normalizeKabaddiDetails(score.sportSpecificDetails as Partial<KabaddiDetails>);
    if (!kd.matchCompleted && (kd.clock.timeoutActive || kd.clock.status === 'TIMEOUT')) {
      const eff = computeEffectiveKabaddiClock(kd, nowMs);
      const side: 'A' | 'B' | '' =
        kd.clock.timeoutTeam === 'A' || kd.clock.timeoutTeam === 'B' ? kd.clock.timeoutTeam : '';
      const teamName = side === 'A' ? teamAName : side === 'B' ? teamBName : 'Official';
      return {
        isTimeout: true,
        teamSide: side,
        teamName,
        remainingSec: eff.timeoutRemainingSec,
        label: side ? `${teamName} Timeout` : 'Official Timeout',
      };
    }
  }

  const rawStatus = (score?.matchStatus || '').trim();
  if (/timeout/i.test(rawStatus)) {
    const upper = rawStatus.toUpperCase();
    let teamSide: 'A' | 'B' | '' = '';
    let teamName = 'Official';
    if (upper.includes('TEAM A') || upper.includes(teamAName.toUpperCase())) {
      teamSide = 'A';
      teamName = teamAName;
    } else if (upper.includes('TEAM B') || upper.includes(teamBName.toUpperCase())) {
      teamSide = 'B';
      teamName = teamBName;
    }
    return {
      isTimeout: true,
      teamSide,
      teamName,
      remainingSec: null,
      label: teamSide ? `${teamName} Timeout` : rawStatus || 'Team Timeout',
    };
  }

  return empty;
}

export function resolveTimeoutOverlayDecision(
  config: Partial<BroadcastOverlayConfig> | null | undefined,
  timeoutInfo: MatchTimeoutInfo
): TimeoutOverlayDecision {
  const fullScoreboard = Boolean(config?.fullScoreboardVisible);
  const manualFullscreenAd = Boolean(config?.timeoutFullscreenSponsorAdActive);
  const mode = config?.timeoutDisplayMode || 'fullscreen_ad';

  const showFullScoreboard =
    fullScoreboard ||
    (timeoutInfo.isTimeout && mode === 'full_scoreboard' && !manualFullscreenAd);

  const showFullscreenSponsorAd =
    !fullScoreboard &&
    (manualFullscreenAd || (timeoutInfo.isTimeout && mode === 'fullscreen_ad'));

  return {
    showFullScoreboard,
    showFullscreenSponsorAd,
    isAnyTakeoverActive: showFullScoreboard || showFullscreenSponsorAd,
  };
}
