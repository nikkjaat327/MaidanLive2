import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  ShieldAlert,
  Sliders,
  Trophy,
  UserMinus,
  Users,
} from 'lucide-react';
import { Modal } from '../../common/Modal.tsx';
import type {
  KabaddiCourtPlayer,
  KabaddiDetails,
  KabaddiExtraPointReason,
  KabaddiHalfLabel,
  KabaddiRulesConfig,
  KabaddiSide,
} from '../../../utils/kabaddiScoring.ts';

const EXTRA_REASONS: KabaddiExtraPointReason[] = [
  'Raider self-out',
  'Defender self-out',
  'Technical point',
  'Penalty point',
  'Score correction',
  'Other',
];

// 1. MULTI POINTS RAID MODAL
export function MultiPointRaidModal({
  open,
  onClose,
  team,
  teamName,
  oppTeamName,
  raiders,
  oppDefenders,
  defaultMode,
  rules,
  saving,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  team: KabaddiSide;
  teamName: string;
  oppTeamName: string;
  raiders: KabaddiCourtPlayer[];
  oppDefenders: KabaddiCourtPlayer[];
  defaultMode: 'quick' | 'detailed';
  rules: KabaddiRulesConfig;
  saving: boolean;
  onSubmit: (payload: {
    team: KabaddiSide;
    touchPoints: number;
    includeBonus: boolean;
    raiderId?: string;
    raiderName?: string;
    defenderIds?: string[];
    defenderNames?: string[];
  }) => Promise<void> | void;
}) {
  const [touchPoints, setTouchPoints] = useState(2);
  const [includeBonus, setIncludeBonus] = useState(false);
  const [mode, setMode] = useState<'quick' | 'detailed'>(defaultMode);
  const [raiderId, setRaiderId] = useState('');
  const [selectedDefIds, setSelectedDefIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setTouchPoints(2);
      setIncludeBonus(false);
      setMode(defaultMode);
      setRaiderId('');
      setSelectedDefIds([]);
    }
  }, [open, defaultMode]);

  const bonusValue = includeBonus ? rules.bonusPointValue || 1 : 0;
  const touchTotal = touchPoints * (rules.touchPointValue || 1);
  const grandTotal = touchTotal + bonusValue;
  const isSuper = grandTotal >= (rules.superRaidMinTotalPoints || 3);

  const toggleDefender = (id: string) => {
    setSelectedDefIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= touchPoints) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={`Multi Points Raid · ${teamName}`} maxWidthClass="max-w-xl">
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('quick')}
            className={`flex-1 min-h-[38px] rounded-md text-xs font-bold uppercase tracking-wider ${
              mode === 'quick' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Quick Mode
          </button>
          <button
            type="button"
            onClick={() => setMode('detailed')}
            className={`flex-1 min-h-[38px] rounded-md text-xs font-bold uppercase tracking-wider ${
              mode === 'detailed' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Detailed Mode (Select Players)
          </button>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Touch Points (Marks defenders out &amp; revives)
          </p>
          <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  setTouchPoints(num);
                  setSelectedDefIds((prev) => prev.slice(0, num));
                }}
                className={`min-h-[44px] rounded-lg font-mono text-base font-extrabold border transition-colors ${
                  touchPoints === num
                    ? 'bg-[#EA580C] text-white border-[#EA580C]'
                    : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
          <div>
            <p className="font-semibold text-slate-900">Include Bonus Point (+{rules.bonusPointValue || 1})</p>
            <p className="text-xs text-slate-500">
              Adds +{rules.bonusPointValue || 1} point only — bonus never marks defenders out or causes revival
            </p>
          </div>
          <input
            type="checkbox"
            checked={includeBonus}
            onChange={(e) => setIncludeBonus(e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-[#EA580C]"
          />
        </label>

        <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono tabular-nums text-sm font-bold">
            Touch: {touchTotal} + Bonus: {bonusValue} = <span className="text-orange-400 text-lg">{grandTotal} Pts</span>
          </div>
          {isSuper && (
            <span className="px-2.5 py-1 rounded bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider">
              SUPER RAID
            </span>
          )}
        </div>

        {mode === 'detailed' && (
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Raider ({teamName})
              </label>
              <select
                value={raiderId}
                onChange={(e) => setRaiderId(e.target.value)}
                className="w-full min-h-[42px] px-3 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="">-- Optional Raider Selection --</option>
                {raiders.map((r) => (
                  <option key={r.playerId} value={r.playerId}>
                    {r.jerseyNumber ? `#${r.jerseyNumber} ` : ''}{r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Select {oppTeamName} Defenders Put Out ({selectedDefIds.length}/{touchPoints} chosen)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {oppDefenders.map((d) => {
                  const chosen = selectedDefIds.includes(d.playerId);
                  return (
                    <button
                      key={d.playerId}
                      type="button"
                      onClick={() => toggleDefender(d.playerId)}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold border text-left flex items-center justify-between gap-1 ${
                        chosen
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">
                        {d.jerseyNumber ? `#${d.jerseyNumber} ` : ''}{d.name}
                      </span>
                      {chosen && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              const chosenRaider = raiders.find((r) => r.playerId === raiderId);
              const chosenDefs = oppDefenders.filter((d) => selectedDefIds.includes(d.playerId));
              onSubmit({
                team,
                touchPoints,
                includeBonus,
                raiderId: chosenRaider?.playerId,
                raiderName: chosenRaider?.name,
                defenderIds: chosenDefs.map((d) => d.playerId),
                defenderNames: chosenDefs.map((d) => d.name),
              });
            }}
            className="min-h-[44px] px-5 rounded-lg bg-[#EA580C] text-white font-bold uppercase tracking-wide hover:bg-orange-600 disabled:opacity-50"
          >
            Update Raid (+{grandTotal})
          </button>
        </div>
      </div>
    </Modal>
  );
}

// 2. EXTRA POINTS MODAL
export function ExtraPointsModal({
  open,
  onClose,
  initialTeam,
  teamAName,
  teamBName,
  courtPlayersA,
  courtPlayersB,
  saving,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  initialTeam: KabaddiSide;
  teamAName: string;
  teamBName: string;
  courtPlayersA: KabaddiCourtPlayer[];
  courtPlayersB: KabaddiCourtPlayer[];
  saving: boolean;
  onSubmit: (payload: {
    team: KabaddiSide;
    points: number;
    reason: string;
    playerId?: string;
    playerName?: string;
    markPlayerOut?: boolean;
    outTeam?: KabaddiSide;
    outPlayerId?: string;
  }) => Promise<void> | void;
}) {
  const [team, setTeam] = useState<KabaddiSide>(initialTeam);
  const [points, setPoints] = useState(1);
  const [reason, setReason] = useState<string>('Technical point');
  const [customReason, setCustomReason] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [markPlayerOut, setMarkPlayerOut] = useState(false);
  const [outTeam, setOutTeam] = useState<KabaddiSide>(initialTeam === 'A' ? 'B' : 'A');
  const [outPlayerId, setOutPlayerId] = useState('');

  useEffect(() => {
    if (open) {
      setTeam(initialTeam);
      setPoints(1);
      setReason('Technical point');
      setCustomReason('');
      setPlayerId('');
      setMarkPlayerOut(false);
      setOutTeam(initialTeam === 'A' ? 'B' : 'A');
      setOutPlayerId('');
    }
  }, [open, initialTeam]);

  const teamRoster = team === 'A' ? courtPlayersA : courtPlayersB;
  const outRoster = (outTeam === 'A' ? courtPlayersA : courtPlayersB).filter(
    (p) => p.status === 'ON_COURT'
  );

  return (
    <Modal open={open} onClose={onClose} title="Extra / Technical / Penalty Points" maxWidthClass="max-w-lg">
      <div className="space-y-4 text-sm">
        <div>
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Award Points To</label>
          <div className="grid grid-cols-2 gap-2">
            {(['A', 'B'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => {
                  setTeam(side);
                  setOutTeam(side === 'A' ? 'B' : 'A');
                }}
                className={`min-h-[42px] px-3 rounded-lg font-bold border ${
                  team === side
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {side === 'A' ? teamAName : teamBName}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Points</label>
            <input
              type="number"
              min={0}
              max={25}
              value={points}
              onChange={(e) => setPoints(Math.max(0, Math.min(25, Number(e.target.value) || 0)))}
              className="w-full min-h-[42px] px-3 font-mono font-bold border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[42px] px-3 border border-slate-300 rounded-lg bg-white"
            >
              {EXTRA_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {reason === 'Other' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Specify Reason</label>
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="e.g. Coach warning penalty"
              className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Player Attribution (Optional)
          </label>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white"
          >
            <option value="">-- Team-level extra point --</option>
            {teamRoster.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
          <input
            type="checkbox"
            checked={markPlayerOut}
            onChange={(e) => setMarkPlayerOut(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
          />
          <span className="text-xs font-semibold text-slate-800">
            Also mark a player OUT (e.g. self-out / line out)
          </span>
        </label>

        {markPlayerOut && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Team Putting Player Out</label>
              <select
                value={outTeam}
                onChange={(e) => setOutTeam(e.target.value as KabaddiSide)}
                className="w-full min-h-[38px] px-2.5 border border-slate-300 rounded-lg bg-white text-xs"
              >
                <option value="A">{teamAName}</option>
                <option value="B">{teamBName}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Specific Player</label>
              <select
                value={outPlayerId}
                onChange={(e) => setOutPlayerId(e.target.value)}
                className="w-full min-h-[38px] px-2.5 border border-slate-300 rounded-lg bg-white text-xs"
              >
                <option value="">Next active player</option>
                {outRoster.map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="min-h-[42px] px-4 rounded-lg border border-slate-300 font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              const pObj = teamRoster.find((p) => p.playerId === playerId);
              onSubmit({
                team,
                points,
                reason: reason === 'Other' ? customReason.trim() || 'Other extra point' : reason,
                playerId: pObj?.playerId,
                playerName: pObj?.name,
                markPlayerOut,
                outTeam: markPlayerOut ? outTeam : undefined,
                outPlayerId: markPlayerOut ? outPlayerId || undefined : undefined,
              });
            }}
            className="min-h-[42px] px-5 rounded-lg bg-[#EA580C] text-white font-bold hover:bg-orange-600 disabled:opacity-50"
          >
            Award Extra Points
          </button>
        </div>
      </div>
    </Modal>
  );
}

// 3. TIMEOUT MODAL
export function KabaddiTimeoutModal({
  open,
  onClose,
  teamAName,
  teamBName,
  details,
  saving,
  onStartTimeout,
}: {
  open: boolean;
  onClose: () => void;
  teamAName: string;
  teamBName: string;
  details: KabaddiDetails;
  saving: boolean;
  onStartTimeout: (team: KabaddiSide) => void;
}) {
  const max = details.rules.maxTimeoutsPerTeam || 2;
  const usedA = details.clock.timeoutCountA || 0;
  const usedB = details.clock.timeoutCountB || 0;

  return (
    <Modal open={open} onClose={onClose} title="Call Official Timeout" maxWidthClass="max-w-md">
      <div className="space-y-4 text-sm">
        <p className="text-xs text-slate-600">
          Calling a timeout automatically pauses the match clock and starts a{' '}
          <strong className="font-mono">{details.rules.timeoutDurationSeconds}s</strong> official timeout countdown.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={saving || usedA >= max}
            onClick={() => onStartTimeout('A')}
            className="min-h-[60px] p-3 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-left disabled:opacity-45"
          >
            <p className="font-bold text-slate-900 truncate">{teamAName}</p>
            <p className="font-mono text-xs text-slate-500 mt-0.5">
              Timeouts used: {usedA} / {max}
            </p>
          </button>
          <button
            type="button"
            disabled={saving || usedB >= max}
            onClick={() => onStartTimeout('B')}
            className="min-h-[60px] p-3 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-left disabled:opacity-45"
          >
            <p className="font-bold text-slate-900 truncate">{teamBName}</p>
            <p className="font-mono text-xs text-slate-500 mt-0.5">
              Timeouts used: {usedB} / {max}
            </p>
          </button>
        </div>
      </div>
    </Modal>
  );
}

// 4. SUBSTITUTION, CARDS & INJURY MODAL
export function KabaddiPlayerOpsModal({
  open,
  onClose,
  mode,
  teamAName,
  teamBName,
  courtPlayersA,
  courtPlayersB,
  saving,
  onSubstitute,
  onCard,
  onInjury,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'SUBSTITUTION' | 'CARD' | 'INJURY';
  teamAName: string;
  teamBName: string;
  courtPlayersA: KabaddiCourtPlayer[];
  courtPlayersB: KabaddiCourtPlayer[];
  saving: boolean;
  onSubstitute: (payload: { team: KabaddiSide; playerOutId: string; playerInId: string }) => void;
  onCard: (payload: {
    team: KabaddiSide;
    playerId: string;
    cardType: 'GREEN' | 'YELLOW' | 'RED' | 'CUSTOM';
    customLabel?: string;
    actionImpact: 'WARNING' | 'SUSPEND' | 'DISQUALIFY';
    pointsToOpponent?: number;
  }) => void;
  onInjury: (payload: { team: KabaddiSide; playerId: string; status: 'INJURED' | 'ON_COURT' }) => void;
}) {
  const [team, setTeam] = useState<KabaddiSide>('A');
  const roster = team === 'A' ? courtPlayersA : courtPlayersB;
  const onCourt = roster.filter((p) => p.status === 'ON_COURT');
  const bench = roster.filter((p) => p.status === 'BENCH');
  const injured = roster.filter((p) => p.status === 'INJURED');

  const [playerOutId, setPlayerOutId] = useState('');
  const [playerInId, setPlayerInId] = useState('');
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [cardType, setCardType] = useState<'GREEN' | 'YELLOW' | 'RED' | 'CUSTOM'>('YELLOW');
  const [customCardLabel, setCustomCardLabel] = useState('');
  const [actionImpact, setActionImpact] = useState<'WARNING' | 'SUSPEND' | 'DISQUALIFY'>('WARNING');
  const [penaltyPts, setPenaltyPts] = useState(0);
  const [injuryStatus, setInjuryStatus] = useState<'INJURED' | 'ON_COURT'>('INJURED');

  useEffect(() => {
    if (open) {
      setPlayerOutId(onCourt[0]?.playerId || '');
      setPlayerInId(bench[0]?.playerId || '');
      setTargetPlayerId(roster[0]?.playerId || '');
    }
  }, [open, team]);

  const title =
    mode === 'SUBSTITUTION'
      ? 'Player Substitution'
      : mode === 'CARD'
        ? 'Disciplinary Cards & Sanctions'
        : 'Player Injury Status';

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-lg">
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          {(['A', 'B'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTeam(s)}
              className={`min-h-[40px] rounded-lg font-bold border ${
                team === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              {s === 'A' ? teamAName : teamBName}
            </button>
          ))}
        </div>

        {mode === 'SUBSTITUTION' && (
          <div className="space-y-3">
            {bench.length === 0 ? (
              <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                No substitute bench players available for {team === 'A' ? teamAName : teamBName}. Add players to the team roster (more than 7) so substitutes appear on bench.
              </p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Player Leaving Court</label>
                  <select
                    value={playerOutId}
                    onChange={(e) => setPlayerOutId(e.target.value)}
                    className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white"
                  >
                    {onCourt.map((p) => (
                      <option key={p.playerId} value={p.playerId}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Substitute Coming In</label>
                  <select
                    value={playerInId}
                    onChange={(e) => setPlayerInId(e.target.value)}
                    className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white"
                  >
                    {bench.map((p) => (
                      <option key={p.playerId} value={p.playerId}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={onClose} className="min-h-[40px] px-4 rounded-lg border border-slate-300">Cancel</button>
                  <button
                    type="button"
                    disabled={saving || !playerOutId || !playerInId}
                    onClick={() => onSubstitute({ team, playerOutId, playerInId })}
                    className="min-h-[40px] px-4 rounded-lg bg-[#EA580C] text-white font-bold disabled:opacity-45"
                  >
                    Confirm Substitution
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {mode === 'CARD' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Player</label>
              <select
                value={targetPlayerId}
                onChange={(e) => setTargetPlayerId(e.target.value)}
                className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white"
              >
                {roster.map((p) => (
                  <option key={p.playerId} value={p.playerId}>{p.name} ({p.status})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Card Type</label>
                <select
                  value={cardType}
                  onChange={(e) => {
                    const next = e.target.value as any;
                    setCardType(next);
                    if (next === 'YELLOW') setActionImpact('SUSPEND');
                    else if (next === 'RED') setActionImpact('DISQUALIFY');
                    else setActionImpact('WARNING');
                  }}
                  className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="GREEN">Green Card (Warning)</option>
                  <option value="YELLOW">Yellow Card (Temp Suspension)</option>
                  <option value="RED">Red Card (Disqualification)</option>
                  <option value="CUSTOM">Custom Tournament Card</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Court Impact</label>
                <select
                  value={actionImpact}
                  onChange={(e) => setActionImpact(e.target.value as any)}
                  className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="WARNING">Warning Only</option>
                  <option value="SUSPEND">Temporary Suspension</option>
                  <option value="DISQUALIFY">Disqualify Player</option>
                </select>
              </div>
            </div>
            {cardType === 'CUSTOM' && (
              <input
                type="text"
                value={customCardLabel}
                onChange={(e) => setCustomCardLabel(e.target.value)}
                placeholder="Custom card name (e.g. Blue Card)"
                className="w-full min-h-[38px] px-3 border border-slate-300 rounded-lg"
              />
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Penalty Points Awarded to Opponent (Optional)
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={penaltyPts}
                onChange={(e) => setPenaltyPts(Math.max(0, Number(e.target.value) || 0))}
                className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="min-h-[40px] px-4 rounded-lg border border-slate-300">Cancel</button>
              <button
                type="button"
                disabled={saving || !targetPlayerId}
                onClick={() =>
                  onCard({
                    team,
                    playerId: targetPlayerId,
                    cardType,
                    customLabel: customCardLabel,
                    actionImpact,
                    pointsToOpponent: penaltyPts,
                  })
                }
                className="min-h-[40px] px-4 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700"
              >
                Issue Card
              </button>
            </div>
          </div>
        )}

        {mode === 'INJURY' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setInjuryStatus('INJURED');
                  setTargetPlayerId(onCourt[0]?.playerId || '');
                }}
                className={`min-h-[38px] rounded-lg text-xs font-bold border ${
                  injuryStatus === 'INJURED' ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-white border-slate-300'
                }`}
              >
                Mark Injured (Pause)
              </button>
              <button
                type="button"
                onClick={() => {
                  setInjuryStatus('ON_COURT');
                  setTargetPlayerId(injured[0]?.playerId || '');
                }}
                className={`min-h-[38px] rounded-lg text-xs font-bold border ${
                  injuryStatus === 'ON_COURT' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-300'
                }`}
              >
                Return to Court
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Player</label>
              <select
                value={targetPlayerId}
                onChange={(e) => setTargetPlayerId(e.target.value)}
                className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white"
              >
                {(injuryStatus === 'INJURED' ? onCourt : injured).map((p) => (
                  <option key={p.playerId} value={p.playerId}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="min-h-[40px] px-4 rounded-lg border border-slate-300">Cancel</button>
              <button
                type="button"
                disabled={saving || !targetPlayerId}
                onClick={() => onInjury({ team, playerId: targetPlayerId, status: injuryStatus })}
                className="min-h-[40px] px-4 rounded-lg bg-[#EA580C] text-white font-bold disabled:opacity-45"
              >
                Update Injury Status
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// 5. RULES CONFIGURATION MODAL
export function KabaddiRulesModal({
  open,
  onClose,
  rules,
  saving,
  onSaveRules,
  onResetDefaults,
}: {
  open: boolean;
  onClose: () => void;
  rules: KabaddiRulesConfig;
  saving: boolean;
  onSaveRules: (next: KabaddiRulesConfig) => void;
  onResetDefaults: () => void;
}) {
  const [draft, setDraft] = useState<KabaddiRulesConfig>(rules);

  useEffect(() => {
    if (open) setDraft(rules);
  }, [open, rules]);

  const numField = (label: string, key: keyof KabaddiRulesConfig, min = 0, max = 99) => (
    <div>
      <label className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={Number(draft[key] ?? 0)}
        onChange={(e) =>
          setDraft((prev) => ({ ...prev, [key]: Math.max(min, Math.min(max, Number(e.target.value) || 0)) }))
        }
        className="w-full min-h-[38px] px-2.5 font-mono text-sm border border-slate-300 rounded-lg"
      />
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Tournament Kabaddi Rules Configuration" maxWidthClass="max-w-2xl">
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {numField('Players Per Side', 'playersPerSide', 3, 12)}
          {numField('Touch Point Value', 'touchPointValue', 1, 5)}
          {numField('Tackle Point Value', 'unsuccessfulRaidDefenderPoints', 1, 5)}
          {numField('Bonus Point Value', 'bonusPointValue', 1, 5)}
          {numField('Super Raid Min Total', 'superRaidMinTotalPoints', 2, 10)}
          {numField('All-Out Bonus Points', 'allOutBonusPoints', 1, 6)}
          {numField('Super Tackle Max Defenders', 'superTackleMaxDefenders', 1, 6)}
          {numField('Super Tackle Points', 'superTacklePoints', 1, 6)}
          {numField('Super Tackle Revivals', 'superTackleRevivalCount', 0, 5)}
          {numField('Do-or-Die Empty Threshold', 'doOrDieConsecutiveEmptyThreshold', 1, 5)}
          {numField('Do-or-Die Animation (Secs)', 'doOrDieBannerDurationSec', 2, 120)}
          {numField('All-Out Animation (Secs)', 'allOutBannerDurationSec', 2, 120)}
          {numField('Half Duration (Mins)', 'halfDurationMinutes', 1, 60)}
          {numField('Halves Count', 'halvesCount', 1, 4)}
          {numField('Break Duration (Mins)', 'breakDurationMinutes', 1, 30)}
          {numField('Raid Timer Seconds', 'raidTimerSeconds', 10, 60)}
          {numField('Timeout Duration (Secs)', 'timeoutDurationSeconds', 10, 120)}
          {numField('Max Timeouts / Team', 'maxTimeoutsPerTeam', 0, 10)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.raidTimerEnabled}
              onChange={(e) => setDraft((prev) => ({ ...prev, raidTimerEnabled: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
            />
            <span>Enable 30s Raid Timer</span>
          </label>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tie Resolution Policy</label>
            <select
              value={draft.tieResolutionMode}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  tieResolutionMode: e.target.value as KabaddiRulesConfig['tieResolutionMode'],
                }))
              }
              className="w-full min-h-[38px] px-2.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
            >
              <option value="EXTRA_TIME">Extra Time Halves</option>
              <option value="TIE_BREAKER">5-Raid Tie-Breaker</option>
              <option value="GOLDEN_RAID">Golden Raid Sudden Death</option>
              <option value="ALLOW_TIE">Allow Tied Finish</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            disabled={saving}
            onClick={onResetDefaults}
            className="min-h-[40px] px-3.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset Defaults
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="min-h-[40px] px-4 rounded-lg border border-slate-300 font-semibold">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onSaveRules(draft)}
              className="min-h-[40px] px-5 rounded-lg bg-[#EA580C] text-white font-bold hover:bg-orange-600"
            >
              Save Match Rules
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// 6. TIME CORRECTION, SCORE CORRECTION, FORFEIT & COMPLETE MATCH MODALS
export function KabaddiCompleteMatchModal({
  open,
  onClose,
  teamAName,
  teamBName,
  scoreA,
  scoreB,
  details,
  saving,
  onComplete,
  onStartExtraTime,
  onStartTieBreaker,
}: {
  open: boolean;
  onClose: () => void;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  details: KabaddiDetails;
  saving: boolean;
  onComplete: (opts?: { goldenRaidWinner?: 'A' | 'B'; allowDraw?: boolean }) => void;
  onStartExtraTime: () => void;
  onStartTieBreaker: () => void;
}) {
  const isTied = scoreA === scoreB;
  const tbDecided =
    details.isTieBreaker && details.tieBreakerScoreA !== details.tieBreakerScoreB;
  const autoWinnerName =
    scoreA > scoreB
      ? teamAName
      : scoreB > scoreA
        ? teamBName
        : tbDecided
          ? details.tieBreakerScoreA > details.tieBreakerScoreB
            ? teamAName
            : teamBName
          : '';

  return (
    <Modal open={open} onClose={onClose} title="Complete Kabaddi Match & Calculate Winner" maxWidthClass="max-w-lg">
      <div className="space-y-4 text-sm">
        <div className="p-4 rounded-xl bg-slate-950 text-white text-center space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Final Scoreboard Comparison
          </p>
          <p className="font-mono tabular-nums text-2xl font-extrabold">
            {teamAName} <span className="text-orange-400">{scoreA}</span> –{' '}
            <span className="text-sky-400">{scoreB}</span> {teamBName}
          </p>
          {autoWinnerName ? (
            <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600/25 border border-emerald-400/40 text-emerald-300 text-xs font-bold">
              <Trophy className="w-3.5 h-3.5" />
              Auto-Calculated Winner: {autoWinnerName}
            </p>
          ) : (
            <p className="text-xs font-bold text-amber-300">
              Scores are currently tied ({scoreA}-{scoreB})
            </p>
          )}
        </div>

        {isTied && !tbDecided ? (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-600">
              Choose how to resolve the tie according to tournament rules:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  onStartExtraTime();
                  onClose();
                }}
                className="min-h-[42px] px-3 rounded-lg border border-slate-300 font-semibold hover:bg-slate-50"
              >
                Start Extra Time
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  onStartTieBreaker();
                  onClose();
                }}
                className="min-h-[42px] px-3 rounded-lg border border-slate-300 font-semibold hover:bg-slate-50"
              >
                Start 5-Raid Tie-Breaker
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onComplete({ goldenRaidWinner: 'A' })}
                className="min-h-[42px] px-3 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
              >
                Golden Raid Winner: {teamAName}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onComplete({ goldenRaidWinner: 'B' })}
                className="min-h-[42px] px-3 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
              >
                Golden Raid Winner: {teamBName}
              </button>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => onComplete({ allowDraw: true })}
              className="w-full min-h-[42px] rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800"
            >
              Confirm Match as Official Tie ({scoreA}-{scoreB})
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Completing the match locks the clock &amp; scoring, updates tournament standings/fixtures, and opens the official Winner Screen.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="min-h-[42px] px-4 rounded-lg border border-slate-300 font-semibold">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onComplete()}
                className="min-h-[42px] px-5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700"
              >
                Confirm &amp; Complete Match
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function KabaddiUtilityModals({
  timeOpen,
  onCloseTime,
  scoreCorrOpen,
  onCloseScoreCorr,
  forfeitOpen,
  onCloseForfeit,
  teamAName,
  teamBName,
  scoreA,
  scoreB,
  details,
  saving,
  onTimeCorrection,
  onScoreCorrection,
  onForfeit,
}: {
  timeOpen: boolean;
  onCloseTime: () => void;
  scoreCorrOpen: boolean;
  onCloseScoreCorr: () => void;
  forfeitOpen: boolean;
  onCloseForfeit: () => void;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  details: KabaddiDetails;
  saving: boolean;
  onTimeCorrection: (minutes: number, seconds: number, halfLabel: KabaddiHalfLabel) => void;
  onScoreCorrection: (nextA: number, nextB: number, reason: string) => void;
  onForfeit: (forfeitTeam: KabaddiSide, reason: string) => void;
}) {
  const [mins, setMins] = useState(details.timerMinutes);
  const [secs, setSecs] = useState(details.timerSeconds);
  const [halfLabel, setHalfLabel] = useState<KabaddiHalfLabel>(details.clock.halfLabel || details.half);

  const [corrA, setCorrA] = useState(scoreA);
  const [corrB, setCorrB] = useState(scoreB);
  const [corrReason, setCorrReason] = useState('');

  const [forfeitTeam, setForfeitTeam] = useState<KabaddiSide>('B');
  const [forfeitReason, setForfeitReason] = useState('');

  useEffect(() => {
    if (timeOpen) {
      setMins(details.timerMinutes);
      setSecs(details.timerSeconds);
      setHalfLabel(details.clock.halfLabel || details.half);
    }
  }, [timeOpen, details]);

  useEffect(() => {
    if (scoreCorrOpen) {
      setCorrA(scoreA);
      setCorrB(scoreB);
      setCorrReason('');
    }
  }, [scoreCorrOpen, scoreA, scoreB]);

  return (
    <>
      <Modal open={timeOpen} onClose={onCloseTime} title="Match Clock Correction" maxWidthClass="max-w-md">
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Minutes</label>
              <input
                type="number"
                min={0}
                max={99}
                value={mins}
                onChange={(e) => setMins(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                className="w-full min-h-[40px] px-3 font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Seconds</label>
              <input
                type="number"
                min={0}
                max={59}
                value={secs}
                onChange={(e) => setSecs(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                className="w-full min-h-[40px] px-3 font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Half / Period</label>
            <select
              value={halfLabel}
              onChange={(e) => setHalfLabel(e.target.value as KabaddiHalfLabel)}
              className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white"
            >
              <option value="1st Half">1st Half</option>
              <option value="Half Time">Half Time</option>
              <option value="2nd Half">2nd Half</option>
              <option value="Extra Time">Extra Time</option>
              <option value="Tie-Breaker">Tie-Breaker</option>
              <option value="Golden Raid">Golden Raid</option>
              <option value="Full Time">Full Time</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCloseTime} className="min-h-[40px] px-4 rounded-lg border border-slate-300">Cancel</button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onTimeCorrection(mins, secs, halfLabel)}
              className="min-h-[40px] px-4 rounded-lg bg-[#EA580C] text-white font-bold"
            >
              Apply Clock
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={scoreCorrOpen} onClose={onCloseScoreCorr} title="Audited Manual Score Correction" maxWidthClass="max-w-md">
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{teamAName}</label>
              <input
                type="number"
                min={0}
                value={corrA}
                onChange={(e) => setCorrA(Math.max(0, Number(e.target.value) || 0))}
                className="w-full min-h-[42px] px-3 font-mono font-bold border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{teamBName}</label>
              <input
                type="number"
                min={0}
                value={corrB}
                onChange={(e) => setCorrB(Math.max(0, Number(e.target.value) || 0))}
                className="w-full min-h-[42px] px-3 font-mono font-bold border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Reason (Required)</label>
            <input
              type="text"
              value={corrReason}
              onChange={(e) => setCorrReason(e.target.value)}
              placeholder="e.g. Referee overturned lobby out call"
              className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCloseScoreCorr} className="min-h-[40px] px-4 rounded-lg border border-slate-300">Cancel</button>
            <button
              type="button"
              disabled={saving || !corrReason.trim()}
              onClick={() => onScoreCorrection(corrA, corrB, corrReason.trim())}
              className="min-h-[40px] px-4 rounded-lg bg-[#EA580C] text-white font-bold disabled:opacity-45"
            >
              Save Audited Correction
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={forfeitOpen} onClose={onCloseForfeit} title="Declare Match Forfeit" maxWidthClass="max-w-md">
        <div className="space-y-4 text-sm">
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            The forfeiting team loses automatically and the opponent is awarded the win in tournament standings.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Forfeiting Team</label>
            <select
              value={forfeitTeam}
              onChange={(e) => setForfeitTeam(e.target.value as KabaddiSide)}
              className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white"
            >
              <option value="A">{teamAName} forfeits ({teamBName} wins)</option>
              <option value="B">{teamBName} forfeits ({teamAName} wins)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
            <input
              type="text"
              value={forfeitReason}
              onChange={(e) => setForfeitReason(e.target.value)}
              placeholder="e.g. Walkover / insufficient players"
              className="w-full min-h-[40px] px-3 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCloseForfeit} className="min-h-[40px] px-4 rounded-lg border border-slate-300">Cancel</button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onForfeit(forfeitTeam, forfeitReason.trim())}
              className="min-h-[40px] px-4 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
            >
              Confirm Forfeit
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
