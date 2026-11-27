import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Award,
  BellPlus,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  Lock,
  MapPin,
  Maximize2,
  Minimize2,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trophy,
  Unlock,
  Users,
  Video,
  VideoOff,
  Wifi,
} from 'lucide-react';
import {
  FixtureData,
  LiveScoreData,
  LiveStreamData,
  MatchHighlightData,
  PlayerData,
  PlayerMatchStatRecord,
  ScoreHistoryItem,
  SponsorData,
  SponsorOverlayData,
  VenueData,
} from '../../types/index.ts';
import { normalizeBroadcast } from '../../utils/normalizeBroadcast.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { useAuth } from '../../hooks/useAuth.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { tournamentWorkflowService } from '../../services/tournaments/tournamentWorkflowService.ts';
import { LiveStreamPlayer, type PlayerPlaybackSignal } from './LiveStreamPlayer.tsx';
import { StreamStatusIndicator } from './StreamStatusIndicator.tsx';
import { BroadcastScoreboard } from './BroadcastScoreboard.tsx';
import { BroadcastScoreboardOverlay } from '../scoreboard/broadcast/BroadcastScoreboardOverlay.tsx';
import { BroadcastSportStrip } from './BroadcastSportStrip.tsx';
import { BroadcastResultBar } from './BroadcastResultBar.tsx';
import { LiveCommentaryFeed } from './LiveCommentaryFeed.tsx';
import { ScoreboardSummary } from '../scoreboard/ScoreboardSummary.tsx';
import { ActivePlayersCard } from '../scoreboard/ActivePlayersCard.tsx';
import { MatchStatisticsWidget } from '../scoreboard/MatchStatisticsWidget.tsx';
import { MatchTimelineWidget } from '../scoreboard/MatchTimelineWidget.tsx';
import { CricketScorecardPanel } from '../scoreboard/CricketScorecardPanel.tsx';
import { MatchStatusBadge } from '../common/MatchStatusBadge.tsx';
import { StartingSoonGraphic } from '../streaming/StartingSoonGraphic.tsx';
import { SponsorOverlayBanner } from '../streaming/SponsorOverlayBanner.tsx';
import { LiveChatAndPollsPanel } from '../engagement/LiveChatAndPollsPanel.tsx';
import { ShareButton } from '../common/ShareButton.tsx';
import { TeamAvatar } from '../common/TeamAvatar.tsx';
import { formatTimestamp } from '../scoreboard/MatchHighlightsManager.tsx';
import { buildMatchUrl } from '../../utils/shareUrl.ts';
import {
  KabaddiDetails,
  normalizeKabaddiDetails,
} from '../../utils/kabaddiScoring.ts';
import {
  CricketDetails,
  deriveCricketInningsScorecard,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import {
  mergeMatchRoster,
  type UnifiedMatchPlayer,
} from '../../utils/sportPositions.ts';
import { KabaddiWinnerScreen } from '../scoreboard/kabaddi/KabaddiWinnerScreen.tsx';
import { BroadcastBrandLogoBug } from '../obs/ObsBrandMark.tsx';
import { BroadcastSponsorAdBanner } from '../obs/BroadcastSponsorAdBanner.tsx';
import { TimeoutFullscreenSponsorAd } from '../obs/TimeoutFullscreenSponsorAd.tsx';
import { JioHotstarFullScoreboard } from '../obs/JioHotstarFullScoreboard.tsx';
import { normalizeOverlayConfig } from '../../utils/overlayConfig.ts';
import {
  resolveMatchTimeoutState,
  resolveTimeoutOverlayDecision,
} from '../../utils/matchTimeout.ts';
import { useBroadcastEventQueue } from '../../hooks/useBroadcastEventQueue.ts';
import { BroadcastEventAnimationLayer } from '../obs/BroadcastEventAnimationLayer.tsx';
import { useImmersivePlayer } from '../../hooks/useImmersivePlayer.ts';
import { extractRecentImportantEvent } from '../../utils/mediaPlayerUtils.ts';

interface LiveBroadcastViewProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  history: ScoreHistoryItem[];
  connected: boolean;
  highlights: MatchHighlightData[];
  sponsorOverlays: SponsorOverlayData[];
  prefetchedDetailBundle?: boolean;
  initialPublicSponsors?: SponsorData[];
  initialMatchStats?: PlayerMatchStatRecord[];
  initialLineupPlayers?: { teamA: PlayerData[]; teamB: PlayerData[] };
  initialUpcomingFixtures?: FixtureData[];
  wantsReplay?: boolean;
  startSeconds?: number | null;
  jumpKey?: number;
  switchingBanner?: boolean;
  isAuthenticated?: boolean;
  authLoading?: boolean;
  onJumpHighlight: (seconds: number) => void;
  onOpenReport: () => void;
}

function buildGoogleMapsUrl(venue: VenueData | null, fallbackLocation?: string): string | null {
  if (venue && typeof venue.latitude === 'number' && typeof venue.longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`;
  }
  const query = venue
    ? [venue.name, venue.address, venue.city, venue.state].filter(Boolean).join(', ')
    : fallbackLocation?.trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

type DetailTab =
  | 'commentary'
  | 'scorecard'
  | 'raids'
  | 'stats'
  | 'lineups'
  | 'chat'
  | 'highlights'
  | 'fixtures'
  | 'info';

export function LiveBroadcastView({
  stream,
  score,
  history,
  connected,
  highlights,
  sponsorOverlays,
  prefetchedDetailBundle = false,
  initialPublicSponsors,
  initialMatchStats,
  initialLineupPlayers,
  initialUpcomingFixtures,
  wantsReplay = false,
  startSeconds = null,
  jumpKey = 0,
  switchingBanner = false,
  isAuthenticated,
  authLoading = false,
  onJumpHighlight,
  onOpenReport,
}: LiveBroadcastViewProps) {
  const { t } = useLanguage();
  const location = useLocation();
  const { customerUser, adminUser, updateCustomerUser } = useAuth();
  const resolvedAuth = isAuthenticated ?? Boolean(customerUser || adminUser);
  const canPlayVideo = resolvedAuth && !stream.playbackLocked;
  const returnPath = `${location.pathname}${location.search}`;
  const [fullscreenNotice, setFullscreenNotice] = useState<string | null>(null);

  const {
    stageRef,
    controlsVisible,
    touchLocked,
    lockedHintVisible,
    isNativeFullscreen,
    isExpandedFallback,
    isFullscreenActive,
    layout,
    showControlsTemporarily,
    hideControls,
    toggleControls,
    notifyUserInteraction,
    toggleTouchLock,
    showLockedHintBriefly,
    toggleFullscreen,
  } = useImmersivePlayer({
    autoHideMs: 3000,
    initiallyVisible: true,
    onFullscreenFallbackNotice: setFullscreenNotice,
  });

  const kabaddiDetails = useMemo<KabaddiDetails | null>(() => {
    const sport = score?.sportType || stream.gameName;
    if (sport !== 'Kabaddi') return null;
    return normalizeKabaddiDetails(score?.sportSpecificDetails);
  }, [score?.sportType, score?.sportSpecificDetails, stream.gameName]);

  const [kabaddiNowMs, setKabaddiNowMs] = useState<number>(() => Date.now());
  const kabaddiClockRunning = Boolean(
    kabaddiDetails &&
      !kabaddiDetails.matchCompleted &&
      (kabaddiDetails.clock.status === 'RUNNING' ||
        kabaddiDetails.clock.status === 'EXTRA_TIME' ||
        kabaddiDetails.clock.status === 'BREAK' ||
        kabaddiDetails.clock.timeoutActive ||
        kabaddiDetails.clock.raidRunning ||
        kabaddiDetails.doOrDie.active)
  );

  useEffect(() => {
    if (!kabaddiClockRunning) return;
    setKabaddiNowMs(Date.now());
    const id = window.setInterval(() => setKabaddiNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [kabaddiClockRunning]);

  const broadcast = useMemo(
    () => normalizeBroadcast(stream, score, kabaddiNowMs),
    [stream, score, kabaddiNowMs]
  );

  const normalizedOverlayConfig = useMemo(
    () => normalizeOverlayConfig(stream.overlayConfig),
    [stream.overlayConfig]
  );
  const timeoutInfo = useMemo(
    () => resolveMatchTimeoutState(stream, score, kabaddiNowMs),
    [stream, score, kabaddiNowMs]
  );
  const timeoutDecision = useMemo(
    () => resolveTimeoutOverlayDecision(normalizedOverlayConfig, timeoutInfo),
    [normalizedOverlayConfig, timeoutInfo]
  );

  const { activeItem: activeEventItem, isExiting: isEventExiting } = useBroadcastEventQueue({
    matchId: broadcast.id,
    overlayConfig: normalizedOverlayConfig,
  });

  const kabaddiActiveRaids = useMemo(
    () => (kabaddiDetails ? kabaddiDetails.raidTimeline.filter((r) => !r.reverted) : []),
    [kabaddiDetails]
  );

  const storageKey = `maidanlive_sb_vis_${broadcast.id || broadcast.youtubeVideoId}`;

  const [scoreboardVisible, setScoreboardVisible] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    } catch {
      // Ignore storage error
    }
    return broadcast.scoreboardVisibleByDefault;
  });

  const [showUpcomingPreview, setShowUpcomingPreview] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(false);
  const [videoDisabled, setVideoDisabled] = useState(false);
  const [playerSignal, setPlayerSignal] = useState<PlayerPlaybackSignal>('ok');
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<any>(null);
  const userPickedTabRef = useRef(false);
  const [activeTab, setActiveTab] = useState<DetailTab>(() =>
    broadcast.sport === 'Cricket' ? 'scorecard' : 'commentary'
  );
  useEffect(() => {
    userPickedTabRef.current = false;
    setActiveTab(broadcast.sport === 'Cricket' ? 'scorecard' : 'commentary');
  }, [broadcast.id]);
  useEffect(() => {
    if (!userPickedTabRef.current && broadcast.sport === 'Cricket' && activeTab === 'commentary') {
      setActiveTab('scorecard');
    }
  }, [broadcast.sport, activeTab]);
  const [publicSponsors, setPublicSponsors] = useState<SponsorData[]>(
    () => initialPublicSponsors || []
  );
  const [matchStats, setMatchStats] = useState<PlayerMatchStatRecord[]>(
    () => initialMatchStats || []
  );

  const recentImportantEvent = useMemo(
    () => extractRecentImportantEvent(history, broadcast.sport),
    [history, broadcast.sport]
  );
  const [visibleRecentEventKey, setVisibleRecentEventKey] = useState<string | null>(null);
  useEffect(() => {
    if (!recentImportantEvent) {
      setVisibleRecentEventKey(null);
      return;
    }
    setVisibleRecentEventKey(recentImportantEvent.key);
    const id = window.setTimeout(() => setVisibleRecentEventKey(null), 4500);
    return () => window.clearTimeout(id);
  }, [recentImportantEvent]);

  const [lineupPlayers, setLineupPlayers] = useState<{ teamA: PlayerData[]; teamB: PlayerData[] }>(
    () => initialLineupPlayers || { teamA: [], teamB: [] }
  );

  const mergedRoster = useMemo(
    () => mergeMatchRoster(stream, [...lineupPlayers.teamA, ...lineupPlayers.teamB]),
    [stream, lineupPlayers]
  );

  const kabaddiStatRows = useMemo(() => {
    if (!kabaddiDetails) return [];
    const byPlayerId = new Map<string, PlayerMatchStatRecord>();
    for (const st of matchStats) {
      const pObj = typeof st.playerId === 'object' && st.playerId ? st.playerId : null;
      const pId = pObj?._id || (typeof st.playerId === 'string' ? st.playerId : '');
      if (pId) byPlayerId.set(pId, st);
    }
    const rows: Array<{
      id: string;
      playerId: string;
      name: string;
      jersey?: number | string | null;
      position?: string;
      teamName: string;
      isMvp: boolean;
      raidPoints: number;
      tacklePoints: number;
      bonusPoints: number;
      superRaids: number;
      superTackles: number;
      outCount: number;
      revivals: number;
    }> = [];
    const seenKeys = new Set<string>();
    const appendSide = (
      courtPlayers: KabaddiDetails['courtPlayersA'],
      rosterPlayers: UnifiedMatchPlayer[],
      teamName: string
    ) => {
      for (const cp of courtPlayers) {
        const db = byPlayerId.get(cp.playerId);
        const nameKey = `${teamName}:${cp.name.trim().toLowerCase()}`;
        seenKeys.add(nameKey);
        if (cp.playerId) seenKeys.add(`id:${cp.playerId}`);
        rows.push({
          id: cp.playerId || `${teamName}-${cp.name}`,
          playerId: cp.playerId,
          name: cp.name,
          jersey: cp.jerseyNumber,
          position: cp.role || '',
          teamName,
          isMvp: Boolean(db?.isMvp),
          raidPoints: Math.max(cp.stats.raidPoints || 0, db?.raidPoints || 0),
          tacklePoints: Math.max(cp.stats.tacklePoints || 0, db?.tacklePoints || 0),
          bonusPoints: Math.max(cp.stats.bonusPoints || 0, db?.bonusPoints || 0),
          superRaids: cp.stats.superRaids || 0,
          superTackles: cp.stats.superTackles || 0,
          outCount: cp.stats.outCount || 0,
          revivals: cp.stats.revivals || 0,
        });
      }
      for (const rp of rosterPlayers) {
        const nameKey = `${teamName}:${rp.name.trim().toLowerCase()}`;
        if (seenKeys.has(nameKey) || (rp.dbPlayerId && seenKeys.has(`id:${rp.dbPlayerId}`))) {
          continue;
        }
        seenKeys.add(nameKey);
        const db = rp.dbPlayerId ? byPlayerId.get(rp.dbPlayerId) : undefined;
        rows.push({
          id: rp.id,
          playerId: rp.dbPlayerId || '',
          name: rp.name,
          jersey: rp.jerseyNumber,
          position: rp.position || '',
          teamName,
          isMvp: Boolean(db?.isMvp),
          raidPoints: db?.raidPoints || 0,
          tacklePoints: db?.tacklePoints || 0,
          bonusPoints: db?.bonusPoints || 0,
          superRaids: 0,
          superTackles: 0,
          outCount: 0,
          revivals: 0,
        });
      }
    };
    appendSide(kabaddiDetails.courtPlayersA, mergedRoster.teamA, stream.teamAName || 'Team A');
    appendSide(kabaddiDetails.courtPlayersB, mergedRoster.teamB, stream.teamBName || 'Team B');
    for (const st of matchStats) {
      const pObj = typeof st.playerId === 'object' && st.playerId ? st.playerId : null;
      const tObj = typeof st.teamId === 'object' && st.teamId ? st.teamId : null;
      const pId = pObj?._id || (typeof st.playerId === 'string' ? st.playerId : '');
      if (pId && seenKeys.has(`id:${pId}`)) continue;
      const tName = tObj?.shortName || tObj?.name || '—';
      const pName = pObj?.name || 'Player';
      if (seenKeys.has(`${tName}:${pName.toLowerCase()}`)) continue;
      rows.push({
        id: st.id || pId || `stat_${rows.length}`,
        playerId: pId,
        name: pName,
        teamName: tName,
        isMvp: Boolean(st.isMvp),
        raidPoints: st.raidPoints || 0,
        tacklePoints: st.tacklePoints || 0,
        bonusPoints: st.bonusPoints || 0,
        superRaids: 0,
        superTackles: 0,
        outCount: 0,
        revivals: 0,
      });
    }
    return rows.sort(
      (a, b) =>
        b.raidPoints + b.tacklePoints + b.bonusPoints - (a.raidPoints + a.tacklePoints + a.bonusPoints)
    );
  }, [kabaddiDetails, matchStats, mergedRoster, stream.teamAName, stream.teamBName]);

  const cricketPlayerStatRows = useMemo(() => {
    if (broadcast.sport !== 'Cricket') return [];
    const d = normalizeCricketDetails(
      (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
    );
    const teamAName = stream.teamAName || 'Team A';
    const teamBName = stream.teamBName || 'Team B';
    const card1 = deriveCricketInningsScorecard(d, 1, teamAName, teamBName);
    const card2 = deriveCricketInningsScorecard(d, 2, teamAName, teamBName);

    interface CricketStatRow {
      key: string;
      playerId: string;
      name: string;
      jersey?: number | null;
      position?: string;
      teamName: string;
      runs: number;
      balls: number;
      fours: number;
      sixes: number;
      strikeRate: string;
      onStrike: boolean;
      overs: string;
      wickets: number;
      runsConceded: number;
      economy: string;
      isMvp: boolean;
      statusNote: string;
    }

    const rowMap = new Map<string, CricketStatRow>();
    const ensureRow = (
      name: string,
      teamName: string,
      opts?: { playerId?: string; jersey?: number | null; position?: string }
    ): CricketStatRow => {
      const k = `${teamName.toLowerCase()}::${name.trim().toLowerCase()}`;
      let row = rowMap.get(k);
      if (!row) {
        row = {
          key: k,
          playerId: opts?.playerId || '',
          name: name.trim(),
          jersey: opts?.jersey ?? null,
          position: opts?.position || '',
          teamName,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strikeRate: '0.0',
          onStrike: false,
          overs: '—',
          wickets: 0,
          runsConceded: 0,
          economy: '—',
          isMvp: false,
          statusNote: 'Squad',
        };
        rowMap.set(k, row);
      } else {
        if (!row.playerId && opts?.playerId) row.playerId = opts.playerId;
        if (row.jersey == null && opts?.jersey != null) row.jersey = opts.jersey;
        if (!row.position && opts?.position) row.position = opts.position;
      }
      return row;
    };

    // Seed with full drafted/DB rosters first so jersey numbers & positions populate
    for (const p of mergedRoster.teamA) {
      ensureRow(p.name, teamAName, {
        playerId: p.dbPlayerId || '',
        jersey: p.jerseyNumber ?? null,
        position: p.position || '',
      });
    }
    for (const p of mergedRoster.teamB) {
      ensureRow(p.name, teamBName, {
        playerId: p.dbPlayerId || '',
        jersey: p.jerseyNumber ?? null,
        position: p.position || '',
      });
    }

    // Apply live batting & bowling stats from both innings
    for (const card of [card1, card2]) {
      for (const b of card.batting) {
        const row = ensureRow(b.name, card.battingTeamName);
        row.runs += b.runs;
        row.balls += b.balls;
        row.fours += b.fours;
        row.sixes += b.sixes;
        row.strikeRate = row.balls > 0 ? ((row.runs / row.balls) * 100).toFixed(1) : '0.0';
        row.onStrike = row.onStrike || b.onStrike;
        row.statusNote = b.isOut ? b.dismissalText : b.onStrike ? 'Batting *' : 'Not out';
      }
      for (const bw of card.bowling) {
        const row = ensureRow(bw.name, card.bowlingTeamName);
        row.overs = bw.overs;
        row.wickets += bw.wickets;
        row.runsConceded += bw.runsConceded;
        row.economy = bw.economy;
        if (row.statusNote === 'Squad') row.statusNote = 'Bowled';
      }
    }

    // Merge verified PlayerMatchStat overrides (MVP, DB IDs, any manually saved rows)
    for (const st of matchStats) {
      const pObj = typeof st.playerId === 'object' && st.playerId ? st.playerId : null;
      const tObj = typeof st.teamId === 'object' && st.teamId ? st.teamId : null;
      const pId = pObj?._id || (typeof st.playerId === 'string' ? st.playerId : '');
      const tName = tObj?.name || tObj?.shortName || teamAName;
      const pName = pObj?.name || '';
      if (!pName) continue;
      const row = ensureRow(pName, tName, { playerId: pId });
      if (st.isMvp) row.isMvp = true;
      if ((st.runs || 0) > row.runs) row.runs = st.runs;
      if ((st.ballsFaced || 0) > row.balls) row.balls = st.ballsFaced;
      if ((st.fours || 0) > row.fours) row.fours = st.fours;
      if ((st.sixes || 0) > row.sixes) row.sixes = st.sixes;
      if ((st.wickets || 0) > row.wickets) row.wickets = st.wickets;
      if (row.balls > 0) row.strikeRate = ((row.runs / row.balls) * 100).toFixed(1);
    }

    return Array.from(rowMap.values()).sort((a, b) => {
      const aAct = a.runs + a.balls + a.wickets * 20 + (a.overs !== '—' ? 5 : 0);
      const bAct = b.runs + b.balls + b.wickets * 20 + (b.overs !== '—' ? 5 : 0);
      return bAct - aAct;
    });
  }, [broadcast.sport, score?.sportSpecificDetails, mergedRoster, matchStats, stream.teamAName, stream.teamBName]);

  const generalSportStatRows = useMemo(() => {
    if (broadcast.sport === 'Cricket' || broadcast.sport === 'Kabaddi') return [];
    const teamAName = stream.teamAName || 'Team A';
    const teamBName = stream.teamBName || 'Team B';

    interface GeneralStatRow {
      id: string;
      playerId: string;
      name: string;
      jersey?: number | null;
      position?: string;
      teamName: string;
      goals: number;
      assists: number;
      yellowCards: number;
      redCards: number;
      attackPoints: number;
      blockPoints: number;
      serveAces: number;
      pointsScored: number;
      isMvp: boolean;
    }

    const rowMap = new Map<string, GeneralStatRow>();
    const ensure = (
      name: string,
      teamName: string,
      opts?: { playerId?: string; jersey?: number | null; position?: string }
    ): GeneralStatRow => {
      const key = `${teamName.toLowerCase()}::${name.trim().toLowerCase()}`;
      let row = rowMap.get(key);
      if (!row) {
        row = {
          id: opts?.playerId || key,
          playerId: opts?.playerId || '',
          name: name.trim(),
          jersey: opts?.jersey ?? null,
          position: opts?.position || '',
          teamName,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
          attackPoints: 0,
          blockPoints: 0,
          serveAces: 0,
          pointsScored: 0,
          isMvp: false,
        };
        rowMap.set(key, row);
      } else {
        if (!row.playerId && opts?.playerId) row.playerId = opts.playerId;
        if (row.jersey == null && opts?.jersey != null) row.jersey = opts.jersey;
        if (!row.position && opts?.position) row.position = opts.position;
      }
      return row;
    };

    for (const p of mergedRoster.teamA) {
      ensure(p.name, teamAName, {
        playerId: p.dbPlayerId || '',
        jersey: p.jerseyNumber ?? null,
        position: p.position || '',
      });
    }
    for (const p of mergedRoster.teamB) {
      ensure(p.name, teamBName, {
        playerId: p.dbPlayerId || '',
        jersey: p.jerseyNumber ?? null,
        position: p.position || '',
      });
    }

    // Derive live events from ScoreHistory for active players
    for (const h of history) {
      if (h.reverted || h.entryType === 'UNDO') continue;
      const tName = h.teamSide === 'B' ? teamBName : teamAName;
      if (h.playerName) {
        const r = ensure(h.playerName, tName);
        const ev = String(h.eventType || '').toUpperCase();
        if (ev === 'GOAL' || ev === 'PENALTY_GOAL') r.goals += 1;
        if (ev === 'YELLOW_CARD') r.yellowCards += 1;
        if (ev === 'RED_CARD') r.redCards += 1;
        if (ev.includes('ATTACK') || ev.includes('SPIKE')) r.attackPoints += 1;
        if (ev.includes('BLOCK')) r.blockPoints += 1;
        if (ev.includes('ACE') || ev.includes('SERVE')) r.serveAces += 1;
        r.pointsScored += Math.max(0, Number(h.pointsAwarded || 0));
      }
      if (h.assistPlayerName) {
        const aRow = ensure(h.assistPlayerName, tName);
        aRow.assists += 1;
      }
    }

    for (const st of matchStats) {
      const pObj = typeof st.playerId === 'object' && st.playerId ? st.playerId : null;
      const tObj = typeof st.teamId === 'object' && st.teamId ? st.teamId : null;
      const pId = pObj?._id || (typeof st.playerId === 'string' ? st.playerId : '');
      const pName = pObj?.name || '';
      if (!pName) continue;
      const tName = tObj?.name || tObj?.shortName || teamAName;
      const r = ensure(pName, tName, { playerId: pId });
      r.isMvp = Boolean(st.isMvp);
      r.goals = Math.max(r.goals, st.goals || 0);
      r.assists = Math.max(r.assists, st.assists || 0);
      r.yellowCards = Math.max(r.yellowCards, st.yellowCards || 0);
      r.redCards = Math.max(r.redCards, st.redCards || 0);
      r.attackPoints = Math.max(r.attackPoints, st.attackPoints || 0);
      r.blockPoints = Math.max(r.blockPoints, st.blockPoints || 0);
      r.serveAces = Math.max(r.serveAces, st.serveAces || 0);
    }

    return Array.from(rowMap.values()).sort(
      (a, b) =>
        b.goals * 10 +
        b.assists * 5 +
        b.pointsScored +
        b.attackPoints +
        b.blockPoints +
        b.serveAces -
        (a.goals * 10 + a.assists * 5 + a.pointsScored + a.attackPoints + a.blockPoints + a.serveAces)
    );
  }, [broadcast.sport, history, matchStats, mergedRoster, stream.teamAName, stream.teamBName]);

  const [upcomingFixtures, setUpcomingFixtures] = useState<FixtureData[]>(
    () => initialUpcomingFixtures || []
  );
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [followFeedback, setFollowFeedback] = useState<string | null>(null);

  const activeVideoId =
    wantsReplay && broadcast.replayPublished && broadcast.replayVideoId
      ? broadcast.replayVideoId
      : broadcast.youtubeVideoId;
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'true') setScoreboardVisible(true);
      else if (saved === 'false') setScoreboardVisible(false);
      else setScoreboardVisible(broadcast.scoreboardVisibleByDefault);
    } catch {
      setScoreboardVisible(broadcast.scoreboardVisibleByDefault);
    }
  }, [storageKey, broadcast.scoreboardVisibleByDefault]);

  useEffect(() => {
    if (initialPublicSponsors) setPublicSponsors(initialPublicSponsors);
  }, [initialPublicSponsors]);

  useEffect(() => {
    if (initialMatchStats) setMatchStats(initialMatchStats);
  }, [initialMatchStats]);

  useEffect(() => {
    if (initialLineupPlayers) setLineupPlayers(initialLineupPlayers);
  }, [initialLineupPlayers]);

  useEffect(() => {
    if (initialUpcomingFixtures) setUpcomingFixtures(initialUpcomingFixtures);
  }, [initialUpcomingFixtures]);

  // Load live_match sponsors, match player stats, lineups, and upcoming fixtures (when not prefetched by /detail bundle)
  useEffect(() => {
    if (!broadcast.id || prefetchedDetailBundle) return;
    platformOpsService
      .listPublicSponsors({
        placement: 'live_match',
        liveStreamId: broadcast.id,
        tournamentId: broadcast.tournamentId || undefined,
      })
      .then((list) => {
        setPublicSponsors(list);
        list.forEach((sp) => platformOpsService.trackSponsorImpression(sp.id));
      })
      .catch(() => {});

    platformOpsService
      .listMatchPlayerStats(broadcast.id)
      .then(setMatchStats)
      .catch(() => setMatchStats([]));

    if (broadcast.teamA.id || broadcast.teamB.id) {
      Promise.all([
        broadcast.teamA.id
          ? entityService.listPlayers({ teamId: broadcast.teamA.id }).catch(() => [])
          : Promise.resolve([]),
        broadcast.teamB.id
          ? entityService.listPlayers({ teamId: broadcast.teamB.id }).catch(() => [])
          : Promise.resolve([]),
      ]).then(([teamA, teamB]) =>
        setLineupPlayers({
          teamA,
          teamB,
        })
      );
    }

    if (broadcast.tournamentId) {
      tournamentWorkflowService
        .listFixtures(broadcast.tournamentId)
        .then((fxList) =>
          setUpcomingFixtures(
            fxList.filter((f) => f.status === 'SCHEDULED' || f.status === 'LIVE').slice(0, 6)
          )
        )
        .catch(() => setUpcomingFixtures([]));
    }
  }, [broadcast.id, broadcast.tournamentId, broadcast.teamA.id, broadcast.teamB.id, prefetchedDetailBundle]);

  // Screen Wake Lock lifecycle
  const toggleWakeLock = useCallback(async () => {
    if (!wakeLockSupported) return;
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
      setWakeLockActive(false);
      return;
    }
    try {
      const sentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener?.('release', () => {
        wakeLockRef.current = null;
        setWakeLockActive(false);
      });
    } catch {
      setWakeLockActive(false);
    }
  }, [wakeLockSupported]);

  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  const toggleScoreboard = useCallback(() => {
    setScoreboardVisible((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(storageKey, String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, [storageKey]);

  async function handleToggleFollow(teamId: string, teamName: string) {
    if (!customerUser) {
      setFollowFeedback('Sign in on the Player Portal to follow teams.');
      return;
    }
    const followedSet = new Set(customerUser.followedTeamIds || []);
    const isFollowing = followedSet.has(teamId);
    try {
      setFollowBusyId(teamId);
      const res = isFollowing
        ? await engagementService.unfollowTeam(teamId)
        : await engagementService.followTeam(teamId);
      updateCustomerUser({ ...customerUser, followedTeamIds: res.followedTeamIds });
      setFollowFeedback(isFollowing ? `Unfollowed ${teamName}.` : `Following ${teamName}!`);
      window.setTimeout(() => setFollowFeedback(null), 2500);
    } catch {
      setFollowFeedback('Unable to update follow status.');
    } finally {
      setFollowBusyId(null);
    }
  }

  const venueObj = typeof stream.venueId === 'object' && stream.venueId ? stream.venueId : null;
  const mapsUrl = buildGoogleMapsUrl(venueObj, stream.location);
  const followedIds = new Set(customerUser?.followedTeamIds || []);

  // Show viewer count ONLY if public or signed-in admin
  const canSeeViewers =
    typeof broadcast.activeViewers === 'number' &&
    (broadcast.viewerCountVisibility === 'public' || Boolean(adminUser));

  // Merge deduplicated match partners (overlays + placement sponsors)
  const partnerSponsors: SponsorData[] = [];
  const seenSp = new Set<string>();
  for (const ov of sponsorOverlays) {
    const sp = ov.sponsor || (typeof ov.sponsorId === 'object' ? ov.sponsorId : null);
    if (sp && sp.id && !seenSp.has(sp.id)) {
      seenSp.add(sp.id);
      partnerSponsors.push(sp);
    }
  }
  for (const sp of publicSponsors) {
    if (sp.id && !seenSp.has(sp.id)) {
      seenSp.add(sp.id);
      partnerSponsors.push(sp);
    }
  }

  const canQuickScore = Boolean(
    adminUser &&
      (adminUser.role === 'SUPER_ADMIN' ||
        adminUser.role === 'ADMIN' ||
        adminUser.permissions?.manageScores ||
        stream.authorizedScorerId === adminUser.id ||
        stream.backupScorerId === adminUser.id)
  );

  const activePlayerProvider =
    wantsReplay && broadcast.replayPublished ? 'youtube' : broadcast.activeProvider;
  const hasReconnectingAlert =
    !connected || playerSignal === 'error' || playerSignal === 'reconnecting';
  const showHud = controlsVisible && !touchLocked;

  return (
    <div className="space-y-4">
      {/* 1. PERSISTENT VIDEO STAGE (NEVER REMOUNTS ON ORIENTATION / FULLSCREEN / SCORE TOGGLE) */}
      <div className="bg-slate-950 sm:rounded-xl overflow-hidden border border-slate-800 shadow-lg">
        <div
          ref={stageRef}
          onMouseMove={() => {
            if (!touchLocked) showControlsTemporarily();
          }}
          onClick={() => {
            if (touchLocked) {
              showLockedHintBriefly();
              return;
            }
            if (activePlayerProvider === 'mediamtx' || videoDisabled || broadcast.status === 'UPCOMING') {
              toggleControls();
            }
          }}
          className={
            isExpandedFallback
              ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
              : isNativeFullscreen
                ? 'relative w-full h-full bg-black flex items-center justify-center'
                : 'relative w-full aspect-video bg-black'
          }
        >
          <div className="relative w-full h-full">
            {canPlayVideo ? (
              <>
                <LiveStreamPlayer
                  provider={activePlayerProvider}
                  youtubeVideoId={activeVideoId}
                  mediamtxPlaybackUrl={broadcast.mediamtxPlaybackUrl}
                  mediamtxWebrtcUrl={broadcast.mediamtxWebrtcUrl}
                  title={broadcast.title}
                  startSeconds={startSeconds}
                  jumpKey={jumpKey}
                  lowDataMode={lowDataMode}
                  videoDisabled={videoDisabled}
                  controlsVisible={showHud}
                  onEnableVideo={() => setVideoDisabled(false)}
                  switchingBanner={switchingBanner}
                  onPlaybackHealthChange={setPlayerSignal}
                />

                {broadcast.status === 'UPCOMING' && !showUpcomingPreview && !videoDisabled && (
                  <StartingSoonGraphic
                    stream={stream}
                    onShowPreview={() => setShowUpcomingPreview(true)}
                  />
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white z-10">
                {authLoading ? (
                  <div className="flex flex-col items-center gap-2 text-slate-300">
                    <Loader2 className="w-7 h-7 animate-spin text-[#EA580C]" />
                    <span className="text-xs font-medium">Checking player session...</span>
                  </div>
                ) : (
                  <div className="max-w-md space-y-3">
                    <div className="mx-auto h-12 w-12 rounded-full bg-[#EA580C]/15 border border-[#EA580C]/40 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-[#EA580C]" />
                    </div>
                    <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                      {wantsReplay && broadcast.replayPublished
                        ? 'Player Login Required to Watch Replay'
                        : 'Player Login Required for Live Stream'}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      Sign in with your MaidanLive player account to watch live video streams, match highlights, and full-match replays.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                      <Link
                        to={`/login?next=${encodeURIComponent(returnPath)}`}
                        className="min-h-[40px] inline-flex items-center px-4 py-2 rounded-lg bg-[#EA580C] text-white text-xs sm:text-sm font-semibold hover:bg-orange-600 transition-colors"
                      >
                        Sign In to Watch
                      </Link>
                      <Link
                        to={`/register?next=${encodeURIComponent(returnPath)}`}
                        className="min-h-[40px] inline-flex items-center px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-xs sm:text-sm font-semibold hover:bg-white/20 transition-colors"
                      >
                        Create Player Account
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tap-to-Hide Backdrop when Unified Controls are Visible (leaves buttons unobstructed) */}
            {canPlayVideo && showHud && (
              <div
                data-player-backdrop="true"
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  hideControls();
                }}
                className="absolute inset-0 z-25 cursor-pointer"
              />
            )}

            {/* Non-Blocking Top Wake Strip & Corner Toggle when Controls are Hidden (keeps YouTube native center/bottom clickable) */}
            {canPlayVideo && !controlsVisible && !touchLocked && (
              <>
                <div
                  data-player-wake-strip="true"
                  aria-hidden="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    showControlsTemporarily();
                  }}
                  className="absolute top-0 inset-x-0 h-14 z-25 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showControlsTemporarily();
                  }}
                  aria-label="Show player controls"
                  title="Show MaidanLive controls"
                  className="absolute top-2.5 right-2.5 z-30 min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-slate-950/60 hover:bg-slate-950/90 text-white/80 hover:text-white border border-white/15 backdrop-blur-sm opacity-75 hover:opacity-100 transition-opacity cursor-pointer safe-pt"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Always-Visible Minimal Reconnecting Indicator ONLY when telemetry/video is degraded */}
            {canPlayVideo && !showHud && hasReconnectingAlert && (
              <div className="pointer-events-none absolute top-2.5 left-2.5 z-30 flex items-center gap-1.5 safe-pt safe-px">
                <StreamStatusIndicator
                  stream={stream}
                  socketConnected={connected}
                  playerSignal={playerSignal}
                  dark
                />
              </div>
            )}

            {/* Subtle Real-Time Match Highlight Toast (from genuine score history) */}
            {canPlayVideo &&
              !activeEventItem &&
              recentImportantEvent &&
              visibleRecentEventKey === recentImportantEvent.key && (
                <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-30 max-w-[85vw]">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border backdrop-blur-md shadow-xl text-xs font-semibold ${
                      recentImportantEvent.accent === 'red'
                        ? 'bg-red-950/90 border-red-400/50 text-red-100'
                        : recentImportantEvent.accent === 'emerald'
                          ? 'bg-emerald-950/90 border-emerald-400/50 text-emerald-100'
                          : recentImportantEvent.accent === 'amber'
                            ? 'bg-amber-950/90 border-amber-400/50 text-amber-100'
                            : recentImportantEvent.accent === 'sky'
                              ? 'bg-sky-950/90 border-sky-400/50 text-sky-100'
                              : 'bg-slate-950/90 border-orange-400/50 text-orange-100'
                    }`}
                  >
                    <span className="font-display font-extrabold uppercase tracking-wider">
                      {recentImportantEvent.label}
                    </span>
                    <span className="text-white/90 truncate max-w-[180px] sm:max-w-[260px]">
                      {recentImportantEvent.detail}
                    </span>
                  </div>
                </div>
              )}

            {/* UNIFIED YOUTUBE-STYLE AUTO-HIDE PLAYER OVERLAY HUD */}
            <div
              data-unified-hud="true"
              className={`pointer-events-none absolute inset-x-0 top-0 z-30 transition-opacity duration-200 ${
                showHud ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent px-2.5 pt-2.5 pb-6 safe-pt safe-px flex flex-wrap items-start justify-between gap-2">
                {/* Top-Left Live / Viewer / Stream Connectivity Indicator */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    notifyUserInteraction();
                  }}
                  className={`${
                    showHud ? 'pointer-events-auto' : 'pointer-events-none'
                  } flex flex-wrap items-center gap-1.5`}
                >
                  <MatchStatusBadge stream={stream} score={score} dark compact />
                  {canSeeViewers && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 border border-white/15 text-white font-mono text-[10px] font-semibold tabular-nums backdrop-blur-md">
                      <Users className="w-3 h-3 text-emerald-400" />
                      <span>{broadcast.activeViewers}</span>
                    </span>
                  )}
                  {canPlayVideo && (
                    <StreamStatusIndicator
                      stream={stream}
                      socketConnected={connected}
                      playerSignal={playerSignal}
                      dark
                    />
                  )}
                </div>

                {/* Top-Right Unified Controls */}
                {canPlayVideo && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`${
                      showHud ? 'pointer-events-auto' : 'pointer-events-none'
                    } flex flex-wrap items-center justify-end gap-1.5`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTouchLock();
                      }}
                      title="Lock screen against accidental taps"
                      aria-label="Lock player touch controls"
                      aria-pressed={touchLocked}
                      className="min-h-[40px] sm:min-h-[36px] min-w-[40px] sm:min-w-[36px] inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/85 hover:bg-slate-900 text-slate-200 border border-white/15 backdrop-blur-md text-[11px] font-semibold transition cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Lock</span>
                    </button>

                    {wakeLockSupported && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWakeLock();
                          notifyUserInteraction();
                        }}
                        title="Keep screen awake while watching"
                        aria-pressed={wakeLockActive}
                        className={`min-h-[40px] sm:min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border backdrop-blur-md transition cursor-pointer ${
                          wakeLockActive
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-slate-900'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Awake</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVideoDisabled((v) => !v);
                        notifyUserInteraction();
                      }}
                      title="Disable video and retain live scores only"
                      aria-pressed={videoDisabled}
                      className={`min-h-[40px] sm:min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border backdrop-blur-md transition cursor-pointer ${
                        videoDisabled
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                          : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-slate-900'
                      }`}
                    >
                      {videoDisabled ? (
                        <Video className="w-3.5 h-3.5" />
                      ) : (
                        <VideoOff className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">
                        {videoDisabled ? 'Video On' : 'Score Only'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLowDataMode((v) => !v);
                        notifyUserInteraction();
                      }}
                      title="Toggle Low-Data Mode"
                      aria-pressed={lowDataMode}
                      className={`min-h-[40px] sm:min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border backdrop-blur-md transition cursor-pointer ${
                        lowDataMode
                          ? 'bg-amber-400 text-slate-950 border-amber-300'
                          : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-slate-900'
                      }`}
                    >
                      <Wifi className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Low Data</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleScoreboard();
                        notifyUserInteraction();
                      }}
                      aria-pressed={scoreboardVisible}
                      className="min-h-[40px] sm:min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/85 hover:bg-slate-900 text-white text-[11px] font-semibold border border-white/15 backdrop-blur-md cursor-pointer"
                    >
                      {scoreboardVisible ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                          <span className="hidden sm:inline">{t('broadcast.hideScore')}</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-[#EA580C]" />
                          <span className="hidden sm:inline">{t('broadcast.score')}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFullscreen();
                      }}
                      aria-label={isFullscreenActive ? 'Exit fullscreen' : 'Broadcast fullscreen'}
                      className="min-h-[44px] sm:min-h-[36px] min-w-[44px] sm:min-w-[36px] inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/85 hover:bg-slate-900 text-white text-[11px] font-semibold border border-white/15 backdrop-blur-md cursor-pointer"
                    >
                      {isFullscreenActive ? (
                        <>
                          <Minimize2 className="w-4 h-4 text-orange-400" />
                          <span className="hidden sm:inline">{t('broadcast.exitFullscreen')}</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-4 h-4 text-orange-400" />
                          <span className="hidden sm:inline">{t('broadcast.fullscreen')}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Protective Touch-Lock Shield */}
            {canPlayVideo && touchLocked && (
              <div
                data-touch-lock-shield="true"
                onClick={(e) => {
                  e.stopPropagation();
                  showLockedHintBriefly();
                }}
                className="absolute inset-0 z-40 flex items-end justify-center pb-8 safe-pb cursor-pointer"
              >
                {lockedHintVisible && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-950/92 border border-white/20 text-white text-xs font-semibold shadow-2xl backdrop-blur-md"
                  >
                    <Lock className="w-3.5 h-3.5 text-orange-400" />
                    <span>Screen Locked</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTouchLock();
                      }}
                      className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white font-bold cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Unlock</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Embedded MaidanLive Video Scoreboard Overlay (when Scoreboard on YouTube is unchecked) */}
            {!broadcast.showScoreboardOnYoutube &&
              !isFullscreenActive &&
              scoreboardVisible &&
              canPlayVideo &&
              !videoDisabled &&
              !(broadcast.status === 'UPCOMING' && !showUpcomingPreview) && (
                <div
                  className={`pointer-events-none absolute z-25 flex ${
                    !stream.scoreboardPosition || stream.scoreboardPosition === 'BOTTOM'
                      ? 'bottom-12 left-2.5 right-2.5 sm:left-4 sm:right-4 justify-center'
                      : stream.scoreboardPosition === 'LEFT'
                        ? 'top-14 left-2.5 right-2.5 sm:left-4 sm:right-auto justify-start'
                        : stream.scoreboardPosition === 'RIGHT'
                          ? 'top-14 left-2.5 right-2.5 sm:left-auto sm:right-4 justify-end'
                          : 'top-14 left-2.5 right-2.5 sm:left-4 sm:right-4 justify-center'
                  }`}
                >
                  <div className="pointer-events-auto max-w-full">
                    {score ? (
                      <BroadcastScoreboardOverlay
                        stream={stream}
                        score={score}
                        compact={layout.isCompactStage}
                        layoutMode={layout.stageOrientation}
                      />
                    ) : (
                      <BroadcastScoreboard
                        broadcast={broadcast}
                        compact
                        layoutMode={layout.stageOrientation}
                      />
                    )}
                  </div>
                </div>
              )}

            {/* Fullscreen Scoreboard Overlay (adapts cleanly to Portrait vs Landscape Fullscreen) */}
            {isFullscreenActive && scoreboardVisible && !videoDisabled && (
              <div className="pointer-events-none absolute bottom-12 left-3 right-3 sm:left-6 sm:right-6 z-25 flex justify-center safe-pb safe-px">
                <div className="pointer-events-auto w-full flex justify-center max-w-2xl">
                  {score && layout.stageOrientation === 'landscape' ? (
                    <BroadcastScoreboardOverlay
                      stream={stream}
                      score={score}
                      compact
                      layoutMode="landscape"
                    />
                  ) : (
                    <BroadcastScoreboard
                      broadcast={broadcast}
                      compact
                      layoutMode={layout.stageOrientation}
                      className="w-full"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Brand Logo Bug inside Viewer Video Stage */}
            <BroadcastBrandLogoBug
              config={normalizedOverlayConfig}
              variant="responsive"
              zIndex={22}
            />

            {/* 1-Button Live Sponsor Advertisement inside Viewer Video Stage */}
            <BroadcastSponsorAdBanner
              config={normalizedOverlayConfig}
              variant="responsive"
              zIndex={23}
              suppress={timeoutDecision.isAnyTakeoverActive}
            />

            {/* Sponsor Overlay Strip */}
            {sponsorOverlays.length > 0 && (
              <div className="pointer-events-none absolute bottom-12 right-2.5 z-20 max-w-[75%] flex justify-end">
                <SponsorOverlayBanner
                  overlays={sponsorOverlays}
                  suppress={timeoutDecision.isAnyTakeoverActive}
                />
              </div>
            )}

            {/* JioHotstar Full Scoreboard & Fullscreen Timeout Sponsor Ad inside Video Stage */}
            {canPlayVideo && !videoDisabled && (
              <>
                <JioHotstarFullScoreboard
                  stream={stream}
                  score={score}
                  config={normalizedOverlayConfig}
                  timeoutInfo={timeoutInfo}
                  variant="responsive"
                  zIndex={27}
                  visible={timeoutDecision.showFullScoreboard}
                />
                <TimeoutFullscreenSponsorAd
                  stream={stream}
                  score={score}
                  config={normalizedOverlayConfig}
                  timeoutInfo={timeoutInfo}
                  fallbackSponsorOverlays={sponsorOverlays}
                  variant="responsive"
                  zIndex={28}
                  visible={timeoutDecision.showFullscreenSponsorAd}
                />
                <BroadcastEventAnimationLayer
                  activeItem={activeEventItem}
                  isExiting={isEventExiting}
                  overlayConfig={normalizedOverlayConfig}
                  variant="responsive"
                  zIndex={34}
                />
              </>
            )}
          </div>
        </div>

        {/* Footer Strip below stage */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-900 text-[11px] text-slate-300 border-t border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">
              {fullscreenNotice ||
                (broadcast.activeProvider === 'mediamtx'
                  ? 'Streaming via MaidanLive Direct Feed (Low-Latency HLS / WebRTC).'
                  : !broadcast.showScoreboardOnYoutube
                    ? 'YouTube Live playback · Live scoreboard active inside MaidanLive embedded video.'
                    : 'Adaptive YouTube Live playback · Tap video for controls or open landscape fullscreen.')}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {canQuickScore && (
              <Link
                to={`/admin/scoreboard/${broadcast.id}`}
                className="text-orange-400 hover:text-orange-300 font-semibold whitespace-nowrap"
              >
                Open Scorer Console
              </Link>
            )}
            {canPlayVideo && activeVideoId && (
              <a
                href={`https://www.youtube.com/watch?v=${activeVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-white hover:text-orange-400 font-semibold whitespace-nowrap"
              >
                <span>Watch on YouTube</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 2. CONTAINER/ORIENTATION-AWARE SCOREBOARD -> SPORT STRIP -> SUMMARY -> RESULT BAR */}
      <div className="px-3 sm:px-0 space-y-3">
        {scoreboardVisible && (broadcast.showScoreboardOnYoutube || videoDisabled) && (
          <BroadcastScoreboard
            broadcast={broadcast}
            layoutMode={layout.scoreboardMode}
            hideSubStrip
          />
        )}
        <BroadcastSportStrip broadcast={broadcast} />
        <ScoreboardSummary stream={stream} score={score} variant="detail" />
        <BroadcastResultBar broadcast={broadcast} />
        {broadcast.sport === 'Kabaddi' && kabaddiDetails?.matchCompleted && (
          <div className="flex justify-center">
            <KabaddiWinnerScreen inline stream={stream} score={score} details={kabaddiDetails} />
          </div>
        )}

        {/* Match Header & Quick Actions */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <MatchStatusBadge stream={stream} score={score} />
                <span className="font-bold text-[#EA580C] uppercase tracking-wide">
                  {broadcast.sport}
                </span>
                {broadcast.tournamentName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <Link
                      to={broadcast.tournamentId ? `/tournaments/${broadcast.tournamentId}` : '/tournaments'}
                      className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-[#EA580C]"
                    >
                      <Trophy className="w-3.5 h-3.5 text-amber-500" />
                      <span>{broadcast.tournamentName}</span>
                    </Link>
                  </>
                )}
                {broadcast.roundName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{broadcast.roundName}</span>
                  </>
                )}
              </div>
              <h1 className="font-display text-lg sm:text-2xl font-bold text-slate-900">
                {broadcast.title}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <ShareButton
                title={broadcast.title}
                text={`Watch ${broadcast.sport} ${wantsReplay && broadcast.replayPublished ? 'replay' : 'live'} on MaidanLive`}
                url={buildMatchUrl(broadcast.id, Boolean(wantsReplay && broadcast.replayPublished))}
                compact
                shareCard={
                  wantsReplay && broadcast.replayPublished
                    ? {
                        type: 'REPLAY',
                        title: broadcast.title,
                        sport: broadcast.sport,
                        tournamentName: broadcast.tournamentName,
                        resultText: broadcast.resultDeclared
                          ? broadcast.resultBannerText || 'Match Completed'
                          : undefined,
                        winnerName: broadcast.winnerName,
                        teamAName: broadcast.teamA.name,
                        teamBName: broadcast.teamB.name,
                        teamAScore: broadcast.teamA.primaryText,
                        teamBScore: broadcast.teamB.primaryText,
                        teamASecondary: broadcast.teamA.secondaryText,
                        teamBSecondary: broadcast.teamB.secondaryText,
                        teamALogo: broadcast.teamA.logoUrl,
                        teamBLogo: broadcast.teamB.logoUrl,
                        shareUrl: buildMatchUrl(broadcast.id, true),
                      }
                    : broadcast.resultDeclared
                      ? {
                          type: 'MATCH_RESULT',
                          title: broadcast.title,
                          sport: broadcast.sport,
                          tournamentName: broadcast.tournamentName,
                          resultText: broadcast.resultBannerText || 'Match Completed',
                          winnerName: broadcast.winnerName,
                          mvpName: broadcast.mvpName,
                          teamAName: broadcast.teamA.name,
                          teamBName: broadcast.teamB.name,
                          teamAScore: broadcast.teamA.primaryText,
                          teamBScore: broadcast.teamB.primaryText,
                          teamASecondary: broadcast.teamA.secondaryText,
                          teamBSecondary: broadcast.teamB.secondaryText,
                          teamALogo: broadcast.teamA.logoUrl,
                          teamBLogo: broadcast.teamB.logoUrl,
                          shareUrl: buildMatchUrl(broadcast.id),
                        }
                      : broadcast.status === 'UPCOMING' &&
                          (!score || (score.teamAScore === 0 && score.teamBScore === 0))
                        ? {
                            type: 'UPCOMING_MATCH',
                            title: broadcast.title,
                            sport: broadcast.sport,
                            tournamentName: broadcast.tournamentName,
                            scheduledText: broadcast.matchDate
                              ? new Date(broadcast.matchDate).toLocaleString()
                              : 'Upcoming Match',
                            venueName: broadcast.venueName,
                            teamAName: broadcast.teamA.name,
                            teamBName: broadcast.teamB.name,
                            teamALogo: broadcast.teamA.logoUrl,
                            teamBLogo: broadcast.teamB.logoUrl,
                            shareUrl: buildMatchUrl(broadcast.id),
                          }
                        : {
                            type: 'LIVE_SCORE',
                            title: broadcast.title,
                            sport: broadcast.sport,
                            tournamentName: broadcast.tournamentName,
                            statusLabel: broadcast.centerMeta.statusLabel,
                            teamAName: broadcast.teamA.name,
                            teamBName: broadcast.teamB.name,
                            teamAScore: broadcast.teamA.primaryText,
                            teamBScore: broadcast.teamB.primaryText,
                            teamASecondary: broadcast.teamA.secondaryText,
                            teamBSecondary: broadcast.teamB.secondaryText,
                            teamALogo: broadcast.teamA.logoUrl,
                            teamBLogo: broadcast.teamB.logoUrl,
                            venueName: broadcast.venueName,
                            shareUrl: buildMatchUrl(broadcast.id),
                          }
                }
              />
              <button
                type="button"
                onClick={onOpenReport}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Flag className="w-3.5 h-3.5 text-red-600" />
                <span>Report</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
            {broadcast.venueName && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{broadcast.venueName}</span>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[#EA580C] font-semibold hover:underline ml-1"
                  >
                    Map <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </span>
            )}
            {broadcast.matchDate && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>{new Date(broadcast.matchDate).toLocaleString()}</span>
              </span>
            )}
          </div>
        </div>

        {/* Active Players Overview Card (Cricket) */}
        {broadcast.sport === 'Cricket' && (
          <ActivePlayersCard matchId={broadcast.id} stream={stream} score={score} />
        )}

        {/* Match Statistics (Live Cumulative Data) */}
        <MatchStatisticsWidget
          matchId={broadcast.id}
          stream={stream}
          score={score}
          history={history}
        />

        {/* Match Timeline (Last 5 Major Events) */}
        <MatchTimelineWidget
          matchId={broadcast.id}
          history={history}
          teamAName={broadcast.teamA.name}
          teamBName={broadcast.teamB.name}
        />

        {/* 3. MATCH CENTER TABS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            ...(broadcast.sport === 'Cricket'
              ? [{ id: 'scorecard' as const, label: 'Scorecard' }]
              : []),
            { id: 'commentary' as const, label: `Commentary (${history.length})` },
            ...(broadcast.sport === 'Kabaddi' &&
            kabaddiDetails?.viewerDisplaySettings.showRaidHistory !== false
              ? [{ id: 'raids' as const, label: `Raid History (${kabaddiActiveRaids.length})` }]
              : []),
            {
              id: 'stats' as const,
              label: `Player Stats (${
                broadcast.sport === 'Kabaddi'
                  ? kabaddiStatRows.length
                  : broadcast.sport === 'Cricket'
                    ? cricketPlayerStatRows.length
                    : generalSportStatRows.length
              })`,
            },
            {
              id: 'lineups' as const,
              label: `Lineups (${mergedRoster.teamA.length + mergedRoster.teamB.length})`,
            },
            { id: 'chat' as const, label: 'Live Chat & Polls' },
            ...(broadcast.highlightsEnabled && (!resolvedAuth || highlights.length > 0)
              ? [
                  {
                    id: 'highlights' as const,
                    label: resolvedAuth ? `Highlights (${highlights.length})` : 'Highlights',
                  },
                ]
              : []),
            ...(upcomingFixtures.length > 0
              ? [{ id: 'fixtures' as const, label: `Upcoming (${upcomingFixtures.length})` }]
              : []),
            { id: 'info' as const, label: 'Teams & Partners' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                userPickedTabRef.current = true;
                setActiveTab(tab.id);
              }}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'commentary' && <LiveCommentaryFeed history={history} />}

        {activeTab === 'scorecard' && broadcast.sport === 'Cricket' && (
          <CricketScorecardPanel
            stream={stream}
            score={score}
            lineupPlayers={mergedRoster}
          />
        )}

        {activeTab === 'raids' && broadcast.sport === 'Kabaddi' && kabaddiDetails && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Kabaddi Raid & Action Timeline
              </h2>
              <span className="font-mono text-xs text-slate-500">
                {kabaddiActiveRaids.length} events
              </span>
            </div>
            {kabaddiActiveRaids.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                No raids or match events logged yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {kabaddiActiveRaids.map((raid) => {
                  const sideName =
                    raid.team === 'A'
                      ? stream.teamAName || 'Team A'
                      : stream.teamBName || 'Team B';
                  return (
                    <div
                      key={raid.id}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-500">
                            {raid.half}
                            {raid.clockText ? ` · ${raid.clockText}` : ''}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">
                            {sideName}
                          </span>
                          <span className="font-bold text-slate-900">
                            {raid.eventType.replace(/_/g, ' ')}
                          </span>
                          {raid.isDoOrDie && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">
                              DO OR DIE
                            </span>
                          )}
                          {raid.isSuperRaid && (
                            <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-bold text-[10px]">
                              SUPER RAID
                            </span>
                          )}
                          {raid.isSuperTackle && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                              SUPER TACKLE
                            </span>
                          )}
                          {raid.isAllOut && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                              ALL OUT
                            </span>
                          )}
                        </div>
                        {raid.description && (
                          <p className="text-slate-600">{raid.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                        {raid.points !== 0 && (
                          <span className="px-2 py-0.5 rounded bg-orange-50 text-[#EA580C] font-bold">
                            +{raid.points}
                          </span>
                        )}
                        <span className="text-slate-700 font-bold">{raid.scoreSnapshot}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="font-display text-sm font-bold text-slate-900">
              Match Player Statistics
            </h2>
            {broadcast.sport === 'Kabaddi' && kabaddiDetails ? (
              !kabaddiDetails.viewerDisplaySettings.showPlayerStats ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  Player statistics are disabled by the match organizer.
                </p>
              ) : kabaddiStatRows.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No player statistics recorded for this Kabaddi match yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="py-2.5 px-3">Player</th>
                        <th className="py-2.5 px-3">Team</th>
                        <th className="py-2.5 px-3 font-mono">Raid</th>
                        <th className="py-2.5 px-3 font-mono">Tackle</th>
                        <th className="py-2.5 px-3 font-mono">Bonus</th>
                        <th className="py-2.5 px-3 font-mono">SR/ST</th>
                        <th className="py-2.5 px-3 font-mono">Out/Rev</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {kabaddiStatRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {row.playerId && /^[a-f\d]{24}$/i.test(row.playerId) ? (
                              <Link to={`/players/${row.playerId}`} className="hover:text-[#EA580C]">
                                {row.jersey != null ? `#${row.jersey} ` : ''}
                                {row.name}
                              </Link>
                            ) : (
                              <span>
                                {row.jersey != null ? `#${row.jersey} ` : ''}
                                {row.name}
                              </span>
                            )}
                            {row.position && (
                              <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                                ({row.position})
                              </span>
                            )}
                            {row.isMvp && (
                              <span className="ml-1.5 text-[10px] font-bold text-amber-700">
                                POTM
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{row.teamName}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums font-bold">
                            {row.raidPoints}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">{row.tacklePoints}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">{row.bonusPoints}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">
                            {row.superRaids}/{row.superTackles}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">
                            {row.outCount}/{row.revivals}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : broadcast.sport === 'Cricket' ? (
              cricketPlayerStatRows.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No player statistics recorded for this Cricket match yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="py-2.5 px-3">Player</th>
                        <th className="py-2.5 px-3">Team</th>
                        <th className="py-2.5 px-3 font-mono text-right">R (B)</th>
                        <th className="py-2.5 px-3 font-mono text-right">4s/6s</th>
                        <th className="py-2.5 px-3 font-mono text-right">SR</th>
                        <th className="py-2.5 px-3 font-mono text-right">Bowling (O-R-W)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cricketPlayerStatRows.map((row) => (
                        <tr key={row.key} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">
                              {row.playerId && /^[a-f\d]{24}$/i.test(row.playerId) ? (
                                <Link to={`/players/${row.playerId}`} className="hover:text-[#EA580C]">
                                  {row.jersey != null ? `#${row.jersey} ` : ''}
                                  {row.name}
                                </Link>
                              ) : (
                                <span>
                                  {row.jersey != null ? `#${row.jersey} ` : ''}
                                  {row.name}
                                </span>
                              )}
                              {row.onStrike && (
                                <span className="text-[#EA580C] font-bold ml-0.5">*</span>
                              )}
                              {row.isMvp && (
                                <span className="ml-1.5 text-[10px] font-bold text-amber-700">
                                  POTM
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {[row.position, row.statusNote].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{row.teamName}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right">
                            <strong className="text-slate-900">{row.runs}</strong>{' '}
                            <span className="text-slate-500">({row.balls})</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-700">
                            {row.fours}/{row.sixes}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-700">
                            {row.strikeRate}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-800">
                            {row.overs !== '—'
                              ? `${row.overs}-${row.runsConceded}-${row.wickets}`
                              : row.wickets > 0
                                ? `${row.wickets}w`
                                : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : generalSportStatRows.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                No player statistics recorded for this match yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-2.5 px-3">Player</th>
                      <th className="py-2.5 px-3">Team</th>
                      {broadcast.sport === 'Football' ? (
                        <>
                          <th className="py-2.5 px-3 font-mono text-right">Goals</th>
                          <th className="py-2.5 px-3 font-mono text-right">Assists</th>
                          <th className="py-2.5 px-3 font-mono text-right">Cards</th>
                        </>
                      ) : broadcast.sport === 'Volleyball' ? (
                        <>
                          <th className="py-2.5 px-3 font-mono text-right">Attack</th>
                          <th className="py-2.5 px-3 font-mono text-right">Block</th>
                          <th className="py-2.5 px-3 font-mono text-right">Aces</th>
                        </>
                      ) : (
                        <th className="py-2.5 px-3 font-mono text-right">Points</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {generalSportStatRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {row.playerId && /^[a-f\d]{24}$/i.test(row.playerId) ? (
                            <Link to={`/players/${row.playerId}`} className="hover:text-[#EA580C]">
                              {row.jersey != null ? `#${row.jersey} ` : ''}
                              {row.name}
                            </Link>
                          ) : (
                            <span>
                              {row.jersey != null ? `#${row.jersey} ` : ''}
                              {row.name}
                            </span>
                          )}
                          {row.position && (
                            <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                              ({row.position})
                            </span>
                          )}
                          {row.isMvp && (
                            <span className="ml-1.5 text-[10px] font-bold text-amber-700">
                              POTM
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{row.teamName}</td>
                        {broadcast.sport === 'Football' ? (
                          <>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-right font-bold">
                              {row.goals}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-right">
                              {row.assists}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-right">
                              Y:{row.yellowCards} R:{row.redCards}
                            </td>
                          </>
                        ) : broadcast.sport === 'Volleyball' ? (
                          <>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-right font-bold">
                              {row.attackPoints}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-right">
                              {row.blockPoints}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-right">
                              {row.serveAces}
                            </td>
                          </>
                        ) : (
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right font-bold">
                            {row.pointsScored}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lineups' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { team: broadcast.teamA, roster: mergedRoster.teamA },
              { team: broadcast.teamB, roster: mergedRoster.teamB },
            ].map((side, idx) => (
              <div
                key={side.team.id || idx}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
                  <TeamAvatar name={side.team.name} logoUrl={side.team.logoUrl} size="sm" />
                  <h3 className="font-display text-sm font-bold text-slate-900 truncate">
                    {side.team.name}
                  </h3>
                  <span className="ml-auto text-xs text-slate-500 font-mono">
                    {side.roster.length} players
                  </span>
                </div>
                {side.roster.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">Squad list not published yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {side.roster.map((p) => {
                      const hasDbProfile = Boolean(
                        p.dbPlayerId && /^[a-f\d]{24}$/i.test(p.dbPlayerId)
                      );
                      const label = (
                        <>
                          <span className="font-medium text-slate-900 truncate">
                            {p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ''}
                            {p.name}
                          </span>
                          <span className="text-slate-500 shrink-0">
                            {p.position || 'Player'}
                          </span>
                        </>
                      );
                      return hasDbProfile ? (
                        <Link
                          key={p.id}
                          to={`/players/${p.dbPlayerId}`}
                          className="py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 px-1 rounded"
                        >
                          {label}
                        </Link>
                      ) : (
                        <div
                          key={p.id}
                          className="py-2 flex items-center justify-between gap-2 text-xs px-1"
                        >
                          {label}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'fixtures' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Tournament Schedule
              </h2>
              {broadcast.tournamentId && (
                <Link
                  to={`/tournaments/${broadcast.tournamentId}`}
                  className="text-xs font-semibold text-[#EA580C] hover:underline"
                >
                  Full Tournament
                </Link>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {upcomingFixtures.map((fx) => (
                <div key={fx.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {fx.teamAName || 'TBD'} vs {fx.teamBName || 'TBD'}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {fx.roundName || `Round ${fx.roundNumber}`}
                      {fx.scheduledAt ? ` · ${new Date(fx.scheduledAt).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <span className="font-semibold text-slate-600 shrink-0">{fx.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <LiveChatAndPollsPanel streamId={broadcast.id} chatEnabled={broadcast.chatEnabled} />
        )}

        {activeTab === 'highlights' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#EA580C]" />
                <span>Key Match Moments</span>
              </h2>
              {resolvedAuth && (
                <span className="text-xs text-slate-500 font-mono">{highlights.length} clips</span>
              )}
            </div>
            {!resolvedAuth ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-slate-700">
                    Sign in as a Player to view match highlight timestamps and jump straight to key moments.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/login?next=${encodeURIComponent(returnPath)}`}
                    className="min-h-[34px] inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    Sign In
                  </Link>
                  <Link
                    to={`/register?next=${encodeURIComponent(returnPath)}`}
                    className="min-h-[34px] inline-flex items-center px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-orange-700"
                  >
                    Register
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {highlights.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => onJumpHighlight(h.videoTimestampSeconds)}
                    className="min-h-[40px] inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-xs transition-colors"
                  >
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono text-[11px]">
                      <Clock className="w-3 h-3 text-orange-400" />
                      {formatTimestamp(h.videoTimestampSeconds)}
                    </span>
                    <span className="font-semibold text-slate-900">{h.eventType}</span>
                    {h.playerName && <span className="text-slate-600">({h.playerName})</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'info' && (
          <div className="space-y-4">
            {followFeedback && (
              <div className="p-2.5 rounded-lg bg-slate-900 text-white text-xs">{followFeedback}</div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="font-display text-sm font-bold text-slate-900">Participating Teams</h2>
              <div className="flex flex-wrap gap-3">
                {[broadcast.teamA, broadcast.teamB].map((tm, i) => (
                  <div
                    key={tm.id || tm.name || i}
                    className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  >
                    <TeamAvatar name={tm.name} logoUrl={tm.logoUrl} size="sm" />
                    {tm.id ? (
                      <Link
                        to={`/teams/${tm.id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-[#EA580C]"
                      >
                        {tm.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-slate-900">{tm.name}</span>
                    )}
                    {tm.id && (
                      <button
                        type="button"
                        disabled={followBusyId === tm.id}
                        onClick={() => handleToggleFollow(tm.id!, tm.name)}
                        className={`ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                          followedIds.has(tm.id)
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {followedIds.has(tm.id) ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <BellPlus className="w-3 h-3" />
                        )}
                        <span>{followedIds.has(tm.id) ? 'Following' : 'Follow'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {stream.matchDescription && (
                <p className="text-sm text-slate-600 leading-relaxed pt-1">
                  {stream.matchDescription}
                </p>
              )}
            </div>

            {partnerSponsors.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Official Broadcast Partners</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {partnerSponsors.map((sp) => (
                    <a
                      key={sp.id}
                      href={sp.websiteUrl || undefined}
                      target={sp.websiteUrl ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      onClick={() => platformOpsService.trackSponsorClick(sp.id)}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:border-orange-300 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {sp.logoUrl && (
                          <img
                            src={sp.logoUrl}
                            alt={sp.name}
                            className="w-9 h-9 rounded-lg object-contain bg-white border border-slate-200 p-1 shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{sp.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {sp.tagline || sp.sponsorshipType}
                          </p>
                        </div>
                      </div>
                      {sp.websiteUrl && (
                        <span className="text-[11px] font-semibold text-[#EA580C] shrink-0">
                          {sp.ctaText || 'Visit'}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
