import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, Layers, Sparkles } from 'lucide-react';
import { LiveScoreData, LiveStreamData, PlayerData } from '../../types/index.ts';
import {
  applyKabaddiAction,
  createInitialKabaddiDetails,
  KabaddiDetails,
  KabaddiEventType,
} from '../../utils/kabaddiScoring.ts';
import {
  applyCricketAction,
  CricketDeliveryEventType,
  CricketDetails,
  createInitialCricketDetails,
} from '../../utils/cricketScoring.ts';
import {
  applyVolleyballAction,
  normalizeVolleyballDetails,
  VolleyballDetails,
  VolleyballEventType,
} from '../../utils/volleyballScoring.ts';
import {
  applyFootballAction,
  createInitialFootballDetails,
  FootballDetails,
  FootballEventType,
} from '../../utils/footballScoring.ts';
import { PlayerPickerField } from './PlayerPickerField.tsx';
import { mergeMatchRoster } from '../../utils/sportPositions.ts';

interface AdvancedEventComposerProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  players: PlayerData[];
  saving: boolean;
  locked?: boolean;
  onSubmitEvent: (payload: {
    clientEventId: string;
    sportType: string;
    action: Record<string, unknown>;
    playerId?: string;
    playerName?: string;
    assistPlayerId?: string;
    assistPlayerName?: string;
    eventPhase?: string;
  }) => Promise<void>;
}

function makeClientEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AdvancedEventComposer({
  stream,
  score,
  players,
  saving,
  locked = false,
  onSubmitEvent,
}: AdvancedEventComposerProps) {
  const sport = score?.sportType || stream.gameName || 'Other';
  const teamA = stream.teamAName || 'Team A';
  const teamB = stream.teamBName || 'Team B';
  const scoreA = score?.teamAScore ?? 0;
  const scoreB = score?.teamBScore ?? 0;
  const roster = useMemo(() => mergeMatchRoster(stream, players), [stream, players]);

  const [expanded, setExpanded] = useState(true);

  // Kabaddi state
  const [kabTeam, setKabTeam] = useState<'A' | 'B'>('A');
  const [kabEventType, setKabEventType] = useState<KabaddiEventType>('SUCCESSFUL_RAID');
  const [kabPoints, setKabPoints] = useState<number>(1);
  const [kabCustomPts, setKabCustomPts] = useState<string>('1');
  const [kabBonusIncluded, setKabBonusIncluded] = useState<number>(0);
  const [kabDoOrDie, setKabDoOrDie] = useState(false);

  // Cricket state
  const [crkEventType, setCrkEventType] = useState<CricketDeliveryEventType>('LEGAL_DELIVERY');
  const [crkBatRuns, setCrkBatRuns] = useState<number>(0);
  const [crkExtraType, setCrkExtraType] = useState<
    'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | 'PENALTY'
  >('NONE');
  const [crkExtraRuns, setCrkExtraRuns] = useState<number>(0);
  const [crkIsWicket, setCrkIsWicket] = useState(false);
  const [crkWicketType, setCrkWicketType] = useState('Caught');
  const [crkDismissed, setCrkDismissed] = useState('');
  const [crkNewBatsman, setCrkNewBatsman] = useState('');
  const [crkBowler, setCrkBowler] = useState('');

  // Volleyball state
  const [vbTeam, setVbTeam] = useState<'A' | 'B'>('A');
  const [vbEventType, setVbEventType] = useState<VolleyballEventType>('ATTACK_POINT');
  const [vbPoints, setVbPoints] = useState<number>(1);

  // Football state
  const [fbTeam, setFbTeam] = useState<'A' | 'B'>('A');
  const [fbEventType, setFbEventType] = useState<FootballEventType>('GOAL');
  const [fbMinute, setFbMinute] = useState<string>(
    String((score?.sportSpecificDetails as any)?.timerMinutes ?? 0)
  );
  const [fbAddedMin, setFbAddedMin] = useState<string>('0');
  const [fbPlayerOut, setFbPlayerOut] = useState('');

  // Shared player & note
  const [playerId, setPlayerId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [assistPlayerId, setAssistPlayerId] = useState('');
  const [assistPlayerName, setAssistPlayerName] = useState('');
  const [description, setDescription] = useState('');

  const effectiveKabPoints =
    kabEventType === 'EMPTY_RAID' ||
    kabEventType === 'UNSUCCESSFUL_RAID' ||
    kabEventType === 'FAILED_TACKLE'
      ? 0
      : kabCustomPts.trim() !== ''
        ? Math.max(0, Math.min(20, Number(kabCustomPts) || 0))
        : kabPoints;

  const previewResult = useMemo(() => {
    if (sport === 'Kabaddi') {
      const details = {
        ...createInitialKabaddiDetails(),
        ...((score?.sportSpecificDetails || {}) as Partial<KabaddiDetails>),
      };
      const action = {
        type: 'STRUCTURED_EVENT' as const,
        team: kabTeam,
        eventType: kabEventType,
        points: effectiveKabPoints,
        bonusIncluded: Math.min(effectiveKabPoints, kabBonusIncluded),
        playerName: playerName.trim(),
        description: description.trim(),
        isDoOrDie: kabDoOrDie,
      };
      const applied = applyKabaddiAction(details, scoreA, scoreB, action);
      return {
        action,
        label: applied.label,
        nextScoreA: applied.teamAScore,
        nextScoreB: applied.teamBScore,
      };
    }

    if (sport === 'Cricket') {
      const details = {
        ...createInitialCricketDetails(),
        ...((score?.sportSpecificDetails || {}) as Partial<CricketDetails>),
      };
      const action = {
        type: 'STRUCTURED_DELIVERY' as const,
        eventType: crkEventType,
        batRuns: crkBatRuns,
        extraType: crkExtraType,
        extraRuns: crkExtraRuns,
        isWicket: crkIsWicket || crkEventType === 'WICKET',
        wicketType: crkIsWicket || crkEventType === 'WICKET' ? crkWicketType : '',
        dismissedPlayer: crkDismissed.trim() || playerName.trim(),
        newBatsman: crkNewBatsman.trim(),
        bowler: crkBowler.trim() || assistPlayerName.trim(),
        description: description.trim(),
      };
      const applied = applyCricketAction(details, action);
      return {
        action,
        label: applied.label,
        nextScoreA: applied.teamAScore,
        nextScoreB: applied.teamBScore,
      };
    }

    if (sport === 'Volleyball') {
      const details = normalizeVolleyballDetails(
        (score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>
      );
      const action = {
        type: 'STRUCTURED_POINT' as const,
        team: vbTeam,
        eventType: vbEventType,
        points: details.allowCustomMultiPoint ? vbPoints : 1,
        playerName: playerName.trim(),
        description: description.trim(),
      };
      const applied = applyVolleyballAction(details, scoreA, scoreB, action);
      return {
        action,
        label: applied.label,
        nextScoreA: applied.teamAScore,
        nextScoreB: applied.teamBScore,
        blockedReason: applied.blockedReason,
      };
    }

    if (sport === 'Football') {
      const details = {
        ...createInitialFootballDetails(),
        ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
      };
      const action = {
        type: 'STRUCTURED_EVENT' as const,
        team: fbTeam,
        eventType: fbEventType,
        minute: Number(fbMinute) || 0,
        addedMinute: Number(fbAddedMin) || 0,
        playerName: playerName.trim(),
        assistPlayerName: assistPlayerName.trim(),
        playerOutName: fbPlayerOut.trim(),
        description: description.trim(),
      };
      const applied = applyFootballAction(details, scoreA, scoreB, action);
      return {
        action,
        label: applied.label,
        nextScoreA: applied.teamAScore,
        nextScoreB: applied.teamBScore,
      };
    }

    return null;
  }, [
    sport,
    score?.sportSpecificDetails,
    scoreA,
    scoreB,
    kabTeam,
    kabEventType,
    effectiveKabPoints,
    kabBonusIncluded,
    kabDoOrDie,
    crkEventType,
    crkBatRuns,
    crkExtraType,
    crkExtraRuns,
    crkIsWicket,
    crkWicketType,
    crkDismissed,
    crkNewBatsman,
    crkBowler,
    vbTeam,
    vbEventType,
    vbPoints,
    fbTeam,
    fbEventType,
    fbMinute,
    fbAddedMin,
    fbPlayerOut,
    playerName,
    assistPlayerName,
    description,
  ]);

  if (!previewResult) return null;

  async function handleConfirm() {
    if (!previewResult) return;
    await onSubmitEvent({
      clientEventId: makeClientEventId(),
      sportType: sport,
      action: previewResult.action,
      playerId: playerId || undefined,
      playerName: playerName.trim() || undefined,
      assistPlayerId: assistPlayerId || undefined,
      assistPlayerName: assistPlayerName.trim() || undefined,
    });
    setDescription('');
    setPlayerId('');
    setPlayerName('');
    setAssistPlayerId('');
    setAssistPlayerName('');
    setCrkIsWicket(false);
    setCrkDismissed('');
    setCrkNewBatsman('');
    setKabDoOrDie(false);
    setKabBonusIncluded(0);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 bg-slate-950 text-white flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-xs sm:text-sm font-bold tracking-wide">
            Advanced Multi-Point &amp; Structured Event Scorer ({sport})
          </span>
        </div>
        <span className="text-[11px] font-semibold text-slate-300">
          {expanded ? 'Hide Composer' : 'Expand Composer'}
        </span>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {sport === 'Kabaddi' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Scoring Team
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['A', 'B'] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setKabTeam(side)}
                        className={`min-h-[40px] px-2.5 text-xs font-semibold rounded-lg border truncate ${
                          kabTeam === side
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {side === 'A' ? teamA : teamB}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Kabaddi Event Type
                  </label>
                  <select
                    value={kabEventType}
                    onChange={(e) => {
                      const ev = e.target.value as KabaddiEventType;
                      setKabEventType(ev);
                      if (ev === 'SUPER_RAID') {
                        setKabPoints(3);
                        setKabCustomPts('3');
                      } else if (ev === 'SUPER_TACKLE' || ev === 'ALL_OUT') {
                        setKabPoints(2);
                        setKabCustomPts('2');
                      } else if (
                        ev === 'EMPTY_RAID' ||
                        ev === 'UNSUCCESSFUL_RAID' ||
                        ev === 'FAILED_TACKLE'
                      ) {
                        setKabPoints(0);
                        setKabCustomPts('0');
                      } else {
                        setKabPoints(1);
                        setKabCustomPts('1');
                      }
                    }}
                    className="w-full min-h-[40px] px-3 text-xs font-medium border border-slate-300 rounded-lg bg-white"
                  >
                    <optgroup label="Raid Events">
                      <option value="SUCCESSFUL_RAID">Successful Raid</option>
                      <option value="MULTI_POINT_RAID">Multi-Point Raid</option>
                      <option value="SUPER_RAID">Super Raid (3+)</option>
                      <option value="BONUS_POINT">Bonus Point</option>
                      <option value="DO_OR_DIE_RAID">Do-or-Die Raid</option>
                      <option value="ALL_OUT">All-Out (+2)</option>
                      <option value="EMPTY_RAID">Empty Raid (0)</option>
                      <option value="UNSUCCESSFUL_RAID">Unsuccessful Raid (0)</option>
                      <option value="CUSTOM_RAID">Custom Raid</option>
                    </optgroup>
                    <optgroup label="Tackle Events">
                      <option value="SUCCESSFUL_TACKLE">Successful Tackle</option>
                      <option value="SUPER_TACKLE">Super Tackle (2+)</option>
                      <option value="TEAM_TACKLE">Team Tackle</option>
                      <option value="MULTI_POINT_TACKLE">Multi-Point Tackle</option>
                      <option value="FAILED_TACKLE">Failed Tackle (0)</option>
                      <option value="CUSTOM_TACKLE">Custom Tackle</option>
                    </optgroup>
                    <optgroup label="Other">
                      <option value="TECHNICAL_POINT">Technical Point</option>
                      <option value="PENALTY_POINT">Penalty Point</option>
                      <option value="CUSTOM_EVENT">Custom Event</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Points (Quick +1 to +6 or Custom)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setKabPoints(n);
                          setKabCustomPts(String(n));
                        }}
                        className={`min-h-[40px] flex-1 rounded-lg font-mono text-xs font-bold border ${
                          effectiveKabPoints === n
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 text-slate-800 border-slate-300'
                        }`}
                      >
                        +{n}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={kabCustomPts}
                      onChange={(e) => setKabCustomPts(e.target.value)}
                      aria-label="Custom points"
                      className="w-14 min-h-[40px] px-2 font-mono text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span>Bonus pts included in total (no double-count):</span>
                  <input
                    type="number"
                    min={0}
                    max={effectiveKabPoints}
                    value={kabBonusIncluded}
                    onChange={(e) => setKabBonusIncluded(Math.max(0, Number(e.target.value) || 0))}
                    className="w-14 min-h-[34px] px-2 font-mono border border-slate-300 rounded"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={kabDoOrDie}
                    onChange={(e) => setKabDoOrDie(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span>Do-or-Die Raid</span>
                </label>
              </div>
            </div>
          )}

          {sport === 'Cricket' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Delivery Event Type
                  </label>
                  <select
                    value={crkEventType}
                    onChange={(e) => {
                      const ev = e.target.value as CricketDeliveryEventType;
                      setCrkEventType(ev);
                      if (ev === 'WIDE') {
                        setCrkExtraType('WIDE');
                        setCrkExtraRuns(1);
                      } else if (ev === 'NO_BALL') {
                        setCrkExtraType('NO_BALL');
                        setCrkExtraRuns(1);
                      } else if (ev === 'BYE') {
                        setCrkExtraType('BYE');
                        setCrkExtraRuns(1);
                      } else if (ev === 'LEG_BYE') {
                        setCrkExtraType('LEG_BYE');
                        setCrkExtraRuns(1);
                      } else if (ev === 'PENALTY_RUNS') {
                        setCrkExtraType('PENALTY');
                        setCrkExtraRuns(5);
                      } else if (ev === 'WICKET') {
                        setCrkIsWicket(true);
                        setCrkExtraType('NONE');
                        setCrkExtraRuns(0);
                      } else {
                        setCrkExtraType('NONE');
                        setCrkExtraRuns(0);
                      }
                    }}
                    className="w-full min-h-[40px] px-3 text-xs font-medium border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="LEGAL_DELIVERY">Legal Delivery</option>
                    <option value="WIDE">Wide (No legal ball)</option>
                    <option value="NO_BALL">No Ball (No legal ball)</option>
                    <option value="BYE">Bye</option>
                    <option value="LEG_BYE">Leg Bye</option>
                    <option value="WICKET">Wicket / Run Out</option>
                    <option value="PENALTY_RUNS">Penalty Runs</option>
                    <option value="MULTIPLE_EXTRAS">Multiple Extras</option>
                    <option value="CUSTOM_EVENT">Custom Event</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Bat Runs (0–6+)
                  </label>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3, 4, 6].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCrkBatRuns(r)}
                        className={`min-h-[40px] flex-1 rounded-lg font-mono text-xs font-bold border ${
                          crkBatRuns === r
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-800 border-slate-300'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={0}
                      max={12}
                      value={crkBatRuns}
                      onChange={(e) => setCrkBatRuns(Math.max(0, Number(e.target.value) || 0))}
                      aria-label="Custom bat runs"
                      className="w-12 min-h-[40px] px-1.5 font-mono text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Extra Type &amp; Extra Runs
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={crkExtraType}
                      onChange={(e) => setCrkExtraType(e.target.value as any)}
                      className="flex-1 min-h-[40px] px-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="NONE">None</option>
                      <option value="WIDE">Wide</option>
                      <option value="NO_BALL">No Ball</option>
                      <option value="BYE">Bye</option>
                      <option value="LEG_BYE">Leg Bye</option>
                      <option value="PENALTY">Penalty</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={crkExtraRuns}
                      onChange={(e) => setCrkExtraRuns(Math.max(0, Number(e.target.value) || 0))}
                      aria-label="Extra runs"
                      className="w-16 min-h-[40px] px-2 font-mono text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <label className="min-h-[40px] inline-flex items-center gap-2 text-xs font-semibold text-red-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={crkIsWicket || crkEventType === 'WICKET'}
                    onChange={(e) => setCrkIsWicket(e.target.checked)}
                    className="w-4 h-4 rounded border-red-300 text-red-600"
                  />
                  <span>Wicket on this ball</span>
                </label>

                {(crkIsWicket || crkEventType === 'WICKET') && (
                  <>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Dismissal</label>
                      <select
                        value={crkWicketType}
                        onChange={(e) => setCrkWicketType(e.target.value)}
                        className="w-full min-h-[38px] px-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Caught">Caught</option>
                        <option value="Bowled">Bowled</option>
                        <option value="LBW">LBW</option>
                        <option value="Run Out">Run Out</option>
                        <option value="Stumped">Stumped</option>
                        <option value="Hit Wicket">Hit Wicket</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Dismissed Batsman
                      </label>
                      <PlayerPickerField
                        compact
                        value={crkDismissed}
                        onChange={(name) => setCrkDismissed(name)}
                        players={roster.all}
                        placeholder="Batsman out"
                        emptyOptionLabel="-- Select batsman (Optional) --"
                        ariaLabel="Dismissed Batsman"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">New Batsman</label>
                      <PlayerPickerField
                        compact
                        value={crkNewBatsman}
                        onChange={(name) => setCrkNewBatsman(name)}
                        players={roster.all}
                        placeholder="Incoming batsman"
                        emptyOptionLabel="-- Select next batsman (Optional) --"
                        ariaLabel="New Batsman"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Bowler</label>
                  <PlayerPickerField
                    compact
                    value={crkBowler}
                    onChange={(name) => setCrkBowler(name)}
                    players={roster.all}
                    placeholder="Bowler name"
                    emptyOptionLabel="-- Select bowler (Optional) --"
                    ariaLabel="Bowler"
                  />
                </div>
              </div>
            </div>
          )}

          {sport === 'Volleyball' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Point Awarded To
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['A', 'B'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setVbTeam(side)}
                      className={`min-h-[40px] px-2.5 text-xs font-semibold rounded-lg border truncate ${
                        vbTeam === side
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      {side === 'A' ? teamA : teamB}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Rally / Fault Event Type
                </label>
                <select
                  value={vbEventType}
                  onChange={(e) => setVbEventType(e.target.value as VolleyballEventType)}
                  className="w-full min-h-[40px] px-3 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ATTACK_POINT">Attack / Spike Point</option>
                  <option value="BLOCK_POINT">Block Point</option>
                  <option value="SERVICE_ACE">Service Ace</option>
                  <option value="OPPONENT_ERROR">Opponent Error</option>
                  <option value="NET_FAULT">Net Fault</option>
                  <option value="SERVICE_FAULT">Service Fault</option>
                  <option value="ROTATION_FAULT">Rotation Fault</option>
                  <option value="PENALTY_POINT">Penalty Point</option>
                  <option value="CUSTOM_EVENT">Custom Event</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Points (1 standard; multi-point requires unlock)
                </label>
                <input
                  type="number"
                  min={0}
                  max={15}
                  disabled={!(score?.sportSpecificDetails as any)?.allowCustomMultiPoint}
                  value={(score?.sportSpecificDetails as any)?.allowCustomMultiPoint ? vbPoints : 1}
                  onChange={(e) => setVbPoints(Math.max(0, Number(e.target.value) || 1))}
                  className="w-full min-h-[40px] px-3 font-mono text-xs border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>
            </div>
          )}

          {sport === 'Football' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Team</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['A', 'B'] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setFbTeam(side)}
                        className={`min-h-[40px] px-2 text-xs font-semibold rounded-lg border truncate ${
                          fbTeam === side
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {side === 'A' ? teamA : teamB}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Match Event
                  </label>
                  <select
                    value={fbEventType}
                    onChange={(e) => setFbEventType(e.target.value as FootballEventType)}
                    className="w-full min-h-[40px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="GOAL">Goal</option>
                    <option value="PENALTY_GOAL">Penalty Goal</option>
                    <option value="OWN_GOAL">Own Goal</option>
                    <option value="PENALTY_MISS">Penalty Missed</option>
                    <option value="FOUL">Foul</option>
                    <option value="YELLOW_CARD">Yellow Card</option>
                    <option value="RED_CARD">Red Card</option>
                    <option value="SECOND_YELLOW">Second Yellow + Red</option>
                    <option value="SUBSTITUTION">Substitution</option>
                    <option value="SHOOTOUT_SCORED">Shootout Scored</option>
                    <option value="SHOOTOUT_MISSED">Shootout Missed</option>
                    <option value="CUSTOM_EVENT">Custom Event</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Minute</label>
                  <input
                    type="number"
                    min={0}
                    max={130}
                    value={fbMinute}
                    onChange={(e) => setFbMinute(e.target.value)}
                    className="w-full min-h-[40px] px-2.5 font-mono text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Added Min (+)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={fbAddedMin}
                    onChange={(e) => setFbAddedMin(e.target.value)}
                    className="w-full min-h-[40px] px-2.5 font-mono text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              {fbEventType === 'SUBSTITUTION' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Player Replaced (Sub Off)
                  </label>
                  <PlayerPickerField
                    compact
                    value={fbPlayerOut}
                    onChange={(name) => setFbPlayerOut(name)}
                    players={fbTeam === 'A' ? (roster.teamA.length > 0 ? roster.teamA : roster.all) : (roster.teamB.length > 0 ? roster.teamB : roster.all)}
                    placeholder="Player leaving the pitch"
                    emptyOptionLabel="-- Select replaced player (Optional) --"
                    ariaLabel="Player Replaced"
                  />
                </div>
              )}
            </div>
          )}

          {/* Player selector & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Player (Linked or Name)
              </label>
              <PlayerPickerField
                compact
                value={playerName}
                onChange={(name, picked) => {
                  setPlayerName(name);
                  setPlayerId(picked?.dbPlayerId || '');
                }}
                players={
                  sport === 'Football'
                    ? (fbTeam === 'A' ? (roster.teamA.length > 0 ? roster.teamA : roster.all) : (roster.teamB.length > 0 ? roster.teamB : roster.all))
                    : sport === 'Volleyball'
                      ? (vbTeam === 'A' ? (roster.teamA.length > 0 ? roster.teamA : roster.all) : (roster.teamB.length > 0 ? roster.teamB : roster.all))
                      : sport === 'Kabaddi'
                        ? (kabTeam === 'A' ? (roster.teamA.length > 0 ? roster.teamA : roster.all) : (roster.teamB.length > 0 ? roster.teamB : roster.all))
                        : roster.all
                }
                placeholder="Player name (optional)"
                emptyOptionLabel="-- Select player (Optional) --"
                ariaLabel="Event Player"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {sport === 'Football'
                  ? 'Assist Player'
                  : sport === 'Cricket'
                    ? 'Bowler / Fielder'
                    : 'Secondary / Assist Player'}
              </label>
              <PlayerPickerField
                compact
                value={assistPlayerName}
                onChange={(name, picked) => {
                  setAssistPlayerName(name);
                  setAssistPlayerId(picked?.dbPlayerId || '');
                }}
                players={
                  sport === 'Football'
                    ? (fbTeam === 'A' ? (roster.teamA.length > 0 ? roster.teamA : roster.all) : (roster.teamB.length > 0 ? roster.teamB : roster.all))
                    : roster.all
                }
                placeholder="Assist / Secondary (optional)"
                emptyOptionLabel="-- Select assist / secondary (Optional) --"
                ariaLabel="Assist Player"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Event Description / Note
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional match commentary note"
                className="w-full min-h-[38px] px-2.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Preview Before Confirm Bar */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Score Preview (No Double-Counting)</span>
              </div>
              <p className="text-xs font-semibold text-slate-900 break-words">
                {previewResult.label}
              </p>
              <p className="text-xs font-mono tabular-nums text-emerald-700 font-bold">
                Resulting Score: {teamA} {previewResult.nextScoreA} – {previewResult.nextScoreB}{' '}
                {teamB}
              </p>
              {(locked || previewResult.blockedReason) && (
                <p className="text-xs font-semibold text-amber-700">
                  {locked
                    ? 'Match is completed and locked. Reopen the match to record new events.'
                    : previewResult.blockedReason}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={saving || locked || Boolean(previewResult.blockedReason)}
              onClick={handleConfirm}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'Recording...' : 'Confirm & Record Event'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
