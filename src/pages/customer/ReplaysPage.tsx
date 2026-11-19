import { useEffect, useState } from 'react';
import { PlaySquare, Search } from 'lucide-react';
import { LiveStreamData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function ReplaysPage() {
  const [replays, setReplays] = useState<LiveStreamData[]>([]);
  const [sportFilter, setSportFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    liveStreamService
      .listReplays(false, sportFilter || undefined)
      .then(setReplays)
      .catch((err) => setError(extractApiError(err, 'Unable to load replays.')))
      .finally(() => setLoading(false));
  }, [sportFilter]);

  const filtered = replays.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (r.matchTitle || '').toLowerCase().includes(q) ||
      (r.teamAName || '').toLowerCase().includes(q) ||
      (r.teamBName || '').toLowerCase().includes(q) ||
      (r.tournamentName || '').toLowerCase().includes(q) ||
      (r.replayDescription || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Verified Match Replays
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Watch full-match YouTube replays paired with preserved final scoreboards &amp; key highlights.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search replays..."
              className="min-h-[40px] pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg w-48 sm:w-56"
            />
          </div>
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
          >
            <option value="">All Sports</option>
            {SPORT_OPTIONS.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<PlaySquare className="w-6 h-6" />}
          title="No replays published yet"
          description="Only verified, available YouTube replays published by admins appear here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((stream) => (
            <div key={stream.id} className="space-y-1.5">
              <StreamCard
                stream={stream}
                to={`/live/${stream.id}?mode=replay`}
                useReplayThumbnail
              />
              {stream.replayDescription && (
                <p className="text-xs text-slate-600 px-1 line-clamp-2">{stream.replayDescription}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
