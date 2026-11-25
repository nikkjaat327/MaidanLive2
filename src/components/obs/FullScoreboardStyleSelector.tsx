import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  FULL_SCOREBOARD_STYLES,
  type FullScoreboardSportCategory,
  type FullScoreboardStyleId,
  type FullScoreboardStyleMeta,
} from '../../utils/overlayConfig.ts';

interface FullScoreboardStyleSelectorProps {
  value: FullScoreboardStyleId;
  onChange: (style: FullScoreboardStyleId) => void;
  matchSport?: string | null;
  disabled?: boolean;
  darkSurface?: boolean;
  compact?: boolean;
}

const SPORT_FILTER_TABS: readonly ('All' | FullScoreboardSportCategory)[] = [
  'All',
  'Cricket',
  'Kabaddi',
  'Football',
  'Volleyball',
  'Multi-Sport',
];

function FullScoreboardMiniSchematic({
  meta,
  active,
}: {
  meta: FullScoreboardStyleMeta;
  active: boolean;
}) {
  const accent = meta.accentHex;
  const stroke = active ? '#FFFFFF' : '#475569';
  const id = meta.id;

  const isLightTheme =
    id === 'cricket_test_heritage' || id === 'volleyball_olympic_clean';
  const bg = isLightTheme ? '#E2E8F0' : '#090D1A';
  const cardBg = isLightTheme ? '#FFFFFF' : '#111827';
  const subRowBg = isLightTheme ? '#F1F5F9' : '#0F172A';

  const isMedallion =
    id === 'cricket_world_cup_royal' ||
    id === 'multisport_olympic_medallion' ||
    id === 'kabaddi_royal_akhada';
  const isSplitTowers =
    id === 'football_world_turf' ||
    id === 'volleyball_vnl_court' ||
    id === 'kabaddi_pro_mat_fire';
  const isChamfer =
    id === 'cricket_ipl_stadium_neon' ||
    id === 'football_premier_studio' ||
    id === 'multisport_esports_chamfer' ||
    id === 'volleyball_neon_net';

  return (
    <svg viewBox="0 0 96 54" className="w-full h-14 rounded-md" aria-hidden="true">
      <rect x="0" y="0" width="96" height="54" rx="4" fill={bg} />
      {/* Top accent beam */}
      <rect x="0" y="0" width="96" height="3" rx="1.5" fill={accent} />
      {/* Header strip */}
      <rect x="4" y="5" width="88" height="6" rx="1.5" fill={cardBg} stroke={stroke} strokeWidth="0.5" />
      <rect x="7" y="6.8" width="26" height="2.4" rx="1" fill={accent} />
      <rect x="72" y="6.8" width="16" height="2.4" rx="1" fill={isLightTheme ? '#1E293B' : '#94A3B8'} />

      {/* Hero VS Architecture */}
      {isMedallion ? (
        <>
          <rect x="4" y="13" width="38" height="14" rx="2.5" fill={cardBg} stroke={accent} strokeWidth="0.8" />
          <rect x="54" y="13" width="38" height="14" rx="2.5" fill={cardBg} stroke={accent} strokeWidth="0.8" />
          <circle cx="48" cy="20" r="6.5" fill={accent} stroke={cardBg} strokeWidth="1" />
        </>
      ) : isSplitTowers ? (
        <>
          <rect x="4" y="13" width="35" height="14" rx="2" fill={cardBg} stroke={stroke} strokeWidth="0.7" />
          <rect x="41" y="13" width="14" height="14" rx="2" fill={accent} />
          <rect x="57" y="13" width="35" height="14" rx="2" fill={cardBg} stroke={stroke} strokeWidth="0.7" />
        </>
      ) : isChamfer ? (
        <>
          <polygon
            points="8,13 88,13 92,17 88,27 8,27 4,17"
            fill={cardBg}
            stroke={accent}
            strokeWidth="0.9"
          />
          <polygon points="42,13 54,13 56,20 54,27 42,27 40,20" fill={accent} />
        </>
      ) : (
        <>
          <rect x="4" y="13" width="88" height="14" rx="2.5" fill={cardBg} stroke={stroke} strokeWidth="0.8" />
          <rect x="7" y="15.5" width="24" height="9" rx="1.5" fill={accent} fillOpacity="0.28" />
          <rect x="43" y="16.5" width="10" height="7" rx="3.5" fill={accent} />
          <rect x="65" y="15.5" width="24" height="9" rx="1.5" fill={accent} fillOpacity="0.28" />
        </>
      )}

      {/* Sport-specific Detail Grids */}
      {meta.sport === 'Volleyball' ? (
        <>
          {[0, 1, 2, 3, 4].map((idx) => (
            <rect
              key={idx}
              x={4 + idx * 18}
              y="30"
              width="16"
              height="16"
              rx="2"
              fill={idx === 2 ? accent : subRowBg}
              fillOpacity={idx === 2 ? 0.3 : 1}
              stroke={idx === 2 ? accent : stroke}
              strokeWidth="0.7"
            />
          ))}
        </>
      ) : (
        <>
          <rect x="4" y="30" width="42" height="16" rx="2" fill={subRowBg} stroke={stroke} strokeWidth="0.6" />
          <rect x="50" y="30" width="42" height="16" rx="2" fill={subRowBg} stroke={stroke} strokeWidth="0.6" />
          <line x1="7" y1="35" x2="43" y2="35" stroke={accent} strokeWidth="1" strokeOpacity="0.7" />
          <line x1="7" y1="39.5" x2="43" y2="39.5" stroke={stroke} strokeWidth="0.7" />
          <line x1="53" y1="35" x2="89" y2="35" stroke={accent} strokeWidth="1" strokeOpacity="0.7" />
          <line x1="53" y1="39.5" x2="89" y2="39.5" stroke={stroke} strokeWidth="0.7" />
        </>
      )}

      {/* Bottom Ticker */}
      <rect x="4" y="48.5" width="88" height="3.5" rx="1" fill={cardBg} />
    </svg>
  );
}

export function FullScoreboardStyleSelector({
  value,
  onChange,
  matchSport,
  disabled = false,
  darkSurface = true,
  compact = false,
}: FullScoreboardStyleSelectorProps) {
  const normalizedMatchSport: FullScoreboardSportCategory | 'All' = useMemo(() => {
    const raw = (matchSport || '').trim().toLowerCase();
    if (raw.includes('cricket')) return 'Cricket';
    if (raw.includes('kabaddi')) return 'Kabaddi';
    if (raw.includes('football') || raw.includes('soccer')) return 'Football';
    if (raw.includes('volleyball')) return 'Volleyball';
    return 'All';
  }, [matchSport]);

  const [sportFilter, setSportFilter] = useState<'All' | FullScoreboardSportCategory>('All');

  const visibleStyles = useMemo(() => {
    if (sportFilter === 'All') return FULL_SCOREBOARD_STYLES;
    return FULL_SCOREBOARD_STYLES.filter((s) => s.sport === sportFilter);
  }, [sportFilter]);

  return (
    <div className="space-y-2.5">
      {/* Sport Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SPORT_FILTER_TABS.map((cat) => {
          const isCurrent = sportFilter === cat;
          const count =
            cat === 'All'
              ? FULL_SCOREBOARD_STYLES.length
              : FULL_SCOREBOARD_STYLES.filter((s) => s.sport === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSportFilter(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                isCurrent
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : darkSurface
                    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Style Grid */}
      <div
        className={`max-h-[380px] overflow-y-auto pr-1 grid gap-2 ${
          compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
        }`}
      >
        {visibleStyles.map((item) => {
          const active = value === item.id;
          const matchesSport =
            normalizedMatchSport !== 'All' && item.sport === normalizedMatchSport;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(item.id)}
              className={`group relative text-left rounded-xl border p-2.5 transition-all disabled:opacity-50 ${
                active
                  ? darkSurface
                    ? 'border-sky-400 bg-sky-500/15 ring-1 ring-sky-400/50 text-white'
                    : 'border-sky-600 bg-sky-50 ring-1 ring-sky-500/40 text-slate-900'
                  : darkSurface
                    ? 'border-slate-800 bg-slate-950/90 hover:border-slate-700 hover:bg-slate-900 text-slate-200'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
              }`}
            >
              <div className="mb-2 rounded-lg bg-[#050812] p-1 border border-slate-800/80">
                <FullScoreboardMiniSchematic meta={item} active={active} />
              </div>
              <div className="flex items-start justify-between gap-1.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold truncate leading-tight">
                    {compact ? item.shortName : item.name}
                  </p>
                  <p
                    className={`text-[10px] mt-0.5 truncate ${
                      darkSurface ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {item.sport}
                    {matchesSport ? ' · Match Sport' : ''}
                  </p>
                </div>
                {active && (
                  <span className="w-4 h-4 rounded-full bg-sky-500 text-slate-950 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              {!compact && (
                <p
                  className={`text-[10px] leading-snug mt-1 line-clamp-2 ${
                    darkSurface ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {item.tagline}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
