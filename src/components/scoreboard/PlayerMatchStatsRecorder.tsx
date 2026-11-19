import { useState } from 'react';
import type { FormEvent } from 'react';
import { BarChart3, Save } from 'lucide-react';
import { PlayerData, PlayerMatchStatRecord } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';

interface PlayerMatchStatsRecorderProps {
  streamId: string;
  sportType: string;
  players: PlayerData[];
  stats: PlayerMatchStatRecord[];
  onRefresh: () => void;
}

export function PlayerMatchStatsRecorder({
  streamId,
  sportType,
  players,
  stats,
  onRefresh,
}: PlayerMatchStatsRecorderProps) {
  const [playerId, setPlayerId] = useState('');
  const [runs, setRuns] = useState('0');
  const [wickets, setWickets] = useState('0');
  const [raidPoints, setRaidPoints] = useState('0');
  const [tacklePoints, setTacklePoints] = useState('0');
  const [goals, setGoals] = useState('0');
  const [assists, setAssists] = useState('0');
  const [attackPoints, setAttackPoints] = useState('0');
  const [blockPoints, setBlockPoints] = useState('0');
  const [serveAces, setServeAces] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (players.length === 0) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!playerId) return;
    try {
      setSaving(true);
      setError(null);
      await platformOpsService.upsertMatchPlayerStat(streamId, {
        playerId,
        runs: Number(runs) || 0,
        wickets: Number(wickets) || 0,
        raidPoints: Number(raidPoints) || 0,
        tacklePoints: Number(tacklePoints) || 0,
        goals: Number(goals) || 0,
        assists: Number(assists) || 0,
        attackPoints: Number(attackPoints) || 0,
        blockPoints: Number(blockPoints) || 0,
        serveAces: Number(serveAces) || 0,
      });
      onRefresh();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save player match stats.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          <span>Verified Player Match Stats ({sportType})</span>
        </h3>
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          {stats.length} recorded
        </span>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 items-end">
        <div className="col-span-2">
          <label className="block text-[11px] text-slate-500 mb-1">Player</label>
          <select
            value={playerId}
            onChange={(e) => {
              const pid = e.target.value;
              setPlayerId(pid);
              const existing = stats.find(
                (s) =>
                  (typeof s.playerId === 'object' ? s.playerId.id || s.playerId._id : s.playerId) ===
                  pid
              );
              if (existing) {
                setRuns(String(existing.runs || 0));
                setWickets(String(existing.wickets || 0));
                setRaidPoints(String(existing.raidPoints || 0));
                setTacklePoints(String(existing.tacklePoints || 0));
                setGoals(String(existing.goals || 0));
                setAssists(String(existing.assists || 0));
                setAttackPoints(String(existing.attackPoints || 0));
                setBlockPoints(String(existing.blockPoints || 0));
                setServeAces(String(existing.serveAces || 0));
              }
            }}
            className="w-full min-h-[38px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">-- Select Player --</option>
            {players.map((p) => (
              <option key={p.id || p._id} value={p.id || p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {sportType === 'Cricket' && (
          <>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Runs</label>
              <input
                type="number"
                min={0}
                value={runs}
                onChange={(e) => setRuns(e.target.value)}
                className="w-full min-h-[38px] px-2.5 font-mono text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Wickets</label>
              <input
                type="number"
                min={0}
                value={wickets}
                onChange={(e) => setWickets(e.target.value)}
                className="w-full min-h-[38px] px-2.5 font-mono text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </>
        )}

        {sportType === 'Kabaddi' && (
          <>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Raid Pts</label>
              <input
                type="number"
                min={0}
                value={raidPoints}
                onChange={(e) => setRaidPoints(e.target.value)}
                className="w-full min-h-[38px] px-2.5 font-mono text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Tackle Pts</label>
              <input
                type="number"
                min={0}
                value={tacklePoints}
                onChange={(e) => setTacklePoints(e.target.value)}
                className="w-full min-h-[38px] px-2.5 font-mono text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </>
        )}

        {sportType === 'Football' && (
          <>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Goals</label>
              <input
                type="number"
                min={0}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="w-full min-h-[38px] px-2.5 font-mono text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Assists</label>
              <input
                type="number"
                min={0}
                value={assists}
                onChange={(e) => setAssists(e.target.value)}
                className="w-full min-h-[38px] px-2.5 font-mono text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </>
        )}

        {sportType === 'Volleyball' && (
          <>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Attacks</label>
              <input
                type="number"
                min={0}
                value={attackPoints}
                onChange={(e) => setAttackPoints(e.target.value)}
                className="w-full min-h-[38px] px-2.5 font-mono text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Blocks / Aces</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  value={blockPoints}
                  onChange={(e) => setBlockPoints(e.target.value)}
                  className="w-1/2 min-h-[38px] px-1.5 font-mono text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  min={0}
                  value={serveAces}
                  onChange={(e) => setServeAces(e.target.value)}
                  className="w-1/2 min-h-[38px] px-1.5 font-mono text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={saving || !playerId}
          className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Stat</span>
        </button>
      </form>
    </div>
  );
}
