import { Check } from 'lucide-react';
import {
  SCOREBOARD_STYLES,
  type ScoreboardStyleId,
} from '../../utils/overlayConfig.ts';

interface ScoreboardStyleSelectorProps {
  value: ScoreboardStyleId;
  onChange: (style: ScoreboardStyleId) => void;
  disabled?: boolean;
  darkSurface?: boolean;
  compact?: boolean;
}

function StyleMiniSchematic({ styleId, active }: { styleId: ScoreboardStyleId; active: boolean }) {
  const frame = active ? '#C084FC' : '#64748B';
  const fill = active ? '#7C3AED' : '#334155';
  const accent = active ? '#F59E0B' : '#94A3B8';

  return (
    <svg viewBox="0 0 80 28" className="w-full h-7" aria-hidden="true">
      {styleId === 'broadcast_classic' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="2" fill={fill} stroke={frame} strokeWidth="1" />
          <rect x="2" y="4" width="12" height="14" rx="1.5" fill={accent} />
          <rect x="26" y="7" width="14" height="8" rx="1" fill="#0F172A" />
          <rect x="6" y="20" width="68" height="5" rx="1" fill="#1E293B" stroke={frame} strokeWidth="0.7" />
        </>
      )}
      {styleId === 'floating_pill' && (
        <>
          <rect x="4" y="4" width="72" height="14" rx="7" fill={fill} stroke={frame} strokeWidth="1" />
          <circle cx="40" cy="11" r="6" fill={accent} />
          <rect x="14" y="20" width="52" height="4.5" rx="2.2" fill="#1E293B" />
        </>
      )}
      {styleId === 'esports_angular' && (
        <>
          <polygon points="8,4 72,4 78,10 72,18 8,18 2,10" fill={fill} stroke={accent} strokeWidth="1" />
          <polygon points="33,3 47,3 50,11 47,19 33,19 30,11" fill={accent} />
          <rect x="10" y="20" width="60" height="4.5" fill="#1E293B" />
        </>
      )}
      {styleId === 'stacked_glass' && (
        <>
          <rect x="4" y="3" width="72" height="11" rx="3" fill={fill} fillOpacity="0.65" stroke={frame} strokeWidth="1" />
          <rect x="33" y="5" width="14" height="7" rx="1.5" fill={accent} />
          <rect x="8" y="17" width="64" height="7" rx="2.5" fill="#1E293B" fillOpacity="0.8" stroke={frame} strokeWidth="0.8" />
        </>
      )}
      {styleId === 'espn_ticker' && (
        <>
          <rect x="2" y="5" width="28" height="13" fill="#EA580C" />
          <rect x="30" y="5" width="20" height="13" fill="#0F172A" />
          <rect x="50" y="5" width="28" height="13" fill="#2563EB" />
          <rect x="2" y="19" width="76" height="5" fill="#1E293B" />
        </>
      )}
      {styleId === 'split_versus_card' && (
        <>
          <rect x="2" y="8" width="28" height="12" rx="2" fill={fill} stroke={frame} strokeWidth="0.9" />
          <rect x="50" y="8" width="28" height="12" rx="2" fill={fill} stroke={frame} strokeWidth="0.9" />
          <rect x="29" y="2" width="22" height="18" rx="3" fill={accent} />
          <rect x="10" y="21" width="60" height="4" rx="1" fill="#1E293B" />
        </>
      )}
      {styleId === 'minimal_corner_bug' && (
        <>
          <rect x="20" y="2" width="40" height="24" rx="3" fill={fill} stroke={frame} strokeWidth="1" />
          <rect x="20" y="2" width="40" height="5" rx="1.5" fill={accent} />
          <line x1="23" y1="13" x2="57" y2="13" stroke={frame} strokeWidth="0.8" />
          <line x1="23" y1="19" x2="57" y2="19" stroke={frame} strokeWidth="0.8" />
        </>
      )}
      {styleId === 'championship_marquee' && (
        <>
          <rect x="6" y="2" width="68" height="5" rx="1.5" fill={accent} />
          <rect x="2" y="7" width="76" height="14" rx="2" fill={fill} stroke={accent} strokeWidth="1" />
          <rect x="29" y="9" width="22" height="10" rx="1.5" fill="#0F172A" stroke={accent} strokeWidth="0.7" />
          <rect x="6" y="22" width="68" height="4" rx="1" fill="#1E293B" />
        </>
      )}
      {styleId === 'vertical_hud_dock' && (
        <>
          <rect x="2" y="3" width="48" height="10" rx="1.5" fill={fill} stroke={frame} strokeWidth="0.8" />
          <rect x="2" y="15" width="48" height="10" rx="1.5" fill={fill} stroke={frame} strokeWidth="0.8" />
          <rect x="52" y="3" width="26" height="22" rx="2" fill="#0F172A" stroke={accent} strokeWidth="0.9" />
        </>
      )}
      {styleId === 'dynamic_capsule' && (
        <>
          <rect x="2" y="4" width="12" height="12" rx="3" fill={fill} stroke={frame} strokeWidth="0.8" />
          <rect x="16" y="4" width="20" height="12" rx="3" fill={fill} stroke={frame} strokeWidth="0.8" />
          <rect x="38" y="4" width="12" height="12" rx="3" fill={accent} />
          <rect x="52" y="4" width="26" height="12" rx="3" fill={fill} stroke={frame} strokeWidth="0.8" />
          <rect x="12" y="19" width="56" height="5" rx="2.5" fill="#1E293B" stroke={frame} strokeWidth="0.7" />
        </>
      )}
    </svg>
  );
}

export function ScoreboardStyleSelector({
  value,
  onChange,
  disabled = false,
  darkSurface = true,
  compact = false,
}: ScoreboardStyleSelectorProps) {
  return (
    <div
      className={`grid gap-2 ${
        compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-2'
      }`}
    >
      {SCOREBOARD_STYLES.map((item, idx) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(item.id)}
            className={`group relative text-left rounded-xl border p-2.5 transition-all disabled:opacity-50 ${
              active
                ? darkSurface
                  ? 'border-purple-500 bg-purple-600/20 ring-1 ring-purple-400/50 text-white'
                  : 'border-purple-600 bg-purple-50 ring-1 ring-purple-500/40 text-slate-900'
                : darkSurface
                  ? 'border-slate-800 bg-slate-950/90 hover:border-slate-700 hover:bg-slate-900 text-slate-200'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white text-slate-800'
            }`}
          >
            <div className="mb-1.5 rounded-lg bg-[#070A10] p-1.5 border border-slate-800/80">
              <StyleMiniSchematic styleId={item.id} active={active} />
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-bold truncate">
                {idx + 1}. {compact ? item.shortName : item.name}
              </span>
              {active && (
                <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5" />
                </span>
              )}
            </div>
            {!compact && (
              <p
                className={`text-[10px] leading-snug mt-0.5 line-clamp-2 ${
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
  );
}
