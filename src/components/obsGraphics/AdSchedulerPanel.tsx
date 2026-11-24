import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  History,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  AdScheduleBridgePolicy,
  AdScheduleConflictItem,
  AdScheduleConflictPolicy,
  AdScheduleEventRestriction,
  AdScheduleRepeatRule,
  AdScheduleSessionPolicy,
  AdScheduleStatus,
  BroadcastAdDesignData,
  BroadcastAdScheduleData,
} from '../../types/broadcastGraphics.ts';
import { broadcastGraphicsService } from '../../services/obs/broadcastGraphicsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { ConfirmDialog } from '../common/ConfirmDialog.tsx';
import { Modal } from '../common/Modal.tsx';

interface AdSchedulerPanelProps {
  matchId: string;
  designs: BroadcastAdDesignData[];
  bridgeOnline: boolean;
  scheduleRevision?: number;
  onNotifySuccess: (msg: string) => void;
  onNotifyError: (msg: string) => void;
}

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

const WEEKDAY_LABELS = [
  { val: 1, label: 'Mon' },
  { val: 2, label: 'Tue' },
  { val: 3, label: 'Wed' },
  { val: 4, label: 'Thu' },
  { val: 5, label: 'Fri' },
  { val: 6, label: 'Sat' },
  { val: 0, label: 'Sun' },
];

function formatCountdownMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function todayIsoInTz(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function defaultStartTimeInTz(tz: string, offsetMinutes = 5): string {
  const future = new Date(Date.now() + offsetMinutes * 60_000);
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(future);
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
    return `${map.hour}:${map.minute}:00`;
  } catch {
    return '19:30:00';
  }
}

function statusBadgeStyle(status: AdScheduleStatus): string {
  switch (status) {
    case 'playing':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'preparing':
    case 'scheduled':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'paused':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'completed':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'missed':
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-500 border-slate-200';
  }
}

export const AdSchedulerPanel: React.FC<AdSchedulerPanelProps> = ({
  matchId,
  designs,
  bridgeOnline,
  scheduleRevision = 0,
  onNotifySuccess,
  onNotifyError,
}) => {
  const nonTemplateDesigns = useMemo(
    () => designs.filter((d) => !d.isTemplate),
    [designs]
  );

  const [schedules, setSchedules] = useState<BroadcastAdScheduleData[]>([]);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'upcoming' | 'history' | 'all'>('upcoming');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BroadcastAdScheduleData | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const browserTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }, []);
  const [formDesignId, setFormDesignId] = useState('');
  const [formTimezone, setFormTimezone] = useState(browserTz);
  const [formDate, setFormDate] = useState(() => todayIsoInTz(browserTz));
  const [formStartTime, setFormStartTime] = useState(() => defaultStartTimeInTz(browserTz, 5));
  const [formDuration, setFormDuration] = useState(15);
  const [formGracePeriod, setFormGracePeriod] = useState(120);
  const [formPriority, setFormPriority] = useState(50);
  const [formConflictPolicy, setFormConflictPolicy] =
    useState<AdScheduleConflictPolicy>('prevent');
  const [formBridgePolicy, setFormBridgePolicy] =
    useState<AdScheduleBridgePolicy>('allow_overlay_only');
  const [formEventRestriction, setFormEventRestriction] =
    useState<AdScheduleEventRestriction>('any');
  const [formSessionPolicy, setFormSessionPolicy] =
    useState<AdScheduleSessionPolicy>('cancel_on_end');
  const [formRepeatRule, setFormRepeatRule] = useState<AdScheduleRepeatRule>('none');
  const [formRepeatIntervalMin, setFormRepeatIntervalMin] = useState(15);
  const [formRepeatDailyTimes, setFormRepeatDailyTimes] = useState('19:30, 20:30');
  const [formRepeatWeekdays, setFormRepeatWeekdays] = useState<number[]>([6, 0]);
  const [formRepeatEndDate, setFormRepeatEndDate] = useState('');
  const [formRepeatEndTime, setFormRepeatEndTime] = useState('');
  const [formMaxOccurrences, setFormMaxOccurrences] = useState(0);
  const [savingForm, setSavingForm] = useState(false);
  const [conflicts, setConflicts] = useState<AdScheduleConflictItem[]>([]);
  const [resolvedUtcPreview, setResolvedUtcPreview] = useState<string>('');

  const loadSchedules = useCallback(async () => {
    if (!matchId) return;
    try {
      setLoading(true);
      const res = await broadcastGraphicsService.listSchedules(matchId);
      setSchedules(res.schedules);
      if (res.serverNowIso) {
        const srvMs = Date.parse(res.serverNowIso);
        if (Number.isFinite(srvMs)) setServerOffsetMs(srvMs - Date.now());
      }
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to load scheduled advertisements.'));
    } finally {
      setLoading(false);
    }
  }, [matchId, onNotifyError]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules, scheduleRevision]);

  const hasLiveTick = schedules.some((s) =>
    ['scheduled', 'preparing', 'playing'].includes(s.status)
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!hasLiveTick) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [hasLiveTick]);

  const syncedNowMs = nowMs + serverOffsetMs;

  // Live overlap check inside modal
  useEffect(() => {
    if (!modalOpen || !matchId || !formDate || !formStartTime) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await broadcastGraphicsService.checkScheduleConflicts(matchId, {
          scheduledDate: formDate,
          scheduledStartTime: formStartTime,
          timezone: formTimezone,
          durationSeconds: formDuration,
          excludeScheduleId: editingScheduleId || undefined,
        });
        setConflicts(res.conflicts || []);
        setResolvedUtcPreview(res.startAtUtc || '');
      } catch {
        setConflicts([]);
        setResolvedUtcPreview('');
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [
    modalOpen,
    matchId,
    formDate,
    formStartTime,
    formTimezone,
    formDuration,
    editingScheduleId,
  ]);

  const openCreateModal = () => {
    setEditingScheduleId(null);
    const firstAd = nonTemplateDesigns[0];
    setFormDesignId(firstAd?.id || '');
    setFormTimezone(browserTz);
    setFormDate(todayIsoInTz(browserTz));
    setFormStartTime(defaultStartTimeInTz(browserTz, 5));
    setFormDuration(firstAd?.defaultDurationSeconds ? Math.max(5, firstAd.defaultDurationSeconds) : 15);
    setFormGracePeriod(120);
    setFormPriority(50);
    setFormConflictPolicy('prevent');
    setFormBridgePolicy('allow_overlay_only');
    setFormEventRestriction('any');
    setFormSessionPolicy('cancel_on_end');
    setFormRepeatRule('none');
    setFormRepeatIntervalMin(15);
    setFormRepeatDailyTimes('19:30, 20:30');
    setFormRepeatWeekdays([6, 0]);
    setFormRepeatEndDate('');
    setFormRepeatEndTime('');
    setFormMaxOccurrences(0);
    setConflicts([]);
    setModalOpen(true);
  };

  const openEditModal = (sch: BroadcastAdScheduleData) => {
    setEditingScheduleId(sch.id);
    setFormDesignId(sch.designId);
    setFormTimezone(sch.timezone || browserTz);
    setFormDate(sch.scheduledDate);
    setFormStartTime(sch.scheduledStartTime);
    setFormDuration(sch.durationSeconds);
    setFormGracePeriod(sch.gracePeriodSeconds);
    setFormPriority(sch.priority);
    setFormConflictPolicy(sch.conflictPolicy);
    setFormBridgePolicy(sch.bridgePolicy);
    setFormEventRestriction(sch.eventRestriction);
    setFormSessionPolicy(sch.sessionPolicy);
    setFormRepeatRule(sch.repeatRule || 'none');
    setFormRepeatIntervalMin(sch.repeatIntervalMinutes || 15);
    setFormRepeatDailyTimes((sch.repeatDailyTimes || []).join(', '));
    setFormRepeatWeekdays(sch.repeatWeekdays || [6, 0]);
    setFormRepeatEndDate(sch.repeatEndDate || '');
    setFormRepeatEndTime(sch.repeatEndTime || '');
    setFormMaxOccurrences(sch.maxOccurrences || 0);
    setModalOpen(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDesignId) {
      onNotifyError('Please select a Saved Advertisement to schedule.');
      return;
    }
    try {
      setSavingForm(true);
      const dailyTimes = formRepeatDailyTimes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        designId: formDesignId,
        scheduledDate: formDate,
        scheduledStartTime: formStartTime,
        timezone: formTimezone,
        durationSeconds: formDuration,
        gracePeriodSeconds: formGracePeriod,
        priority: formPriority,
        conflictPolicy: formConflictPolicy,
        bridgePolicy: formBridgePolicy,
        eventRestriction: formEventRestriction,
        sessionPolicy: formSessionPolicy,
        repeatRule: formRepeatRule,
        repeatIntervalMinutes: formRepeatIntervalMin,
        repeatDailyTimes: dailyTimes,
        repeatWeekdays: formRepeatWeekdays,
        repeatEndDate: formRepeatEndDate.trim(),
        repeatEndTime: formRepeatEndTime.trim(),
        maxOccurrences: formMaxOccurrences > 0 ? formMaxOccurrences : 0,
      };

      if (editingScheduleId) {
        await broadcastGraphicsService.updateSchedule(editingScheduleId, payload);
        onNotifySuccess('Advertisement schedule updated.');
      } else {
        await broadcastGraphicsService.createSchedule(matchId, payload);
        onNotifySuccess('Advertisement scheduled for automatic live playback.');
      }
      setModalOpen(false);
      await loadSchedules();
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to save advertisement schedule.'));
    } finally {
      setSavingForm(false);
    }
  };

  const handleControl = async (
    scheduleId: string,
    action: 'pause' | 'resume' | 'cancel' | 'skip' | 'play_now' | 'retry'
  ) => {
    try {
      setBusyId(`${scheduleId}:${action}`);
      await broadcastGraphicsService.controlSchedule(scheduleId, action);
      await loadSchedules();
      const labelMap = {
        pause: 'Schedule paused.',
        resume: 'Schedule resumed.',
        cancel: 'Schedule cancelled.',
        skip: 'Skipped to next scheduled occurrence.',
        play_now: 'Triggered scheduled advertisement LIVE.',
        retry: 'Schedule queued to retry now.',
      };
      onNotifySuccess(labelMap[action]);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to update schedule.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await broadcastGraphicsService.deleteSchedule(deleteTarget.id);
      setDeleteTarget(null);
      await loadSchedules();
      onNotifySuccess('Scheduled advertisement deleted.');
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to delete schedule.'));
    } finally {
      setDeleting(false);
    }
  };

  const nextUpcoming = useMemo(() => {
    return schedules
      .filter((s) => s.status === 'scheduled' || s.status === 'preparing')
      .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt))[0];
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (statusFilter === 'upcoming') {
        return ['scheduled', 'preparing', 'playing', 'paused'].includes(s.status);
      }
      if (statusFilter === 'history') {
        return ['completed', 'missed', 'cancelled', 'failed'].includes(s.status);
      }
      return true;
    });
  }, [schedules, statusFilter]);

  const timezoneOptions = useMemo(() => {
    const set = new Set(COMMON_TIMEZONES);
    set.add(browserTz);
    return Array.from(set);
  }, [browserTz]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[#EA580C]" />
            <span>Time-Based Advertisement Scheduler ({schedules.length})</span>
          </h3>
          <p className="text-xs text-slate-500">
            Schedule saved advertisements to trigger automatically at exact clock times, recurring intervals, or match breaks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/80 text-xs font-semibold">
            {(
              [
                { id: 'upcoming', label: 'Upcoming / Active' },
                { id: 'history', label: 'Completed & Logs' },
                { id: 'all', label: 'All' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadSchedules}
            disabled={loading}
            className="min-h-[34px] px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
            title="Refresh Schedules"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            disabled={nonTemplateDesigns.length === 0}
            onClick={openCreateModal}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-xs font-bold text-white whitespace-nowrap shrink-0 disabled:opacity-45"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Ad</span>
          </button>
        </div>
      </div>

      {/* Next Scheduled Ad Countdown Strip */}
      {nextUpcoming && (
        <div className="px-4 py-2.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-[#EA580C] shrink-0" />
            <span className="font-semibold text-slate-300">Next Scheduled Ad:</span>
            <strong className="text-white truncate">{nextUpcoming.adName}</strong>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-slate-300 tabular-nums">
              {nextUpcoming.scheduledDate} {nextUpcoming.scheduledStartTime} ({nextUpcoming.timezone})
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono font-bold text-emerald-300 tabular-nums">
              Starts in {formatCountdownMs(Date.parse(nextUpcoming.nextRunAt) - syncedNowMs)}
            </span>
            <button
              type="button"
              disabled={busyId === `${nextUpcoming.id}:play_now`}
              onClick={() => handleControl(nextUpcoming.id, 'play_now')}
              className="px-2.5 py-1 rounded bg-[#EA580C] hover:bg-orange-600 text-white text-[11px] font-bold"
            >
              Play Now
            </button>
          </div>
        </div>
      )}

      {/* Schedules List */}
      <div className="p-4">
        {nonTemplateDesigns.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4 border border-dashed border-slate-300 rounded-lg">
            Save at least one advertisement in the Saved Ads Library above before scheduling exact playback times.
          </p>
        ) : filteredSchedules.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-300 rounded-lg space-y-2">
            <CalendarClock className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="text-xs font-bold text-slate-800">
              {statusFilter === 'history'
                ? 'No Completed or Missed Schedules Yet'
                : 'No Scheduled Advertisements Queued'}
            </p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Use Schedule Ad to lock sponsor banners, QR promos, or halftime slates to an exact match clock or recurring interval.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredSchedules.map((sch) => {
              const targetMs = Date.parse(sch.nextRunAt);
              const remainingToStartMs = targetMs - syncedNowMs;
              const isPlaying = sch.status === 'playing';
              const isScheduled = sch.status === 'scheduled' || sch.status === 'preparing';
              const isPaused = sch.status === 'paused';
              const canRetry = ['missed', 'failed', 'cancelled'].includes(sch.status);
              const isHistoryOpen = expandedHistoryId === sch.id;

              return (
                <div
                  key={sch.id}
                  className={`rounded-lg border p-3 space-y-2 ${
                    isPlaying
                      ? 'border-emerald-500 bg-emerald-50/40'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {sch.adThumbnailDataUrl ? (
                        <img
                          src={sch.adThumbnailDataUrl}
                          alt={sch.adName}
                          className="w-12 h-8 rounded object-cover border border-slate-200 bg-slate-900 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-8 rounded bg-slate-900 text-slate-300 text-[10px] font-mono flex items-center justify-center shrink-0">
                          AD
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {sch.adName}
                          </h4>
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase ${statusBadgeStyle(
                              sch.status
                            )}`}
                          >
                            {sch.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-mono tabular-nums mt-0.5">
                          {sch.scheduledDate} {sch.scheduledStartTime} ({sch.timezone}) ·{' '}
                          {sch.durationSeconds}s · Priority {sch.priority}
                          {sch.repeatRule !== 'none'
                            ? ` · Repeat: ${sch.repeatRule.replace('_', ' ')}`
                            : ''}
                          {sch.eventRestriction !== 'any'
                            ? ` · ${sch.eventRestriction.replace('_', ' ')}`
                            : ''}
                        </p>
                        {sch.statusReason && (
                          <p className="text-[11px] text-amber-700 mt-0.5">{sch.statusReason}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {isScheduled && (
                        <span className="text-[11px] font-mono font-bold text-emerald-700 tabular-nums mr-1">
                          {remainingToStartMs > 0
                            ? `T-${formatCountdownMs(remainingToStartMs)}`
                            : 'Due now'}
                        </span>
                      )}
                      {isPlaying && (
                        <span className="text-[11px] font-mono font-bold text-red-600 tabular-nums mr-1 inline-flex items-center gap-1">
                          <Radio className="w-3 h-3 animate-pulse" />
                          <span>ON AIR</span>
                        </span>
                      )}

                      {(isScheduled || isPaused) && (
                        <button
                          type="button"
                          disabled={busyId === `${sch.id}:play_now`}
                          onClick={() => handleControl(sch.id, 'play_now')}
                          title="Trigger Live Immediately"
                          className="px-2 py-1 rounded bg-[#EA580C] hover:bg-orange-600 text-white text-[11px] font-bold inline-flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" />
                          <span>Run Now</span>
                        </button>
                      )}

                      {isScheduled && (
                        <button
                          type="button"
                          disabled={busyId === `${sch.id}:pause`}
                          onClick={() => handleControl(sch.id, 'pause')}
                          title="Pause Schedule"
                          className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700"
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isPaused && (
                        <button
                          type="button"
                          disabled={busyId === `${sch.id}:resume`}
                          onClick={() => handleControl(sch.id, 'resume')}
                          title="Resume Schedule"
                          className="px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" />
                          <span>Resume</span>
                        </button>
                      )}

                      {(isScheduled || isPlaying) && (
                        <button
                          type="button"
                          disabled={busyId === `${sch.id}:skip`}
                          onClick={() => handleControl(sch.id, 'skip')}
                          title="Skip current occurrence"
                          className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canRetry && (
                        <button
                          type="button"
                          disabled={busyId === `${sch.id}:retry`}
                          onClick={() => handleControl(sch.id, 'retry')}
                          title="Retry Execution"
                          className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      )}

                      {!isPlaying && (
                        <button
                          type="button"
                          onClick={() => openEditModal(sch)}
                          title="Edit Schedule"
                          className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {(isScheduled || isPaused) && (
                        <button
                          type="button"
                          disabled={busyId === `${sch.id}:cancel`}
                          onClick={() => handleControl(sch.id, 'cancel')}
                          title="Cancel Schedule"
                          className="p-1.5 rounded border border-slate-200 hover:bg-red-50 text-slate-500 hover:text-red-600"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {(sch.executionHistory?.length || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(isHistoryOpen ? null : sch.id)}
                          title="Execution History"
                          className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 inline-flex items-center gap-0.5 text-[10px]"
                        >
                          <History className="w-3.5 h-3.5" />
                          {isHistoryOpen ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(sch)}
                        title="Delete Schedule"
                        className="p-1.5 rounded border border-slate-200 hover:bg-red-50 text-slate-500 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isHistoryOpen && sch.executionHistory && sch.executionHistory.length > 0 && (
                    <div className="border-t border-slate-200 pt-2 space-y-1 text-[11px] font-mono text-slate-600">
                      {sch.executionHistory.map((log, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2">
                          <span>
                            {new Date(log.executedAt).toLocaleString()} ·{' '}
                            <strong className="uppercase">{log.status}</strong>
                          </span>
                          <span className="text-slate-500 truncate">{log.note || ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingScheduleId ? 'Edit Scheduled Advertisement' : 'Schedule Advertisement'}
        subtitle="Set exact broadcast time, timezone, repeat rule, overlap policy, and session safeguards."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSaveSchedule} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="sm:col-span-2 space-y-1">
              <span className="font-bold text-slate-700">Saved Advertisement</span>
              <select
                required
                value={formDesignId}
                onChange={(e) => {
                  const id = e.target.value;
                  setFormDesignId(id);
                  const found = nonTemplateDesigns.find((d) => d.id === id);
                  if (found && found.defaultDurationSeconds > 0 && !editingScheduleId) {
                    setFormDuration(found.defaultDurationSeconds);
                  }
                }}
                className="w-full min-h-[36px] px-2.5 border border-slate-300 rounded-lg bg-white font-semibold"
              >
                <option value="">-- Select Saved Ad --</option>
                {nonTemplateDesigns.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.defaultDurationSeconds === 0 ? 'Permanent' : `${d.defaultDurationSeconds}s`})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="font-bold text-slate-700">Scheduled Date</span>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full min-h-[36px] px-2.5 border border-slate-300 rounded-lg font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold text-slate-700">Start Time (HH:mm:ss)</span>
              <input
                type="time"
                step={1}
                required
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="w-full min-h-[36px] px-2.5 border border-slate-300 rounded-lg font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold text-slate-700">Timezone</span>
              <select
                value={formTimezone}
                onChange={(e) => setFormTimezone(e.target.value)}
                className="w-full min-h-[36px] px-2.5 border border-slate-300 rounded-lg bg-white font-semibold"
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="font-bold text-slate-700">Duration (s)</span>
                <input
                  type="number"
                  min={1}
                  max={3600}
                  value={formDuration}
                  onChange={(e) => setFormDuration(Math.max(1, Number(e.target.value) || 15))}
                  className="w-full min-h-[36px] px-2.5 border border-slate-300 rounded-lg font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold text-slate-700">Priority (1-100)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formPriority}
                  onChange={(e) =>
                    setFormPriority(Math.max(1, Math.min(100, Number(e.target.value) || 50)))
                  }
                  className="w-full min-h-[36px] px-2.5 border border-slate-300 rounded-lg font-mono"
                />
              </label>
            </div>
          </div>

          {resolvedUtcPreview && (
            <p className="text-[11px] font-mono text-slate-500">
              UTC Execution Time: {new Date(resolvedUtcPreview).toUTCString()}
            </p>
          )}

          {conflicts.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Time Overlap Detected ({conflicts.length})</span>
              </p>
              {conflicts.map((c) => (
                <p key={c.scheduleId} className="text-[11px] font-mono">
                  · {c.adName} at {new Date(c.nextRunAt).toLocaleTimeString()} ({c.durationSeconds}s, P{c.priority})
                </p>
              ))}
              <p className="text-[11px]">
                Set Overlap Policy below to &quot;Stack&quot; or &quot;Replace Lower Priority&quot; if intentional.
              </p>
            </div>
          )}

          {/* Repeat Rule */}
          <div className="border-t border-slate-200 pt-3 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-bold text-slate-700">Repeat Rule</span>
                <select
                  value={formRepeatRule}
                  onChange={(e) => setFormRepeatRule(e.target.value as AdScheduleRepeatRule)}
                  className="w-full min-h-[34px] px-2 border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="none">One-Time Only</option>
                  <option value="every_x_minutes">Every X Minutes</option>
                  <option value="daily_times">Specific Daily Times</option>
                  <option value="weekdays">Specific Weekdays</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-bold text-slate-700">Grace Period (seconds)</span>
                <input
                  type="number"
                  min={5}
                  max={3600}
                  value={formGracePeriod}
                  onChange={(e) =>
                    setFormGracePeriod(Math.max(5, Math.min(3600, Number(e.target.value) || 120)))
                  }
                  className="w-full min-h-[34px] px-2 border border-slate-300 rounded-lg font-mono"
                />
              </label>
            </div>

            {formRepeatRule === 'every_x_minutes' && (
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">Interval (min)</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={formRepeatIntervalMin}
                    onChange={(e) =>
                      setFormRepeatIntervalMin(Math.max(1, Number(e.target.value) || 15))
                    }
                    className="w-full min-h-[32px] px-2 border border-slate-300 rounded font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">End Time</span>
                  <input
                    type="time"
                    value={formRepeatEndTime}
                    onChange={(e) => setFormRepeatEndTime(e.target.value)}
                    className="w-full min-h-[32px] px-2 border border-slate-300 rounded font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">Max Runs (0=∞)</span>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={formMaxOccurrences}
                    onChange={(e) => setFormMaxOccurrences(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full min-h-[32px] px-2 border border-slate-300 rounded font-mono"
                  />
                </label>
              </div>
            )}

            {formRepeatRule === 'daily_times' && (
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">
                  Daily Clock Times (comma-separated HH:mm or HH:mm:ss)
                </span>
                <input
                  type="text"
                  value={formRepeatDailyTimes}
                  onChange={(e) => setFormRepeatDailyTimes(e.target.value)}
                  placeholder="19:30, 20:15, 21:00"
                  className="w-full min-h-[32px] px-2.5 border border-slate-300 rounded font-mono"
                />
              </label>
            )}

            {formRepeatRule === 'weekdays' && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 block">
                  Repeat Weekdays
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((wd) => {
                    const active = formRepeatWeekdays.includes(wd.val);
                    return (
                      <button
                        key={wd.val}
                        type="button"
                        onClick={() =>
                          setFormRepeatWeekdays((prev) =>
                            active ? prev.filter((x) => x !== wd.val) : [...prev, wd.val]
                          )
                        }
                        className={`px-2.5 py-1 rounded border text-[11px] font-semibold ${
                          active
                            ? 'bg-[#EA580C] text-white border-[#EA580C]'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {wd.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {formRepeatRule !== 'none' && (
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">
                  Optional Repeat End Date
                </span>
                <input
                  type="date"
                  value={formRepeatEndDate}
                  onChange={(e) => setFormRepeatEndDate(e.target.value)}
                  className="w-48 min-h-[32px] px-2 border border-slate-300 rounded font-mono"
                />
              </label>
            )}
          </div>

          {/* Policies */}
          <div className="grid grid-cols-2 gap-2.5 border-t border-slate-200 pt-3">
            <label className="space-y-1">
              <span className="font-bold text-slate-700">Overlap Conflict Policy</span>
              <select
                value={formConflictPolicy}
                onChange={(e) => setFormConflictPolicy(e.target.value as AdScheduleConflictPolicy)}
                className="w-full min-h-[32px] px-2 border border-slate-300 rounded bg-white"
              >
                <option value="prevent">Prevent Overlapping</option>
                <option value="stack">Stack Multiple Ads</option>
                <option value="replace_lower_priority">Replace Lower Priority</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold text-slate-700">Match State Filter</span>
              <select
                value={formEventRestriction}
                onChange={(e) =>
                  setFormEventRestriction(e.target.value as AdScheduleEventRestriction)
                }
                className="w-full min-h-[32px] px-2 border border-slate-300 rounded bg-white"
              >
                <option value="any">Run Anytime During Broadcast</option>
                <option value="live_only">Only When Match Is Live</option>
                <option value="break_only">Only During Break / Half-Time</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold text-slate-700">OBS Bridge Requirement</span>
              <select
                value={formBridgePolicy}
                onChange={(e) => setFormBridgePolicy(e.target.value as AdScheduleBridgePolicy)}
                className="w-full min-h-[32px] px-2 border border-slate-300 rounded bg-white"
              >
                <option value="allow_overlay_only">
                  Allow Overlay Output Always (Recommended)
                </option>
                <option value="require_bridge">
                  Require Online OBS Bridge ({bridgeOnline ? 'Online' : 'Offline'})
                </option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold text-slate-700">On Match End</span>
              <select
                value={formSessionPolicy}
                onChange={(e) => setFormSessionPolicy(e.target.value as AdScheduleSessionPolicy)}
                className="w-full min-h-[32px] px-2 border border-slate-300 rounded bg-white"
              >
                <option value="cancel_on_end">Cancel Pending Jobs</option>
                <option value="miss_on_end">Mark Remaining As Missed</option>
              </select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[36px] px-4 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingForm || !formDesignId}
              className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[#EA580C] hover:bg-orange-600 font-bold text-white disabled:opacity-45"
            >
              {savingForm
                ? 'Saving...'
                : editingScheduleId
                  ? 'Save Schedule'
                  : 'Create Schedule'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete Schedule for "${deleteTarget?.adName || ''}"?`}
        message="This permanently removes the scheduled broadcast job and its history."
        confirmLabel="Delete Schedule"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  );
};
