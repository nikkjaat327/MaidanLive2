import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart3, TrendingUp } from 'lucide-react';
import { LiveScoreData, LiveStreamData, ScoreHistoryItem } from '../../types/index.ts';
import { SportOption } from '../../constants/sports.ts';
import {
  BurstBarPoint,
  MomentumPoint,
  buildBurstSeries,
  buildMomentumTimeline,
  computeMomentumSummary,
} from '../../utils/scoringMomentum.ts';

type ChartMode = 'trend' | 'lead' | 'bursts';

interface ScoreMomentumChartsProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  history: ScoreHistoryItem[];
}

const TEAM_A_COLOR = '#059669'; // Emerald 600
const TEAM_B_COLOR = '#2563eb'; // Blue 600

export function ScoreMomentumCharts({ stream, score, history }: ScoreMomentumChartsProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('trend');

  const sport: SportOption = score?.sportType || (stream.gameName as SportOption) || 'Other';
  const teamA = stream.teamAName || 'Team A';
  const teamB = stream.teamBName || 'Team B';

  const timeline = useMemo(() => buildMomentumTimeline(history, score), [history, score]);
  const burstSeries = useMemo(() => buildBurstSeries(timeline, sport), [timeline, sport]);
  const summary = useMemo(
    () => computeMomentumSummary(timeline, score, teamA, teamB),
    [timeline, score, teamA, teamB]
  );

  const hasData = timeline.length >= 2;

  return (
    <section
      aria-label="Real-Time Scoring Momentum and Performance Trends"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Header + Segmented View Tabs */}
      <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
            <h2 className="text-base font-bold text-slate-900 truncate">
              Scoring Momentum &amp; Match Trends
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
            <span>{sport}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {summary.totalUpdates} live update{summary.totalUpdates === 1 ? '' : 's'} tracked
            </span>
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Momentum visualization mode"
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={chartMode === 'trend'}
            onClick={() => setChartMode('trend')}
            className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              chartMode === 'trend'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Score Trend</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={chartMode === 'lead'}
            onClick={() => setChartMode('lead')}
            className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              chartMode === 'lead'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Lead Swing</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={chartMode === 'bursts'}
            onClick={() => setChartMode('bursts')}
            className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              chartMode === 'bursts'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{burstSeries.mode === 'overs' ? 'Over Breakdown' : 'Scoring Bursts'}</span>
          </button>
        </div>
      </div>

      {/* Live Momentum Summary Strip (hairline-divided, tabular figures) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border-b border-slate-200">
        <div className="px-4 py-3 bg-slate-50/90">
          <p className="text-[11px] font-medium text-slate-500">Current Advantage</p>
          <p className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5 truncate">
            {summary.leadText}
          </p>
        </div>
        <div className="px-4 py-3 bg-slate-50/90">
          <p className="text-[11px] font-medium text-slate-500">Last 5 Updates</p>
          <p className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5 truncate">
            {summary.recentMomentumText}
          </p>
        </div>
        <div className="px-4 py-3 bg-slate-50/90">
          <p className="text-[11px] font-medium text-slate-500">Peak Margin</p>
          <p className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5 truncate">
            {teamA.split(' ')[0]} +{summary.peakLeadA} · {teamB.split(' ')[0]} +{summary.peakLeadB}
          </p>
        </div>
        <div className="px-4 py-3 bg-slate-50/90">
          <p className="text-[11px] font-medium text-slate-500">
            {summary.cricketCrr ? 'Current Run Rate' : 'Top Single Burst'}
          </p>
          <p className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5 truncate">
            {summary.cricketCrr || summary.largestBurstLabel}
          </p>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="p-4 sm:p-5">
        {!hasData ? (
          <div className="h-[240px] flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
            <TrendingUp className="w-6 h-6 text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-slate-800">
              Waiting for scoring activity
            </p>
            <p className="text-xs text-slate-500 max-w-md mt-1">
              Record score updates below to plot real-time cumulative progression, lead swings, and scoring momentum for this match.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Clean Legend Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: TEAM_A_COLOR }}
                  />
                  <span className="truncate max-w-[160px]">{teamA}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: TEAM_B_COLOR }}
                  />
                  <span className="truncate max-w-[160px]">{teamB}</span>
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                {chartMode === 'trend'
                  ? 'Cumulative score across match updates'
                  : chartMode === 'lead'
                    ? `Positive = ${teamA} lead · Negative = ${teamB} lead`
                    : burstSeries.mode === 'overs'
                      ? 'Runs scored per over'
                      : 'Points added per scoring event'}
              </span>
            </div>

            <div className="w-full h-[260px] sm:h-[290px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'trend' ? (
                  <AreaChart
                    data={timeline}
                    margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="maidanTeamAGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={TEAM_A_COLOR} stopOpacity={0.22} />
                        <stop offset="95%" stopColor={TEAM_A_COLOR} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="maidanTeamBGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={TEAM_B_COLOR} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={TEAM_B_COLOR} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      content={
                        <TrendTooltip teamA={teamA} teamB={teamB} mode="trend" />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="teamAScore"
                      name={teamA}
                      stroke={TEAM_A_COLOR}
                      strokeWidth={2.5}
                      fill="url(#maidanTeamAGradient)"
                      dot={(dotProps: any) => {
                        const payload = dotProps?.payload as MomentumPoint | undefined;
                        if (payload?.isWicket) {
                          return (
                            <circle
                              key={`wicket-${dotProps.index}`}
                              cx={dotProps.cx}
                              cy={dotProps.cy}
                              r={4}
                              fill="#dc2626"
                              stroke="#ffffff"
                              strokeWidth={1.5}
                            />
                          );
                        }
                        return <g key={`dot-a-${dotProps.index}`} />;
                      }}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="teamBScore"
                      name={teamB}
                      stroke={TEAM_B_COLOR}
                      strokeWidth={2.5}
                      fill="url(#maidanTeamBGradient)"
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                ) : chartMode === 'lead' ? (
                  <BarChart
                    data={timeline}
                    margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} />
                    <Tooltip
                      content={
                        <TrendTooltip teamA={teamA} teamB={teamB} mode="lead" />
                      }
                    />
                    <Bar dataKey="leadMargin" radius={3} isAnimationActive={false}>
                      {timeline.map((entry, idx) => (
                        <Cell
                          key={`lead-${idx}`}
                          fill={entry.leadMargin >= 0 ? TEAM_A_COLOR : TEAM_B_COLOR}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart
                    data={burstSeries.data}
                    margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ReferenceLine y={0} stroke="#cbd5e1" />
                    <Tooltip
                      content={
                        <BurstTooltip teamA={teamA} teamB={teamB} mode={burstSeries.mode} />
                      }
                    />
                    <Bar
                      dataKey="teamADelta"
                      name={teamA}
                      fill={TEAM_A_COLOR}
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="teamBDelta"
                      name={teamB}
                      fill={TEAM_B_COLOR}
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function TrendTooltip({
  active,
  payload,
  teamA,
  teamB,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ payload?: MomentumPoint }>;
  teamA: string;
  teamB: string;
  mode: 'trend' | 'lead';
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const marginText =
    point.leadMargin === 0
      ? 'Tied'
      : point.leadMargin > 0
        ? `${teamA} +${point.leadMargin}`
        : `${teamB} +${Math.abs(point.leadMargin)}`;

  return (
    <div className="bg-slate-950 text-white border border-slate-800 rounded-lg px-3 py-2.5 text-xs shadow-lg max-w-[240px]">
      <div className="flex items-center justify-between gap-3 text-slate-400 font-mono tabular-nums mb-1">
        <span>{point.label}</span>
        {point.timeLabel && <span>{point.timeLabel}</span>}
      </div>
      <p className="font-semibold text-white mb-2 leading-snug">{point.action}</p>
      <div className="space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-400 truncate">{teamA}</span>
          <span className="font-bold">
            {point.teamAScore}
            {point.deltaA !== 0 && (
              <span className="text-slate-400 ml-1">
                ({point.deltaA > 0 ? `+${point.deltaA}` : point.deltaA})
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-blue-400 truncate">{teamB}</span>
          <span className="font-bold">
            {point.teamBScore}
            {point.deltaB !== 0 && (
              <span className="text-slate-400 ml-1">
                ({point.deltaB > 0 ? `+${point.deltaB}` : point.deltaB})
              </span>
            )}
          </span>
        </div>
        {mode === 'lead' && (
          <div className="pt-1 mt-1 border-t border-slate-800 flex items-center justify-between gap-3">
            <span className="text-slate-400 font-sans">Margin</span>
            <span className="font-bold text-white">{marginText}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BurstTooltip({
  active,
  payload,
  teamA,
  teamB,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ payload?: BurstBarPoint }>;
  teamA: string;
  teamB: string;
  mode: 'overs' | 'events';
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-slate-950 text-white border border-slate-800 rounded-lg px-3 py-2.5 text-xs shadow-lg max-w-[230px]">
      <div className="flex items-center justify-between gap-3 text-slate-400 font-mono tabular-nums mb-1">
        <span>{point.label}</span>
        {point.timeLabel && <span>{point.timeLabel}</span>}
      </div>
      <p className="font-semibold text-white mb-2 leading-snug">{point.action}</p>
      <div className="space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-400 truncate">{teamA}</span>
          <span className="font-bold">
            {point.teamADelta > 0 ? `+${point.teamADelta}` : point.teamADelta}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-blue-400 truncate">{teamB}</span>
          <span className="font-bold">
            {point.teamBDelta > 0 ? `+${point.teamBDelta}` : point.teamBDelta}
          </span>
        </div>
        {mode === 'overs' && point.wickets > 0 && (
          <div className="pt-1 mt-1 border-t border-slate-800 text-red-400 font-semibold">
            Wickets in over: {point.wickets}
          </div>
        )}
      </div>
    </div>
  );
}
