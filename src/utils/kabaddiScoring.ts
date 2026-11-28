export type KabaddiSide = 'A' | 'B';

export type KabaddiHalfLabel =
  | '1st Half'
  | 'Half Time'
  | '2nd Half'
  | 'Extra Time'
  | 'Tie-Breaker'
  | 'Golden Raid'
  | 'Full Time';

export type KabaddiClockStatus =
  | 'NOT_STARTED'
  | 'RUNNING'
  | 'PAUSED'
  | 'HALF_TIME'
  | 'BREAK'
  | 'TIMEOUT'
  | 'EXTRA_TIME'
  | 'TIE_BREAKER'
  | 'SUSPENDED'
  | 'COMPLETED';

export type KabaddiPlayerStatus =
  | 'ON_COURT'
  | 'OUT'
  | 'BENCH'
  | 'INJURED'
  | 'SUSPENDED'
  | 'DISQUALIFIED';

export interface KabaddiPlayerStats {
  raidPoints: number;
  tacklePoints: number;
  bonusPoints: number;
  totalPoints: number;
  raidsAttempted: number;
  successfulRaids: number;
  emptyRaids: number;
  raidersTackled: number;
  superRaids: number;
  superTackles: number;
  outCount: number;
  revivals: number;
  substitutions: number;
}

export interface KabaddiCourtPlayer {
  playerId: string;
  name: string;
  jerseyNumber?: number | string;
  role?: string;
  team: KabaddiSide;
  status: KabaddiPlayerStatus;
  cards: {
    green: number;
    yellow: number;
    red: number;
    custom: string[];
  };
  stats: KabaddiPlayerStats;
}

export interface KabaddiRulesConfig {
  playersPerSide: number;
  touchPointValue: number;
  unsuccessfulRaidDefenderPoints: number;
  bonusPointValue: number;
  superRaidMinTotalPoints: number;
  superTackleMaxDefenders: number;
  superTacklePoints: number;
  superTackleRevivalCount: number;
  allOutBonusPoints: number;
  doOrDieConsecutiveEmptyThreshold: number;
  doOrDieBannerDurationSec: number;
  allOutBannerDurationSec: number;
  halvesCount: number;
  halfDurationMinutes: number;
  breakDurationMinutes: number;
  extraTimeHalves: number;
  extraTimeHalfMinutes: number;
  raidTimerEnabled: boolean;
  raidTimerSeconds: number;
  timeoutDurationSeconds: number;
  maxTimeoutsPerTeam: number;
  tieResolutionMode: 'EXTRA_TIME' | 'TIE_BREAKER' | 'GOLDEN_RAID' | 'ALLOW_TIE';
}

export interface KabaddiScorerSettings {
  buttons: {
    touchPoint: boolean;
    emptyRaid: boolean;
    unsuccessfulRaid: boolean;
    bonusPoint: boolean;
    multiPointsRaid: boolean;
    superTackle: boolean;
    doOrDieRaid: boolean;
    extraPoints: boolean;
  };
  panels: {
    matchControls: boolean;
    eventHistory: boolean;
    raidHistory: boolean;
    playerStats: boolean;
    playerRoster: boolean;
    timeoutControls: boolean;
    cardsDiscipline: boolean;
  };
  defaultScoringMode: 'quick' | 'detailed';
  confirmDestructiveActions: boolean;
}

export interface KabaddiViewerDisplaySettings {
  showTeamNames: boolean;
  showTeamLogos: boolean;
  showScores: boolean;
  showMatchTimer: boolean;
  showHalf: boolean;
  showRaidTimer: boolean;
  showPlayersOnCourtDots: boolean;
  showPlayerNames: boolean;
  showJerseyNumbers: boolean;
  showDoOrDieBanner: boolean;
  showAllOutAnimation: boolean;
  showSuperTackleBadge: boolean;
  showSuperRaidBadge: boolean;
  showBonusBadge: boolean;
  showTimeoutBanner: boolean;
  showRaidHistory: boolean;
  showPlayerStats: boolean;
  showSponsorLogos: boolean;
  showTournamentLogo: boolean;
  showMatchEvents: boolean;
  enableAnimations: boolean;
}

export interface KabaddiClockState {
  status: KabaddiClockStatus;
  halfNumber: number;
  halfLabel: KabaddiHalfLabel;
  durationMs: number;
  remainingMs: number;
  lastStartedAtIso: string | null;
  raidTimerEnabled: boolean;
  raidDurationMs: number;
  raidRemainingMs: number;
  raidRunning: boolean;
  raidStartedAtIso: string | null;
  timeoutActive: boolean;
  timeoutTeam: KabaddiSide | '';
  timeoutDurationMs: number;
  timeoutRemainingMs: number;
  timeoutStartedAtIso: string | null;
  timeoutCountA: number;
  timeoutCountB: number;
  sideSwapped: boolean;
  suspendedReason: string;
  matchStartedAtIso: string | null;
  matchEndedAtIso: string | null;
}

export interface KabaddiDoOrDieState {
  active: boolean;
  team: KabaddiSide | '';
  triggeredAtIso: string | null;
  expiresAtIso: string | null;
  eventId: string;
  triggerType: 'AUTO' | 'MANUAL';
}

export interface KabaddiAllOutBanner {
  eventId: string;
  awardingTeam: KabaddiSide;
  affectedTeam: KabaddiSide;
  pointsAwarded: number;
  triggeredAtIso: string;
}

export interface KabaddiTeamBreakdown {
  raidPoints: number;
  tacklePoints: number;
  allOutPoints: number;
  bonusPoints: number;
  superTackles: number;
  superRaids: number;
  technicalPoints: number;
  penaltyPoints: number;
  emptyRaids: number;
  doOrDieRaids: number;
  playersOut: number;
  allOutsInflicted?: number;
}

export interface KabaddiRaidLogItem {
  id: string;
  raidNumber?: number;
  team: KabaddiSide;
  category: 'RAID' | 'TACKLE' | 'OTHER';
  eventType: string;
  points: number;
  touchPoints?: number;
  bonusPoints?: number;
  tacklePoints?: number;
  allOutPoints?: number;
  playerId?: string;
  playerName?: string;
  defenderNames?: string[];
  revivedNames?: string[];
  description?: string;
  half: string;
  clockText?: string;
  scoreSnapshot: string;
  isDoOrDie?: boolean;
  isSuperRaid?: boolean;
  isSuperTackle?: boolean;
  isAllOut?: boolean;
  reverted?: boolean;
  timestamp: string;
}

export interface KabaddiDetails {
  teamA: KabaddiTeamBreakdown;
  teamB: KabaddiTeamBreakdown;
  half: KabaddiHalfLabel;
  timerMinutes: number;
  timerSeconds: number;
  superRaidNote: string;
  isTieBreaker: boolean;
  tieBreakerScoreA: number;
  tieBreakerScoreB: number;
  raidTimeline: KabaddiRaidLogItem[];
  // Extended full Kabaddi state (JSON-safe for MongoDB & SQLite)
  rules: KabaddiRulesConfig;
  scorerSettings: KabaddiScorerSettings;
  viewerDisplaySettings: KabaddiViewerDisplaySettings;
  activeRaidingTeam: KabaddiSide;
  consecutiveEmptyRaidsA: number;
  consecutiveEmptyRaidsB: number;
  pendingDoOrDieA: boolean;
  pendingDoOrDieB: boolean;
  playersOnCourtA: number;
  playersOnCourtB: number;
  courtPlayersA: KabaddiCourtPlayer[];
  courtPlayersB: KabaddiCourtPlayer[];
  revivalQueueA: string[];
  revivalQueueB: string[];
  clock: KabaddiClockState;
  doOrDie: KabaddiDoOrDieState;
  lastAllOut: KabaddiAllOutBanner | null;
  raidNumber: number;
  matchCompleted: boolean;
  tieBreakStage: 'NONE' | 'EXTRA_TIME' | 'TIE_BREAKER' | 'GOLDEN_RAID';
  goldenRaidWinner: KabaddiSide | '';
  forfeitTeam: KabaddiSide | '';
  forfeitReason: string;
  tossWinner?: KabaddiSide | '';
  tossDecision?: 'RAID' | 'COURT' | '';
}

export function createDefaultKabaddiRules(): KabaddiRulesConfig {
  return {
    playersPerSide: 7,
    touchPointValue: 1,
    unsuccessfulRaidDefenderPoints: 1,
    bonusPointValue: 1,
    superRaidMinTotalPoints: 3,
    superTackleMaxDefenders: 3,
    superTacklePoints: 2,
    superTackleRevivalCount: 1,
    allOutBonusPoints: 2,
    doOrDieConsecutiveEmptyThreshold: 2,
    doOrDieBannerDurationSec: 10,
    allOutBannerDurationSec: 6,
    halvesCount: 2,
    halfDurationMinutes: 20,
    breakDurationMinutes: 5,
    extraTimeHalves: 2,
    extraTimeHalfMinutes: 5,
    raidTimerEnabled: true,
    raidTimerSeconds: 30,
    timeoutDurationSeconds: 30,
    maxTimeoutsPerTeam: 2,
    tieResolutionMode: 'EXTRA_TIME',
  };
}

export function createDefaultKabaddiScorerSettings(): KabaddiScorerSettings {
  return {
    buttons: {
      touchPoint: true,
      emptyRaid: true,
      unsuccessfulRaid: true,
      bonusPoint: true,
      multiPointsRaid: true,
      superTackle: true,
      doOrDieRaid: true,
      extraPoints: true,
    },
    panels: {
      matchControls: true,
      eventHistory: true,
      raidHistory: true,
      playerStats: true,
      playerRoster: true,
      timeoutControls: true,
      cardsDiscipline: true,
    },
    defaultScoringMode: 'quick',
    confirmDestructiveActions: true,
  };
}

export function createDefaultKabaddiViewerSettings(): KabaddiViewerDisplaySettings {
  return {
    showTeamNames: true,
    showTeamLogos: true,
    showScores: true,
    showMatchTimer: true,
    showHalf: true,
    showRaidTimer: true,
    showPlayersOnCourtDots: true,
    showPlayerNames: true,
    showJerseyNumbers: true,
    showDoOrDieBanner: true,
    showAllOutAnimation: true,
    showSuperTackleBadge: true,
    showSuperRaidBadge: true,
    showBonusBadge: true,
    showTimeoutBanner: true,
    showRaidHistory: true,
    showPlayerStats: true,
    showSponsorLogos: true,
    showTournamentLogo: true,
    showMatchEvents: true,
    enableAnimations: true,
  };
}

export function createEmptyPlayerStats(): KabaddiPlayerStats {
  return {
    raidPoints: 0,
    tacklePoints: 0,
    bonusPoints: 0,
    totalPoints: 0,
    raidsAttempted: 0,
    successfulRaids: 0,
    emptyRaids: 0,
    raidersTackled: 0,
    superRaids: 0,
    superTackles: 0,
    outCount: 0,
    revivals: 0,
    substitutions: 0,
  };
}

function createDefaultRosterSlots(team: KabaddiSide, count: number): KabaddiCourtPlayer[] {
  return Array.from({ length: count }, (_, idx) => ({
    playerId: `slot_${team.toLowerCase()}_${idx + 1}`,
    name: `Player ${idx + 1}`,
    jerseyNumber: idx + 1,
    role: idx === 0 ? 'Raider' : 'All-Rounder',
    team,
    status: 'ON_COURT',
    cards: { green: 0, yellow: 0, red: 0, custom: [] },
    stats: createEmptyPlayerStats(),
  }));
}

function defaultBreakdown(): KabaddiTeamBreakdown {
  return {
    raidPoints: 0,
    tacklePoints: 0,
    allOutPoints: 0,
    bonusPoints: 0,
    superTackles: 0,
    superRaids: 0,
    technicalPoints: 0,
    penaltyPoints: 0,
    emptyRaids: 0,
    doOrDieRaids: 0,
    playersOut: 0,
    allOutsInflicted: 0,
  };
}

function createDefaultClock(rules: KabaddiRulesConfig): KabaddiClockState {
  const durationMs = Math.max(1, rules.halfDurationMinutes) * 60 * 1000;
  const raidMs = Math.max(5, rules.raidTimerSeconds) * 1000;
  const timeoutMs = Math.max(5, rules.timeoutDurationSeconds) * 1000;
  return {
    status: 'NOT_STARTED',
    halfNumber: 1,
    halfLabel: '1st Half',
    durationMs,
    remainingMs: durationMs,
    lastStartedAtIso: null,
    raidTimerEnabled: rules.raidTimerEnabled,
    raidDurationMs: raidMs,
    raidRemainingMs: raidMs,
    raidRunning: false,
    raidStartedAtIso: null,
    timeoutActive: false,
    timeoutTeam: '',
    timeoutDurationMs: timeoutMs,
    timeoutRemainingMs: timeoutMs,
    timeoutStartedAtIso: null,
    timeoutCountA: 0,
    timeoutCountB: 0,
    sideSwapped: false,
    suspendedReason: '',
    matchStartedAtIso: null,
    matchEndedAtIso: null,
  };
}

export function createInitialKabaddiDetails(rulesOverride?: Partial<KabaddiRulesConfig>): KabaddiDetails {
  const rules = { ...createDefaultKabaddiRules(), ...(rulesOverride || {}) };
  return {
    teamA: defaultBreakdown(),
    teamB: defaultBreakdown(),
    half: '1st Half',
    timerMinutes: rules.halfDurationMinutes,
    timerSeconds: 0,
    superRaidNote: '',
    isTieBreaker: false,
    tieBreakerScoreA: 0,
    tieBreakerScoreB: 0,
    raidTimeline: [],
    rules,
    scorerSettings: createDefaultKabaddiScorerSettings(),
    viewerDisplaySettings: createDefaultKabaddiViewerSettings(),
    activeRaidingTeam: 'A',
    consecutiveEmptyRaidsA: 0,
    consecutiveEmptyRaidsB: 0,
    pendingDoOrDieA: false,
    pendingDoOrDieB: false,
    playersOnCourtA: rules.playersPerSide,
    playersOnCourtB: rules.playersPerSide,
    courtPlayersA: createDefaultRosterSlots('A', rules.playersPerSide),
    courtPlayersB: createDefaultRosterSlots('B', rules.playersPerSide),
    revivalQueueA: [],
    revivalQueueB: [],
    clock: createDefaultClock(rules),
    doOrDie: {
      active: false,
      team: '',
      triggeredAtIso: null,
      expiresAtIso: null,
      eventId: '',
      triggerType: 'AUTO',
    },
    lastAllOut: null,
    raidNumber: 0,
    matchCompleted: false,
    tieBreakStage: 'NONE',
    goldenRaidWinner: '',
    forfeitTeam: '',
    forfeitReason: '',
    tossWinner: '',
    tossDecision: '',
  };
}

function makeEventUuid(): string {
  return `kbe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeKabaddiDetails(raw?: Partial<KabaddiDetails> | Record<string, unknown> | null): KabaddiDetails {
  const input = (raw || {}) as Partial<KabaddiDetails>;
  const defaults = createInitialKabaddiDetails(input.rules);
  const rules: KabaddiRulesConfig = {
    ...defaults.rules,
    ...(input.rules || {}),
  };
  const scorerSettings: KabaddiScorerSettings = {
    ...defaults.scorerSettings,
    ...(input.scorerSettings || {}),
    buttons: {
      ...defaults.scorerSettings.buttons,
      ...(input.scorerSettings?.buttons || {}),
    },
    panels: {
      ...defaults.scorerSettings.panels,
      ...(input.scorerSettings?.panels || {}),
    },
  };
  const viewerDisplaySettings: KabaddiViewerDisplaySettings = {
    ...defaults.viewerDisplaySettings,
    ...(input.viewerDisplaySettings || {}),
  };
  const courtPlayersA = Array.isArray(input.courtPlayersA) && input.courtPlayersA.length > 0
    ? input.courtPlayersA.map((p) => ({
        ...p,
        cards: {
          green: p.cards?.green ?? 0,
          yellow: p.cards?.yellow ?? 0,
          red: p.cards?.red ?? 0,
          custom: Array.isArray(p.cards?.custom) ? [...p.cards.custom] : [],
        },
        stats: { ...createEmptyPlayerStats(), ...(p.stats || {}) },
      }))
    : defaults.courtPlayersA;
  const courtPlayersB = Array.isArray(input.courtPlayersB) && input.courtPlayersB.length > 0
    ? input.courtPlayersB.map((p) => ({
        ...p,
        cards: {
          green: p.cards?.green ?? 0,
          yellow: p.cards?.yellow ?? 0,
          red: p.cards?.red ?? 0,
          custom: Array.isArray(p.cards?.custom) ? [...p.cards.custom] : [],
        },
        stats: { ...createEmptyPlayerStats(), ...(p.stats || {}) },
      }))
    : defaults.courtPlayersB;

  const activeCountA = courtPlayersA.filter((p) => p.status === 'ON_COURT').length;
  const activeCountB = courtPlayersB.filter((p) => p.status === 'ON_COURT').length;

  const teamA = { ...defaults.teamA, ...(input.teamA || {}) };
  const teamB = { ...defaults.teamB, ...(input.teamB || {}) };

  const clock: KabaddiClockState = {
    ...defaults.clock,
    ...(input.clock || {}),
  };

  return {
    ...defaults,
    ...input,
    rules,
    scorerSettings,
    viewerDisplaySettings,
    teamA,
    teamB,
    courtPlayersA,
    courtPlayersB,
    playersOnCourtA:
      typeof input.playersOnCourtA === 'number' && input.courtPlayersA?.length
        ? activeCountA
        : Math.max(0, rules.playersPerSide - (teamA.playersOut || 0)),
    playersOnCourtB:
      typeof input.playersOnCourtB === 'number' && input.courtPlayersB?.length
        ? activeCountB
        : Math.max(0, rules.playersPerSide - (teamB.playersOut || 0)),
    revivalQueueA: Array.isArray(input.revivalQueueA) ? [...input.revivalQueueA] : [],
    revivalQueueB: Array.isArray(input.revivalQueueB) ? [...input.revivalQueueB] : [],
    raidTimeline: Array.isArray(input.raidTimeline) ? [...input.raidTimeline] : [],
    clock,
    pendingDoOrDieA: Boolean(input.pendingDoOrDieA),
    pendingDoOrDieB: Boolean(input.pendingDoOrDieB),
    doOrDie: {
      ...defaults.doOrDie,
      ...(input.doOrDie || {}),
    },
    lastAllOut: input.lastAllOut || null,
    tossWinner: input.tossWinner === 'A' || input.tossWinner === 'B' ? input.tossWinner : '',
    tossDecision:
      input.tossDecision === 'RAID' || input.tossDecision === 'COURT' ? input.tossDecision : '',
  };
}

export function hasKabaddiScoringStarted(
  rawDetails?: Partial<KabaddiDetails> | Record<string, unknown> | null,
  teamAScore = 0,
  teamBScore = 0
): boolean {
  if ((teamAScore || 0) > 0 || (teamBScore || 0) > 0) return true;
  if (!rawDetails) return false;
  const d = normalizeKabaddiDetails(rawDetails);
  return Boolean(
    d.raidNumber > 0 ||
      d.raidTimeline.length > 0 ||
      d.clock.status !== 'NOT_STARTED' ||
      Boolean(d.clock.matchStartedAtIso) ||
      d.matchCompleted ||
      d.teamA.raidPoints > 0 ||
      d.teamA.tacklePoints > 0 ||
      d.teamB.raidPoints > 0 ||
      d.teamB.tacklePoints > 0
  );
}

export interface ComputedKabaddiClock {
  remainingMs: number;
  timerMinutes: number;
  timerSeconds: number;
  formattedClock: string;
  raidRemainingMs: number;
  raidRemainingSec: number;
  timeoutRemainingMs: number;
  timeoutRemainingSec: number;
  doOrDieVisible: boolean;
  doOrDieRemainingSec: number;
}

export function computeEffectiveKabaddiClock(
  rawDetails: Partial<KabaddiDetails> | Record<string, unknown> | undefined | null,
  nowMs: number = Date.now()
): ComputedKabaddiClock {
  const d = normalizeKabaddiDetails(rawDetails);
  const c = d.clock;

  let remainingMs = Math.max(0, c.remainingMs);
  if (
    (c.status === 'RUNNING' || c.status === 'EXTRA_TIME' || c.status === 'BREAK') &&
    c.lastStartedAtIso
  ) {
    const startedMs = new Date(c.lastStartedAtIso).getTime();
    if (Number.isFinite(startedMs)) {
      remainingMs = Math.max(0, c.remainingMs - Math.max(0, nowMs - startedMs));
    }
  }

  const totalSec = Math.ceil(remainingMs / 1000);
  const timerMinutes = Math.floor(totalSec / 60);
  const timerSeconds = totalSec % 60;
  const formattedClock = `${String(timerMinutes).padStart(2, '0')}:${String(timerSeconds).padStart(2, '0')}`;

  let raidRemainingMs = Math.max(0, c.raidRemainingMs);
  if (c.raidTimerEnabled && c.raidRunning && c.raidStartedAtIso) {
    const raidStartMs = new Date(c.raidStartedAtIso).getTime();
    if (Number.isFinite(raidStartMs)) {
      raidRemainingMs = Math.max(0, c.raidRemainingMs - Math.max(0, nowMs - raidStartMs));
    }
  }

  let timeoutRemainingMs = Math.max(0, c.timeoutRemainingMs);
  if (c.timeoutActive && c.timeoutStartedAtIso) {
    const tStartMs = new Date(c.timeoutStartedAtIso).getTime();
    if (Number.isFinite(tStartMs)) {
      timeoutRemainingMs = Math.max(0, c.timeoutRemainingMs - Math.max(0, nowMs - tStartMs));
    }
  }

  let doOrDieVisible = false;
  let doOrDieRemainingSec = 0;
  if (d.doOrDie.active) {
    const dodDurationMs = Math.max(2, d.rules.doOrDieBannerDurationSec || 10) * 1000;
    if (d.doOrDie.triggeredAtIso) {
      const startMs = new Date(d.doOrDie.triggeredAtIso).getTime();
      if (Number.isFinite(startMs)) {
        const left = startMs + dodDurationMs - nowMs;
        if (left > 0) {
          doOrDieVisible = true;
          doOrDieRemainingSec = Math.ceil(left / 1000);
        }
      } else {
        doOrDieVisible = true;
      }
    } else if (d.doOrDie.expiresAtIso) {
      const expMs = new Date(d.doOrDie.expiresAtIso).getTime();
      if (Number.isFinite(expMs)) {
        const left = expMs - nowMs;
        if (left > 0) {
          doOrDieVisible = true;
          doOrDieRemainingSec = Math.ceil(left / 1000);
        }
      } else {
        doOrDieVisible = true;
      }
    } else {
      doOrDieVisible = true;
    }
  }

  return {
    remainingMs,
    timerMinutes,
    timerSeconds,
    formattedClock,
    raidRemainingMs,
    raidRemainingSec: Math.ceil(raidRemainingMs / 1000),
    timeoutRemainingMs,
    timeoutRemainingSec: Math.ceil(timeoutRemainingMs / 1000),
    doOrDieVisible,
    doOrDieRemainingSec,
  };
}

export type KabaddiClockCommand =
  | { type: 'START_MATCH' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'HALF_TIME' }
  | { type: 'START_NEXT_HALF'; halfNumber?: number }
  | { type: 'EXTRA_TIME'; halfNumber?: number }
  | { type: 'TIE_BREAKER' }
  | { type: 'GOLDEN_RAID' }
  | { type: 'TIME_CORRECTION'; minutes: number; seconds: number; halfLabel?: KabaddiHalfLabel }
  | { type: 'START_RAID_TIMER' }
  | { type: 'PAUSE_RAID_TIMER' }
  | { type: 'RESET_RAID_TIMER' }
  | { type: 'START_TIMEOUT'; team: KabaddiSide }
  | { type: 'END_TIMEOUT' }
  | { type: 'SUSPEND_MATCH'; reason?: string }
  | { type: 'RESUME_MATCH' }
  | { type: 'SIDE_CHANGE' }
  | { type: 'COMPLETE_CLOCK' };

export function applyKabaddiClockCommand(
  rawDetails: Partial<KabaddiDetails> | Record<string, unknown> | undefined | null,
  command: KabaddiClockCommand,
  nowMs: number = Date.now()
): { details: KabaddiDetails; label: string } {
  const next = normalizeKabaddiDetails(rawDetails);
  const nowIso = new Date(nowMs).toISOString();
  const eff = computeEffectiveKabaddiClock(next, nowMs);
  const c = { ...next.clock };
  let label = 'Match clock updated';

  const commitElapsedBeforeTransition = () => {
    c.remainingMs = eff.remainingMs;
    c.lastStartedAtIso = null;
    if (c.raidRunning) {
      c.raidRemainingMs = eff.raidRemainingMs;
      c.raidStartedAtIso = null;
      c.raidRunning = false;
    }
    if (c.timeoutActive) {
      c.timeoutRemainingMs = eff.timeoutRemainingMs;
      c.timeoutStartedAtIso = null;
    }
  };

  switch (command.type) {
    case 'START_MATCH': {
      const halfMs = Math.max(1, next.rules.halfDurationMinutes) * 60 * 1000;
      c.status = 'RUNNING';
      c.halfNumber = 1;
      c.halfLabel = '1st Half';
      c.durationMs = halfMs;
      c.remainingMs = c.matchStartedAtIso ? eff.remainingMs : halfMs;
      c.lastStartedAtIso = nowIso;
      if (!c.matchStartedAtIso) c.matchStartedAtIso = nowIso;
      c.timeoutActive = false;
      c.timeoutTeam = '';
      c.raidTimerEnabled = next.rules.raidTimerEnabled;
      c.raidDurationMs = Math.max(5, next.rules.raidTimerSeconds) * 1000;
      if (next.rules.raidTimerEnabled) {
        c.raidRemainingMs = c.raidDurationMs;
        c.raidRunning = true;
        c.raidStartedAtIso = nowIso;
      }
      next.half = '1st Half';
      label = 'Match started (1st Half)';
      break;
    }
    case 'PAUSE': {
      commitElapsedBeforeTransition();
      c.status = 'PAUSED';
      label = `Match paused at ${eff.formattedClock}`;
      break;
    }
    case 'RESUME': {
      if (next.matchCompleted) {
        throw new Error('Match is already completed.');
      }
      c.timeoutActive = false;
      c.timeoutTeam = '';
      c.timeoutStartedAtIso = null;
      c.status = next.tieBreakStage === 'EXTRA_TIME' ? 'EXTRA_TIME' : 'RUNNING';
      c.lastStartedAtIso = nowIso;
      if (c.raidTimerEnabled && c.raidRemainingMs > 0) {
        c.raidRunning = true;
        c.raidStartedAtIso = nowIso;
      }
      label = 'Match resumed';
      break;
    }
    case 'HALF_TIME': {
      commitElapsedBeforeTransition();
      c.status = 'HALF_TIME';
      c.halfLabel = 'Half Time';
      c.timeoutActive = false;
      c.timeoutTeam = '';
      next.half = 'Half Time';
      label = 'Half Time break started';
      break;
    }
    case 'START_NEXT_HALF': {
      const targetHalf = command.halfNumber ?? Math.min(next.rules.halvesCount, (c.halfNumber || 1) + 1);
      const halfMs = Math.max(1, next.rules.halfDurationMinutes) * 60 * 1000;
      c.status = 'RUNNING';
      c.halfNumber = targetHalf;
      c.halfLabel = targetHalf === 2 ? '2nd Half' : '1st Half';
      c.durationMs = halfMs;
      c.remainingMs = halfMs;
      c.lastStartedAtIso = nowIso;
      c.timeoutActive = false;
      c.timeoutTeam = '';
      c.raidRemainingMs = Math.max(5, next.rules.raidTimerSeconds) * 1000;
      if (next.rules.raidTimerEnabled) {
        c.raidRunning = true;
        c.raidStartedAtIso = nowIso;
      }
      next.half = c.halfLabel;
      label = `${c.halfLabel} started`;
      break;
    }
    case 'EXTRA_TIME': {
      const etNum = command.halfNumber ?? 1;
      const etMs = Math.max(1, next.rules.extraTimeHalfMinutes) * 60 * 1000;
      c.status = 'EXTRA_TIME';
      c.halfNumber = next.rules.halvesCount + etNum;
      c.halfLabel = 'Extra Time';
      c.durationMs = etMs;
      c.remainingMs = etMs;
      c.lastStartedAtIso = nowIso;
      c.timeoutActive = false;
      c.timeoutTeam = '';
      next.half = 'Extra Time';
      next.tieBreakStage = 'EXTRA_TIME';
      label = `Extra Time (Half ${etNum}) started`;
      break;
    }
    case 'TIE_BREAKER': {
      commitElapsedBeforeTransition();
      c.status = 'TIE_BREAKER';
      c.halfLabel = 'Tie-Breaker';
      c.remainingMs = 0;
      next.half = 'Tie-Breaker';
      next.isTieBreaker = true;
      next.tieBreakStage = 'TIE_BREAKER';
      label = 'Tie-Breaker (5-Raid Shootout) started';
      break;
    }
    case 'GOLDEN_RAID': {
      commitElapsedBeforeTransition();
      c.status = 'TIE_BREAKER';
      c.halfLabel = 'Golden Raid';
      c.remainingMs = 0;
      next.half = 'Golden Raid';
      next.isTieBreaker = true;
      next.tieBreakStage = 'GOLDEN_RAID';
      label = 'Golden Raid sudden-death started';
      break;
    }
    case 'TIME_CORRECTION': {
      const mins = Math.max(0, Math.min(99, Math.trunc(command.minutes || 0)));
      const secs = Math.max(0, Math.min(59, Math.trunc(command.seconds || 0)));
      const correctedMs = (mins * 60 + secs) * 1000;
      const wasRunning = c.status === 'RUNNING' || c.status === 'EXTRA_TIME';
      c.remainingMs = correctedMs;
      c.lastStartedAtIso = wasRunning ? nowIso : null;
      if (command.halfLabel) {
        c.halfLabel = command.halfLabel;
        next.half = command.halfLabel;
      }
      label = `Clock corrected to ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      break;
    }
    case 'START_RAID_TIMER': {
      const raidMs = Math.max(5, next.rules.raidTimerSeconds) * 1000;
      c.raidTimerEnabled = true;
      c.raidDurationMs = raidMs;
      if (eff.raidRemainingMs <= 0) c.raidRemainingMs = raidMs;
      else c.raidRemainingMs = eff.raidRemainingMs;
      c.raidRunning = true;
      c.raidStartedAtIso = nowIso;
      label = 'Raid timer started';
      break;
    }
    case 'PAUSE_RAID_TIMER': {
      c.raidRemainingMs = eff.raidRemainingMs;
      c.raidRunning = false;
      c.raidStartedAtIso = null;
      label = 'Raid timer paused';
      break;
    }
    case 'RESET_RAID_TIMER': {
      const raidMs = Math.max(5, next.rules.raidTimerSeconds) * 1000;
      c.raidDurationMs = raidMs;
      c.raidRemainingMs = raidMs;
      const running = c.status === 'RUNNING' || c.status === 'EXTRA_TIME';
      c.raidRunning = Boolean(c.raidTimerEnabled && running);
      c.raidStartedAtIso = c.raidRunning ? nowIso : null;
      label = `Raid timer reset (${next.rules.raidTimerSeconds}s)`;
      break;
    }
    case 'START_TIMEOUT': {
      const currentUsed = command.team === 'A' ? c.timeoutCountA : c.timeoutCountB;
      if (currentUsed >= next.rules.maxTimeoutsPerTeam) {
        throw new Error(`Team ${command.team} has already used all ${next.rules.maxTimeoutsPerTeam} timeouts.`);
      }
      commitElapsedBeforeTransition();
      const tMs = Math.max(5, next.rules.timeoutDurationSeconds) * 1000;
      c.status = 'TIMEOUT';
      c.timeoutActive = true;
      c.timeoutTeam = command.team;
      c.timeoutDurationMs = tMs;
      c.timeoutRemainingMs = tMs;
      c.timeoutStartedAtIso = nowIso;
      if (command.team === 'A') c.timeoutCountA += 1;
      else c.timeoutCountB += 1;
      label = `Official Timeout called by Team ${command.team}`;
      break;
    }
    case 'END_TIMEOUT': {
      c.timeoutActive = false;
      c.timeoutTeam = '';
      c.timeoutRemainingMs = 0;
      c.timeoutStartedAtIso = null;
      c.status = 'RUNNING';
      c.lastStartedAtIso = nowIso;
      label = 'Timeout ended — Match resumed';
      break;
    }
    case 'SUSPEND_MATCH': {
      commitElapsedBeforeTransition();
      c.status = 'SUSPENDED';
      c.suspendedReason = command.reason?.trim() || 'Match temporarily suspended';
      label = `Match suspended: ${c.suspendedReason}`;
      break;
    }
    case 'RESUME_MATCH': {
      c.status = 'RUNNING';
      c.suspendedReason = '';
      c.lastStartedAtIso = nowIso;
      label = 'Match resumed from suspension';
      break;
    }
    case 'SIDE_CHANGE': {
      c.sideSwapped = !c.sideSwapped;
      label = c.sideSwapped ? 'Court sides swapped (B ← | → A)' : 'Court sides restored (A ← | → B)';
      break;
    }
    case 'COMPLETE_CLOCK': {
      commitElapsedBeforeTransition();
      c.status = 'COMPLETED';
      c.halfLabel = 'Full Time';
      c.matchEndedAtIso = nowIso;
      c.timeoutActive = false;
      next.half = 'Full Time';
      next.matchCompleted = true;
      label = 'Match clock locked (Full Time)';
      break;
    }
  }

  const finalEff = computeEffectiveKabaddiClock({ ...next, clock: c }, nowMs);
  next.clock = c;
  next.timerMinutes = finalEff.timerMinutes;
  next.timerSeconds = finalEff.timerSeconds;

  return { details: next, label };
}

export type KabaddiExtraPointReason =
  | 'Raider self-out'
  | 'Defender self-out'
  | 'Technical point'
  | 'Penalty point'
  | 'Score correction'
  | 'Other';

export type KabaddiEngineActionPayload =
  | {
      type: 'TOUCH_POINT';
      team: KabaddiSide;
      raiderId?: string;
      raiderName?: string;
      defenderId?: string;
      defenderName?: string;
      clockText?: string;
    }
  | {
      type: 'EMPTY_RAID';
      team: KabaddiSide;
      raiderId?: string;
      raiderName?: string;
      clockText?: string;
    }
  | {
      type: 'UNSUCCESSFUL_RAID';
      team: KabaddiSide; // Raiding team whose raid was unsuccessful
      raiderId?: string;
      raiderName?: string;
      defenderId?: string;
      defenderName?: string;
      clockText?: string;
    }
  | {
      type: 'TACKLE_POINT';
      team: KabaddiSide; // Defending team earning the tackle point
      defenderId?: string;
      defenderName?: string;
      raiderId?: string;
      raiderName?: string;
      clockText?: string;
    }
  | {
      type: 'BONUS_POINT';
      team: KabaddiSide;
      raiderId?: string;
      raiderName?: string;
      clockText?: string;
    }
  | {
      type: 'MULTI_POINT_RAID';
      team: KabaddiSide;
      touchPoints: number;
      includeBonus?: boolean;
      raiderId?: string;
      raiderName?: string;
      defenderIds?: string[];
      defenderNames?: string[];
      clockText?: string;
    }
  | {
      type: 'SUPER_TACKLE';
      team: KabaddiSide; // Defending team executing the super tackle
      raiderId?: string;
      raiderName?: string;
      defenderId?: string;
      defenderName?: string;
      allowBelowThresholdOverride?: boolean;
      clockText?: string;
    }
  | {
      type: 'DO_OR_DIE_TRIGGER';
      team: KabaddiSide;
      triggerType?: 'MANUAL' | 'AUTO';
    }
  | {
      type: 'CLEAR_DO_OR_DIE';
    }
  | {
      type: 'EXTRA_POINTS';
      team: KabaddiSide;
      points: number;
      reason: KabaddiExtraPointReason | string;
      playerId?: string;
      playerName?: string;
      markPlayerOut?: boolean;
      outTeam?: KabaddiSide;
      outPlayerId?: string;
      clockText?: string;
    }
  | {
      type: 'SUBSTITUTION';
      team: KabaddiSide;
      playerOutId: string;
      playerInId: string;
    }
  | {
      type: 'CARD';
      team: KabaddiSide;
      playerId: string;
      cardType: 'GREEN' | 'YELLOW' | 'RED' | 'CUSTOM';
      customLabel?: string;
      actionImpact: 'WARNING' | 'SUSPEND' | 'DISQUALIFY';
      pointsToOpponent?: number;
      note?: string;
    }
  | {
      type: 'INJURY';
      team: KabaddiSide;
      playerId: string;
      status: 'INJURED' | 'ON_COURT';
      note?: string;
    }
  | {
      type: 'SET_RAIDING_TEAM';
      team: KabaddiSide;
    }
  | {
      type: 'SYNC_ROSTER';
      teamAPlayers: Array<{ playerId: string; name: string; jerseyNumber?: number | string; role?: string }>;
      teamBPlayers: Array<{ playerId: string; name: string; jerseyNumber?: number | string; role?: string }>;
    }
  | {
      type: 'MANUAL_SCORE_CORRECTION';
      teamAScore: number;
      teamBScore: number;
      reason: string;
    }
  | {
      type: 'SET_PRE_MATCH_SETUP';
      tossWinner?: KabaddiSide | '';
      tossDecision?: 'RAID' | 'COURT' | '';
      startingRaidingTeam?: KabaddiSide;
      sideSwapped?: boolean;
    };

export interface KabaddiEngineResult {
  details: KabaddiDetails;
  teamAScore: number;
  teamBScore: number;
  label: string;
  pointsAwarded: number;
  awardingTeam: KabaddiSide | '';
  eventCategory: string;
  eventType: string;
  triggeredDoOrDie?: KabaddiDoOrDieState | null;
  triggeredAllOut?: KabaddiAllOutBanner | null;
  playerStatDeltas: Record<string, Record<string, number>>;
}

function addPlayerStatDelta(
  deltas: Record<string, Record<string, number>>,
  players: KabaddiCourtPlayer[],
  playerId: string | undefined,
  statChanges: Partial<KabaddiPlayerStats>
) {
  if (!playerId) return;
  const target = players.find((p) => p.playerId === playerId);
  if (target) {
    for (const [k, v] of Object.entries(statChanges)) {
      if (typeof v === 'number' && v !== 0) {
        (target.stats as any)[k] = Math.max(0, ((target.stats as any)[k] || 0) + v);
      }
    }
  }
  // Only persist PlayerMatchStat deltas for real DB player IDs (not synthetic slot_a_1 placeholders)
  if (!playerId.startsWith('slot_')) {
    deltas[playerId] = deltas[playerId] || {};
    for (const [k, v] of Object.entries(statChanges)) {
      if (typeof v === 'number' && v !== 0) {
        deltas[playerId][k] = (deltas[playerId][k] || 0) + v;
      }
    }
  }
}

function recountCourtPlayers(details: KabaddiDetails) {
  details.playersOnCourtA = details.courtPlayersA.filter((p) => p.status === 'ON_COURT').length;
  details.playersOnCourtB = details.courtPlayersB.filter((p) => p.status === 'ON_COURT').length;
  details.teamA.playersOut = details.courtPlayersA.filter((p) => p.status === 'OUT').length;
  details.teamB.playersOut = details.courtPlayersB.filter((p) => p.status === 'OUT').length;
}

function markDefendersOut(
  details: KabaddiDetails,
  targetTeam: KabaddiSide,
  count: number,
  explicitIds: string[] = [],
  statDeltas: Record<string, Record<string, number>>
): string[] {
  const list = targetTeam === 'A' ? details.courtPlayersA : details.courtPlayersB;
  const queue = targetTeam === 'A' ? details.revivalQueueA : details.revivalQueueB;
  const markedNames: string[] = [];

  for (const id of explicitIds) {
    if (markedNames.length >= count) break;
    const p = list.find((item) => item.playerId === id && item.status === 'ON_COURT');
    if (p) {
      p.status = 'OUT';
      if (!queue.includes(p.playerId)) queue.push(p.playerId);
      addPlayerStatDelta(statDeltas, list, p.playerId, { outCount: 1 });
      markedNames.push(p.name);
    }
  }

  while (markedNames.length < count) {
    const candidate = list.find((item) => item.status === 'ON_COURT');
    if (!candidate) break;
    candidate.status = 'OUT';
    if (!queue.includes(candidate.playerId)) queue.push(candidate.playerId);
    addPlayerStatDelta(statDeltas, list, candidate.playerId, { outCount: 1 });
    markedNames.push(candidate.name);
  }

  recountCourtPlayers(details);
  return markedNames;
}

function processRevivals(
  details: KabaddiDetails,
  beneficiaryTeam: KabaddiSide,
  count: number,
  statDeltas: Record<string, Record<string, number>>
): string[] {
  if (count <= 0) return [];
  const list = beneficiaryTeam === 'A' ? details.courtPlayersA : details.courtPlayersB;
  const queue = beneficiaryTeam === 'A' ? details.revivalQueueA : details.revivalQueueB;
  const revivedNames: string[] = [];
  const maxCourt = Math.max(1, details.rules.playersPerSide);

  let remaining = count;
  while (remaining > 0) {
    const currentlyActive = list.filter((p) => p.status === 'ON_COURT').length;
    if (currentlyActive >= maxCourt) break;

    let playerToRevive: KabaddiCourtPlayer | undefined;
    while (queue.length > 0 && !playerToRevive) {
      const nextId = queue.shift()!;
      const found = list.find((p) => p.playerId === nextId && p.status === 'OUT');
      if (found) playerToRevive = found;
    }
    if (!playerToRevive) {
      playerToRevive = list.find((p) => p.status === 'OUT');
    }
    if (!playerToRevive) break;

    playerToRevive.status = 'ON_COURT';
    addPlayerStatDelta(statDeltas, list, playerToRevive.playerId, { revivals: 1 });
    revivedNames.push(playerToRevive.name);
    remaining -= 1;
  }

  recountCourtPlayers(details);
  return revivedNames;
}

function checkAndProcessAllOut(
  details: KabaddiDetails,
  attackingTeam: KabaddiSide,
  affectedTeam: KabaddiSide,
  nowIso: string
): KabaddiAllOutBanner | null {
  const affectedList = affectedTeam === 'A' ? details.courtPlayersA : details.courtPlayersB;
  const activeLeft = affectedList.filter((p) => p.status === 'ON_COURT').length;
  if (activeLeft > 0) return null;

  // All-out applies only when at least one player was put OUT (not if team had zero active due to injury/disqualification without outs)
  const hadOutPlayers = affectedList.some((p) => p.status === 'OUT');
  if (!hadOutPlayers) return null;

  const aoPts = Math.max(1, details.rules.allOutBonusPoints || 2);
  const attackerBreakdown = attackingTeam === 'A' ? details.teamA : details.teamB;
  attackerBreakdown.allOutPoints = (attackerBreakdown.allOutPoints || 0) + aoPts;
  attackerBreakdown.allOutsInflicted = (attackerBreakdown.allOutsInflicted || 0) + 1;

  // Restore all OUT players (preserve DISQUALIFIED / SUSPENDED / INJURED) up to playersPerSide
  let restored = 0;
  for (const p of affectedList) {
    if (p.status === 'OUT' && restored < details.rules.playersPerSide) {
      p.status = 'ON_COURT';
      restored += 1;
    }
  }
  if (affectedTeam === 'A') details.revivalQueueA = [];
  else details.revivalQueueB = [];

  if (affectedTeam === 'A') {
    details.consecutiveEmptyRaidsA = 0;
    details.pendingDoOrDieA = false;
  } else {
    details.consecutiveEmptyRaidsB = 0;
    details.pendingDoOrDieB = false;
  }

  recountCourtPlayers(details);

  const banner: KabaddiAllOutBanner = {
    eventId: makeEventUuid(),
    awardingTeam: attackingTeam,
    affectedTeam,
    pointsAwarded: aoPts,
    triggeredAtIso: nowIso,
  };
  details.lastAllOut = banner;
  return banner;
}

export function applyKabaddiEngineAction(
  rawDetails: Partial<KabaddiDetails> | Record<string, unknown> | undefined | null,
  currentTeamAScore: number,
  currentTeamBScore: number,
  action: KabaddiEngineActionPayload,
  nowMs: number = Date.now()
): KabaddiEngineResult {
  const next = normalizeKabaddiDetails(rawDetails);
  const nowIso = new Date(nowMs).toISOString();
  const effClock = computeEffectiveKabaddiClock(next, nowMs);
  let teamAScore = Math.max(0, currentTeamAScore || 0);
  let teamBScore = Math.max(0, currentTeamBScore || 0);
  const statDeltas: Record<string, Record<string, number>> = {};

  const addTeamPoints = (side: KabaddiSide, pts: number) => {
    if (side === 'A') teamAScore = Math.max(0, teamAScore + pts);
    else teamBScore = Math.max(0, teamBScore + pts);
  };

  let label = 'Kabaddi event recorded';
  let pointsAwarded = 0;
  let awardingTeam: KabaddiSide | '' = '';
  let eventCategory = 'KABADDI';
  let eventType: string = action.type;
  let triggeredDoOrDie: KabaddiDoOrDieState | null = null;
  let triggeredAllOut: KabaddiAllOutBanner | null = null;

  const resetRaidClockAfterRaid = () => {
    if (next.clock.raidTimerEnabled) {
      const raidMs = Math.max(5, next.rules.raidTimerSeconds) * 1000;
      next.clock.raidDurationMs = raidMs;
      next.clock.raidRemainingMs = raidMs;
      const matchRunning =
        next.clock.status === 'RUNNING' || next.clock.status === 'EXTRA_TIME';
      next.clock.raidRunning = matchRunning;
      next.clock.raidStartedAtIso = matchRunning ? nowIso : null;
    }
  };

  const clearActiveDoOrDie = (onlyIfTeam?: KabaddiSide) => {
    if (!next.doOrDie.active) return;
    if (onlyIfTeam && next.doOrDie.team !== onlyIfTeam) return;
    next.doOrDie = {
      active: false,
      team: '',
      triggeredAtIso: null,
      expiresAtIso: null,
      eventId: '',
      triggerType: 'AUTO',
    };
  };

  const clearEmptyStreak = (side: KabaddiSide) => {
    if (side === 'A') next.consecutiveEmptyRaidsA = 0;
    else next.consecutiveEmptyRaidsB = 0;
  };

  const clearPendingDoOrDie = (side: KabaddiSide) => {
    if (side === 'A') next.pendingDoOrDieA = false;
    else next.pendingDoOrDieB = false;
  };

  const activateDoOrDieIfPending = (incomingTeam: KabaddiSide) => {
    const isPending = incomingTeam === 'A' ? next.pendingDoOrDieA : next.pendingDoOrDieB;
    if (!isPending) return;
    clearPendingDoOrDie(incomingTeam);
    const expIso = new Date(
      nowMs + Math.max(2, next.rules.doOrDieBannerDurationSec || 10) * 1000
    ).toISOString();
    next.doOrDie = {
      active: true,
      team: incomingTeam,
      triggeredAtIso: nowIso,
      expiresAtIso: expIso,
      eventId: makeEventUuid(),
      triggerType: 'AUTO',
    };
    const incBreakdown = incomingTeam === 'A' ? next.teamA : next.teamB;
    incBreakdown.doOrDieRaids += 1;
    triggeredDoOrDie = next.doOrDie;
  };

  switch (action.type) {
    case 'TOUCH_POINT': {
      const team = action.team;
      const opp: KabaddiSide = team === 'A' ? 'B' : 'A';
      const pts = Math.max(1, next.rules.touchPointValue || 1);
      const teamBreakdown = team === 'A' ? next.teamA : next.teamB;
      const teamPlayers = team === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const wasDoOrDie = next.doOrDie.active && next.doOrDie.team === team;

      teamBreakdown.raidPoints += pts;
      addTeamPoints(team, pts);
      pointsAwarded = pts;
      awardingTeam = team;
      eventCategory = 'RAID';
      eventType = 'TOUCH_POINT';

      const outNames = markDefendersOut(
        next,
        opp,
        1,
        action.defenderId ? [action.defenderId] : [],
        statDeltas
      );
      const revivedNames = processRevivals(next, team, 1, statDeltas);

      if (action.raiderId) {
        addPlayerStatDelta(statDeltas, teamPlayers, action.raiderId, {
          raidPoints: pts,
          totalPoints: pts,
          raidsAttempted: 1,
          successfulRaids: 1,
        });
      }

      clearActiveDoOrDie(team);
      clearPendingDoOrDie(team);
      clearEmptyStreak(team);
      triggeredAllOut = checkAndProcessAllOut(next, team, opp, nowIso);
      if (triggeredAllOut) {
        addTeamPoints(team, triggeredAllOut.pointsAwarded);
        pointsAwarded += triggeredAllOut.pointsAwarded;
      }

      next.raidNumber += 1;
      next.activeRaidingTeam = opp;
      activateDoOrDieIfPending(opp);
      resetRaidClockAfterRaid();

      label = `Team ${team} Touch Point (+${pts})${action.raiderName ? ` · ${action.raiderName}` : ''}${triggeredAllOut ? ` + ALL-OUT (+${triggeredAllOut.pointsAwarded})` : ''}`;

      next.raidTimeline = [
        {
          id: makeEventUuid(),
          raidNumber: next.raidNumber,
          team,
          category: 'RAID',
          eventType: 'TOUCH_POINT',
          points: pointsAwarded,
          touchPoints: pts,
          allOutPoints: triggeredAllOut?.pointsAwarded || 0,
          playerId: action.raiderId,
          playerName: action.raiderName || '',
          defenderNames: outNames,
          revivedNames,
          description: label,
          half: next.clock.halfLabel || next.half,
          clockText: action.clockText || effClock.formattedClock,
          scoreSnapshot: `${teamAScore}-${teamBScore}`,
          isDoOrDie: wasDoOrDie,
          isAllOut: Boolean(triggeredAllOut),
          timestamp: nowIso,
        },
        ...next.raidTimeline.slice(0, 79),
      ];
      break;
    }

    case 'EMPTY_RAID': {
      const team = action.team;
      const opp: KabaddiSide = team === 'A' ? 'B' : 'A';
      const teamBreakdown = team === 'A' ? next.teamA : next.teamB;
      const teamPlayers = team === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const wasDoOrDieForTeam = next.doOrDie.active && next.doOrDie.team === team;

      teamBreakdown.emptyRaids += 1;
      eventCategory = 'RAID';
      eventType = 'EMPTY_RAID';
      pointsAwarded = 0;

      if (action.raiderId) {
        addPlayerStatDelta(statDeltas, teamPlayers, action.raiderId, {
          raidsAttempted: 1,
          emptyRaids: 1,
        });
      }

      let newStreak = 0;
      let queuedDoOrDieNextRaid = false;
      if (wasDoOrDieForTeam) {
        clearActiveDoOrDie(team);
        clearPendingDoOrDie(team);
        clearEmptyStreak(team);
      } else {
        const prevStreak = team === 'A' ? next.consecutiveEmptyRaidsA : next.consecutiveEmptyRaidsB;
        newStreak = prevStreak + 1;
        if (team === 'A') next.consecutiveEmptyRaidsA = newStreak;
        else next.consecutiveEmptyRaidsB = newStreak;

        const threshold = Math.max(1, next.rules.doOrDieConsecutiveEmptyThreshold || 2);
        if (newStreak >= threshold) {
          if (team === 'A') next.pendingDoOrDieA = true;
          else next.pendingDoOrDieB = true;
          queuedDoOrDieNextRaid = true;
        }
      }

      next.raidNumber += 1;
      next.activeRaidingTeam = opp;
      activateDoOrDieIfPending(opp);
      resetRaidClockAfterRaid();

      label = wasDoOrDieForTeam
        ? `Team ${team} Do-or-Die Empty Raid${action.raiderName ? ` · ${action.raiderName}` : ''}`
        : `Team ${team} Empty Raid (${newStreak} consecutive)${action.raiderName ? ` · ${action.raiderName}` : ''}${queuedDoOrDieNextRaid ? ' — NEXT RAID DO-OR-DIE!' : ''}`;

      next.raidTimeline = [
        {
          id: makeEventUuid(),
          raidNumber: next.raidNumber,
          team,
          category: 'RAID',
          eventType: 'EMPTY_RAID',
          points: 0,
          playerId: action.raiderId,
          playerName: action.raiderName || '',
          description: label,
          half: next.clock.halfLabel || next.half,
          clockText: action.clockText || effClock.formattedClock,
          scoreSnapshot: `${teamAScore}-${teamBScore}`,
          isDoOrDie: wasDoOrDieForTeam || queuedDoOrDieNextRaid,
          timestamp: nowIso,
        },
        ...next.raidTimeline.slice(0, 79),
      ];
      break;
    }

    case 'TACKLE_POINT':
    case 'UNSUCCESSFUL_RAID': {
      const defendingTeam: KabaddiSide =
        action.type === 'TACKLE_POINT' ? action.team : action.team === 'A' ? 'B' : 'A';
      const raidingTeam: KabaddiSide = defendingTeam === 'A' ? 'B' : 'A';
      const defBreakdown = defendingTeam === 'A' ? next.teamA : next.teamB;
      const raidingPlayers = raidingTeam === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const defendingPlayers = defendingTeam === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const defPts = Math.max(1, next.rules.unsuccessfulRaidDefenderPoints || 1);
      const wasDoOrDie = next.doOrDie.active && next.doOrDie.team === raidingTeam;

      defBreakdown.tacklePoints += defPts;
      addTeamPoints(defendingTeam, defPts);
      pointsAwarded = defPts;
      awardingTeam = defendingTeam;
      eventCategory = 'TACKLE';
      eventType = action.type === 'TACKLE_POINT' ? 'TACKLE_POINT' : 'UNSUCCESSFUL_RAID';

      const outNames = markDefendersOut(
        next,
        raidingTeam,
        1,
        action.raiderId ? [action.raiderId] : [],
        statDeltas
      );
      const revivedNames = processRevivals(next, defendingTeam, 1, statDeltas);

      if (action.raiderId) {
        addPlayerStatDelta(statDeltas, raidingPlayers, action.raiderId, {
          raidsAttempted: 1,
        });
      }
      if (action.defenderId) {
        addPlayerStatDelta(statDeltas, defendingPlayers, action.defenderId, {
          tacklePoints: defPts,
          totalPoints: defPts,
          raidersTackled: 1,
        });
      }

      clearActiveDoOrDie(raidingTeam);
      clearPendingDoOrDie(raidingTeam);
      clearEmptyStreak(raidingTeam);
      triggeredAllOut = checkAndProcessAllOut(next, defendingTeam, raidingTeam, nowIso);
      if (triggeredAllOut) {
        addTeamPoints(defendingTeam, triggeredAllOut.pointsAwarded);
        pointsAwarded += triggeredAllOut.pointsAwarded;
      }

      next.raidNumber += 1;
      next.activeRaidingTeam = defendingTeam;
      activateDoOrDieIfPending(defendingTeam);
      resetRaidClockAfterRaid();

      label = `Team ${defendingTeam} Tackle Point (+${defPts})${action.defenderName ? ` · ${action.defenderName}` : ''}${action.raiderName ? ` (${action.raiderName} out)` : ''}${triggeredAllOut ? ` + ALL-OUT (+${triggeredAllOut.pointsAwarded})` : ''}`;

      next.raidTimeline = [
        {
          id: makeEventUuid(),
          raidNumber: next.raidNumber,
          team: defendingTeam,
          category: 'TACKLE',
          eventType,
          points: pointsAwarded,
          tacklePoints: defPts,
          allOutPoints: triggeredAllOut?.pointsAwarded || 0,
          playerId: action.defenderId || action.raiderId,
          playerName: action.defenderName || action.raiderName || '',
          defenderNames: outNames,
          revivedNames,
          description: label,
          half: next.clock.halfLabel || next.half,
          clockText: action.clockText || effClock.formattedClock,
          scoreSnapshot: `${teamAScore}-${teamBScore}`,
          isDoOrDie: wasDoOrDie,
          isAllOut: Boolean(triggeredAllOut),
          timestamp: nowIso,
        },
        ...next.raidTimeline.slice(0, 79),
      ];
      break;
    }

    case 'BONUS_POINT': {
      const team = action.team;
      const opp: KabaddiSide = team === 'A' ? 'B' : 'A';
      const bp = Math.max(1, next.rules.bonusPointValue || 1);
      const teamBreakdown = team === 'A' ? next.teamA : next.teamB;
      const teamPlayers = team === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const wasDoOrDie = next.doOrDie.active && next.doOrDie.team === team;

      // Bonus point ONLY adds point; NO defender out and NO revival
      teamBreakdown.bonusPoints += bp;
      addTeamPoints(team, bp);
      pointsAwarded = bp;
      awardingTeam = team;
      eventCategory = 'RAID';
      eventType = 'BONUS_POINT';

      if (action.raiderId) {
        addPlayerStatDelta(statDeltas, teamPlayers, action.raiderId, {
          bonusPoints: bp,
          totalPoints: bp,
          raidsAttempted: 1,
          successfulRaids: 1,
        });
      }

      clearActiveDoOrDie(team);
      clearPendingDoOrDie(team);
      clearEmptyStreak(team);
      next.raidNumber += 1;
      next.activeRaidingTeam = opp;
      activateDoOrDieIfPending(opp);
      resetRaidClockAfterRaid();

      label = `Team ${team} Bonus Point (+${bp})${action.raiderName ? ` · ${action.raiderName}` : ''}`;

      next.raidTimeline = [
        {
          id: makeEventUuid(),
          raidNumber: next.raidNumber,
          team,
          category: 'RAID',
          eventType: 'BONUS_POINT',
          points: bp,
          bonusPoints: bp,
          playerId: action.raiderId,
          playerName: action.raiderName || '',
          description: label,
          half: next.clock.halfLabel || next.half,
          clockText: action.clockText || effClock.formattedClock,
          scoreSnapshot: `${teamAScore}-${teamBScore}`,
          isDoOrDie: wasDoOrDie,
          timestamp: nowIso,
        },
        ...next.raidTimeline.slice(0, 79),
      ];
      break;
    }

    case 'MULTI_POINT_RAID': {
      const team = action.team;
      const opp: KabaddiSide = team === 'A' ? 'B' : 'A';
      const touchCount = Math.max(1, Math.min(9, Math.trunc(action.touchPoints || 1)));
      const touchPts = touchCount * Math.max(1, next.rules.touchPointValue || 1);
      const bonusPts = action.includeBonus ? Math.max(1, next.rules.bonusPointValue || 1) : 0;
      const totalRaidPts = touchPts + bonusPts;
      const isSuperRaid = totalRaidPts >= Math.max(2, next.rules.superRaidMinTotalPoints || 3);
      const wasDoOrDie = next.doOrDie.active && next.doOrDie.team === team;

      const teamBreakdown = team === 'A' ? next.teamA : next.teamB;
      const teamPlayers = team === 'A' ? next.courtPlayersA : next.courtPlayersB;

      teamBreakdown.raidPoints += touchPts;
      if (bonusPts > 0) teamBreakdown.bonusPoints += bonusPts;
      if (isSuperRaid) {
        teamBreakdown.superRaids += 1;
        next.superRaidNote = `Team ${team} Super Raid (+${totalRaidPts})${action.raiderName ? ` · ${action.raiderName}` : ''}`;
      }
      addTeamPoints(team, totalRaidPts);
      pointsAwarded = totalRaidPts;
      awardingTeam = team;
      eventCategory = 'RAID';
      eventType = isSuperRaid ? 'SUPER_RAID' : 'MULTI_POINT_RAID';

      // Defenders out and revivals are driven STRICTLY by touchCount (never bonusPts)
      const outNames = markDefendersOut(
        next,
        opp,
        touchCount,
        action.defenderIds || [],
        statDeltas
      );
      const revivedNames = processRevivals(next, team, touchCount, statDeltas);

      if (action.raiderId) {
        addPlayerStatDelta(statDeltas, teamPlayers, action.raiderId, {
          raidPoints: touchPts,
          bonusPoints: bonusPts,
          totalPoints: totalRaidPts,
          raidsAttempted: 1,
          successfulRaids: 1,
          superRaids: isSuperRaid ? 1 : 0,
        });
      }

      clearActiveDoOrDie(team);
      clearPendingDoOrDie(team);
      clearEmptyStreak(team);
      triggeredAllOut = checkAndProcessAllOut(next, team, opp, nowIso);
      if (triggeredAllOut) {
        addTeamPoints(team, triggeredAllOut.pointsAwarded);
        pointsAwarded += triggeredAllOut.pointsAwarded;
      }

      next.raidNumber += 1;
      next.activeRaidingTeam = opp;
      activateDoOrDieIfPending(opp);
      resetRaidClockAfterRaid();

      label = `Team ${team} ${isSuperRaid ? 'Super Raid' : 'Multi-Point Raid'} (+${totalRaidPts}: ${touchPts}T${bonusPts ? `+${bonusPts}B` : ''})${action.raiderName ? ` · ${action.raiderName}` : ''}${triggeredAllOut ? ` + ALL-OUT (+${triggeredAllOut.pointsAwarded})` : ''}`;

      next.raidTimeline = [
        {
          id: makeEventUuid(),
          raidNumber: next.raidNumber,
          team,
          category: 'RAID',
          eventType,
          points: pointsAwarded,
          touchPoints: touchPts,
          bonusPoints: bonusPts,
          allOutPoints: triggeredAllOut?.pointsAwarded || 0,
          playerId: action.raiderId,
          playerName: action.raiderName || '',
          defenderNames: action.defenderNames?.length ? action.defenderNames : outNames,
          revivedNames,
          description: label,
          half: next.clock.halfLabel || next.half,
          clockText: action.clockText || effClock.formattedClock,
          scoreSnapshot: `${teamAScore}-${teamBScore}`,
          isDoOrDie: wasDoOrDie,
          isSuperRaid,
          isAllOut: Boolean(triggeredAllOut),
          timestamp: nowIso,
        },
        ...next.raidTimeline.slice(0, 79),
      ];
      break;
    }

    case 'SUPER_TACKLE': {
      const defTeam = action.team;
      const raidTeam: KabaddiSide = defTeam === 'A' ? 'B' : 'A';
      const activeDefenders =
        defTeam === 'A' ? next.playersOnCourtA : next.playersOnCourtB;
      const maxEligible = Math.max(1, next.rules.superTackleMaxDefenders || 3);
      if (!action.allowBelowThresholdOverride && activeDefenders > maxEligible) {
        throw new Error(
          `Super Tackle requires ${maxEligible} or fewer defenders on court for Team ${defTeam} (currently ${activeDefenders} active).`
        );
      }

      const stPts = Math.max(1, next.rules.superTacklePoints || 2);
      const revivalsCount = Math.max(0, next.rules.superTackleRevivalCount ?? 1);
      const defBreakdown = defTeam === 'A' ? next.teamA : next.teamB;
      const defPlayers = defTeam === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const raidPlayers = raidTeam === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const wasDoOrDie = next.doOrDie.active && next.doOrDie.team === raidTeam;

      defBreakdown.superTackles += 1;
      defBreakdown.tacklePoints += stPts;
      addTeamPoints(defTeam, stPts);
      pointsAwarded = stPts;
      awardingTeam = defTeam;
      eventCategory = 'TACKLE';
      eventType = 'SUPER_TACKLE';

      const outNames = markDefendersOut(
        next,
        raidTeam,
        1,
        action.raiderId ? [action.raiderId] : [],
        statDeltas
      );
      const revivedNames = processRevivals(next, defTeam, revivalsCount, statDeltas);

      if (action.defenderId) {
        addPlayerStatDelta(statDeltas, defPlayers, action.defenderId, {
          tacklePoints: stPts,
          totalPoints: stPts,
          raidersTackled: 1,
          superTackles: 1,
        });
      }
      if (action.raiderId) {
        addPlayerStatDelta(statDeltas, raidPlayers, action.raiderId, {
          raidsAttempted: 1,
        });
      }

      clearActiveDoOrDie(raidTeam);
      clearPendingDoOrDie(raidTeam);
      clearEmptyStreak(raidTeam);
      triggeredAllOut = checkAndProcessAllOut(next, defTeam, raidTeam, nowIso);
      if (triggeredAllOut) {
        addTeamPoints(defTeam, triggeredAllOut.pointsAwarded);
        pointsAwarded += triggeredAllOut.pointsAwarded;
      }

      next.raidNumber += 1;
      next.activeRaidingTeam = defTeam;
      activateDoOrDieIfPending(defTeam);
      resetRaidClockAfterRaid();

      label = `Team ${defTeam} Super Tackle (+${stPts})${action.defenderName ? ` · ${action.defenderName}` : ''}${triggeredAllOut ? ` + ALL-OUT (+${triggeredAllOut.pointsAwarded})` : ''}`;

      next.raidTimeline = [
        {
          id: makeEventUuid(),
          raidNumber: next.raidNumber,
          team: defTeam,
          category: 'TACKLE',
          eventType: 'SUPER_TACKLE',
          points: pointsAwarded,
          tacklePoints: stPts,
          allOutPoints: triggeredAllOut?.pointsAwarded || 0,
          playerId: action.defenderId || action.raiderId,
          playerName: action.defenderName || action.raiderName || '',
          defenderNames: outNames,
          revivedNames,
          description: label,
          half: next.clock.halfLabel || next.half,
          clockText: action.clockText || effClock.formattedClock,
          scoreSnapshot: `${teamAScore}-${teamBScore}`,
          isDoOrDie: wasDoOrDie,
          isSuperTackle: true,
          isAllOut: Boolean(triggeredAllOut),
          timestamp: nowIso,
        },
        ...next.raidTimeline.slice(0, 79),
      ];
      break;
    }

    case 'DO_OR_DIE_TRIGGER': {
      const team = action.team;
      if (next.doOrDie.active && next.doOrDie.team === team) {
        throw new Error(`Do-or-Die Raid is already active for Team ${team}.`);
      }
      clearPendingDoOrDie(team);
      const expIso = new Date(
        nowMs + Math.max(2, next.rules.doOrDieBannerDurationSec || 10) * 1000
      ).toISOString();
      next.doOrDie = {
        active: true,
        team,
        triggeredAtIso: nowIso,
        expiresAtIso: expIso,
        eventId: makeEventUuid(),
        triggerType: action.triggerType || 'MANUAL',
      };
      next.activeRaidingTeam = team;
      const b = team === 'A' ? next.teamA : next.teamB;
      b.doOrDieRaids += 1;
      triggeredDoOrDie = next.doOrDie;
      eventCategory = 'RAID';
      eventType = 'DO_OR_DIE_RAID';
      label = `Team ${team} DO-OR-DIE RAID Triggered`;
      break;
    }

    case 'CLEAR_DO_OR_DIE': {
      clearActiveDoOrDie();
      eventCategory = 'META';
      eventType = 'CLEAR_DO_OR_DIE';
      label = 'Do-or-Die banner cleared';
      break;
    }

    case 'EXTRA_POINTS': {
      const team = action.team;
      const pts = Math.max(0, Math.min(25, Math.trunc(action.points || 0)));
      const b = team === 'A' ? next.teamA : next.teamB;
      const reasonStr = String(action.reason || 'Technical point').trim();
      const lowerReason = reasonStr.toLowerCase();

      if (lowerReason.includes('penalty')) {
        b.penaltyPoints += pts;
        eventType = 'PENALTY_POINT';
      } else {
        b.technicalPoints += pts;
        eventType = 'TECHNICAL_POINT';
      }
      addTeamPoints(team, pts);
      pointsAwarded = pts;
      awardingTeam = team;
      eventCategory = 'OTHER';

      if (action.playerId && pts > 0) {
        const playersList = team === 'A' ? next.courtPlayersA : next.courtPlayersB;
        addPlayerStatDelta(statDeltas, playersList, action.playerId, {
          totalPoints: pts,
        });
      }

      let outNames: string[] = [];
      if (action.markPlayerOut) {
        const outTargetSide: KabaddiSide =
          action.outTeam || (lowerReason.includes('raider') || lowerReason.includes('defender') ? (team === 'A' ? 'B' : 'A') : team === 'A' ? 'B' : 'A');
        outNames = markDefendersOut(
          next,
          outTargetSide,
          1,
          action.outPlayerId ? [action.outPlayerId] : [],
          statDeltas
        );
        triggeredAllOut = checkAndProcessAllOut(next, team, outTargetSide, nowIso);
        if (triggeredAllOut) {
          addTeamPoints(team, triggeredAllOut.pointsAwarded);
          pointsAwarded += triggeredAllOut.pointsAwarded;
        }
      }

      clearActiveDoOrDie();
      label = `Team ${team} Extra Points (+${pts}: ${reasonStr})${action.playerName ? ` · ${action.playerName}` : ''}`;

      next.raidTimeline = [
        {
          id: makeEventUuid(),
          raidNumber: next.raidNumber,
          team,
          category: 'OTHER',
          eventType,
          points: pointsAwarded,
          allOutPoints: triggeredAllOut?.pointsAwarded || 0,
          playerId: action.playerId,
          playerName: action.playerName || '',
          defenderNames: outNames,
          description: label,
          half: next.clock.halfLabel || next.half,
          clockText: action.clockText || effClock.formattedClock,
          scoreSnapshot: `${teamAScore}-${teamBScore}`,
          isAllOut: Boolean(triggeredAllOut),
          timestamp: nowIso,
        },
        ...next.raidTimeline.slice(0, 79),
      ];
      break;
    }

    case 'SUBSTITUTION': {
      const list = action.team === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const pOut = list.find((p) => p.playerId === action.playerOutId);
      const pIn = list.find((p) => p.playerId === action.playerInId);
      if (!pOut || !pIn) {
        throw new Error('Selected players not found for substitution.');
      }
      if (pOut.status !== 'ON_COURT') {
        throw new Error(`${pOut.name} is not currently on court.`);
      }
      if (pIn.status !== 'BENCH') {
        throw new Error(`${pIn.name} is not currently on the bench.`);
      }
      pOut.status = 'BENCH';
      pIn.status = 'ON_COURT';
      addPlayerStatDelta(statDeltas, list, pOut.playerId, { substitutions: 1 });
      addPlayerStatDelta(statDeltas, list, pIn.playerId, { substitutions: 1 });
      recountCourtPlayers(next);
      eventCategory = 'CONTROL';
      eventType = 'SUBSTITUTION';
      label = `Team ${action.team} Substitution: ${pIn.name} IN for ${pOut.name}`;
      break;
    }

    case 'CARD': {
      const list = action.team === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const opp: KabaddiSide = action.team === 'A' ? 'B' : 'A';
      const player = list.find((p) => p.playerId === action.playerId);
      if (!player) {
        throw new Error('Player not found for disciplinary card.');
      }
      if (action.cardType === 'GREEN') player.cards.green += 1;
      else if (action.cardType === 'YELLOW') player.cards.yellow += 1;
      else if (action.cardType === 'RED') player.cards.red += 1;
      else if (action.customLabel?.trim()) {
        player.cards.custom = [...player.cards.custom, action.customLabel.trim()];
      }

      if (action.actionImpact === 'SUSPEND') {
        player.status = 'SUSPENDED';
      } else if (action.actionImpact === 'DISQUALIFY') {
        player.status = 'DISQUALIFIED';
      }

      const penaltyPts = Math.max(0, Math.trunc(action.pointsToOpponent || 0));
      if (penaltyPts > 0) {
        const oppBreakdown = opp === 'A' ? next.teamA : next.teamB;
        oppBreakdown.penaltyPoints += penaltyPts;
        addTeamPoints(opp, penaltyPts);
        pointsAwarded = penaltyPts;
        awardingTeam = opp;
      }

      recountCourtPlayers(next);
      eventCategory = 'DISCIPLINE';
      eventType = 'CARD';
      const cardText = action.cardType === 'CUSTOM' ? action.customLabel || 'Custom Card' : `${action.cardType} Card`;
      label = `Team ${action.team} ${cardText} → ${player.name} (${action.actionImpact})${penaltyPts > 0 ? ` · +${penaltyPts} Opp Penalty` : ''}`;
      break;
    }

    case 'INJURY': {
      const list = action.team === 'A' ? next.courtPlayersA : next.courtPlayersB;
      const player = list.find((p) => p.playerId === action.playerId);
      if (!player) throw new Error('Player not found.');
      player.status = action.status;
      recountCourtPlayers(next);
      eventCategory = 'CONTROL';
      eventType = 'INJURY';
      label =
        action.status === 'INJURED'
          ? `Team ${action.team} Injury Timeout/Exit: ${player.name} marked temporarily injured`
          : `Team ${action.team} Recovery: ${player.name} returned to court`;
      break;
    }

    case 'SET_RAIDING_TEAM': {
      next.activeRaidingTeam = action.team;
      activateDoOrDieIfPending(action.team);
      eventCategory = 'META';
      eventType = 'SET_RAIDING_TEAM';
      label = `Active Raiding Team switched to Team ${action.team}`;
      break;
    }

    case 'SYNC_ROSTER': {
      const mergeRoster = (
        team: KabaddiSide,
        incoming: Array<{ playerId: string; name: string; jerseyNumber?: number | string; role?: string }>,
        existing: KabaddiCourtPlayer[]
      ): KabaddiCourtPlayer[] => {
        if (incoming.length === 0) return existing;
        const existingMap = new Map(existing.map((p) => [p.playerId, p]));
        return incoming.map((row, idx) => {
          const prev = existingMap.get(row.playerId);
          if (prev) {
            return {
              ...prev,
              name: row.name,
              jerseyNumber: row.jerseyNumber ?? prev.jerseyNumber,
              role: row.role || prev.role,
            };
          }
          return {
            playerId: row.playerId,
            name: row.name,
            jerseyNumber: row.jerseyNumber ?? idx + 1,
            role: row.role || 'Player',
            team,
            status: idx < next.rules.playersPerSide ? 'ON_COURT' : 'BENCH',
            cards: { green: 0, yellow: 0, red: 0, custom: [] },
            stats: createEmptyPlayerStats(),
          };
        });
      };

      if (action.teamAPlayers.length > 0) {
        next.courtPlayersA = mergeRoster('A', action.teamAPlayers, next.courtPlayersA);
      }
      if (action.teamBPlayers.length > 0) {
        next.courtPlayersB = mergeRoster('B', action.teamBPlayers, next.courtPlayersB);
      }
      recountCourtPlayers(next);
      eventCategory = 'META';
      eventType = 'SYNC_ROSTER';
      label = 'Team rosters synced with Kabaddi court sheet';
      break;
    }

    case 'MANUAL_SCORE_CORRECTION': {
      teamAScore = Math.max(0, Math.trunc(action.teamAScore));
      teamBScore = Math.max(0, Math.trunc(action.teamBScore));
      eventCategory = 'CORRECTION';
      eventType = 'MANUAL_SCORE_CORRECTION';
      label = `Manual score correction (${teamAScore}-${teamBScore}): ${action.reason}`;
      break;
    }

    case 'SET_PRE_MATCH_SETUP': {
      if (action.tossWinner !== undefined) next.tossWinner = action.tossWinner;
      if (action.tossDecision !== undefined) next.tossDecision = action.tossDecision;
      if (action.startingRaidingTeam) {
        next.activeRaidingTeam = action.startingRaidingTeam;
      } else if (action.tossWinner === 'A' || action.tossWinner === 'B') {
        if (action.tossDecision === 'COURT') {
          next.activeRaidingTeam = action.tossWinner === 'A' ? 'B' : 'A';
          next.clock.sideSwapped = action.tossWinner === 'A';
        } else if (action.tossDecision === 'RAID') {
          next.activeRaidingTeam = action.tossWinner;
          next.clock.sideSwapped = false;
        }
      }
      if (typeof action.sideSwapped === 'boolean') {
        next.clock.sideSwapped = action.sideSwapped;
      }
      eventCategory = 'META';
      eventType = 'SET_PRE_MATCH_SETUP';
      label =
        next.tossWinner && next.tossDecision
          ? `Kabaddi Toss: Team ${next.tossWinner} chose ${next.tossDecision === 'RAID' ? 'First Raid' : 'Court Side'} (Raiding: Team ${next.activeRaidingTeam})`
          : `Kabaddi Pre-Match Setup: Team ${next.activeRaidingTeam} raids first`;
      break;
    }
  }

  return {
    details: next,
    teamAScore,
    teamBScore,
    label,
    pointsAwarded,
    awardingTeam,
    eventCategory,
    eventType,
    triggeredDoOrDie,
    triggeredAllOut,
    playerStatDeltas: statDeltas,
  };
}

// ============================================================================
// Backwards-compatible legacy action adapter (used by existing helpers/overlays)
// ============================================================================
export type KabaddiEventType =
  | 'TOUCH_POINT'
  | 'SUCCESSFUL_RAID'
  | 'EMPTY_RAID'
  | 'UNSUCCESSFUL_RAID'
  | 'BONUS_POINT'
  | 'MULTI_POINT_RAID'
  | 'SUPER_RAID'
  | 'ALL_OUT'
  | 'DO_OR_DIE_RAID'
  | 'CUSTOM_RAID'
  | 'SUCCESSFUL_TACKLE'
  | 'SUPER_TACKLE'
  | 'TEAM_TACKLE'
  | 'FAILED_TACKLE'
  | 'MULTI_POINT_TACKLE'
  | 'CUSTOM_TACKLE'
  | 'TECHNICAL_POINT'
  | 'PENALTY_POINT'
  | 'REVIVAL_OUT_ADJUST'
  | 'CUSTOM_EVENT';

export type KabaddiActionPayload =
  | {
      type: 'ADD_POINTS';
      team: 'A' | 'B';
      category:
        | 'raidPoints'
        | 'tacklePoints'
        | 'allOutPoints'
        | 'bonusPoints'
        | 'superTackles'
        | 'superRaids'
        | 'technicalPoints'
        | 'penaltyPoints';
      points: number;
      note?: string;
    }
  | {
      type: 'STRUCTURED_EVENT';
      team: 'A' | 'B';
      eventType: KabaddiEventType;
      points: number;
      bonusIncluded?: number;
      playerName?: string;
      description?: string;
      playersOutDelta?: number;
      isDoOrDie?: boolean;
    }
  | {
      type: 'SET_META';
      half?: KabaddiDetails['half'];
      timerMinutes?: number;
      timerSeconds?: number;
      superRaidNote?: string;
      isTieBreaker?: boolean;
      tieBreakerScoreA?: number;
      tieBreakerScoreB?: number;
    };

export function applyKabaddiAction(
  current: Partial<KabaddiDetails>,
  currentTeamAScore: number,
  currentTeamBScore: number,
  action: KabaddiActionPayload
): {
  details: KabaddiDetails;
  teamAScore: number;
  teamBScore: number;
  label: string;
  pointsAwarded: number;
  eventCategory: string;
  eventType: string;
} {
  const next = normalizeKabaddiDetails(current);
  let teamAScore = Math.max(0, currentTeamAScore || 0);
  let teamBScore = Math.max(0, currentTeamBScore || 0);
  let label = 'Kabaddi score updated';
  let pointsAwarded = 0;
  let eventCategory = 'KABADDI';
  let eventType: string = action.type;

  const addTeamPoints = (side: 'A' | 'B', delta: number) => {
    if (side === 'A') teamAScore = Math.max(0, teamAScore + delta);
    else teamBScore = Math.max(0, teamBScore + delta);
  };

  if (action.type === 'ADD_POINTS') {
    if (action.category === 'raidPoints' && action.points === 1) {
      const r = applyKabaddiEngineAction(next, teamAScore, teamBScore, {
        type: 'TOUCH_POINT',
        team: action.team,
      });
      return r;
    }
    if (action.category === 'bonusPoints' && action.points === 1) {
      const r = applyKabaddiEngineAction(next, teamAScore, teamBScore, {
        type: 'BONUS_POINT',
        team: action.team,
      });
      return r;
    }
    const target = action.team === 'A' ? next.teamA : next.teamB;
    const pts = Number.isFinite(action.points) ? Math.trunc(action.points) : 0;
    eventType = action.category;

    if (action.category === 'superTackles') {
      const scoreDelta = pts !== 0 ? pts : 2;
      target.superTackles = Math.max(0, (target.superTackles || 0) + (scoreDelta > 0 ? 1 : -1));
      target.tacklePoints = Math.max(0, (target.tacklePoints || 0) + scoreDelta);
      addTeamPoints(action.team, scoreDelta);
      pointsAwarded = scoreDelta;
      eventCategory = 'TACKLE';
      label = `Team ${action.team} Super Tackle (+${scoreDelta})`;
    } else if (action.category === 'superRaids') {
      const raidPts = Math.max(3, Math.abs(pts) || 3);
      target.superRaids = Math.max(0, (target.superRaids || 0) + 1);
      target.raidPoints = Math.max(0, (target.raidPoints || 0) + raidPts);
      addTeamPoints(action.team, raidPts);
      pointsAwarded = raidPts;
      eventCategory = 'RAID';
      next.superRaidNote = action.note?.trim() || `Team ${action.team} Super Raid (+${raidPts})`;
      label = `Team ${action.team} Super Raid (+${raidPts})`;
    } else {
      target[action.category] = Math.max(0, (target[action.category] || 0) + pts);
      addTeamPoints(action.team, pts);
      pointsAwarded = pts;
      eventCategory = action.category === 'tacklePoints' ? 'TACKLE' : 'RAID';
      const categoryNames: Record<string, string> = {
        raidPoints: 'Raid Point',
        tacklePoints: 'Tackle Point',
        allOutPoints: 'All-Out',
        bonusPoints: 'Bonus Point',
        technicalPoints: 'Technical Point',
        penaltyPoints: 'Penalty Point',
      };
      label = `Team ${action.team} ${categoryNames[action.category] || action.category} (${pts >= 0 ? `+${pts}` : pts})`;
    }
  } else if (action.type === 'STRUCTURED_EVENT') {
    const mapped: KabaddiEngineActionPayload | null =
      action.eventType === 'TOUCH_POINT' || action.eventType === 'SUCCESSFUL_RAID'
        ? action.points > 1
          ? {
              type: 'MULTI_POINT_RAID',
              team: action.team,
              touchPoints: Math.max(1, action.points - (action.bonusIncluded || 0)),
              includeBonus: Boolean(action.bonusIncluded && action.bonusIncluded > 0),
              raiderName: action.playerName,
            }
          : { type: 'TOUCH_POINT', team: action.team, raiderName: action.playerName }
        : action.eventType === 'EMPTY_RAID'
          ? { type: 'EMPTY_RAID', team: action.team, raiderName: action.playerName }
          : action.eventType === 'UNSUCCESSFUL_RAID'
            ? { type: 'UNSUCCESSFUL_RAID', team: action.team, raiderName: action.playerName }
            : action.eventType === 'BONUS_POINT'
              ? { type: 'BONUS_POINT', team: action.team, raiderName: action.playerName }
              : action.eventType === 'MULTI_POINT_RAID' || action.eventType === 'SUPER_RAID'
                ? {
                    type: 'MULTI_POINT_RAID',
                    team: action.team,
                    touchPoints: Math.max(1, (action.points || 2) - (action.bonusIncluded || 0)),
                    includeBonus: Boolean(action.bonusIncluded && action.bonusIncluded > 0),
                    raiderName: action.playerName,
                  }
                : null;

    if (mapped) {
      return applyKabaddiEngineAction(next, teamAScore, teamBScore, mapped);
    }

    const target = action.team === 'A' ? next.teamA : next.teamB;
    const pts = Math.max(0, Math.min(20, Math.trunc(action.points || 0)));
    const bonusPart = Math.max(0, Math.min(pts, Math.trunc(action.bonusIncluded || 0)));
    const raidOrTacklePart = Math.max(0, pts - bonusPart);
    eventType = action.eventType;

    switch (action.eventType) {
      case 'ALL_OUT': {
        const opp: KabaddiSide = action.team === 'A' ? 'B' : 'A';
        const aoPts = pts > 0 ? pts : 2;
        target.allOutPoints += aoPts;
        addTeamPoints(action.team, aoPts);
        const oppList = opp === 'A' ? next.courtPlayersA : next.courtPlayersB;
        oppList.forEach((p) => {
          if (p.status === 'OUT') p.status = 'ON_COURT';
        });
        recountCourtPlayers(next);
        pointsAwarded = aoPts;
        eventCategory = 'RAID';
        label = `Team ${action.team} All-Out (+${aoPts})`;
        break;
      }
      case 'SUPER_TACKLE': {
        return applyKabaddiEngineAction(next, teamAScore, teamBScore, {
          type: 'SUPER_TACKLE',
          team: action.team,
          defenderName: action.playerName,
          allowBelowThresholdOverride: true,
        });
      }
      case 'TECHNICAL_POINT':
      case 'PENALTY_POINT': {
        return applyKabaddiEngineAction(next, teamAScore, teamBScore, {
          type: 'EXTRA_POINTS',
          team: action.team,
          points: pts || 1,
          reason: action.eventType === 'PENALTY_POINT' ? 'Penalty point' : 'Technical point',
          playerName: action.playerName,
        });
      }
      default: {
        target.tacklePoints += action.eventType.includes('TACKLE') ? raidOrTacklePart : 0;
        target.raidPoints += action.eventType.includes('TACKLE') ? 0 : raidOrTacklePart;
        if (bonusPart > 0) target.bonusPoints += bonusPart;
        addTeamPoints(action.team, pts);
        pointsAwarded = pts;
        eventCategory = action.eventType.includes('TACKLE') ? 'TACKLE' : 'RAID';
        label = `Team ${action.team} ${action.eventType.replace(/_/g, ' ')} (+${pts})${action.playerName ? ` · ${action.playerName}` : ''}`;
      }
    }

    next.raidTimeline = [
      {
        id: makeEventUuid(),
        team: action.team,
        category: eventCategory as 'RAID' | 'TACKLE' | 'OTHER',
        eventType: action.eventType,
        points: pointsAwarded,
        playerName: action.playerName?.trim() || '',
        description: action.description?.trim() || '',
        half: next.half,
        scoreSnapshot: `${teamAScore}-${teamBScore}`,
        timestamp: new Date().toISOString(),
      },
      ...next.raidTimeline.slice(0, 79),
    ];
  } else if (action.type === 'SET_META') {
    eventCategory = 'META';
    if (action.half) {
      next.half = action.half;
      next.clock.halfLabel = action.half;
    }
    if (action.timerMinutes !== undefined) next.timerMinutes = Math.max(0, Math.min(99, action.timerMinutes));
    if (action.timerSeconds !== undefined) next.timerSeconds = Math.max(0, Math.min(59, action.timerSeconds));
    if (action.timerMinutes !== undefined || action.timerSeconds !== undefined) {
      next.clock.remainingMs = (next.timerMinutes * 60 + next.timerSeconds) * 1000;
      next.clock.lastStartedAtIso = null;
    }
    if (action.superRaidNote !== undefined) next.superRaidNote = action.superRaidNote;
    if (action.isTieBreaker !== undefined) next.isTieBreaker = action.isTieBreaker;
    if (action.tieBreakerScoreA !== undefined) next.tieBreakerScoreA = Math.max(0, action.tieBreakerScoreA);
    if (action.tieBreakerScoreB !== undefined) next.tieBreakerScoreB = Math.max(0, action.tieBreakerScoreB);
    label = `Kabaddi match state: ${next.half}`;
  }

  return {
    details: next,
    teamAScore,
    teamBScore,
    label,
    pointsAwarded,
    eventCategory,
    eventType,
  };
}
