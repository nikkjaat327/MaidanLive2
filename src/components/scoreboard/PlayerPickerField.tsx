import { useEffect, useState } from 'react';
import { Keyboard, ListFilter } from 'lucide-react';
import { formatUnifiedPlayerLabel, UnifiedMatchPlayer } from '../../utils/sportPositions.ts';

interface PlayerPickerFieldProps {
  value: string;
  onChange: (name: string, player: UnifiedMatchPlayer | null) => void;
  players: UnifiedMatchPlayer[];
  placeholder?: string;
  emptyOptionLabel?: string;
  ariaLabel?: string;
  themeVariant?: 'light' | 'dark';
  compact?: boolean;
  disabled?: boolean;
}

export function PlayerPickerField({
  value,
  onChange,
  players,
  placeholder = 'Type player name (optional)',
  emptyOptionLabel = '-- Select player (Optional) --',
  ariaLabel,
  themeVariant = 'light',
  compact = false,
  disabled = false,
}: PlayerPickerFieldProps) {
  const normalizedVal = value.trim().toLowerCase();
  const matchedPlayer = players.find((p) => p.name.trim().toLowerCase() === normalizedVal) || null;
  const hasCustomValue = Boolean(value.trim()) && !matchedPlayer;

  const [manualMode, setManualMode] = useState<boolean>(
    players.length === 0 || hasCustomValue
  );

  useEffect(() => {
    if (players.length === 0) {
      setManualMode(true);
    } else if (!value.trim()) {
      setManualMode(false);
    } else if (matchedPlayer) {
      setManualMode(false);
    }
  }, [players.length, matchedPlayer, value]);

  const isDark = themeVariant === 'dark';
  const heightCls = compact ? 'min-h-[36px] text-xs' : 'min-h-[40px] text-sm';
  const inputCls = isDark
    ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';
  const toggleBtnCls = isDark
    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700';

  if (players.length === 0) {
    return (
      <input
        type="text"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value, null)}
        placeholder={placeholder}
        className={`w-full ${heightCls} px-3 py-1.5 border rounded-lg ${inputCls}`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {!manualMode ? (
        <select
          value={matchedPlayer ? matchedPlayer.name : ''}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(e) => {
            const picked = e.target.value;
            if (picked === '__CUSTOM__') {
              setManualMode(true);
              return;
            }
            const found =
              players.find((p) => p.name.trim().toLowerCase() === picked.trim().toLowerCase()) ||
              null;
            onChange(picked, found);
          }}
          className={`flex-1 min-w-0 ${heightCls} px-2.5 py-1.5 border rounded-lg ${inputCls}`}
        >
          <option value="">{emptyOptionLabel}</option>
          {players.map((p) => (
            <option key={p.id} value={p.name}>
              {formatUnifiedPlayerLabel(p)}
            </option>
          ))}
          <option value="__CUSTOM__">+ Type custom name...</option>
        </select>
      ) : (
        <input
          type="text"
          value={value}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(e) => {
            const next = e.target.value;
            const found =
              players.find((p) => p.name.trim().toLowerCase() === next.trim().toLowerCase()) ||
              null;
            onChange(next, found);
          }}
          placeholder={placeholder}
          className={`flex-1 min-w-0 ${heightCls} px-2.5 py-1.5 border rounded-lg ${inputCls}`}
        />
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setManualMode((v) => !v)}
        title={manualMode ? 'Switch to roster dropdown' : 'Type a custom player name'}
        aria-label={manualMode ? 'Switch to roster dropdown' : 'Type a custom player name'}
        className={`${compact ? 'min-h-[36px] px-2' : 'min-h-[40px] px-2.5'} inline-flex items-center justify-center rounded-lg border shrink-0 transition-colors disabled:opacity-40 ${toggleBtnCls}`}
      >
        {manualMode ? <ListFilter className="w-3.5 h-3.5" /> : <Keyboard className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
