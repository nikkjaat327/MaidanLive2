import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  Award,
  BarChart3,
  Clock,
  Edit3,
  Eye,
  Flag,
  History,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Sliders,
  SlidersHorizontal,
  Timer,
  Unlock,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  LiveScoreData,
  LiveStreamData,
  PlayerData,
  PlayerMatchStatRecord,
  ScoreHistoryItem,
} from '../../../types/index.ts';
import {
  createDefaultKabaddiScorerSettings,
  createDefaultKabaddiViewerSettings,
  type KabaddiClockCommand,
  type KabaddiCourtPlayer,
  type KabaddiDetails,
  type KabaddiRulesConfig,
  type KabaddiScorerSettings,
  type KabaddiViewerDisplaySettings,
} from '../../../utils/kabaddiScoring.ts';
import { resolveTeamId } from '../../../utils/dedupe.ts';
import { TeamAvatar } from '../../common/TeamAvatar.tsx';
import { KabaddiCourtDots } from './KabaddiCourtDots.tsx';

export type KabaddiSidebarTab =
  | 'controls'
  | 'events'
  | 'raids'
  | 'stats'
  | 'roster'
  | 'scorer_ui'
  | 'viewer_ui';

interface KabaddiSidebarPanelsProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  details: KabaddiDetails;
  history: ScoreHistoryItem[];
  players: PlayerData[];
  playerStats: PlayerMatchStatRecord[];
  saving: boolean;
  formattedClock: string;
  activeTab: KabaddiSidebarTab;
  onChangeTab: (tab: KabaddiSidebarTab) => void;
  onClockCommand: (cmd: KabaddiClockCommand) => void;
  onOpenTimeCorrection: () => void;
  onOpenScoreCorrection: () => void;
  onOpenTimeout: () => void;
  onOpenRules: () => void;
  onOpenPlayerOps: (mode: 'SUBSTITUTION' | 'CARD' | 'INJURY') => void;
  onOpenForfeit: () => void;
  onOpenCompleteMatch: () => void;
  onReopenMatch: () => void;
  onCorrectEvent: (item: ScoreHistoryItem) => void;
  onSyncRoster: () => void;
  onSaveScorerSettings: (settings: KabaddiScorerSettings) => void;
  onResetScorerSettings: () => void;
  onSaveViewerSettings: (settings: KabaddiViewerDisplaySettings) => void;
  onSaveRules?: (rules: KabaddiRulesConfig) => void;
  onResetViewerSettings: () => void;
}

const SCORER_BUTTON_LABELS: Array<{ key: keyof KabaddiScorerSettings['buttons']; label: string }> = [
  { key: 'touchPoint', label: 'TOUCH POINT' },
  { key: 'unsuccessfulRaid', label: 'TACKLE POINT (+1)' },
  { key: 'emptyRaid', label: 'EMPTY RAID' },
  { key: 'bonusPoint', label: 'BONUS POINT' },
  { key: 'multiPointsRaid', label: 'MULTI POINTS RAID' },
  { key: 'superTackle', label: 'SUPER TACKLE' },
  { key: 'doOrDieRaid', label: 'DO OR DIE RAID' },
  { key: 'extraPoints', label: 'EXTRA POINTS' },
];

const SCORER_PANEL_LABELS: Array<{ key: keyof KabaddiScorerSettings['panels']; label: string }> = [
  { key: 'matchControls', label: 'Match Controls Panel' },
  { key: 'eventHistory', label: 'Event History Panel' },
  { key: 'raidHistory', label: 'Raid History Timeline' },
  { key: 'playerStats', label: 'Player Statistics Table' },
  { key: 'playerRoster', label: 'Team Roster & Court Sheet' },
  { key: 'timeoutControls', label: 'Timeout Controls' },
  { key: 'cardsDiscipline', label: 'Cards & Discipline Controls' },
];

const VIEWER_DISPLAY_TOGGLES: Array<{
  key: keyof KabaddiViewerDisplaySettings;
  label: string;
}> = [
  { key: 'showTeamNames', label: 'Team Names' },
  { key: 'showTeamLogos', label: 'Team Logos' },
  { key: 'showScores', label: 'Team Scores' },
  { key: 'showMatchTimer', label: 'Match Timer' },
  { key: 'showHalf', label: 'Half / Stage Label' },
  { key: 'showRaidTimer', label: '30s Raid Timer' },
  { key: 'showPlayersOnCourtDots', label: 'Players on Court Dots' },
  { key: 'showPlayerNames', label: 'Court Player Names' },
  { key: 'showJerseyNumbers', label: 'Jersey Numbers' },
  { key: 'showDoOrDieBanner', label: 'Do-or-Die Banner' },
  { key: 'showAllOutAnimation', label: 'All-Out Animation Banner' },
  { key: 'showSuperTackleBadge', label: 'Super Tackle Badge' },
  { key: 'showSuperRaidBadge', label: 'Super Raid Badge' },
  { key: 'showBonusBadge', label: 'Bonus Point Badge' },
  { key: 'showTimeoutBanner', label: 'Official Timeout Banner' },
  { key: 'showRaidHistory', label: 'Spectator Raid History' },
  { key: 'showPlayerStats', label: 'Spectator Player Stats' },
  { key: 'showSponsorLogos', label: 'Sponsor Logos' },
  { key: 'showTournamentLogo', label: 'Tournament Badge / Name' },
  { key: 'showMatchEvents', label: 'Match Event Feed' },
  { key: 'enableAnimations', label: 'Motion Animations' },
];

export function KabaddiSidebarPanels({
  stream,
  score,
  details,
  history,
  players,
  playerStats,
  saving,
  formattedClock,
  activeTab,
  onChangeTab,
  onClockCommand,
  onOpenTimeCorrection,
  onOpenScoreCorrection,
  onOpenTimeout,
  onOpenRules,
  onOpenPlayerOps,
  onOpenForfeit,
  onOpenCompleteMatch,
  onReopenMatch,
  onCorrectEvent,
  onSyncRoster,
  onSaveScorerSettings,
  onResetScorerSettings,
  onSaveViewerSettings,
  onSaveRules,
  onResetViewerSettings,
}: KabaddiSidebarPanelsProps) {
  const teamAName = stream.teamAName || 'Team A';
  const teamBName = stream.teamBName || 'Team B';
  const [suspendReason, setSuspendReason] = useState('');
  const [scorerDraft, setScorerDraft] = useState<KabaddiScorerSettings>(details.scorerSettings);
  const [viewerDraft, setViewerDraft] = useState<KabaddiViewerDisplaySettings>(
    details.viewerDisplaySettings
  );
  const [dodDurationSec, setDodDurationSec] = useState<number>(
    details.rules.doOrDieBannerDurationSec || 10
  );
  const [allOutDurationSec, setAllOutDurationSec] = useState<number>(
    details.rules.allOutBannerDurationSec || 6
  );

  useEffect(() => {
    setScorerDraft(details.scorerSettings);
  }, [details.scorerSettings]);

  useEffect(() => {
    setViewerDraft(details.viewerDisplaySettings);
  }, [details.viewerDisplaySettings]);

  useEffect(() => {
    setDodDurationSec(details.rules.doOrDieBannerDurationSec || 10);
    setAllOutDurationSec(details.rules.allOutBannerDurationSec || 6);
  }, [details.rules.doOrDieBannerDurationSec, details.rules.allOutBannerDurationSec]);

  const panels = details.scorerSettings.panels;
  const isSuspended = details.clock.status === 'SUSPENDED';
  const isRunning =
    details.clock.status === 'RUNNING' || details.clock.status === 'EXTRA_TIME';

  const visibleTabs: Array<{ id: KabaddiSidebarTab; label: string; icon: typeof Sliders }> = [
    ...(panels.matchControls ? [{ id: 'controls' as const, label: 'Controls', icon: Sliders }] : []),
    ...(panels.eventHistory ? [{ id: 'events' as const, label: 'Events', icon: History }] : []),
    ...(panels.raidHistory ? [{ id: 'raids' as const, label: 'Raids', icon: Activity }] : []),
    ...(panels.playerStats ? [{ id: 'stats' as const, label: 'Stats', icon: BarChart3 }] : []),
    ...(panels.playerRoster ? [{ id: 'roster' as const, label: 'Roster', icon: Users }] : []),
    { id: 'scorer_ui', label: 'Scorer UI', icon: SlidersHorizontal },
    { id: 'viewer_ui', label: 'Viewer UI', icon: Eye },
  ];

  // Merge DB PlayerMatchStat with live courtPlayersA/B so full tournament match stats always display cleanly
  const dbStatByPlayerId = new Map<string, PlayerMatchStatRecord>();
  playerStats.forEach((st) => {
    const pid =
      typeof st.playerId === 'object' && st.playerId ? st.playerId._id : String(st.playerId || '');
    if (pid) dbStatByPlayerId.set(pid, st);
  });

  const combinedPlayerRows: Array<{
    teamName: string;
    side: 'A' | 'B';
    player: KabaddiCourtPlayer;
    dbStat?: PlayerMatchStatRecord;
  }> = [
    ...details.courtPlayersA.map((player) => ({
      teamName: teamAName,
      side: 'A' as const,
      player,
      dbStat: dbStatByPlayerId.get(player.playerId),
    })),
    ...details.courtPlayersB.map((player) => ({
      teamName: teamBName,
      side: 'B' as const,
      player,
      dbStat: dbStatByPlayerId.get(player.playerId),
    })),
  ];

  const dbRosterCountA = players.filter((p) => resolveTeamId(p.teamId) === stream.teamAId).length;
  const dbRosterCountB = players.filter((p) => resolveTeamId(p.teamId) === stream.teamBId).length;

  return (
    <aside className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
      {/* Tab Strip */}
      <div className="flex items-center gap-1 p-2 bg-slate-950/80 border-b border-slate-800 overflow-x-auto">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChangeTab(t.id)}
              className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-[#EA580C] text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className="p-4 space-y-4 text-xs text-slate-200 max-h-[680px] overflow-y-auto">
        {/* 1. CONTROLS */}
        {activeTab === 'controls' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Match Half &amp; Stage Transitions
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onClockCommand({ type: 'START_MATCH' })}
                  className="min-h-[42px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start 1st Half</span>
                </button>
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onClockCommand({ type: 'HALF_TIME' })}
                  className="min-h-[42px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Half Time</span>
                </button>
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onClockCommand({ type: 'START_NEXT_HALF', halfNumber: 2 })}
                  className="min-h-[42px] px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start 2nd Half</span>
                </button>
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onClockCommand({ type: 'EXTRA_TIME', halfNumber: 1 })}
                  className="min-h-[42px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold disabled:opacity-40 whitespace-nowrap"
                >
                  Extra Time
                </button>
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onClockCommand({ type: 'TIE_BREAKER' })}
                  className="min-h-[42px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold disabled:opacity-40 whitespace-nowrap"
                >
                  5-Raid Tie-Breaker
                </button>
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onClockCommand({ type: 'GOLDEN_RAID' })}
                  className="min-h-[42px] px-3 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-slate-950 font-bold disabled:opacity-40 whitespace-nowrap"
                >
                  Golden Raid
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Clock, Court &amp; Official Actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onClockCommand({ type: isRunning ? 'PAUSE' : 'RESUME' })}
                  className="min-h-[42px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                >
                  {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isRunning ? 'Pause Clock' : 'Resume Clock'}</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onOpenTimeCorrection}
                  className="min-h-[42px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Time Correction</span>
                </button>
                {panels.timeoutControls && (
                  <button
                    type="button"
                    disabled={saving || details.matchCompleted}
                    onClick={onOpenTimeout}
                    className="min-h-[42px] px-3 rounded-lg bg-sky-900/60 hover:bg-sky-800/70 border border-sky-700/60 text-sky-100 font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Timer className="w-3.5 h-3.5" />
                    <span>Official Timeout</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onClockCommand({ type: 'SIDE_CHANGE' })}
                  className="min-h-[42px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Swap Sides</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onOpenScoreCorrection}
                  className="min-h-[42px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Score Correction</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onOpenRules}
                  className="min-h-[42px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Match Rules</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Player Management &amp; Discipline
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onOpenPlayerOps('SUBSTITUTION')}
                  className="min-h-[42px] px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40 whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Sub</span>
                </button>
                {panels.cardsDiscipline && (
                  <button
                    type="button"
                    disabled={saving || details.matchCompleted}
                    onClick={() => onOpenPlayerOps('CARD')}
                    className="min-h-[42px] px-2.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/70 border border-amber-700/60 text-amber-200 font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40 whitespace-nowrap"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={() => onOpenPlayerOps('INJURY')}
                  className="min-h-[42px] px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40 whitespace-nowrap"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Injury</span>
                </button>
              </div>
            </div>

            {/* Suspend / Resume / Forfeit / Complete / Reopen */}
            <div className="space-y-2.5 pt-3 border-t border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Match Lifecycle
              </p>
              {!isSuspended ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    placeholder="Suspend reason (rain, floodlight...)"
                    className="flex-1 min-h-[38px] px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500"
                  />
                  <button
                    type="button"
                    disabled={saving || details.matchCompleted}
                    onClick={() => {
                      onClockCommand({
                        type: 'SUSPEND_MATCH',
                        reason: suspendReason.trim() || 'Official Suspension',
                      });
                      setSuspendReason('');
                    }}
                    className="min-h-[38px] px-3 rounded-lg bg-amber-600 text-slate-950 font-bold hover:bg-amber-500 disabled:opacity-40 whitespace-nowrap"
                  >
                    Suspend
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onClockCommand({ type: 'RESUME_MATCH' })}
                  className="w-full min-h-[42px] rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-500"
                >
                  Resume Suspended Match
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saving || details.matchCompleted}
                  onClick={onOpenForfeit}
                  className="min-h-[42px] px-3 rounded-lg bg-red-950/70 hover:bg-red-900/70 border border-red-800/70 text-red-200 font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Forfeit</span>
                </button>
                {details.matchCompleted ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onReopenMatch}
                    className="min-h-[42px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Reopen Match</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onOpenCompleteMatch}
                    className="min-h-[42px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Complete Match</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. AUDITED EVENTS */}
        {activeTab === 'events' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Audited Event History ({history.length})
              </p>
              <span className="font-mono text-[11px] text-slate-500">Clock {formattedClock}</span>
            </div>
            {history.length === 0 ? (
              <p className="py-6 text-center text-slate-500">No events recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {history.map((item) => {
                  const isReverted = Boolean(item.reverted);
                  const isUndo = item.entryType === 'UNDO';
                  const isCorrection = item.entryType === 'CORRECTION' || item.isCorrection;
                  return (
                    <div
                      key={item._id}
                      className={`py-2.5 flex items-start justify-between gap-2 ${
                        isReverted ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className={`font-medium leading-snug ${isReverted ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                          {isUndo && <span className="text-amber-400 font-bold mr-1">[UNDO]</span>}
                          {isCorrection && <span className="text-sky-400 font-bold mr-1">[CORRECTION]</span>}
                          {isReverted && <span className="text-red-400 font-bold mr-1">[REVERTED]</span>}
                          {item.action}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(item.createdAt).toLocaleTimeString()} ·{' '}
                          <span className="font-mono tabular-nums text-slate-400">
                            {item.updatedScore?.teamAScore ?? 0}-{item.updatedScore?.teamBScore ?? 0}
                          </span>
                        </p>
                      </div>
                      {(!item.entryType || item.entryType === 'SCORE_UPDATE') && !isReverted && (
                        <button
                          type="button"
                          onClick={() => onCorrectEvent(item)}
                          className="min-h-[30px] px-2 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 shrink-0"
                        >
                          Correct
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. RAID HISTORY TIMELINE */}
        {activeTab === 'raids' && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Raid Timeline ({details.raidTimeline.length})
            </p>
            {details.raidTimeline.length === 0 ? (
              <p className="py-6 text-center text-slate-500">No raids recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {details.raidTimeline.map((raid) => (
                  <div
                    key={raid.id}
                    className={`py-2.5 space-y-1 ${raid.reverted ? 'opacity-45 line-through' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white truncate">
                        {raid.raidNumber ? `#${raid.raidNumber} ` : ''}
                        {raid.team === 'A' ? teamAName : teamBName} ·{' '}
                        {raid.eventType.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-orange-400 shrink-0">
                        {raid.points > 0 ? `+${raid.points}` : '0'} · {raid.scoreSnapshot}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                      <span>{raid.half}{raid.clockText ? ` (${raid.clockText})` : ''}</span>
                      {raid.playerName && <span>· Player: {raid.playerName}</span>}
                      {raid.defenderNames && raid.defenderNames.length > 0 && (
                        <span>· Out: {raid.defenderNames.join(', ')}</span>
                      )}
                      {raid.revivedNames && raid.revivedNames.length > 0 && (
                        <span className="text-emerald-400">· Revived: {raid.revivedNames.join(', ')}</span>
                      )}
                      {raid.isDoOrDie && <span className="text-amber-300 font-bold">· DO-OR-DIE</span>}
                      {raid.isSuperRaid && <span className="text-orange-300 font-bold">· SUPER RAID</span>}
                      {raid.isSuperTackle && <span className="text-sky-300 font-bold">· SUPER TACKLE</span>}
                      {raid.isAllOut && <span className="text-red-400 font-bold">· ALL-OUT</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. PLAYER STATISTICS TABLE */}
        {activeTab === 'stats' && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Live Kabaddi Player Statistics
            </p>
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono">
                    <th className="py-2 px-2.5 font-sans">Player</th>
                    <th className="py-2 px-2 text-right">Raid</th>
                    <th className="py-2 px-2 text-right">Tck</th>
                    <th className="py-2 px-2 text-right">Bon</th>
                    <th className="py-2 px-2 text-right">Tot</th>
                    <th className="py-2 px-2 text-right">R/Att</th>
                    <th className="py-2 px-2 text-right">Empty</th>
                    <th className="py-2 px-2 text-right">SR/ST</th>
                    <th className="py-2 px-2 text-right">Out/Rev</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono tabular-nums">
                  {combinedPlayerRows.map(({ teamName, player, dbStat }) => {
                    const st = player.stats;
                    const raidPts = Math.max(st.raidPoints, dbStat?.raidPoints || 0);
                    const tacklePts = Math.max(st.tacklePoints, dbStat?.tacklePoints || 0);
                    const bonusPts = Math.max(st.bonusPoints, dbStat?.bonusPoints || 0);
                    const totalPts = Math.max(st.totalPoints, raidPts + tacklePts + bonusPts);
                    return (
                      <tr key={player.playerId} className="hover:bg-slate-800/40">
                        <td className="py-2 px-2.5 font-sans">
                          <p className="font-semibold text-white truncate max-w-[120px]">
                            {player.jerseyNumber ? `#${player.jerseyNumber} ` : ''}
                            {player.name}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate max-w-[120px]">
                            {teamName} · {player.status.replace('_', ' ')}
                          </p>
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-orange-300">{raidPts}</td>
                        <td className="py-2 px-2 text-right text-sky-300">{tacklePts}</td>
                        <td className="py-2 px-2 text-right text-emerald-300">{bonusPts}</td>
                        <td className="py-2 px-2 text-right font-bold text-white">{totalPts}</td>
                        <td className="py-2 px-2 text-right text-slate-300">
                          {st.successfulRaids}/{st.raidsAttempted}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-400">{st.emptyRaids}</td>
                        <td className="py-2 px-2 text-right text-amber-300">
                          {st.superRaids}/{st.superTackles}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-300">
                          {st.outCount}/{st.revivals}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. TEAM ROSTER & COURT SHEET */}
        {activeTab === 'roster' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Team Rosters &amp; Court Positions
                </p>
                <p className="text-[11px] text-slate-500">
                  DB Roster available: {teamAName} ({dbRosterCountA}) · {teamBName} ({dbRosterCountB})
                </p>
              </div>
              <button
                type="button"
                disabled={saving || (dbRosterCountA === 0 && dbRosterCountB === 0)}
                onClick={onSyncRoster}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white disabled:opacity-45 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync DB Rosters</span>
              </button>
            </div>

            {[
              { title: teamAName, side: 'A' as const, list: details.courtPlayersA },
              { title: teamBName, side: 'B' as const, list: details.courtPlayersB },
            ].map((group) => (
              <div key={group.title} className="space-y-2 border-t border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{group.title}</span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Active {group.list.filter((p) => p.status === 'ON_COURT').length}/{details.rules.playersPerSide}
                  </span>
                </div>
                <KabaddiCourtDots
                  players={group.list}
                  maxPlayers={details.rules.playersPerSide}
                  teamName={group.title}
                  side={group.side}
                  showNames
                  showNumbers
                />
                <div className="divide-y divide-slate-800/80">
                  {group.list.map((p) => (
                    <div key={p.playerId} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-slate-200">
                        {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
                        {p.cards.green + p.cards.yellow + p.cards.red > 0 && (
                          <span className="ml-1.5 font-mono text-amber-300">
                            (G:{p.cards.green} Y:{p.cards.yellow} R:{p.cards.red})
                          </span>
                        )}
                      </span>
                      <span
                        className={`font-mono font-bold shrink-0 ${
                          p.status === 'ON_COURT'
                            ? 'text-emerald-400'
                            : p.status === 'OUT'
                              ? 'text-slate-500'
                              : p.status === 'DISQUALIFIED'
                                ? 'text-red-400'
                                : 'text-amber-300'
                        }`}
                      >
                        {p.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 6. SCORING CONSOLE SETTINGS */}
        {activeTab === 'scorer_ui' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Enabled Scoring Buttons (Both Teams)
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {SCORER_BUTTON_LABELS.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer"
                  >
                    <span className="font-semibold text-slate-200">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={scorerDraft.buttons[item.key]}
                      onChange={(e) =>
                        setScorerDraft((prev) => ({
                          ...prev,
                          buttons: { ...prev.buttons, [item.key]: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 rounded border-slate-600 text-[#EA580C]"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Visible Console Panels
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {SCORER_PANEL_LABELS.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer"
                  >
                    <span className="text-slate-300">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={scorerDraft.panels[item.key]}
                      onChange={(e) =>
                        setScorerDraft((prev) => ({
                          ...prev,
                          panels: { ...prev.panels, [item.key]: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 rounded border-slate-600 text-[#EA580C]"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Workflow Preferences
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['quick', 'detailed'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setScorerDraft((prev) => ({ ...prev, defaultScoringMode: m }))}
                    className={`min-h-[38px] rounded-lg font-bold uppercase border ${
                      scorerDraft.defaultScoringMode === m
                        ? 'bg-[#EA580C] text-white border-[#EA580C]'
                        : 'bg-slate-950 text-slate-300 border-slate-700'
                    }`}
                  >
                    {m === 'quick' ? 'Quick Scoring' : 'Player Selection'}
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer">
                <span>Confirm Reset / Undo / Forfeit actions</span>
                <input
                  type="checkbox"
                  checked={scorerDraft.confirmDestructiveActions}
                  onChange={(e) =>
                    setScorerDraft((prev) => ({
                      ...prev,
                      confirmDestructiveActions: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded border-slate-600 text-[#EA580C]"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const def = createDefaultKabaddiScorerSettings();
                  setScorerDraft(def);
                  onResetScorerSettings();
                }}
                className="min-h-[40px] px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSaveScorerSettings(scorerDraft)}
                className="min-h-[40px] px-4 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white font-bold inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Console Settings</span>
              </button>
            </div>
          </div>
        )}

        {/* 7. SCOREBOARD DISPLAY SETTINGS + LIVE PREVIEW */}
        {activeTab === 'viewer_ui' && (
          <div className="space-y-4">
            {/* Live Mini Preview */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Live Spectator &amp; OBS Display Preview
              </p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                {viewerDraft.showTournamentLogo && stream.tournamentName && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400 text-center">
                    {stream.tournamentName}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {viewerDraft.showTeamLogos && (
                      <TeamAvatar name={teamAName} logoUrl={stream.teamALogo} size="sm" />
                    )}
                    {viewerDraft.showTeamNames && (
                      <span className="font-bold text-white truncate max-w-[90px]">{teamAName}</span>
                    )}
                  </div>
                  <div className="text-center font-mono tabular-nums shrink-0">
                    {viewerDraft.showScores && (
                      <p className="text-base font-extrabold text-white">
                        {score?.teamAScore ?? 0} - {score?.teamBScore ?? 0}
                      </p>
                    )}
                    <p className="text-[10px] text-emerald-400">
                      {viewerDraft.showHalf ? details.half : ''}
                      {viewerDraft.showHalf && viewerDraft.showMatchTimer ? ' · ' : ''}
                      {viewerDraft.showMatchTimer ? formattedClock : ''}
                      {viewerDraft.showRaidTimer && details.clock.raidTimerEnabled
                        ? ` · R:${Math.ceil(details.clock.raidRemainingMs / 1000)}s`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0 justify-end">
                    {viewerDraft.showTeamNames && (
                      <span className="font-bold text-white truncate max-w-[90px] text-right">
                        {teamBName}
                      </span>
                    )}
                    {viewerDraft.showTeamLogos && (
                      <TeamAvatar name={teamBName} logoUrl={stream.teamBLogo} size="sm" />
                    )}
                  </div>
                </div>
                {viewerDraft.showPlayersOnCourtDots && (
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80">
                    <KabaddiCourtDots
                      players={details.courtPlayersA}
                      maxPlayers={details.rules.playersPerSide}
                      teamName={teamAName}
                      side="A"
                      compact
                      showNumbers={viewerDraft.showJerseyNumbers}
                    />
                    <KabaddiCourtDots
                      players={details.courtPlayersB}
                      maxPlayers={details.rules.playersPerSide}
                      teamName={teamBName}
                      side="B"
                      compact
                      showNumbers={viewerDraft.showJerseyNumbers}
                    />
                  </div>
                )}
              </div>
            </div>

            {onSaveRules && (
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-orange-300">
                  OBS &amp; Scoreboard Animation Timing (Seconds)
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Do-or-Die Animation (s)
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={dodDurationSec}
                      onChange={(e) =>
                        setDodDurationSec(Math.max(2, Math.min(120, Number(e.target.value) || 2)))
                      }
                      className="w-full min-h-[36px] px-2.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      All-Out Animation (s)
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={allOutDurationSec}
                      onChange={(e) =>
                        setAllOutDurationSec(
                          Math.max(2, Math.min(120, Number(e.target.value) || 2))
                        )
                      }
                      className="w-full min-h-[36px] px-2.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-1.5">
              {VIEWER_DISPLAY_TOGGLES.map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer"
                >
                  <span className="text-slate-200">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={viewerDraft[item.key]}
                    onChange={(e) => {
                      const next = { ...viewerDraft, [item.key]: e.target.checked };
                      setViewerDraft(next);
                      onSaveViewerSettings(next);
                    }}
                    className="w-4 h-4 rounded border-slate-600 text-[#EA580C]"
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const def = createDefaultKabaddiViewerSettings();
                  setViewerDraft(def);
                  onResetViewerSettings();
                }}
                className="min-h-[40px] px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  onSaveViewerSettings(viewerDraft);
                  if (
                    onSaveRules &&
                    (dodDurationSec !== details.rules.doOrDieBannerDurationSec ||
                      allOutDurationSec !== details.rules.allOutBannerDurationSec)
                  ) {
                    onSaveRules({
                      ...details.rules,
                      doOrDieBannerDurationSec: dodDurationSec,
                      allOutBannerDurationSec: allOutDurationSec,
                    });
                  }
                }}
                className="min-h-[40px] px-4 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white font-bold inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Viewer Layout</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
