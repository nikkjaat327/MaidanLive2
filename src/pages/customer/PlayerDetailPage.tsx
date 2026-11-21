import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Award, BarChart3, BellPlus, Check } from 'lucide-react';
import { PlayerData, PlayerMatchStatRecord } from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { ShareButton } from '../../components/common/ShareButton.tsx';
import { buildPlayerUrl } from '../../utils/shareUrl.ts';

export function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { customerUser, updateCustomerUser } = useAuth();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [matchStats, setMatchStats] = useState<PlayerMatchStatRecord[]>([]);
  const [followBusy, setFollowBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    entityService
      .getPlayerProfile(id)
      .then((res) => {
        setPlayer(res.player);
        setTotals(res.totals || {});
        setMatchStats(res.matchStats || []);
      })
      .catch((err) => setError(extractApiError(err, 'Unable to load player profile.')))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleToggleFollow() {
    if (!player) return;
    if (!customerUser) {
      setError('Sign in to follow this player and receive match alerts.');
      return;
    }
    const isFollowing = (customerUser.followedPlayerIds || []).includes(player.id);
    try {
      setFollowBusy(true);
      const res = isFollowing
        ? await engagementService.unfollowPlayer(player.id)
        : await engagementService.followPlayer(player.id);
      updateCustomerUser({ ...customerUser, followedPlayerIds: res.followedPlayerIds });
      setPlayer((prev) => (prev ? { ...prev, followersCount: res.followersCount } : prev));
    } catch (err) {
      setError(extractApiError(err, 'Failed to update player follow status.'));
    } finally {
      setFollowBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-52" />
        <div className="h-36 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <FeedbackBanner type="error" message={error || 'Player not found.'} />
        <Link to="/players" className="inline-flex items-center gap-2 text-sm text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Players</span>
        </Link>
      </div>
    );
  }

  const teamObj = typeof player.teamId === 'object' && player.teamId ? player.teamId : null;
  const isFollowing = Boolean(customerUser?.followedPlayerIds?.includes(player.id));

  const statSummaryCards =
    player.sportType === 'Cricket'
      ? [
          { label: 'Matches', val: totals.matches || 0 },
          { label: 'Runs', val: totals.runs || 0 },
          { label: 'Wickets', val: totals.wickets || 0 },
          { label: 'MVP Awards', val: totals.mvpAwards || 0 },
        ]
      : player.sportType === 'Kabaddi'
        ? [
            { label: 'Matches', val: totals.matches || 0 },
            { label: 'Raid Points', val: totals.raidPoints || 0 },
            { label: 'Tackle Points', val: totals.tacklePoints || 0 },
            { label: 'MVP Awards', val: totals.mvpAwards || 0 },
          ]
        : player.sportType === 'Football'
          ? [
              { label: 'Matches', val: totals.matches || 0 },
              { label: 'Goals', val: totals.goals || 0 },
              { label: 'Assists', val: totals.assists || 0 },
              { label: 'MVP Awards', val: totals.mvpAwards || 0 },
            ]
          : [
              { label: 'Matches', val: totals.matches || 0 },
              { label: 'Attack Pts', val: totals.attackPoints || 0 },
              { label: 'Blocks & Aces', val: (totals.blockPoints || 0) + (totals.serveAces || 0) },
              { label: 'MVP Awards', val: totals.mvpAwards || 0 },
            ];

  const mvpMatches = matchStats.filter((st) => st.isMvp);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <Link
        to="/players"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>All Players</span>
      </Link>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {/* Player Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <TeamAvatar name={player.name} logoUrl={player.avatarUrl} size="lg" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-900">{player.sportType}</span>
              {player.role && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{player.role}</span>
                </>
              )}
              {player.jerseyNumber !== null && player.jerseyNumber !== undefined && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-bold text-slate-800">#{player.jerseyNumber}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {player.followersCount || 0} follower{(player.followersCount || 0) === 1 ? '' : 's'}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              {player.name}
            </h1>
            {teamObj && (
              <Link
                to={`/teams/${teamObj._id}`}
                className="inline-block text-sm font-semibold text-emerald-700 hover:underline"
              >
                {teamObj.name}
              </Link>
            )}
            {(player.battingStyle || player.bowlingStyle) && (
              <p className="text-xs text-slate-500">
                {[player.battingStyle, player.bowlingStyle].filter(Boolean).join(' · ')}
              </p>
            )}
            {player.bio && <p className="text-sm text-slate-600 pt-1 max-w-xl">{player.bio}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={followBusy}
            onClick={handleToggleFollow}
            className={`min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              isFollowing
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {isFollowing ? <Check className="w-4 h-4" /> : <BellPlus className="w-4 h-4" />}
            <span>{isFollowing ? 'Following Player' : 'Follow Player'}</span>
          </button>
          <ShareButton
            title={player.name}
            text={`View ${player.name}'s stats on MaidanLive`}
            url={buildPlayerUrl(player.id)}
            shareCard={{
              type: 'PLAYER_AWARD',
              playerName: player.name,
              sport: player.sportType,
              teamName: teamObj?.name,
              role: player.role,
              jerseyNumber: player.jerseyNumber,
              avatarUrl: player.avatarUrl,
              mvpAwards: totals.mvpAwards || 0,
              stats: statSummaryCards.map((c) => ({ label: c.label, value: c.val })),
              shareUrl: buildPlayerUrl(player.id),
            }}
          />
        </div>
      </div>

      {/* Verified Stats */}
      {matchStats.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-2">
          <BarChart3 className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-800">
            No verified match statistics recorded yet
          </p>
          <p className="text-xs text-slate-500">
            Statistics appear here automatically once scorers record verified match events or match stat sheets.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statSummaryCards.map((c) => (
              <div
                key={c.label}
                className="bg-white border border-slate-200 rounded-xl p-4 text-center"
              >
                <p className="text-xs text-slate-500">{c.label}</p>
                <p className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                  {c.val}
                </p>
              </div>
            ))}
          </div>

          {mvpMatches.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-amber-900 inline-flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-600" />
                <span>Player of the Match Honours ({mvpMatches.length})</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {mvpMatches.map((st) => {
                  const streamObj =
                    typeof st.liveStreamId === 'object' && st.liveStreamId
                      ? (st.liveStreamId as any)
                      : null;
                  const streamId = streamObj?._id || st.liveStreamId;
                  const title =
                    streamObj?.matchTitle ||
                    [streamObj?.teamAName, streamObj?.teamBName].filter(Boolean).join(' vs ') ||
                    'Match';
                  return (
                    <Link
                      key={st._id || st.id}
                      to={`/live/${streamId}`}
                      className="px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-xs font-semibold text-amber-950 hover:border-amber-400"
                    >
                      {title}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900">Match-by-Match History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Match</th>
                    {player.sportType === 'Cricket' && (
                      <>
                        <th className="px-3 py-2.5 text-right">Runs</th>
                        <th className="px-3 py-2.5 text-right">Wkts</th>
                      </>
                    )}
                    {player.sportType === 'Kabaddi' && (
                      <>
                        <th className="px-3 py-2.5 text-right">Raid Pts</th>
                        <th className="px-3 py-2.5 text-right">Tackle Pts</th>
                      </>
                    )}
                    {player.sportType === 'Football' && (
                      <>
                        <th className="px-3 py-2.5 text-right">Goals</th>
                        <th className="px-3 py-2.5 text-right">Assists</th>
                      </>
                    )}
                    {player.sportType === 'Volleyball' && (
                      <>
                        <th className="px-3 py-2.5 text-right">Attacks</th>
                        <th className="px-3 py-2.5 text-right">Blocks / Aces</th>
                      </>
                    )}
                    <th className="px-4 py-2.5 text-right">MVP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchStats.map((st) => {
                    const streamObj =
                      typeof st.liveStreamId === 'object' && st.liveStreamId
                        ? (st.liveStreamId as any)
                        : null;
                    const streamId = streamObj?._id || st.liveStreamId;
                    const title =
                      streamObj?.matchTitle ||
                      [streamObj?.teamAName, streamObj?.teamBName].filter(Boolean).join(' vs ') ||
                      'Match';
                    return (
                      <tr key={st._id || st.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold">
                          <Link to={`/live/${streamId}`} className="text-slate-900 hover:text-emerald-700">
                            {title}
                          </Link>
                        </td>
                        {player.sportType === 'Cricket' && (
                          <>
                            <td className="px-3 py-2.5 text-right font-mono">{st.runs}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{st.wickets}</td>
                          </>
                        )}
                        {player.sportType === 'Kabaddi' && (
                          <>
                            <td className="px-3 py-2.5 text-right font-mono">{st.raidPoints}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{st.tacklePoints}</td>
                          </>
                        )}
                        {player.sportType === 'Football' && (
                          <>
                            <td className="px-3 py-2.5 text-right font-mono">{st.goals}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{st.assists}</td>
                          </>
                        )}
                        {player.sportType === 'Volleyball' && (
                          <>
                            <td className="px-3 py-2.5 text-right font-mono">{st.attackPoints}</td>
                            <td className="px-3 py-2.5 text-right font-mono">
                              {st.blockPoints} / {st.serveAces}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-2.5 text-right font-mono">
                          {st.isMvp ? <span className="text-amber-600 font-bold">YES</span> : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
