import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Sparkles } from 'lucide-react';
import { LiveStreamData, MatchHighlightData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { MatchHighlightsManager } from '../../components/scoreboard/MatchHighlightsManager.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminHighlightsPage() {
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [highlights, setHighlights] = useState<MatchHighlightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStreams = useCallback(async () => {
    try {
      setError(null);
      const list = await liveStreamService.listStreams();
      setStreams(list);
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to load streams.'));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadHighlights = useCallback(async (streamId: string) => {
    if (!streamId) return;
    try {
      const list = await engagementService.listHighlights(streamId);
      setHighlights(list);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load highlights.'));
    }
  }, []);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);

  useEffect(() => {
    if (selectedId) {
      loadHighlights(selectedId);
    }
  }, [selectedId, loadHighlights]);

  const selectedStream = streams.find((s) => s.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Match Highlights Manager
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tag timestamped key moments (Six, Wicket, Goal, Super Raid, Match Point) so viewers can jump straight to the exact video second.
        </p>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : streams.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="w-6 h-6" />}
          title="No broadcasts available"
          description="Start or schedule a live stream first to tag key video highlight timestamps."
        />
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Select Match Broadcast:
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 max-w-xl min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.status}] {s.matchTitle || `${s.teamAName} vs ${s.teamBName}` || s.youtubeVideoId}
                  </option>
                ))}
              </select>
            </div>
            {selectedStream && (
              <div className="flex items-center gap-3 text-xs">
                <Link
                  to={`/admin/scoreboard/${selectedStream.id}`}
                  className="font-semibold text-slate-700 hover:text-slate-900"
                >
                  Open Score Control
                </Link>
                <Link
                  to={`/live/${selectedStream.id}`}
                  className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                >
                  <span>Watch Page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>

          {selectedStream && (
            <MatchHighlightsManager
              streamId={selectedStream.id}
              highlights={highlights}
              onRefresh={() => loadHighlights(selectedStream.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}
