import { useEffect, useMemo, useState } from 'react';
import { Award, Eye, EyeOff, Radio, Sparkles } from 'lucide-react';
import {
  LiveScoreData,
  LiveStreamData,
  PlayerMatchStatRecord,
  ScoreHistoryItem,
} from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { computeLiveMvpCandidates } from '../../utils/liveMvp.ts';
import {
  BroadcastOverlayConfig,
  normalizeOverlayConfig,
  type OverlayPosition,
} from '../../utils/overlayConfig.ts';

interface LiveMvpTrackerPanelProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  history: ScoreHistoryItem[];
  playerStats?: PlayerMatchStatRecord[];
}

const POSITION_OPTIONS: Array<{ value: OverlayPosition; label: string }> = [
  { value: 'top-right', label: 'Top Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
];

export function LiveMvpTrackerPanel({
  stream,
  score,
  history,
  playerStats = [],
}: LiveMvpTrackerPanelProps) {
  const [overlayConfig, setOverlayConfig] = useState<BroadcastOverlayConfig>(() =>
    normalizeOverlayConfig(stream.overlayConfig)
  );
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [position, setPosition] = useState<OverlayPosition>(
    () => normalizeOverlayConfig(stream.overlayConfig).liveMvpPosition || 'top-right'
  );
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const norm = normalizeOverlayConfig(stream.overlayConfig);
    setOverlayConfig(norm);
    setPosition(norm.liveMvpPosition || 'top-right');
  }, [stream.overlayConfig]);

  useEffect(() => {
    const socket = getSocketClient();
    const handleOverlayUpdated = (payload: {
      streamId?: string;
      overlayConfig?: BroadcastOverlayConfig;
    }) => {
      if (payload?.streamId === stream.id && payload?.overlayConfig) {
        const norm = normalizeOverlayConfig(payload.overlayConfig);
        setOverlayConfig(norm);
        setPosition(norm.liveMvpPosition || 'top-right');
      }
    };
    socket.on('overlay:config_updated', handleOverlayUpdated);
    return () => {
      socket.off('overlay:config_updated', handleOverlayUpdated);
    };
  }, [stream.id]);

  const ranking = useMemo(
    () =>
      computeLiveMvpCandidates({
        sportType: score?.sportType || stream.gameName,
        teamAName: stream.teamAName,
        teamBName: stream.teamBName,
        score,
        history,
        playerStats,
      }),
    [score, stream.gameName, stream.teamAName, stream.teamBName, history, playerStats]
  );

  const activeCandidate = useMemo(() => {
    if (selectedKey) {
      const found = ranking.candidates.find((c) => c.key === selectedKey);
      if (found) return found;
    }
    return ranking.suggestedMvp;
  }, [ranking, selectedKey]);

  const isCurrentlyFeatured = Boolean(
    overlayConfig.liveMvpVisible &&
      activeCandidate &&
      overlayConfig.liveMvpPlayerName.trim().toLowerCase() ===
        activeCandidate.name.trim().toLowerCase()
  );

  async function handleFeatureOnOverlay(nextVisible = true) {
    if (nextVisible && !activeCandidate) {
      setErrorMsg('Score runs or wickets first so a Live MVP candidate can be suggested.');
      return;
    }
    try {
      setBusy(true);
      setErrorMsg(null);
      setStatusMsg(null);
      const patch: Partial<BroadcastOverlayConfig> = nextVisible && activeCandidate
        ? {
            liveMvpVisible: true,
            liveMvpPlayerName: activeCandidate.name,
            liveMvpTeamName: activeCandidate.teamName,
            liveMvpStatsLine: activeCandidate.statLine,
            liveMvpLabel: 'LIVE MVP',
            liveMvpPosition: position,
          }
        : {
            liveMvpVisible: false,
          };

      const res = await liveStreamService.updateOverlayConfig(stream.id, patch);
      if (res?.overlayConfig) {
        setOverlayConfig(normalizeOverlayConfig(res.overlayConfig));
      }
      setStatusMsg(
        nextVisible && activeCandidate
          ? `Featured ${activeCandidate.name} on broadcast overlays.`
          : 'Removed Live MVP graphic from broadcast overlays.'
      );
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Failed to update Live MVP broadcast overlay.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Live MVP Tracker"
      className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 sm:p-4 text-white space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Award className="w-4 h-4 text-amber-400 shrink-0" />
          <h3 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
            Live MVP Tracker
          </h3>
          <span className="text-[11px] text-slate-400 truncate">
            Auto-suggested from live runs &amp; wickets
          </span>
        </div>

        {overlayConfig.liveMvpVisible && overlayConfig.liveMvpPlayerName ? (
          <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-300">
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span>
              On Air: <strong>{overlayConfig.liveMvpPlayerName}</strong>
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">Not featured on overlay</span>
        )}
      </div>

      {!ranking.suggestedMvp ? (
        <p className="text-xs text-slate-400 py-1">
          Start scoring runs, boundaries, or wickets to automatically identify the top-performing Live MVP candidate.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Auto-suggested / Selected Performer */}
          {activeCandidate && (
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-amber-300">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>
                      {activeCandidate.key === ranking.suggestedMvp.key
                        ? 'Auto-Suggested MVP'
                        : 'Selected Candidate'}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-300">{activeCandidate.teamName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-amber-200">
                    {activeCandidate.impactScore} pts ({activeCandidate.roleHighlight})
                  </span>
                </div>
                <p className="font-display text-base font-bold text-white truncate">
                  {activeCandidate.name}
                </p>
                <p className="font-mono tabular-nums text-xs text-slate-300">
                  {activeCandidate.statLine}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  aria-label="Live MVP overlay position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value as OverlayPosition)}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {POSITION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleFeatureOnOverlay(true)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {isCurrentlyFeatured ? 'Update Overlay' : 'Feature in Overlay'}
                  </span>
                </button>

                {overlayConfig.liveMvpVisible && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleFeatureOnOverlay(false)}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Top Contenders Quick-Select */}
          {ranking.candidates.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-400 mr-1">
                Top performers:
              </span>
              {ranking.candidates.slice(0, 4).map((cand, idx) => {
                const isSelected = activeCandidate?.key === cand.key;
                return (
                  <button
                    key={cand.key}
                    type="button"
                    onClick={() => setSelectedKey(cand.key)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 border-amber-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <span>
                      {idx === 0 ? '#1 ' : `#${idx + 1} `}
                      {cand.name}
                    </span>
                    <span className="ml-1.5 font-mono tabular-nums text-[11px] text-amber-300">
                      {cand.impactScore}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {statusMsg && <p className="text-xs text-emerald-300">{statusMsg}</p>}
      {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
    </section>
  );
}
