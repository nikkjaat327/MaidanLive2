import { useState } from 'react';
import type { FormEvent } from 'react';
import { BookmarkPlus, Clock, Edit3, Trash2 } from 'lucide-react';
import { MatchHighlightData } from '../../types/index.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';

interface MatchHighlightsManagerProps {
  streamId: string;
  highlights: MatchHighlightData[];
  onRefresh: () => void;
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export function MatchHighlightsManager({
  streamId,
  highlights,
  onRefresh,
}: MatchHighlightsManagerProps) {
  const [eventType, setEventType] = useState('Key Moment');
  const [minutes, setMinutes] = useState('0');
  const [seconds, setSeconds] = useState('0');
  const [description, setDescription] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [teamSide, setTeamSide] = useState<'A' | 'B' | ''>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const totalSeconds = Math.max(0, (Number(minutes) || 0) * 60 + (Number(seconds) || 0));
    try {
      setSaving(true);
      setError(null);
      if (editingId) {
        await engagementService.updateHighlight(editingId, {
          eventType: eventType.trim() || 'Key Moment',
          videoTimestampSeconds: totalSeconds,
          description: description.trim(),
          playerName: playerName.trim(),
          teamSide,
        });
      } else {
        await engagementService.createHighlight(streamId, {
          eventType: eventType.trim() || 'Key Moment',
          videoTimestampSeconds: totalSeconds,
          description: description.trim(),
          playerName: playerName.trim(),
          teamSide,
        });
      }
      setEditingId(null);
      setDescription('');
      setPlayerName('');
      onRefresh();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save highlight marker.'));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(h: MatchHighlightData) {
    setEditingId(h.id);
    setEventType(h.eventType);
    setMinutes(String(Math.floor(h.videoTimestampSeconds / 60)));
    setSeconds(String(h.videoTimestampSeconds % 60));
    setDescription(h.description || '');
    setPlayerName(h.playerName || '');
    setTeamSide(h.teamSide || '');
  }

  async function handleDelete(id: string) {
    try {
      await engagementService.deleteHighlight(id);
      onRefresh();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete highlight.'));
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
          <BookmarkPlus className="w-4 h-4 text-emerald-600" />
          <span>Match Highlights &amp; Key Timestamp Markers</span>
        </h3>
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          {highlights.length} marker{highlights.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end">
        <div className="sm:col-span-2">
          <label className="block text-[11px] text-slate-500 mb-1">Highlight Type</label>
          <input
            type="text"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            placeholder="e.g. Six, Wicket, Super Raid, Goal"
            className="w-full min-h-[38px] px-2.5 text-xs border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Video Time (MM:SS)</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-1/2 min-h-[38px] px-2 font-mono text-xs border border-slate-300 rounded-lg"
            />
            <span>:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              className="w-1/2 min-h-[38px] px-2 font-mono text-xs border border-slate-300 rounded-lg"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Player (Optional)</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Player name"
            className="w-full min-h-[38px] px-2.5 text-xs border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short moment note"
            className="w-full min-h-[38px] px-2.5 text-xs border border-slate-300 rounded-lg"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="min-h-[38px] px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
        >
          {editingId ? 'Update' : 'Mark Moment'}
        </button>
      </form>

      {highlights.length > 0 && (
        <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto border border-slate-100 rounded-lg">
          {highlights.map((h) => (
            <div
              key={h.id}
              className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[11px] shrink-0">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  {formatTimestamp(h.videoTimestampSeconds)}
                </span>
                <span className="font-semibold text-slate-900">{h.eventType}</span>
                {h.playerName && <span className="text-slate-600">· {h.playerName}</span>}
                {h.description && <span className="text-slate-500 truncate">— {h.description}</span>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(h)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded"
                  title="Edit highlight"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(h.id)}
                  className="p-1.5 text-slate-500 hover:text-red-600 rounded"
                  title="Delete highlight"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
