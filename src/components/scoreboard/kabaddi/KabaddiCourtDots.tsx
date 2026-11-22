import type { KabaddiCourtPlayer } from '../../../utils/kabaddiScoring.ts';

interface KabaddiCourtDotsProps {
  players: KabaddiCourtPlayer[];
  maxPlayers?: number;
  teamName: string;
  side?: 'A' | 'B';
  compact?: boolean;
  showNames?: boolean;
  showNumbers?: boolean;
  onSelectPlayer?: (player: KabaddiCourtPlayer) => void;
}

const STATUS_RANK: Record<KabaddiCourtPlayer['status'], number> = {
  ON_COURT: 0,
  OUT: 1,
  INJURED: 2,
  SUSPENDED: 3,
  DISQUALIFIED: 4,
  BENCH: 5,
};

export function KabaddiCourtDots({
  players,
  maxPlayers = 7,
  teamName,
  side = 'A',
  compact = false,
  showNames = false,
  showNumbers = false,
  onSelectPlayer,
}: KabaddiCourtDotsProps) {
  const rawList = players
    .filter((p) => p.status !== 'BENCH')
    .slice(0, Math.max(maxPlayers, players.length));

  // Team A: active ON_COURT packed on the LEFT -> drops right-to-left when out, fills left-to-right on revival.
  // Team B: opposite -> active ON_COURT packed on the RIGHT -> drops left-to-right when out, fills right-to-left on revival.
  const displayList = [...rawList].sort((a, b) => {
    const diff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return side === 'B' ? -diff : diff;
  });

  const activeCount = players.filter((p) => p.status === 'ON_COURT').length;

  const counterEl = (
    <span
      className={`font-mono tabular-nums text-[11px] font-bold text-slate-300 ${
        side === 'B' ? 'mr-1' : 'ml-1'
      }`}
    >
      {activeCount}/{maxPlayers}
    </span>
  );

  return (
    <div className="space-y-1">
      <div
        className={`flex flex-wrap items-center gap-1.5 ${
          side === 'B' ? 'justify-end' : 'justify-start'
        }`}
        aria-label={`${teamName} players on court: ${activeCount} active`}
      >
        {side === 'B' && counterEl}
        {displayList.map((p, idx) => {
          const isOnCourt = p.status === 'ON_COURT';
          const isInjured = p.status === 'INJURED';
          const isSuspended = p.status === 'SUSPENDED';
          const isDisqualified = p.status === 'DISQUALIFIED';

          const dotClass = isOnCourt
            ? 'bg-emerald-500 border-emerald-300 text-slate-950 shadow-[0_0_8px_rgba(16,185,129,0.45)]'
            : isDisqualified
              ? 'bg-red-700/80 border-red-400 text-white'
              : isSuspended || isInjured
                ? 'bg-amber-500/80 border-amber-300 text-slate-950'
                : 'bg-slate-700 border-slate-500 text-slate-300';

          const label = `${p.name}${p.jerseyNumber ? ` (#${p.jerseyNumber})` : ''} — ${p.status.replace('_', ' ')}`;

          return (
            <button
              key={p.playerId || idx}
              type="button"
              disabled={!onSelectPlayer}
              onClick={() => onSelectPlayer?.(p)}
              title={label}
              className={`inline-flex items-center justify-center rounded-full border font-mono font-bold transition-transform ${
                compact ? 'w-4 h-4 text-[9px]' : 'w-6 h-6 text-[10px]'
              } ${dotClass} ${onSelectPlayer ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
            >
              {showNumbers && p.jerseyNumber ? p.jerseyNumber : ''}
            </button>
          );
        })}
        {side !== 'B' && counterEl}
      </div>
      {showNames && displayList.length > 0 && !compact && (
        <div
          className={`flex flex-wrap gap-1 text-[10px] text-slate-400 ${
            side === 'B' ? 'justify-end' : 'justify-start'
          }`}
        >
          {displayList.slice(0, maxPlayers).map((p) => (
            <span
              key={p.playerId}
              className={`px-1.5 py-0.5 rounded border ${
                p.status === 'ON_COURT'
                  ? 'border-emerald-800/70 bg-emerald-950/40 text-emerald-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-500 line-through'
              }`}
            >
              {showNumbers && p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
