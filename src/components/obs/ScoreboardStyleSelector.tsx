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
      {styleId === 'ipl_neon_ribbon' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="4" fill="#311042" stroke="#EC4899" strokeWidth="1" />
          <rect x="24" y="6" width="12" height="10" rx="2" fill="#EC4899" />
          <rect x="44" y="6" width="12" height="10" rx="2" fill="#06B6D4" />
          <rect x="8" y="20" width="64" height="4.5" rx="1" fill="#0F172A" stroke="#D946EF" strokeWidth="0.7" />
        </>
      )}
      {styleId === 'world_cup_crest' && (
        <>
          <rect x="2" y="6" width="32" height="12" rx="3" fill="#16377A" stroke="#38BDF8" strokeWidth="0.9" />
          <rect x="46" y="6" width="32" height="12" rx="3" fill="#16377A" stroke="#38BDF8" strokeWidth="0.9" />
          <circle cx="40" cy="12" r="8" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="1" />
          <rect x="10" y="20" width="60" height="4.5" rx="1" fill="#07122B" />
        </>
      )}
      {styleId === 'premier_league_bar' && (
        <>
          <rect x="2" y="5" width="10" height="13" fill="#38003C" />
          <rect x="12" y="5" width="56" height="13" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="0.7" />
          <rect x="68" y="5" width="10" height="13" fill="#00FF85" />
          <rect x="2" y="19" width="76" height="5" fill="#38003C" />
        </>
      )}
      {styleId === 'pro_kabaddi_raid' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="2.5" fill="#7C2D12" stroke="#F59E0B" strokeWidth="1" />
          <polygon points="24,6 34,6 32,16 22,16" fill="#F59E0B" />
          <polygon points="48,6 58,6 56,16 46,16" fill="#22D3EE" />
          <rect x="4" y="20" width="72" height="4.5" rx="1" fill="#0F172A" />
        </>
      )}
      {styleId === 'olympic_gold_clean' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="3" fill="#F8FAFC" stroke="#F59E0B" strokeWidth="1.1" />
          <rect x="33" y="5.5" width="14" height="11" rx="2" fill="#F59E0B" />
          <rect x="4" y="20" width="72" height="4.5" rx="1" fill="#E2E8F0" />
        </>
      )}
      {styleId === 'cyber_grid_matrix' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="1.5" fill="#020617" stroke="#22D3EE" strokeWidth="1" />
          <line x1="2" y1="8" x2="78" y2="8" stroke="#22D3EE" strokeOpacity="0.25" strokeWidth="0.6" />
          <line x1="2" y1="13" x2="78" y2="13" stroke="#22D3EE" strokeOpacity="0.25" strokeWidth="0.6" />
          <rect x="34" y="5.5" width="12" height="11" fill="#083344" stroke="#34D399" strokeWidth="0.8" />
          <rect x="4" y="20" width="72" height="4.5" fill="#020617" stroke="#22D3EE" strokeWidth="0.6" />
        </>
      )}
      {styleId === 'retro_arcade_pixel' && (
        <>
          <rect x="2" y="4" width="76" height="15" fill="#090D16" stroke="#FACC15" strokeWidth="1.2" />
          <rect x="5" y="6.5" width="28" height="10" fill="#E11D48" />
          <rect x="35" y="6" width="10" height="11" fill="#FACC15" stroke="#FFFFFF" strokeWidth="0.8" />
          <rect x="47" y="6.5" width="28" height="10" fill="#0284C7" />
          <rect x="2" y="20" width="76" height="4.5" fill="#090D16" stroke="#FACC15" strokeWidth="0.6" />
        </>
      )}
      {styleId === 'champions_shield' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="4" fill="#334155" stroke="#94A3B8" strokeWidth="1.1" />
          <rect x="32" y="5" width="16" height="12" rx="3" fill="#CBD5E1" stroke="#FFFFFF" strokeWidth="0.8" />
          <rect x="6" y="20" width="68" height="4.5" rx="1" fill="#0F172A" />
        </>
      )}
      {styleId === 'stealth_carbon_pro' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="3" fill="#111827" stroke="#475569" strokeWidth="0.9" />
          <circle cx="7" cy="11" r="2" fill="#F43F5E" />
          <circle cx="73" cy="11" r="2" fill="#34D399" />
          <rect x="34" y="6" width="12" height="10" rx="1.5" fill="#020617" stroke="#475569" strokeWidth="0.7" />
          <rect x="4" y="20" width="72" height="4.5" rx="1" fill="#090D16" />
        </>
      )}
      {styleId === 'sunset_gradient_arc' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="5" fill="#EA580C" stroke="#FDA4AF" strokeWidth="0.9" />
          <rect x="22" y="7" width="12" height="8" rx="4" fill="#FFFFFF" />
          <rect x="46" y="7" width="12" height="8" rx="4" fill="#FFFFFF" />
          <rect x="36" y="6.5" width="8" height="9" rx="4" fill="#0F172A" />
          <rect x="6" y="20" width="68" height="4.5" rx="1.5" fill="#0F172A" />
        </>
      )}
      {styleId === 'minimal_mono_line' && (
        <>
          <rect x="2" y="5" width="76" height="12" rx="2" fill="#090C14" stroke="#94A3B8" strokeWidth="0.8" />
          <line x1="34" y1="6.5" x2="34" y2="15.5" stroke="#64748B" strokeWidth="0.8" />
          <line x1="46" y1="6.5" x2="46" y2="15.5" stroke="#64748B" strokeWidth="0.8" />
          <rect x="4" y="19" width="72" height="4" rx="1" fill="#020617" stroke="#475569" strokeWidth="0.5" />
        </>
      )}
      {styleId === 'stadium_jumboscreen' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="3" fill="#020617" stroke="#38BDF8" strokeWidth="1" />
          <rect x="23" y="6.5" width="11" height="9" rx="1.5" fill="#0369A1" stroke="#38BDF8" strokeWidth="0.7" />
          <rect x="46" y="6.5" width="11" height="9" rx="1.5" fill="#0369A1" stroke="#38BDF8" strokeWidth="0.7" />
          <rect x="35.5" y="6" width="9" height="10" rx="1.5" fill="#0F172A" stroke="#FBBF24" strokeWidth="0.7" />
          <rect x="4" y="20" width="72" height="4.5" rx="1" fill="#020617" stroke="#0284C7" strokeWidth="0.6" />
        </>
      )}
      {styleId === 'tactical_hex_pod' && (
        <>
          <rect x="2" y="5" width="33" height="12" rx="2" fill="#111827" stroke={accent} strokeWidth="0.8" />
          <rect x="45" y="5" width="33" height="12" rx="2" fill="#111827" stroke={accent} strokeWidth="0.8" />
          <polygon points="35,4 45,4 49,11 45,18 35,18 31,11" fill="#10B981" />
          <rect x="8" y="19" width="64" height="4.5" rx="1.5" fill="#0F172A" stroke="#10B981" strokeWidth="0.6" />
        </>
      )}
      {styleId === 'arena_spotlight_bar' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="4" fill="#1E293B" stroke="#CBD5E1" strokeWidth="0.9" />
          <rect x="24" y="6" width="10" height="10" rx="2.5" fill="#EA580C" />
          <rect x="46" y="6" width="10" height="10" rx="2.5" fill="#2563EB" />
          <rect x="36" y="6.5" width="8" height="9" rx="2" fill="#DC2626" />
          <rect x="4" y="20" width="72" height="4.5" rx="1" fill="#020617" />
        </>
      )}
      {styleId === 'custom_designer' && (
        <>
          <rect x="2" y="4" width="76" height="14" rx="4" fill="#3B0764" stroke="#EC4899" strokeWidth="1.2" />
          <rect x="6" y="7" width="20" height="8" rx="2" fill="#EC4899" fillOpacity="0.45" stroke="#F472B6" strokeWidth="0.7" />
          <rect x="34" y="6.5" width="12" height="9" rx="2" fill="#F59E0B" />
          <rect x="54" y="7" width="20" height="8" rx="2" fill="#3B82F6" fillOpacity="0.45" stroke="#60A5FA" strokeWidth="0.7" />
          <rect x="6" y="20" width="68" height="4.5" rx="1.5" fill="#090D1A" stroke="#A855F7" strokeWidth="0.7" />
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
      className={`max-h-[420px] overflow-y-auto pr-1 grid gap-2 ${
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
