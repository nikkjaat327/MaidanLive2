import { useEffect, useMemo, useState } from 'react';
import { Coins, Lock, ShieldCheck } from 'lucide-react';
import type { LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import {
  CricketDetails,
  deriveCricketBattingTeamFromToss,
  hasCricketScoringStarted,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import {
  createInitialFootballDetails,
  FootballDetails,
  hasFootballScoringStarted,
} from '../../utils/footballScoring.ts';
import {
  hasKabaddiScoringStarted,
  KabaddiDetails,
  normalizeKabaddiDetails,
} from '../../utils/kabaddiScoring.ts';
import {
  hasVolleyballScoringStarted,
  normalizeVolleyballDetails,
  VolleyballDetails,
} from '../../utils/volleyballScoring.ts';

interface PreMatchTossSetupPanelProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  userRole?: string;
  onScoreChange: (score: LiveScoreData) => void;
  onRefreshHistory: () => void;
  onError: (msg: string | null) => void;
  onSuccess: (msg: string | null) => void;
}

export function PreMatchTossSetupPanel({
  stream,
  score,
  userRole,
  onScoreChange,
  onRefreshHistory,
  onError,
  onSuccess,
}: PreMatchTossSetupPanelProps) {
  const sport = score?.sportType || stream.gameName || 'Other';
  const teamA = stream.teamAName || 'Team A';
  const teamB = stream.teamBName || 'Team B';
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

  const [saving, setSaving] = useState(false);
  const [adminOverride, setAdminOverride] = useState(false);

  // Cricket state
  const [cricketWinner, setCricketWinner] = useState<'A' | 'B' | ''>('');
  const [cricketDecision, setCricketDecision] = useState<'BAT' | 'BOWL' | ''>('');

  // Football state
  const [footballKickoff, setFootballKickoff] = useState<'A' | 'B' | ''>('');
  const [footballWinner, setFootballWinner] = useState<'A' | 'B' | ''>('');
  const [footballDecision, setFootballDecision] = useState<'KICKOFF' | 'SIDE' | ''>('');

  // Kabaddi state
  const [kabaddiWinner, setKabaddiWinner] = useState<'A' | 'B' | ''>('');
  const [kabaddiDecision, setKabaddiDecision] = useState<'RAID' | 'COURT' | ''>('');

  // Volleyball state
  const [volleyballServe, setVolleyballServe] = useState<'A' | 'B' | ''>('');
  const [volleyballWinner, setVolleyballWinner] = useState<'A' | 'B' | ''>('');
  const [volleyballDecision, setVolleyballDecision] = useState<'SERVE' | 'RECEIVE' | ''>('');

  const matchStarted = useMemo(() => {
    const raw = (score?.sportSpecificDetails || {}) as Record<string, unknown>;
    const scoreA = score?.teamAScore ?? 0;
    const scoreB = score?.teamBScore ?? 0;
    if (sport === 'Cricket') {
      return hasCricketScoringStarted(normalizeCricketDetails(raw as Partial<CricketDetails>));
    }
    if (sport === 'Football') {
      return hasFootballScoringStarted(
        { ...createInitialFootballDetails(), ...(raw as Partial<FootballDetails>) },
        scoreA,
        scoreB
      );
    }
    if (sport === 'Kabaddi') {
      return hasKabaddiScoringStarted(
        normalizeKabaddiDetails(raw as Partial<KabaddiDetails>),
        scoreA,
        scoreB
      );
    }
    if (sport === 'Volleyball') {
      return hasVolleyballScoringStarted(
        normalizeVolleyballDetails(raw as Partial<VolleyballDetails>),
        scoreA,
        scoreB
      );
    }
    return false;
  }, [sport, score?.sportSpecificDetails, score?.teamAScore, score?.teamBScore]);

  useEffect(() => {
    const raw = (score?.sportSpecificDetails || {}) as Record<string, unknown>;
    if (sport === 'Cricket') {
      const cd = normalizeCricketDetails(raw as Partial<CricketDetails>);
      setCricketWinner(cd.tossWinner || '');
      setCricketDecision(cd.tossDecision || '');
    } else if (sport === 'Football') {
      const fd = { ...createInitialFootballDetails(), ...(raw as Partial<FootballDetails>) };
      setFootballKickoff(fd.kickoffTeam || '');
      setFootballWinner(fd.tossWinner || '');
      setFootballDecision(fd.tossDecision || '');
    } else if (sport === 'Kabaddi') {
      const kd = normalizeKabaddiDetails(raw as Partial<KabaddiDetails>);
      setKabaddiWinner(kd.tossWinner || '');
      setKabaddiDecision(kd.tossDecision || '');
    } else if (sport === 'Volleyball') {
      const vd = normalizeVolleyballDetails(raw as Partial<VolleyballDetails>);
      setVolleyballServe(vd.servingTeam || '');
      setVolleyballWinner(vd.tossWinner || '');
      setVolleyballDecision(vd.tossDecision || '');
    }
  }, [sport, score?.sportSpecificDetails]);

  if (sport !== 'Cricket' && sport !== 'Football' && sport !== 'Kabaddi' && sport !== 'Volleyball') {
    return null;
  }

  const controlsLocked = matchStarted && !(isAdmin && adminOverride);

  const hasSavedSetup = (() => {
    if (sport === 'Cricket') return Boolean(cricketWinner && cricketDecision);
    if (sport === 'Football') return Boolean(footballKickoff);
    if (sport === 'Kabaddi') return Boolean(kabaddiWinner && kabaddiDecision);
    if (sport === 'Volleyball') return Boolean(volleyballServe);
    return false;
  })();

  const cricketDerivedBatting =
    cricketWinner && cricketDecision
      ? deriveCricketBattingTeamFromToss(cricketWinner, cricketDecision)
      : null;

  const kabaddiDerivedFirstRaider =
    kabaddiWinner && kabaddiDecision
      ? kabaddiDecision === 'RAID'
        ? kabaddiWinner
        : kabaddiWinner === 'A'
          ? 'B'
          : 'A'
      : null;

  async function handleSaveToss(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    onSuccess(null);

    let payload: Parameters<typeof scoreboardService.savePreMatchToss>[1] | null = null;
    if (sport === 'Cricket') {
      if (!cricketWinner || !cricketDecision) {
        onError('Select both Toss Winner and Bat/Bowl decision.');
        return;
      }
      payload = {
        tossWinner: cricketWinner,
        tossDecision: cricketDecision,
        ...(isAdmin && adminOverride ? { adminOverride: true } : {}),
      };
    } else if (sport === 'Football') {
      if (!footballKickoff) {
        onError('Select the Opening Kick-off team.');
        return;
      }
      payload = {
        kickoffTeam: footballKickoff,
        ...(footballWinner ? { tossWinner: footballWinner } : {}),
        ...(footballDecision ? { tossDecision: footballDecision } : {}),
        ...(isAdmin && adminOverride ? { adminOverride: true } : {}),
      };
    } else if (sport === 'Kabaddi') {
      if (!kabaddiWinner || !kabaddiDecision) {
        onError('Select both Toss Winner and First Raid / Court Side choice.');
        return;
      }
      payload = {
        tossWinner: kabaddiWinner,
        tossDecision: kabaddiDecision,
        ...(isAdmin && adminOverride ? { adminOverride: true } : {}),
      };
    } else if (sport === 'Volleyball') {
      if (!volleyballServe) {
        onError('Select the First Serve team.');
        return;
      }
      payload = {
        servingTeam: volleyballServe,
        ...(volleyballWinner ? { tossWinner: volleyballWinner } : {}),
        ...(volleyballDecision ? { tossDecision: volleyballDecision } : {}),
        ...(isAdmin && adminOverride ? { adminOverride: true } : {}),
      };
    }

    if (!payload) return;

    try {
      setSaving(true);
      const res = await scoreboardService.savePreMatchToss(stream.id, payload);
      onScoreChange(res.score);
      onRefreshHistory();
      setAdminOverride(false);
      onSuccess(`Pre-match ${sport} toss setup saved cleanly.`);
    } catch (err) {
      onError(extractApiError(err, 'Failed to save pre-match toss setup.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSaveToss}
      className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Pre-Match Toss &amp; Opening Setup ({sport})
            </h3>
            <p className="text-xs text-slate-500">
              {sport === 'Cricket' &&
                'Set toss winner and bat/bowl choice to configure batting & bowling wings.'}
              {sport === 'Football' && 'Set opening kick-off team and optional toss record.'}
              {sport === 'Kabaddi' &&
                'Set toss winner and First Raid vs Court Side to set opening raid & mat sides.'}
              {sport === 'Volleyball' && 'Set opening serving team and optional toss record.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {matchStarted ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-300 text-[11px] font-semibold text-slate-700">
              <Lock className="w-3.5 h-3.5" />
              <span>Locked (Scoring Started)</span>
            </span>
          ) : hasSavedSetup ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Toss Configured</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800">
              <span>Pending Toss Setup</span>
            </span>
          )}

          {matchStarted && isAdmin && (
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300 text-[11px] font-semibold text-amber-950 cursor-pointer">
              <input
                type="checkbox"
                checked={adminOverride}
                onChange={(e) => setAdminOverride(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-amber-400 text-amber-600"
              />
              <span>Admin Override</span>
            </label>
          )}
        </div>
      </div>

      {sport === 'Cricket' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Toss Winner</label>
            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  disabled={controlsLocked || saving}
                  onClick={() => setCricketWinner(side)}
                  className={`min-h-[44px] px-3 rounded-lg text-xs font-bold border truncate transition-colors disabled:opacity-50 ${
                    cricketWinner === side
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {side === 'A' ? teamA : teamB}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Toss Decision
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'BAT', label: 'Bat First' },
                  { id: 'BOWL', label: 'Bowl First' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={controlsLocked || saving}
                  onClick={() => setCricketDecision(opt.id)}
                  className={`min-h-[44px] px-3 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                    cricketDecision === opt.id
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:items-end justify-between gap-2">
            {cricketDerivedBatting && (
              <p className="text-[11px] font-medium text-slate-600">
                Batting:{' '}
                <strong className="text-slate-900">
                  {cricketDerivedBatting === 'A' ? teamA : teamB}
                </strong>{' '}
                · Bowling:{' '}
                <strong className="text-slate-900">
                  {cricketDerivedBatting === 'A' ? teamB : teamA}
                </strong>
              </p>
            )}
            <button
              type="submit"
              disabled={controlsLocked || saving || !cricketWinner || !cricketDecision}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-45 whitespace-nowrap"
            >
              {saving ? 'Saving Toss...' : 'Save Toss Setup'}
            </button>
          </div>
        </div>
      )}

      {sport === 'Football' && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Opening Kick-Off
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  disabled={controlsLocked || saving}
                  onClick={() => setFootballKickoff(side)}
                  className={`min-h-[44px] px-3 rounded-lg text-xs font-bold border truncate disabled:opacity-50 ${
                    footballKickoff === side
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {side === 'A' ? teamA : teamB}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Toss Winner (Optional)
            </label>
            <select
              value={footballWinner}
              disabled={controlsLocked || saving}
              onChange={(e) => setFootballWinner(e.target.value as 'A' | 'B' | '')}
              className="w-full min-h-[44px] px-3 text-xs border border-slate-300 rounded-lg bg-white disabled:opacity-50"
            >
              <option value="">-- Optional --</option>
              <option value="A">{teamA}</option>
              <option value="B">{teamB}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Choice (Optional)
            </label>
            <select
              value={footballDecision}
              disabled={controlsLocked || saving}
              onChange={(e) => setFootballDecision(e.target.value as 'KICKOFF' | 'SIDE' | '')}
              className="w-full min-h-[44px] px-3 text-xs border border-slate-300 rounded-lg bg-white disabled:opacity-50"
            >
              <option value="">-- Optional --</option>
              <option value="KICKOFF">Kick-Off</option>
              <option value="SIDE">Choose Side</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={controlsLocked || saving || !footballKickoff}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-45 whitespace-nowrap"
          >
            {saving ? 'Saving...' : 'Save Kick-Off Setup'}
          </button>
        </div>
      )}

      {sport === 'Kabaddi' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Toss Winner</label>
            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  disabled={controlsLocked || saving}
                  onClick={() => setKabaddiWinner(side)}
                  className={`min-h-[44px] px-3 rounded-lg text-xs font-bold border truncate disabled:opacity-50 ${
                    kabaddiWinner === side
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {side === 'A' ? teamA : teamB}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Toss Choice</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'RAID', label: 'First Raid' },
                  { id: 'COURT', label: 'Court Side' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={controlsLocked || saving}
                  onClick={() => setKabaddiDecision(opt.id)}
                  className={`min-h-[44px] px-3 rounded-lg text-xs font-bold border disabled:opacity-50 ${
                    kabaddiDecision === opt.id
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:items-end justify-between gap-2">
            {kabaddiDerivedFirstRaider && (
              <p className="text-[11px] font-medium text-slate-600">
                First Raid:{' '}
                <strong className="text-slate-900">
                  {kabaddiDerivedFirstRaider === 'A' ? teamA : teamB}
                </strong>
                {kabaddiDecision === 'COURT' ? ' · Court sides swapped' : ''}
              </p>
            )}
            <button
              type="submit"
              disabled={controlsLocked || saving || !kabaddiWinner || !kabaddiDecision}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-45 whitespace-nowrap"
            >
              {saving ? 'Saving...' : 'Save Toss Setup'}
            </button>
          </div>
        </div>
      )}

      {sport === 'Volleyball' && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">First Serve</label>
            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  disabled={controlsLocked || saving}
                  onClick={() => setVolleyballServe(side)}
                  className={`min-h-[44px] px-3 rounded-lg text-xs font-bold border truncate disabled:opacity-50 ${
                    volleyballServe === side
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {side === 'A' ? teamA : teamB}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Toss Winner (Optional)
            </label>
            <select
              value={volleyballWinner}
              disabled={controlsLocked || saving}
              onChange={(e) => setVolleyballWinner(e.target.value as 'A' | 'B' | '')}
              className="w-full min-h-[44px] px-3 text-xs border border-slate-300 rounded-lg bg-white disabled:opacity-50"
            >
              <option value="">-- Optional --</option>
              <option value="A">{teamA}</option>
              <option value="B">{teamB}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Choice (Optional)
            </label>
            <select
              value={volleyballDecision}
              disabled={controlsLocked || saving}
              onChange={(e) => setVolleyballDecision(e.target.value as 'SERVE' | 'RECEIVE' | '')}
              className="w-full min-h-[44px] px-3 text-xs border border-slate-300 rounded-lg bg-white disabled:opacity-50"
            >
              <option value="">-- Optional --</option>
              <option value="SERVE">Serve</option>
              <option value="RECEIVE">Receive First</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={controlsLocked || saving || !volleyballServe}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-45 whitespace-nowrap"
          >
            {saving ? 'Saving...' : 'Save Serve Setup'}
          </button>
        </div>
      )}
    </form>
  );
}
