import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Radio, Trophy } from 'lucide-react';
import { LiveStreamData } from '../../types/index.ts';
import { TeamAvatar } from '../common/TeamAvatar.tsx';
import { formatCricketOvers } from '../../utils/cricketScoring.ts';

interface StreamCardProps {
  stream: LiveStreamData;
  to?: string;
  onSelect?: () => void;
  useReplayThumbnail?: boolean;
}

export function StreamCard({
  stream,
  to,
  onSelect,
  useReplayThumbnail = false,
}: StreamCardProps) {
  const [thumbErr, setThumbErr] = useState(false);

  const activeVideoId =
    useReplayThumbnail && stream.replayVideoId ? stream.replayVideoId : stream.youtubeVideoId;
  const thumbUrl = `https://i.ytimg.com/vi/${activeVideoId}/hqdefault.jpg`;

  const hasTeams = Boolean(stream.teamAName || stream.teamBName);
  const displayTitle =
    stream.matchTitle ||
    (stream.teamAName && stream.teamBName
      ? `${stream.teamAName} vs ${stream.teamBName}`
      : stream.teamAName || stream.teamBName || 'Live Sports Broadcast');

  const metaParts = [
    stream.gameName || null,
    stream.tournamentName || null,
    stream.location || null,
  ].filter(Boolean);

  const score = stream.score;
  const isCricket = score?.sportType === 'Cricket';
  const cricketDetails = isCricket ? score?.sportSpecificDetails : null;

  const content = (
    <article className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors flex flex-col h-full">
      <div className="relative aspect-video bg-slate-900 overflow-hidden">
        {!thumbErr ? (
          <img
            src={thumbUrl}
            alt={displayTitle}
            referrerPolicy="no-referrer"
            onError={() => setThumbErr(true)}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400">
            <Play className="w-10 h-10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {stream.status === 'LIVE' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-semibold tracking-wide">
              <Radio className="w-3.5 h-3.5" />
              LIVE
            </span>
          )}
          {stream.status === 'UPCOMING' && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-900/90 text-white text-xs font-medium">
              UPCOMING
            </span>
          )}
          {stream.status === 'ENDED' && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-900/90 text-slate-200 text-xs font-medium">
              {useReplayThumbnail ? 'REPLAY' : 'ENDED'}
            </span>
          )}
          {(stream.activeStreamingProvider || stream.streamingProvider) === 'mediamtx' &&
            stream.status === 'LIVE' && (
              <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-950/90 text-orange-300 text-[10px] font-bold uppercase tracking-wider">
                DIRECT
              </span>
            )}
        </div>
        {typeof stream.activeViewers === 'number' && stream.viewerCountVisibility === 'public' && (
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-slate-950/85 text-white font-mono text-[11px] font-semibold tabular-nums">
            {stream.activeViewers} watching
          </div>
        )}
        {score && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs font-mono tabular-nums">
            <span className="font-semibold truncate">
              {stream.teamAName || 'Team A'}:{' '}
              {isCricket && cricketDetails
                ? `${cricketDetails.teamARuns ?? score.teamAScore}/${cricketDetails.teamAWickets ?? 0} (${formatCricketOvers(cricketDetails.teamABalls ?? 0)})`
                : score.teamAScore}
            </span>
            <span className="font-semibold truncate ml-2">
              {stream.teamBName || 'Team B'}:{' '}
              {isCricket && cricketDetails
                ? `${cricketDetails.teamBRuns ?? score.teamBScore}/${cricketDetails.teamBWickets ?? 0} (${formatCricketOvers(cricketDetails.teamBBalls ?? 0)})`
                : score.teamBScore}
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          {metaParts.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mb-1.5">
              {metaParts.map((part, idx) => (
                <span key={idx} className="inline-flex items-center gap-2">
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <span>{part}</span>
                </span>
              ))}
            </div>
          )}

          <h3 className="text-base font-semibold text-slate-900 leading-snug line-clamp-2 group-hover:text-[#EA580C] transition-colors">
            {displayTitle}
          </h3>

          {score?.resultStatus && score.resultStatus !== 'NOT_DECLARED' && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
              <Trophy className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">
                {score.resultDescription || score.winnerTeamName}
              </span>
            </div>
          )}
        </div>

        {hasTeams && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              {stream.teamAName && (
                <>
                  <TeamAvatar name={stream.teamAName} logoUrl={stream.teamALogo} size="sm" />
                  <span className="text-xs font-medium text-slate-700 truncate">
                    {stream.teamAName}
                  </span>
                </>
              )}
            </div>
            {stream.teamAName && stream.teamBName && (
              <span className="text-xs text-slate-400 font-medium shrink-0">vs</span>
            )}
            <div className="flex items-center gap-2 min-w-0 justify-end">
              {stream.teamBName && (
                <>
                  <span className="text-xs font-medium text-slate-700 truncate">
                    {stream.teamBName}
                  </span>
                  <TeamAvatar name={stream.teamBName} logoUrl={stream.teamBLogo} size="sm" />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );

  if (to) {
    return (
      <Link to={to} className="block h-full focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-xl">
        {content}
      </Link>
    );
  }

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left h-full focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-xl"
      >
        {content}
      </button>
    );
  }

  return content;
}
