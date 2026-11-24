import crypto from 'crypto';
import mongoose from 'mongoose';
import { BroadcastAdDesign } from '../models/BroadcastAdDesign.ts';
import { BroadcastAdSchedule } from '../models/BroadcastAdSchedule.ts';
import { BroadcastGraphicsState } from '../models/BroadcastGraphicsState.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { ObsControllerProfile } from '../models/ObsControllerProfile.ts';
import type { IUser } from '../models/User.ts';
import type {
  AdScheduleBridgePolicy,
  AdScheduleConflictItem,
  AdScheduleConflictPolicy,
  AdScheduleEventRestriction,
  AdScheduleExecutionLogItem,
  AdScheduleRepeatRule,
  AdScheduleSessionPolicy,
  AdScheduleStatus,
  BroadcastAdScheduleData,
  GraphicsDesignType,
} from '../../src/types/broadcastGraphics.ts';
import { emitBroadcastStudioEvent, emitRoomOnlyEvent } from '../socket/index.ts';
import { sanitizeText } from '../utils/sanitize.ts';
import {
  getGraphicsStateForMatch,
  registerSlotExpiredListener,
  showSavedDesignLive,
} from './broadcastGraphicsService.ts';
import { isMatchBridgeOnline, writeBroadcastAudit } from './obsControllerService.ts';

const VALID_CONFLICT_POLICIES = new Set<AdScheduleConflictPolicy>([
  'prevent',
  'stack',
  'replace_lower_priority',
]);
const VALID_BRIDGE_POLICIES = new Set<AdScheduleBridgePolicy>([
  'allow_overlay_only',
  'require_bridge',
]);
const VALID_EVENT_RESTRICTIONS = new Set<AdScheduleEventRestriction>([
  'any',
  'live_only',
  'break_only',
]);
const VALID_SESSION_POLICIES = new Set<AdScheduleSessionPolicy>([
  'cancel_on_end',
  'miss_on_end',
]);
const VALID_REPEAT_RULES = new Set<AdScheduleRepeatRule>([
  'none',
  'every_x_minutes',
  'daily_times',
  'weekdays',
]);

let wakeUpTimer: NodeJS.Timeout | null = null;
let sweepInterval: NodeJS.Timeout | null = null;
let engineInitialized = false;
let tickInFlight = false;

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const hourNum = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: hourNum,
    minute: Number(map.minute),
    second: Number(map.second),
    dateStr: `${map.year}-${map.month}-${map.day}`,
    timeStr: `${String(hourNum).padStart(2, '0')}:${map.minute}:${map.second}`,
    weekday: weekdayMap[map.weekday] ?? date.getUTCDay(),
  };
}

export function zonedDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string
): Date {
  const cleanTz = isValidIanaTimeZone(timeZone) ? timeZone.trim() : 'Asia/Kolkata';
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(timeStr || '').trim());
  if (!dateMatch || !timeMatch) {
    const err: any = new Error('Scheduled date must be YYYY-MM-DD and start time must be HH:mm or HH:mm:ss.');
    err.statusCode = 400;
    throw err;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    const err: any = new Error('Invalid scheduled date or time values.');
    err.statusCode = 400;
    throw err;
  }

  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let candidateMs = targetAsUtc;

  // Iterative fixed-point refinement handles DST transitions accurately without moment/luxon
  for (let i = 0; i < 4; i++) {
    const p = getZonedParts(new Date(candidateMs), cleanTz);
    const actualAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    const diff = targetAsUtc - actualAsUtc;
    if (diff === 0) break;
    candidateMs += diff;
  }

  return new Date(candidateMs);
}

function addCalendarDays(dateStr: string, daysToAdd: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + daysToAdd, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function normalizeTimeList(times: unknown, fallback: string): string[] {
  if (!Array.isArray(times)) return fallback ? [fallback] : [];
  const valid = times
    .map((t) => String(t || '').trim())
    .filter((t) => /^\d{2}:\d{2}(:\d{2})?$/.test(t))
    .slice(0, 24);
  return Array.from(new Set(valid)).sort();
}

function normalizeWeekdays(days: unknown): number[] {
  if (!Array.isArray(days)) return [];
  return Array.from(
    new Set(
      days
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    )
  ).sort((a, b) => a - b);
}

function passesRecurringBounds(
  candidateUtc: Date,
  schedule: {
    timezone: string;
    repeatStartDate?: string;
    repeatEndDate?: string;
    repeatEndTime?: string;
    maxOccurrences?: number;
    occurrenceCount?: number;
  }
): boolean {
  if (
    typeof schedule.maxOccurrences === 'number' &&
    schedule.maxOccurrences > 0 &&
    (schedule.occurrenceCount || 0) >= schedule.maxOccurrences
  ) {
    return false;
  }

  const parts = getZonedParts(candidateUtc, schedule.timezone || 'Asia/Kolkata');
  if (schedule.repeatStartDate && parts.dateStr < schedule.repeatStartDate) {
    return false;
  }
  if (schedule.repeatEndDate && parts.dateStr > schedule.repeatEndDate) {
    return false;
  }
  if (schedule.repeatEndTime && /^\d{2}:\d{2}(:\d{2})?$/.test(schedule.repeatEndTime)) {
    const endFull =
      schedule.repeatEndTime.length === 5 ? `${schedule.repeatEndTime}:59` : schedule.repeatEndTime;
    if (parts.timeStr > endFull) {
      return false;
    }
  }
  return true;
}

export function computeNextRecurringRunAt(
  schedule: {
    repeatRule: AdScheduleRepeatRule;
    repeatIntervalMinutes?: number;
    repeatDailyTimes?: string[];
    repeatWeekdays?: number[];
    repeatStartDate?: string;
    repeatEndDate?: string;
    repeatEndTime?: string;
    scheduledStartTime: string;
    timezone: string;
    maxOccurrences?: number;
    occurrenceCount?: number;
  },
  afterDate: Date
): Date | null {
  if (!schedule.repeatRule || schedule.repeatRule === 'none') return null;
  if (
    typeof schedule.maxOccurrences === 'number' &&
    schedule.maxOccurrences > 0 &&
    (schedule.occurrenceCount || 0) >= schedule.maxOccurrences
  ) {
    return null;
  }

  const tz = isValidIanaTimeZone(schedule.timezone) ? schedule.timezone : 'Asia/Kolkata';

  if (schedule.repeatRule === 'every_x_minutes') {
    const intervalMs = Math.max(1, Number(schedule.repeatIntervalMinutes) || 15) * 60_000;
    const candidate = new Date(afterDate.getTime() + intervalMs);
    if (!passesRecurringBounds(candidate, schedule)) {
      // If passed repeatEndTime today and repeatEndDate allows tomorrow, jump to tomorrow start if endDate > today
      const p = getZonedParts(candidate, tz);
      if (schedule.repeatEndTime && (!schedule.repeatEndDate || p.dateStr < schedule.repeatEndDate)) {
        const nextDay = addCalendarDays(p.dateStr, 1);
        const nextCandidate = zonedDateTimeToUtc(nextDay, schedule.scheduledStartTime || '09:00', tz);
        return passesRecurringBounds(nextCandidate, schedule) ? nextCandidate : null;
      }
      return null;
    }
    return candidate;
  }

  const times = normalizeTimeList(
    schedule.repeatDailyTimes,
    schedule.scheduledStartTime || '12:00'
  );
  if (times.length === 0) return null;

  const baseParts = getZonedParts(afterDate, tz);
  const startDateCursor =
    schedule.repeatStartDate && schedule.repeatStartDate > baseParts.dateStr
      ? schedule.repeatStartDate
      : baseParts.dateStr;

  const allowedWeekdays =
    schedule.repeatRule === 'weekdays'
      ? normalizeWeekdays(schedule.repeatWeekdays)
      : [0, 1, 2, 3, 4, 5, 6];

  if (schedule.repeatRule === 'weekdays' && allowedWeekdays.length === 0) {
    return null;
  }

  for (let dayOffset = 0; dayOffset <= 35; dayOffset++) {
    const dateStr = addCalendarDays(startDateCursor, dayOffset);
    if (schedule.repeatEndDate && dateStr > schedule.repeatEndDate) {
      return null;
    }
    const probeMidday = zonedDateTimeToUtc(dateStr, '12:00', tz);
    const weekday = getZonedParts(probeMidday, tz).weekday;
    if (!allowedWeekdays.includes(weekday)) continue;

    for (const t of times) {
      const cand = zonedDateTimeToUtc(dateStr, t, tz);
      if (cand.getTime() <= afterDate.getTime() + 1000) continue;
      if (passesRecurringBounds(cand, schedule)) {
        return cand;
      }
    }
  }

  return null;
}

export function formatAdSchedule(doc: any): BroadcastAdScheduleData {
  return {
    id: String(doc._id || doc.id),
    matchId: String(doc.matchId),
    tournamentId: doc.tournamentId ? String(doc.tournamentId) : null,
    broadcastSessionId: doc.broadcastSessionId || '',
    designId: String(doc.designId),
    adName: doc.adName || 'Scheduled Ad',
    adDesignType: (doc.adDesignType || 'custom') as GraphicsDesignType,
    adThumbnailDataUrl: doc.adThumbnailDataUrl || '',
    matchTitle: doc.matchTitle || '',
    scheduledDate: doc.scheduledDate || '',
    scheduledStartTime: doc.scheduledStartTime || '',
    timezone: doc.timezone || 'Asia/Kolkata',
    scheduledStartAt: doc.scheduledStartAt
      ? new Date(doc.scheduledStartAt).toISOString()
      : new Date().toISOString(),
    nextRunAt: doc.nextRunAt ? new Date(doc.nextRunAt).toISOString() : new Date().toISOString(),
    durationSeconds: Math.max(1, Number(doc.durationSeconds) || 15),
    gracePeriodSeconds: Math.max(0, Number(doc.gracePeriodSeconds ?? 45)),
    priority: Math.max(1, Number(doc.priority) || 5),
    conflictPolicy: VALID_CONFLICT_POLICIES.has(doc.conflictPolicy)
      ? doc.conflictPolicy
      : 'prevent',
    bridgePolicy: VALID_BRIDGE_POLICIES.has(doc.bridgePolicy)
      ? doc.bridgePolicy
      : 'allow_overlay_only',
    eventRestriction: VALID_EVENT_RESTRICTIONS.has(doc.eventRestriction)
      ? doc.eventRestriction
      : 'any',
    sessionPolicy: VALID_SESSION_POLICIES.has(doc.sessionPolicy)
      ? doc.sessionPolicy
      : 'cancel_on_end',
    repeatRule: VALID_REPEAT_RULES.has(doc.repeatRule) ? doc.repeatRule : 'none',
    repeatIntervalMinutes: Math.max(1, Number(doc.repeatIntervalMinutes) || 15),
    repeatDailyTimes: Array.isArray(doc.repeatDailyTimes) ? doc.repeatDailyTimes : [],
    repeatWeekdays: Array.isArray(doc.repeatWeekdays) ? doc.repeatWeekdays : [],
    repeatStartDate: doc.repeatStartDate || '',
    repeatEndDate: doc.repeatEndDate || '',
    repeatEndTime: doc.repeatEndTime || '',
    maxOccurrences: Number(doc.maxOccurrences) || 0,
    occurrenceCount: Number(doc.occurrenceCount) || 0,
    status: (doc.status || 'scheduled') as AdScheduleStatus,
    statusReason: doc.statusReason || '',
    activeSlotInstanceId: doc.activeSlotInstanceId || null,
    lastExecutedAt: doc.lastExecutedAt ? new Date(doc.lastExecutedAt).toISOString() : null,
    lastCompletedAt: doc.lastCompletedAt ? new Date(doc.lastCompletedAt).toISOString() : null,
    executionHistory: Array.isArray(doc.executionHistory) ? doc.executionHistory : [],
    createdByName: doc.createdByName || '',
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

async function emitScheduleUpdate(
  matchId: string,
  schedule: BroadcastAdScheduleData | null,
  action: string
) {
  const schedules = await listSchedulesForMatch(matchId);
  const payload = {
    matchId,
    schedule,
    schedules: schedules.schedules,
    action,
    serverNowIso: new Date().toISOString(),
  };
  emitRoomOnlyEvent(matchId, 'graphics:schedule_updated', payload);
  emitBroadcastStudioEvent(matchId, 'graphics:schedule_updated', payload);
}

export async function listSchedulesForMatch(matchId: string): Promise<{
  schedules: BroadcastAdScheduleData[];
  serverNowIso: string;
}> {
  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    return { schedules: [], serverNowIso: new Date().toISOString() };
  }
  const docs = await BroadcastAdSchedule.find({ matchId })
    .sort({ nextRunAt: 1, createdAt: -1 })
    .limit(120)
    .lean();
  return {
    schedules: docs.map(formatAdSchedule),
    serverNowIso: new Date().toISOString(),
  };
}

export async function detectScheduleConflicts(params: {
  matchId: string;
  startAtUtc: Date;
  durationSeconds: number;
  excludeScheduleId?: string;
}): Promise<AdScheduleConflictItem[]> {
  const startMs = params.startAtUtc.getTime();
  const endMs = startMs + Math.max(1, params.durationSeconds) * 1000;

  const active = await BroadcastAdSchedule.find({
    matchId: params.matchId,
    status: { $in: ['scheduled', 'preparing', 'playing'] },
  }).lean();

  const conflicts: AdScheduleConflictItem[] = [];
  for (const s of active) {
    if (params.excludeScheduleId && String(s._id) === String(params.excludeScheduleId)) {
      continue;
    }
    const otherStart = new Date(s.nextRunAt).getTime();
    const otherEnd = otherStart + Math.max(1, Number(s.durationSeconds) || 15) * 1000;
    if (startMs < otherEnd && otherStart < endMs) {
      conflicts.push({
        scheduleId: String(s._id),
        adName: s.adName || 'Scheduled Ad',
        nextRunAt: new Date(s.nextRunAt).toISOString(),
        durationSeconds: Number(s.durationSeconds) || 15,
        priority: Number(s.priority) || 5,
        status: s.status as AdScheduleStatus,
      });
    }
  }
  return conflicts;
}

export async function createAdSchedule(params: {
  matchId: string;
  designId: string;
  scheduledDate: string;
  scheduledStartTime: string;
  timezone?: string;
  durationSeconds?: number;
  gracePeriodSeconds?: number;
  priority?: number;
  conflictPolicy?: AdScheduleConflictPolicy;
  bridgePolicy?: AdScheduleBridgePolicy;
  eventRestriction?: AdScheduleEventRestriction;
  sessionPolicy?: AdScheduleSessionPolicy;
  repeatRule?: AdScheduleRepeatRule;
  repeatIntervalMinutes?: number;
  repeatDailyTimes?: string[];
  repeatWeekdays?: number[];
  repeatStartDate?: string;
  repeatEndDate?: string;
  repeatEndTime?: string;
  maxOccurrences?: number;
  actor: IUser;
}): Promise<{ schedule: BroadcastAdScheduleData; conflicts: AdScheduleConflictItem[] }> {
  const { matchId, designId, actor } = params;
  if (!mongoose.Types.ObjectId.isValid(matchId) || !mongoose.Types.ObjectId.isValid(designId)) {
    const err: any = new Error('Invalid match or advertisement design ID.');
    err.statusCode = 400;
    throw err;
  }

  const timezone = String(params.timezone || 'Asia/Kolkata').trim();
  if (!isValidIanaTimeZone(timezone)) {
    const err: any = new Error(`Unsupported IANA timezone: ${timezone}`);
    err.statusCode = 400;
    throw err;
  }

  const [stream, design, profile] = await Promise.all([
    LiveStream.findById(matchId).lean(),
    BroadcastAdDesign.findById(designId).lean(),
    ObsControllerProfile.findOne({ matchId }).select('broadcastSessionId').lean(),
  ]);

  if (!stream) {
    const err: any = new Error('Target match broadcast session was not found.');
    err.statusCode = 404;
    throw err;
  }
  if (stream.status === 'ENDED') {
    const err: any = new Error('Cannot schedule advertisements on an ended match.');
    err.statusCode = 400;
    throw err;
  }
  if (!design) {
    const err: any = new Error('Selected advertisement from Saved Ads Library was not found.');
    err.statusCode = 404;
    throw err;
  }
  if (design.scope === 'match' && design.matchId && String(design.matchId) !== String(matchId)) {
    const err: any = new Error('This match-scoped advertisement belongs to a different match.');
    err.statusCode = 403;
    throw err;
  }

  const durationSeconds = clampInt(
    params.durationSeconds ?? design.defaultDurationSeconds,
    1,
    3600,
    15
  );
  const gracePeriodSeconds = clampInt(params.gracePeriodSeconds, 0, 3600, 45);
  const priority = clampInt(params.priority, 1, 100, 5);
  const conflictPolicy: AdScheduleConflictPolicy = VALID_CONFLICT_POLICIES.has(
    params.conflictPolicy as AdScheduleConflictPolicy
  )
    ? params.conflictPolicy!
    : 'prevent';
  const bridgePolicy: AdScheduleBridgePolicy = VALID_BRIDGE_POLICIES.has(
    params.bridgePolicy as AdScheduleBridgePolicy
  )
    ? params.bridgePolicy!
    : 'allow_overlay_only';
  const eventRestriction: AdScheduleEventRestriction = VALID_EVENT_RESTRICTIONS.has(
    params.eventRestriction as AdScheduleEventRestriction
  )
    ? params.eventRestriction!
    : 'any';
  const sessionPolicy: AdScheduleSessionPolicy = VALID_SESSION_POLICIES.has(
    params.sessionPolicy as AdScheduleSessionPolicy
  )
    ? params.sessionPolicy!
    : 'cancel_on_end';
  const repeatRule: AdScheduleRepeatRule = VALID_REPEAT_RULES.has(
    params.repeatRule as AdScheduleRepeatRule
  )
    ? params.repeatRule!
    : 'none';

  const startAtUtc = zonedDateTimeToUtc(params.scheduledDate, params.scheduledStartTime, timezone);
  const nowMs = Date.now();
  if (startAtUtc.getTime() + gracePeriodSeconds * 1000 < nowMs - 5000) {
    const err: any = new Error('Scheduled start time is already in the past. Please choose a future time.');
    err.statusCode = 400;
    throw err;
  }

  const conflicts = await detectScheduleConflicts({
    matchId,
    startAtUtc,
    durationSeconds,
  });

  if (conflicts.length > 0 && conflictPolicy === 'prevent') {
    const err: any = new Error(
      `Time slot overlaps with "${conflicts[0].adName}". Change start time or choose Stack / Replace Lower Priority.`
    );
    err.statusCode = 409;
    err.conflicts = conflicts;
    throw err;
  }

  const matchTitle =
    stream.matchTitle ||
    [stream.teamAName, stream.teamBName].filter(Boolean).join(' vs ') ||
    'Live Match';

  const created = await BroadcastAdSchedule.create({
    matchId,
    tournamentId: stream.tournamentId || null,
    broadcastSessionId: profile?.broadcastSessionId || '',
    designId,
    adName: design.name,
    adDesignType: design.designType || 'custom',
    adThumbnailDataUrl: design.thumbnailDataUrl || '',
    matchTitle,
    scheduledDate: String(params.scheduledDate).trim(),
    scheduledStartTime: String(params.scheduledStartTime).trim(),
    timezone,
    scheduledStartAt: startAtUtc,
    nextRunAt: startAtUtc,
    durationSeconds,
    gracePeriodSeconds,
    priority,
    conflictPolicy,
    bridgePolicy,
    eventRestriction,
    sessionPolicy,
    repeatRule,
    repeatIntervalMinutes: clampInt(params.repeatIntervalMinutes, 1, 1440, 15),
    repeatDailyTimes: normalizeTimeList(params.repeatDailyTimes, String(params.scheduledStartTime).trim()),
    repeatWeekdays: normalizeWeekdays(params.repeatWeekdays),
    repeatStartDate: sanitizeText(params.repeatStartDate, 20),
    repeatEndDate: sanitizeText(params.repeatEndDate, 20),
    repeatEndTime: sanitizeText(params.repeatEndTime, 16),
    maxOccurrences: clampInt(params.maxOccurrences, 0, 1000, 0),
    occurrenceCount: 0,
    status: 'scheduled',
    statusReason: '',
    claimLockToken: '',
    claimLockedAt: null,
    activeSlotInstanceId: '',
    executionHistory: [],
    createdBy: actor._id,
    createdByName: actor.name || actor.email || 'Admin',
    updatedBy: actor._id,
  });

  const formatted = formatAdSchedule(created);
  await writeBroadcastAudit({
    matchId,
    tournamentId: stream.tournamentId ? String(stream.tournamentId) : null,
    actionType: 'GRAPHICS_SCHEDULE_CREATED',
    actor,
    obsStatus: 'SUCCESS',
    metadata: {
      scheduleId: formatted.id,
      designId,
      adName: formatted.adName,
      nextRunAt: formatted.nextRunAt,
      durationSeconds,
      repeatRule,
    },
  });

  await emitScheduleUpdate(matchId, formatted, 'created');
  refreshWakeUpTimer().catch(() => {});

  return { schedule: formatted, conflicts };
}

export async function updateAdSchedule(
  scheduleId: string,
  params: Partial<{
    designId: string;
    scheduledDate: string;
    scheduledStartTime: string;
    timezone: string;
    durationSeconds: number;
    gracePeriodSeconds: number;
    priority: number;
    conflictPolicy: AdScheduleConflictPolicy;
    bridgePolicy: AdScheduleBridgePolicy;
    eventRestriction: AdScheduleEventRestriction;
    sessionPolicy: AdScheduleSessionPolicy;
    repeatRule: AdScheduleRepeatRule;
    repeatIntervalMinutes: number;
    repeatDailyTimes: string[];
    repeatWeekdays: number[];
    repeatStartDate: string;
    repeatEndDate: string;
    repeatEndTime: string;
    maxOccurrences: number;
  }>,
  actor: IUser
): Promise<{ schedule: BroadcastAdScheduleData; conflicts: AdScheduleConflictItem[] }> {
  const doc = await BroadcastAdSchedule.findById(scheduleId);
  if (!doc) {
    const err: any = new Error('Scheduled advertisement not found.');
    err.statusCode = 404;
    throw err;
  }

  if (doc.status === 'playing') {
    const err: any = new Error('Cannot reschedule while this advertisement is currently playing live.');
    err.statusCode = 409;
    throw err;
  }

  const timezone = String(params.timezone ?? doc.timezone ?? 'Asia/Kolkata').trim();
  if (!isValidIanaTimeZone(timezone)) {
    const err: any = new Error(`Unsupported IANA timezone: ${timezone}`);
    err.statusCode = 400;
    throw err;
  }

  if (params.designId && String(params.designId) !== String(doc.designId)) {
    const design = await BroadcastAdDesign.findById(params.designId).lean();
    if (!design) {
      const err: any = new Error('Selected advertisement not found.');
      err.statusCode = 404;
      throw err;
    }
    doc.designId = design._id as mongoose.Types.ObjectId;
    doc.adName = design.name;
    doc.adDesignType = design.designType || 'custom';
    doc.adThumbnailDataUrl = design.thumbnailDataUrl || '';
  }

  const nextDate = String(params.scheduledDate ?? doc.scheduledDate).trim();
  const nextTime = String(params.scheduledStartTime ?? doc.scheduledStartTime).trim();
  const nextStartUtc = zonedDateTimeToUtc(nextDate, nextTime, timezone);
  const durationSeconds = clampInt(params.durationSeconds ?? doc.durationSeconds, 1, 3600, 15);
  const gracePeriodSeconds = clampInt(
    params.gracePeriodSeconds ?? doc.gracePeriodSeconds,
    0,
    3600,
    45
  );
  const conflictPolicy = VALID_CONFLICT_POLICIES.has(params.conflictPolicy as AdScheduleConflictPolicy)
    ? params.conflictPolicy!
    : (doc.conflictPolicy as AdScheduleConflictPolicy);

  const conflicts = await detectScheduleConflicts({
    matchId: String(doc.matchId),
    startAtUtc: nextStartUtc,
    durationSeconds,
    excludeScheduleId: String(doc._id),
  });
  if (conflicts.length > 0 && conflictPolicy === 'prevent') {
    const err: any = new Error(`Overlaps with "${conflicts[0].adName}".`);
    err.statusCode = 409;
    err.conflicts = conflicts;
    throw err;
  }

  doc.scheduledDate = nextDate;
  doc.scheduledStartTime = nextTime;
  doc.timezone = timezone;
  doc.scheduledStartAt = nextStartUtc;
  doc.nextRunAt = nextStartUtc;
  doc.durationSeconds = durationSeconds;
  doc.gracePeriodSeconds = gracePeriodSeconds;
  doc.priority = clampInt(params.priority ?? doc.priority, 1, 100, 5);
  doc.conflictPolicy = conflictPolicy;
  if (params.bridgePolicy && VALID_BRIDGE_POLICIES.has(params.bridgePolicy)) {
    doc.bridgePolicy = params.bridgePolicy;
  }
  if (params.eventRestriction && VALID_EVENT_RESTRICTIONS.has(params.eventRestriction)) {
    doc.eventRestriction = params.eventRestriction;
  }
  if (params.sessionPolicy && VALID_SESSION_POLICIES.has(params.sessionPolicy)) {
    doc.sessionPolicy = params.sessionPolicy;
  }
  if (params.repeatRule && VALID_REPEAT_RULES.has(params.repeatRule)) {
    doc.repeatRule = params.repeatRule;
  }
  if (params.repeatIntervalMinutes !== undefined) {
    doc.repeatIntervalMinutes = clampInt(params.repeatIntervalMinutes, 1, 1440, 15);
  }
  if (params.repeatDailyTimes !== undefined) {
    doc.repeatDailyTimes = normalizeTimeList(params.repeatDailyTimes, nextTime);
  }
  if (params.repeatWeekdays !== undefined) {
    doc.repeatWeekdays = normalizeWeekdays(params.repeatWeekdays);
  }
  if (params.repeatStartDate !== undefined) {
    doc.repeatStartDate = sanitizeText(params.repeatStartDate, 20);
  }
  if (params.repeatEndDate !== undefined) {
    doc.repeatEndDate = sanitizeText(params.repeatEndDate, 20);
  }
  if (params.repeatEndTime !== undefined) {
    doc.repeatEndTime = sanitizeText(params.repeatEndTime, 16);
  }
  if (params.maxOccurrences !== undefined) {
    doc.maxOccurrences = clampInt(params.maxOccurrences, 0, 1000, 0);
  }

  if (['missed', 'failed', 'cancelled', 'completed', 'preparing'].includes(doc.status)) {
    doc.status = 'scheduled';
    doc.statusReason = '';
  }
  doc.updatedBy = actor._id as mongoose.Types.ObjectId;
  await doc.save();

  const formatted = formatAdSchedule(doc);
  await writeBroadcastAudit({
    matchId: String(doc.matchId),
    actionType: 'GRAPHICS_SCHEDULE_UPDATED',
    actor,
    obsStatus: 'SUCCESS',
    metadata: { scheduleId: formatted.id, nextRunAt: formatted.nextRunAt },
  });
  await emitScheduleUpdate(String(doc.matchId), formatted, 'updated');
  refreshWakeUpTimer().catch(() => {});

  return { schedule: formatted, conflicts };
}

function appendHistory(
  existing: AdScheduleExecutionLogItem[] | undefined,
  entry: AdScheduleExecutionLogItem
): AdScheduleExecutionLogItem[] {
  return [...(Array.isArray(existing) ? existing : []).slice(-19), entry];
}

export async function controlAdSchedule(
  scheduleId: string,
  action: 'pause' | 'resume' | 'cancel' | 'skip' | 'play_now' | 'retry',
  actor: IUser
): Promise<BroadcastAdScheduleData> {
  const doc = await BroadcastAdSchedule.findById(scheduleId);
  if (!doc) {
    const err: any = new Error('Scheduled advertisement not found.');
    err.statusCode = 404;
    throw err;
  }

  const matchId = String(doc.matchId);
  const now = new Date();

  if (action === 'pause') {
    if (doc.status !== 'scheduled' && doc.status !== 'preparing') {
      const err: any = new Error('Only pending schedules can be paused.');
      err.statusCode = 400;
      throw err;
    }
    doc.status = 'paused';
    doc.statusReason = `Paused by ${actor.name}`;
    doc.claimLockToken = '';
    doc.claimLockedAt = null;
  } else if (action === 'resume') {
    if (doc.status !== 'paused') {
      const err: any = new Error('Only paused schedules can be resumed.');
      err.statusCode = 400;
      throw err;
    }
    const nextMs = new Date(doc.nextRunAt).getTime();
    const graceMs = Math.max(0, Number(doc.gracePeriodSeconds) || 45) * 1000;
    if (nextMs + graceMs < now.getTime()) {
      const nextOcc = computeNextRecurringRunAt(doc as any, now);
      if (nextOcc) {
        doc.nextRunAt = nextOcc;
        doc.status = 'scheduled';
        doc.statusReason = 'Resumed to next recurring slot';
      } else {
        doc.status = 'missed';
        doc.statusReason = 'Original slot expired while paused';
      }
    } else {
      doc.status = 'scheduled';
      doc.statusReason = '';
    }
  } else if (action === 'cancel') {
    doc.status = 'cancelled';
    doc.statusReason = `Cancelled by ${actor.name}`;
    doc.claimLockToken = '';
    doc.claimLockedAt = null;
  } else if (action === 'skip') {
    const nextOcc = computeNextRecurringRunAt(doc as any, new Date(doc.nextRunAt));
    doc.executionHistory = appendHistory(doc.executionHistory, {
      executedAt: now.toISOString(),
      status: 'skipped',
      note: `Skipped by ${actor.name}`,
    });
    if (nextOcc) {
      doc.nextRunAt = nextOcc;
      doc.status = 'scheduled';
      doc.statusReason = 'Skipped current slot; queued next recurrence';
    } else {
      doc.status = 'cancelled';
      doc.statusReason = `Skipped by ${actor.name}`;
    }
    doc.claimLockToken = '';
    doc.claimLockedAt = null;
  } else if (action === 'retry') {
    doc.nextRunAt = now;
    doc.status = 'scheduled';
    doc.statusReason = `Retry requested by ${actor.name}`;
    doc.claimLockToken = '';
    doc.claimLockedAt = null;
  } else if (action === 'play_now') {
    const overlapPolicyOverride =
      doc.conflictPolicy === 'stack' ? 'stack' : 'replace';
    const { state } = await showSavedDesignLive({
      matchId,
      designId: String(doc.designId),
      scheduleId: String(doc._id),
      durationSecondsOverride: doc.durationSeconds,
      overlapPolicyOverride,
      actor,
      triggerSource: 'schedule',
    });
    const matchedSlot = [...(state.activeSlots || [])]
      .reverse()
      .find((s) => s.scheduleId === String(doc._id));

    doc.status = 'playing';
    doc.activeSlotInstanceId = matchedSlot?.instanceId || '';
    doc.lastExecutedAt = now;
    doc.occurrenceCount = (Number(doc.occurrenceCount) || 0) + 1;
    doc.statusReason = `Manually started by ${actor.name}`;
    doc.executionHistory = appendHistory(doc.executionHistory, {
      executedAt: now.toISOString(),
      status: 'manual_play',
      note: `Triggered immediately by ${actor.name}`,
    });
  }

  doc.updatedBy = actor._id as mongoose.Types.ObjectId;
  await doc.save();

  const formatted = formatAdSchedule(doc);
  const auditAction =
    action === 'pause'
      ? 'GRAPHICS_SCHEDULE_PAUSED'
      : action === 'resume'
        ? 'GRAPHICS_SCHEDULE_RESUMED'
        : action === 'cancel' || action === 'skip'
          ? 'GRAPHICS_SCHEDULE_CANCELLED'
          : 'GRAPHICS_SCHEDULE_EXECUTED';

  await writeBroadcastAudit({
    matchId,
    actionType: auditAction,
    actor,
    obsStatus: 'SUCCESS',
    metadata: { scheduleId: formatted.id, action, status: formatted.status },
  });

  await emitScheduleUpdate(matchId, formatted, action);
  refreshWakeUpTimer().catch(() => {});
  return formatted;
}

export async function deleteAdSchedule(scheduleId: string, actor: IUser): Promise<string> {
  const doc = await BroadcastAdSchedule.findById(scheduleId);
  if (!doc) {
    const err: any = new Error('Scheduled advertisement not found.');
    err.statusCode = 404;
    throw err;
  }
  const matchId = String(doc.matchId);
  await BroadcastAdSchedule.deleteOne({ _id: scheduleId });
  await writeBroadcastAudit({
    matchId,
    actionType: 'GRAPHICS_SCHEDULE_CANCELLED',
    actor,
    obsStatus: 'SUCCESS',
    metadata: { scheduleId, deleted: true, adName: doc.adName },
  });
  await emitScheduleUpdate(matchId, null, 'deleted');
  refreshWakeUpTimer().catch(() => {});
  return matchId;
}

export async function handleMatchSessionEndedForSchedules(matchId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(matchId)) return;
  const active = await BroadcastAdSchedule.find({
    matchId,
    status: { $in: ['scheduled', 'preparing', 'paused'] },
  });
  if (active.length === 0) return;

  for (const doc of active) {
    const nextStatus: AdScheduleStatus =
      doc.sessionPolicy === 'miss_on_end' ? 'missed' : 'cancelled';
    doc.status = nextStatus;
    doc.statusReason = 'Broadcast session ended';
    doc.claimLockToken = '';
    doc.claimLockedAt = null;
    if (nextStatus === 'missed') {
      doc.executionHistory = appendHistory(doc.executionHistory, {
        executedAt: new Date().toISOString(),
        status: 'missed',
        note: 'Broadcast session ended before execution',
      });
    }
    await doc.save();
  }
  await emitScheduleUpdate(matchId, null, 'session_ended');
  refreshWakeUpTimer().catch(() => {});
}

async function settleCompletedScheduleDoc(doc: any, note = 'Completed scheduled duration') {
  const now = new Date();
  doc.lastCompletedAt = now;
  doc.activeSlotInstanceId = '';
  doc.claimLockToken = '';
  doc.claimLockedAt = null;
  doc.executionHistory = appendHistory(doc.executionHistory, {
    executedAt: now.toISOString(),
    status: 'completed',
    note,
  });

  const nextRun = computeNextRecurringRunAt(doc, now);
  if (nextRun) {
    doc.nextRunAt = nextRun;
    doc.status = 'scheduled';
    doc.statusReason = 'Scheduled next recurring occurrence';
  } else {
    doc.status = 'completed';
    doc.statusReason = note;
  }
  await doc.save();
  await emitScheduleUpdate(String(doc.matchId), formatAdSchedule(doc), 'completed');
  refreshWakeUpTimer().catch(() => {});
}

async function markMissedScheduleDoc(doc: any, reason: string) {
  const now = new Date();
  doc.claimLockToken = '';
  doc.claimLockedAt = null;
  doc.executionHistory = appendHistory(doc.executionHistory, {
    executedAt: now.toISOString(),
    status: 'missed',
    note: reason,
  });

  const nextRun = computeNextRecurringRunAt(doc, now);
  if (nextRun) {
    doc.nextRunAt = nextRun;
    doc.status = 'scheduled';
    doc.statusReason = `Missed previous slot (${reason}); moved to next recurrence`;
  } else {
    doc.status = 'missed';
    doc.statusReason = reason;
  }
  await doc.save();

  await writeBroadcastAudit({
    matchId: String(doc.matchId),
    actionType: 'GRAPHICS_SCHEDULE_MISSED',
    obsStatus: 'REJECTED',
    errorDetails: reason,
    metadata: { scheduleId: String(doc._id), adName: doc.adName },
  });

  await emitScheduleUpdate(String(doc.matchId), formatAdSchedule(doc), 'missed');
  refreshWakeUpTimer().catch(() => {});
}

async function executeClaimedSchedule(doc: any): Promise<void> {
  const matchId = String(doc.matchId);
  const now = new Date();
  const graceEndMs =
    new Date(doc.nextRunAt).getTime() + Math.max(0, Number(doc.gracePeriodSeconds) || 0) * 1000;
  const graceExpired = now.getTime() > graceEndMs;

  try {
    const [stream, score, profile, graphicsState] = await Promise.all([
      LiveStream.findById(matchId).lean(),
      LiveScore.findOne({ liveStreamId: matchId }).lean(),
      ObsControllerProfile.findOne({ matchId }).lean(),
      getGraphicsStateForMatch(matchId),
    ]);

    if (!stream || stream.status === 'ENDED') {
      const endStatus: AdScheduleStatus =
        doc.sessionPolicy === 'miss_on_end' ? 'missed' : 'cancelled';
      doc.status = endStatus;
      doc.statusReason = 'Match stream ended';
      doc.claimLockToken = '';
      doc.claimLockedAt = null;
      await doc.save();
      await emitScheduleUpdate(matchId, formatAdSchedule(doc), endStatus);
      return;
    }

    // Event restriction check
    const matchStatusLower = String(score?.matchStatus || '').toLowerCase();
    const isBreakState =
      stream.status !== 'LIVE' ||
      matchStatusLower.includes('break') ||
      matchStatusLower.includes('half') ||
      matchStatusLower.includes('timeout') ||
      matchStatusLower.includes('innings');

    if (doc.eventRestriction === 'live_only' && stream.status !== 'LIVE') {
      if (graceExpired) {
        await markMissedScheduleDoc(doc, 'Match was not live before grace period expired');
      } else {
        doc.status = 'preparing';
        doc.statusReason = 'Waiting for match broadcast to go LIVE';
        doc.claimLockToken = '';
        doc.claimLockedAt = null;
        await doc.save();
      }
      return;
    }
    if (doc.eventRestriction === 'break_only' && !isBreakState) {
      if (graceExpired) {
        await markMissedScheduleDoc(doc, 'Match break window did not occur within grace period');
      } else {
        doc.status = 'preparing';
        doc.statusReason = 'Waiting for match break / timeout window';
        doc.claimLockToken = '';
        doc.claimLockedAt = null;
        await doc.save();
      }
      return;
    }

    // OBS Bridge requirement check
    if (doc.bridgePolicy === 'require_bridge') {
      const bridgeOnline = await isMatchBridgeOnline(matchId);
      const obsConnected = bridgeOnline && profile?.connectionStatus === 'CONNECTED';
      if (!obsConnected) {
        if (graceExpired) {
          await markMissedScheduleDoc(doc, 'Required OBS Bridge / OBS Studio was disconnected');
        } else {
          doc.status = 'preparing';
          doc.statusReason = 'Waiting for OBS Bridge connection';
          doc.claimLockToken = '';
          doc.claimLockedAt = null;
          await doc.save();
        }
        return;
      }
    }

    // Check active graphic conflict
    const activeSlots = graphicsState.activeSlots || [];
    if (activeSlots.length > 0 && doc.conflictPolicy === 'prevent') {
      if (graceExpired) {
        await markMissedScheduleDoc(doc, 'Another live graphic occupied the overlay past grace period');
      } else {
        doc.status = 'preparing';
        doc.statusReason = 'Waiting for active graphic slot to clear';
        doc.claimLockToken = '';
        doc.claimLockedAt = null;
        await doc.save();
      }
      return;
    }

    if (activeSlots.length > 0 && doc.conflictPolicy === 'replace_lower_priority') {
      // Check if an active scheduled slot has higher priority
      const playingHigher = await BroadcastAdSchedule.findOne({
        matchId,
        status: 'playing',
        priority: { $gt: Number(doc.priority) || 5 },
      }).lean();
      if (playingHigher) {
        if (graceExpired) {
          await markMissedScheduleDoc(
            doc,
            `Blocked by higher-priority ad "${playingHigher.adName}"`
          );
        } else {
          doc.status = 'preparing';
          doc.statusReason = `Waiting for higher-priority ad "${playingHigher.adName}"`;
          doc.claimLockToken = '';
          doc.claimLockedAt = null;
          await doc.save();
        }
        return;
      }
    }

    const overlapOverride =
      doc.conflictPolicy === 'stack' ? 'stack' : 'replace';

    const { state } = await showSavedDesignLive({
      matchId,
      designId: String(doc.designId),
      scheduleId: String(doc._id),
      durationSecondsOverride: doc.durationSeconds,
      overlapPolicyOverride: overlapOverride,
      triggerSource: 'schedule',
    });

    const matchedSlot = [...(state.activeSlots || [])]
      .reverse()
      .find((s) => s.scheduleId === String(doc._id));

    doc.status = 'playing';
    doc.activeSlotInstanceId = matchedSlot?.instanceId || '';
    doc.lastExecutedAt = now;
    doc.occurrenceCount = (Number(doc.occurrenceCount) || 0) + 1;
    doc.statusReason = 'Playing on live broadcast overlay';
    doc.claimLockToken = '';
    doc.claimLockedAt = null;
    await doc.save();

    await writeBroadcastAudit({
      matchId,
      tournamentId: doc.tournamentId ? String(doc.tournamentId) : null,
      actionType: 'GRAPHICS_SCHEDULE_EXECUTED',
      obsStatus: 'SUCCESS',
      metadata: {
        scheduleId: String(doc._id),
        designId: String(doc.designId),
        adName: doc.adName,
        occurrenceCount: doc.occurrenceCount,
        durationSeconds: doc.durationSeconds,
      },
    });

    await emitScheduleUpdate(matchId, formatAdSchedule(doc), 'executing');
  } catch (err: any) {
    console.error('[AdSchedule] Execution failed:', err);
    doc.status = 'failed';
    doc.statusReason = err?.message || 'Failed to execute scheduled advertisement';
    doc.claimLockToken = '';
    doc.claimLockedAt = null;
    doc.executionHistory = appendHistory(doc.executionHistory, {
      executedAt: now.toISOString(),
      status: 'failed',
      note: doc.statusReason,
    });
    await doc.save();

    await writeBroadcastAudit({
      matchId,
      actionType: 'GRAPHICS_SCHEDULE_FAILED',
      obsStatus: 'FAILED',
      errorDetails: doc.statusReason,
      metadata: { scheduleId: String(doc._id), adName: doc.adName },
    });

    await emitScheduleUpdate(matchId, formatAdSchedule(doc), 'failed');
  }
}

async function runDueSchedulesTick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const now = new Date();
    // 1. Settle any 'playing' schedules whose slot disappeared or expired
    const playingDocs = await BroadcastAdSchedule.find({ status: 'playing' });
    for (const p of playingDocs) {
      const state = await BroadcastGraphicsState.findOne({ matchId: p.matchId }).lean();
      const stillActive = (state?.activeSlots || []).some(
        (s: any) =>
          (p.activeSlotInstanceId && s.instanceId === p.activeSlotInstanceId) ||
          s.scheduleId === String(p._id)
      );
      if (!stillActive) {
        await settleCompletedScheduleDoc(p, 'Completed live broadcast playback');
      }
    }

    // 2. Query due schedules ('scheduled' or 'preparing' where nextRunAt <= now)
    const due = await BroadcastAdSchedule.find({
      status: { $in: ['scheduled', 'preparing'] },
      nextRunAt: { $lte: now },
    })
      .sort({ nextRunAt: 1, priority: -1 })
      .limit(20)
      .lean();

    for (const item of due) {
      const claimToken = crypto.randomBytes(10).toString('hex');
      const claimed = await BroadcastAdSchedule.findOneAndUpdate(
        {
          _id: item._id,
          status: { $in: ['scheduled', 'preparing'] },
          claimLockToken: '',
        },
        {
          $set: {
            claimLockToken: claimToken,
            claimLockedAt: new Date(),
          },
        },
        { returnDocument: 'after', new: true }
      );
      if (!claimed) continue;
      await executeClaimedSchedule(claimed);
    }
  } catch (err) {
    console.warn('[AdSchedule] Tick error (non-fatal):', err);
  } finally {
    tickInFlight = false;
    await refreshWakeUpTimer().catch(() => {});
  }
}

export async function refreshWakeUpTimer(): Promise<void> {
  if (wakeUpTimer) {
    clearTimeout(wakeUpTimer);
    wakeUpTimer = null;
  }

  const nextList = await BroadcastAdSchedule.find({
    status: { $in: ['scheduled', 'preparing'] },
  })
    .sort({ nextRunAt: 1 })
    .limit(1)
    .lean();

  const earliest = nextList[0];
  if (!earliest) return;

  const targetMs =
    earliest.status === 'preparing'
      ? Date.now() + 5000 // retry waiting preparing condition shortly
      : Math.max(50, new Date(earliest.nextRunAt).getTime() - Date.now());

  const boundedMs = Math.min(targetMs, 3_600_000);
  wakeUpTimer = setTimeout(() => {
    wakeUpTimer = null;
    runDueSchedulesTick().catch(() => {});
  }, boundedMs);
}

async function reconcileSchedulesOnStartup(): Promise<void> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - 60_000);

  // Release any orphaned claim locks left by crash/restart
  await BroadcastAdSchedule.updateMany(
    {
      status: { $in: ['scheduled', 'preparing'] },
      claimLockToken: { $ne: '' },
      claimLockedAt: { $lte: staleCutoff },
    },
    { $set: { claimLockToken: '', claimLockedAt: null } }
  );

  // Reconcile pending overdue items against their grace period
  const pending = await BroadcastAdSchedule.find({
    status: { $in: ['scheduled', 'preparing'] },
    nextRunAt: { $lte: now },
  });

  for (const doc of pending) {
    const graceMs = Math.max(0, Number(doc.gracePeriodSeconds) || 45) * 1000;
    const deadlineMs = new Date(doc.nextRunAt).getTime() + graceMs;
    if (now.getTime() > deadlineMs) {
      await markMissedScheduleDoc(doc, 'Grace period expired while server was restarting');
    }
  }

  await runDueSchedulesTick();
}

export async function initAdScheduleEngine(): Promise<void> {
  if (engineInitialized) return;
  engineInitialized = true;

  registerSlotExpiredListener(async (slot) => {
    if (!slot.scheduleId) return;
    const doc = await BroadcastAdSchedule.findById(slot.scheduleId);
    if (doc && doc.status === 'playing') {
      await settleCompletedScheduleDoc(doc, 'Completed scheduled playback duration');
    }
  });

  await reconcileSchedulesOnStartup().catch((err) => {
    console.warn('[AdSchedule] Startup reconciliation warning:', err);
  });

  sweepInterval = setInterval(() => {
    runDueSchedulesTick().catch(() => {});
  }, 15_000);
}

export function stopAdScheduleEngine(): void {
  if (wakeUpTimer) {
    clearTimeout(wakeUpTimer);
    wakeUpTimer = null;
  }
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
  engineInitialized = false;
}
