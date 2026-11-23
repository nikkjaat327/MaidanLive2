import mongoose from 'mongoose';
import type { Response } from 'express';
import { LiveStream } from '../models/LiveStream.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { ScoreHistory } from '../models/ScoreHistory.ts';
import { Fixture } from '../models/Fixture.ts';
import { Player } from '../models/Player.ts';
import { PlayerMatchStat } from '../models/PlayerMatchStat.ts';
import { Team } from '../models/Team.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { canManageStream } from '../middleware/auth.ts';
import {
  applyKabaddiClockCommand,
  applyKabaddiEngineAction,
  createDefaultKabaddiRules,
  createDefaultKabaddiScorerSettings,
  createDefaultKabaddiViewerSettings,
  normalizeKabaddiDetails,
} from '../../src/utils/kabaddiScoring.ts';
import type {
  KabaddiClockCommand,
  KabaddiDetails,
  KabaddiEngineActionPayload,
} from '../../src/utils/kabaddiScoring.ts';
import { sanitizeText } from './sanitize.ts';
import { emitStreamEvent, emitTournamentEvent } from '../socket/index.ts';
import { recordActivity } from './audit.ts';
import { runWithOptionalTransaction } from './dbTransaction.ts';
import { dispatchMatchNotifications } from './notifications.ts';
import { buildIdMatchFilter, findDocByAnyId } from './mongoNormalize.ts';
import { triggerBroadcastGraphicEvent } from '../services/broadcastGraphicsService.ts';

const PLAYER_STAT_FIELDS = [
  'raidPoints',
  'tacklePoints',
  'bonusPoints',
  'superRaids',
  'superTackles',
  'yellowCards',
  'redCards',
] as const;

export async function applyKabaddiPlayerStatDeltas(params: {
  stream: any;
  playerStatDeltas: Record<string, Record<string, number>>;
  actorId: mongoose.Types.ObjectId;
  direction: 1 | -1;
  session: any;
}): Promise<void> {
  const { stream, playerStatDeltas, actorId, direction, session } = params;
  if (!playerStatDeltas || typeof playerStatDeltas !== 'object') return;

  for (const [playerId, rawDelta] of Object.entries(playerStatDeltas)) {
    if (!playerId || !mongoose.Types.ObjectId.isValid(playerId) || !rawDelta) continue;
    const player = await Player.findById(playerId).session(session);
    if (!player) continue;

    let statDoc = await PlayerMatchStat.findOne({
      liveStreamId: stream._id,
      playerId: player._id,
    }).session(session);

    if (!statDoc && direction === -1) continue;

    if (!statDoc) {
      const created = await PlayerMatchStat.create(
        [
          {
            liveStreamId: stream._id,
            tournamentId: stream.tournamentId || null,
            teamId: player.teamId || null,
            playerId: player._id,
            sportType: 'Kabaddi',
            appearances: 1,
            updatedBy: actorId,
          },
        ],
        { session: session || undefined }
      );
      statDoc = created[0];
    }

    let changed = false;
    for (const field of PLAYER_STAT_FIELDS) {
      const val = Number((rawDelta as any)[field] || 0);
      if (Number.isFinite(val) && val !== 0) {
        const currentVal = Number((statDoc as any)[field] || 0);
        (statDoc as any)[field] = Math.max(0, currentVal + val * direction);
        changed = true;
      }
    }

    if (changed) {
      statDoc.updatedBy = actorId;
      await statDoc.save({ session: session || undefined });
    }
  }
}

async function resolveKabaddiStream(idOrFixtureId: string, session: any = null) {
  let stream = await LiveStream.findById(idOrFixtureId).session(session);
  if (!stream) {
    stream = await findDocByAnyId(LiveStream, idOrFixtureId);
  }
  if (!stream) {
    const fixture = await Fixture.findById(idOrFixtureId).session(session);
    if (fixture?.liveStreamId) {
      stream = await LiveStream.findById(fixture.liveStreamId).session(session);
      if (!stream) {
        stream = await findDocByAnyId(LiveStream, fixture.liveStreamId.toString());
      }
    }
  }
  return stream;
}

async function ensureKabaddiScore(streamId: string, session: any = null) {
  const stream = await resolveKabaddiStream(streamId, session);
  const resolvedId = stream ? stream._id.toString() : streamId;
  let score = await LiveScore.findOne({
    liveStreamId: buildIdMatchFilter(resolvedId),
  }).session(session);
  if (!score) {
    if (!stream) return null;
    const created = await LiveScore.create(
      [
        {
          liveStreamId: stream._id,
          sportType: 'Kabaddi' as const,
          teamAScore: 0,
          teamBScore: 0,
          sportSpecificDetails: normalizeKabaddiDetails(null) as unknown as Record<string, unknown>,
          matchStatus:
            stream.status === 'ENDED'
              ? 'Completed'
              : stream.status === 'UPCOMING'
                ? 'Upcoming'
                : 'Live',
          lastUpdatedAt: new Date(),
        },
      ],
      { session: session || undefined }
    );
    score = created[0];
  }
  return score;
}

export async function handleKabaddiEventRoute(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const allowed = await canManageStream(req.user!, id, 'score');
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden: Not authorized to score this Kabaddi match.' });
      return;
    }

    const actionPayload = (req.body?.action || req.body) as KabaddiEngineActionPayload;
    if (!actionPayload || typeof actionPayload !== 'object' || !actionPayload.type) {
      res.status(400).json({ message: 'Kabaddi action payload is required.' });
      return;
    }

    const clientEventId = sanitizeText(req.body?.clientEventId, 100);
    if (clientEventId) {
      const existing = await ScoreHistory.findOne({
        liveStreamId: id,
        clientEventId,
      })
        .populate('updatedBy', 'name role')
        .lean();
      if (existing) {
        const currentScore = await ensureKabaddiScore(id);
        res.json({
          streamId: id,
          score: currentScore ? currentScore.toObject() : null,
          historyItem: existing,
          duplicatePrevented: true,
        });
        return;
      }
    }

    const txResult = await runWithOptionalTransaction(async (session) => {
      const stream = await resolveKabaddiStream(id, session);
      if (!stream) return null;

      const score = await ensureKabaddiScore(stream._id.toString(), session);
      if (!score) return null;

      const detailsNorm = normalizeKabaddiDetails(score.sportSpecificDetails as Partial<KabaddiDetails>);
      const isControlOrAdmin =
        actionPayload.type === 'MANUAL_SCORE_CORRECTION' ||
        actionPayload.type === 'SYNC_ROSTER' ||
        actionPayload.type === 'CLEAR_DO_OR_DIE';

      if (
        (detailsNorm.matchCompleted || score.resultStatus !== 'NOT_DECLARED') &&
        !isControlOrAdmin &&
        req.body?.allowPostCompletionOverride !== true
      ) {
        return {
          locked: true as const,
          reason:
            'Match is completed and locked. Use Reopen or Correction with authorization to adjust.',
        };
      }

      if (
        detailsNorm.clock.status === 'SUSPENDED' &&
        !isControlOrAdmin &&
        actionPayload.type !== 'INJURY'
      ) {
        return {
          locked: true as const,
          reason: 'Match is currently suspended. Resume the match before recording raids.',
        };
      }

      const previousSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const applied = applyKabaddiEngineAction(
        detailsNorm,
        score.teamAScore,
        score.teamBScore,
        actionPayload,
        Date.now()
      );

      // Handle Card yellow/red PlayerMatchStat tracking if real playerId exists
      if (actionPayload.type === 'CARD' && !actionPayload.playerId.startsWith('slot_')) {
        applied.playerStatDeltas[actionPayload.playerId] = {
          ...(applied.playerStatDeltas[actionPayload.playerId] || {}),
          ...(actionPayload.cardType === 'YELLOW' ? { yellowCards: 1 } : {}),
          ...(actionPayload.cardType === 'RED' ? { redCards: 1 } : {}),
        };
      }

      score.sportType = 'Kabaddi';
      score.teamAScore = applied.teamAScore;
      score.teamBScore = applied.teamBScore;
      score.sportSpecificDetails = applied.details as unknown as Record<string, unknown>;
      score.markModified?.('sportSpecificDetails');
      if (score.matchStatus === 'Upcoming') {
        score.matchStatus = 'Live';
      }
      score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
      score.lastUpdatedAt = new Date();
      await score.save({ session: session || undefined });

      await applyKabaddiPlayerStatDeltas({
        stream,
        playerStatDeltas: applied.playerStatDeltas,
        actorId: req.user!._id as mongoose.Types.ObjectId,
        direction: 1,
        session,
      });

      const updatedSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const rawActorPid =
        'raiderId' in actionPayload && actionPayload.raiderId
          ? actionPayload.raiderId
          : 'defenderId' in actionPayload && actionPayload.defenderId
            ? actionPayload.defenderId
            : 'playerId' in actionPayload && actionPayload.playerId
              ? actionPayload.playerId
              : '';
      const validPlayerObjectId =
        rawActorPid && mongoose.Types.ObjectId.isValid(rawActorPid)
          ? new mongoose.Types.ObjectId(rawActorPid)
          : null;

      const isScoreUpdateEntry =
        actionPayload.type !== 'SYNC_ROSTER' && actionPayload.type !== 'SET_RAIDING_TEAM';

      const createdHistory = await ScoreHistory.create(
        [
          {
            liveStreamId: score.liveStreamId,
            entryType:
              actionPayload.type === 'MANUAL_SCORE_CORRECTION'
                ? 'CORRECTION'
                : isScoreUpdateEntry
                  ? 'SCORE_UPDATE'
                  : 'SCORE_UPDATE',
            sportType: 'Kabaddi',
            teamSide: applied.awardingTeam,
            teamId:
              applied.awardingTeam === 'A'
                ? stream.teamAId || null
                : applied.awardingTeam === 'B'
                  ? stream.teamBId || null
                  : null,
            eventCategory: applied.eventCategory,
            eventType: applied.eventType,
            pointsAwarded: applied.pointsAwarded,
            playerId: validPlayerObjectId,
            playerName: sanitizeText(
              ('raiderName' in actionPayload && actionPayload.raiderName) ||
                ('defenderName' in actionPayload && actionPayload.defenderName) ||
                ('playerName' in actionPayload && actionPayload.playerName) ||
                '',
              120
            ),
            details: {
              action: actionPayload,
              playerStatDeltas: applied.playerStatDeltas,
            },
            clientEventId,
            previousScore: previousSnapshot,
            updatedScore: updatedSnapshot,
            action: applied.label.slice(0, 280),
            updatedBy: req.user!._id,
          },
        ],
        { session: session || undefined }
      );

      return {
        locked: false as const,
        score,
        historyId: createdHistory[0]._id,
        applied,
      };
    });

    if (!txResult) {
      res.status(404).json({ message: 'Live stream not found.' });
      return;
    }
    if (txResult.locked) {
      res.status(409).json({ message: txResult.reason, locked: true });
      return;
    }

    const populatedHistory = await ScoreHistory.findById(txResult.historyId)
      .populate('updatedBy', 'name role')
      .lean();

    await recordActivity(
      req.user!,
      'KABADDI_SCORE_EVENT',
      'LiveScore',
      txResult.score._id.toString(),
      txResult.applied.label,
      {
        newValue: {
          teamAScore: txResult.score.teamAScore,
          teamBScore: txResult.score.teamBScore,
          eventType: txResult.applied.eventType,
        },
      }
    );

    const payload = {
      streamId: id,
      score: txResult.score.toObject(),
      historyItem: populatedHistory,
      triggeredDoOrDie: txResult.applied.triggeredDoOrDie || null,
      triggeredAllOut: txResult.applied.triggeredAllOut || null,
    };

    emitStreamEvent(id, 'score:updated', payload);
    emitStreamEvent(id, 'kabaddi:state', {
      streamId: id,
      score: payload.score,
      serverNowIso: new Date().toISOString(),
    });
    if (txResult.applied.triggeredDoOrDie) {
      emitStreamEvent(id, 'kabaddi:do_or_die', {
        streamId: id,
        doOrDie: txResult.applied.triggeredDoOrDie,
      });
    }
    if (txResult.applied.triggeredAllOut) {
      emitStreamEvent(id, 'kabaddi:all_out', {
        streamId: id,
        allOut: txResult.applied.triggeredAllOut,
      });
    }
    emitStreamEvent(id, 'match:timeline:updated', {
      streamId: id,
      historyItem: populatedHistory,
    });

    if (txResult.applied.triggeredAllOut) {
      triggerBroadcastGraphicEvent(id, 'ALL_OUT', `k_allout_${txResult.historyId}`).catch(() => {});
    } else if (txResult.applied.eventType === 'SUPER_TACKLE') {
      triggerBroadcastGraphicEvent(id, 'SUPER_TACKLE', `k_st_${txResult.historyId}`).catch(() => {});
    }

    res.json(payload);
  } catch (err: any) {
    console.error('[Kabaddi] Event route error:', err);
    res.status(400).json({ message: err?.message || 'Failed to record Kabaddi event.' });
  }
}

export async function handleKabaddiClockRoute(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const allowed = await canManageStream(req.user!, id, 'score');
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden: Not authorized to control Kabaddi match clock.' });
      return;
    }

    const command = (req.body?.command || req.body) as KabaddiClockCommand;
    if (!command || typeof command !== 'object' || !command.type) {
      res.status(400).json({ message: 'Clock command type is required.' });
      return;
    }

    const score = await ensureKabaddiScore(id);
    if (!score) {
      res.status(404).json({ message: 'Live stream not found.' });
      return;
    }

    const previousSnapshot = {
      sportType: score.sportType,
      teamAScore: score.teamAScore,
      teamBScore: score.teamBScore,
      sportSpecificDetails: score.sportSpecificDetails,
      matchStatus: score.matchStatus,
    };

    const { details, label } = applyKabaddiClockCommand(
      score.sportSpecificDetails as Partial<KabaddiDetails>,
      command,
      Date.now()
    );

    score.sportType = 'Kabaddi';
    score.sportSpecificDetails = details as unknown as Record<string, unknown>;
    score.markModified?.('sportSpecificDetails');

    if (command.type === 'HALF_TIME') score.matchStatus = 'Half Time';
    else if (command.type === 'SUSPEND_MATCH') score.matchStatus = 'Suspended';
    else if (command.type === 'START_TIMEOUT') score.matchStatus = 'Timeout';
    else if (
      command.type === 'START_MATCH' ||
      command.type === 'RESUME' ||
      command.type === 'RESUME_MATCH' ||
      command.type === 'END_TIMEOUT' ||
      command.type === 'START_NEXT_HALF' ||
      command.type === 'EXTRA_TIME' ||
      command.type === 'TIE_BREAKER' ||
      command.type === 'GOLDEN_RAID'
    ) {
      score.matchStatus = 'Live';
    }

    score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
    score.lastUpdatedAt = new Date();
    await score.save();

    // Update stream LIVE status if match starts from UPCOMING
    if (command.type === 'START_MATCH') {
      const stream = await resolveKabaddiStream(id);
      if (stream && stream.status === 'UPCOMING') {
        stream.status = 'LIVE';
        stream.startedAt = stream.startedAt || new Date();
        await stream.save();
      }
    }

    const updatedSnapshot = {
      sportType: score.sportType,
      teamAScore: score.teamAScore,
      teamBScore: score.teamBScore,
      sportSpecificDetails: score.sportSpecificDetails,
      matchStatus: score.matchStatus,
    };

    const historyDoc = await ScoreHistory.create({
      liveStreamId: score.liveStreamId,
      entryType: 'CORRECTION',
      sportType: 'Kabaddi',
      eventCategory: 'CLOCK',
      eventType: command.type,
      previousScore: previousSnapshot,
      updatedScore: updatedSnapshot,
      action: label.slice(0, 280),
      updatedBy: req.user!._id,
    });
    const populatedHistory = await ScoreHistory.findById(historyDoc._id)
      .populate('updatedBy', 'name role')
      .lean();

    const payload = {
      streamId: id,
      score: score.toObject(),
      historyItem: populatedHistory,
      serverNowIso: new Date().toISOString(),
    };

    emitStreamEvent(id, 'kabaddi:timer', payload);
    emitStreamEvent(id, 'score:updated', payload);
    emitStreamEvent(id, 'match:timeline:updated', {
      streamId: id,
      historyItem: populatedHistory,
    });

    const clockHistId = String(historyDoc._id);
    if (command.type === 'HALF_TIME') {
      triggerBroadcastGraphicEvent(id, 'HALF_TIME', `k_clk_${clockHistId}`).catch(() => {});
    } else if (command.type === 'START_TIMEOUT') {
      triggerBroadcastGraphicEvent(id, 'TIMEOUT', `k_clk_${clockHistId}`).catch(() => {});
    } else if (command.type === 'START_NEXT_HALF') {
      triggerBroadcastGraphicEvent(id, 'SECOND_HALF', `k_clk_${clockHistId}`).catch(() => {});
    } else if (command.type === 'START_MATCH') {
      triggerBroadcastGraphicEvent(id, 'FIRST_HALF', `k_clk_${clockHistId}`).catch(() => {});
    }

    res.json(payload);
  } catch (err: any) {
    console.error('[Kabaddi] Clock route error:', err);
    res.status(400).json({ message: err?.message || 'Failed to update Kabaddi clock.' });
  }
}

export async function handleKabaddiSettingsRoute(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const allowed = await canManageStream(req.user!, id, 'score');
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden: Not authorized to change Kabaddi settings.' });
      return;
    }

    const score = await ensureKabaddiScore(id);
    if (!score) {
      res.status(404).json({ message: 'Live stream not found.' });
      return;
    }

    const next = normalizeKabaddiDetails(score.sportSpecificDetails as Partial<KabaddiDetails>);

    if (req.body.resetRulesDefaults) {
      next.rules = createDefaultKabaddiRules();
    } else if (req.body.rules && typeof req.body.rules === 'object') {
      next.rules = { ...next.rules, ...req.body.rules };
      if (typeof req.body.rules.raidTimerEnabled === 'boolean') {
        next.clock.raidTimerEnabled = req.body.rules.raidTimerEnabled;
      }
      if (typeof req.body.rules.raidTimerSeconds === 'number') {
        next.clock.raidDurationMs = Math.max(5, req.body.rules.raidTimerSeconds) * 1000;
        if (!next.clock.raidRunning) {
          next.clock.raidRemainingMs = next.clock.raidDurationMs;
        }
      }
      if (
        typeof req.body.rules.halfDurationMinutes === 'number' &&
        next.clock.status === 'NOT_STARTED'
      ) {
        const ms = Math.max(1, req.body.rules.halfDurationMinutes) * 60 * 1000;
        next.clock.durationMs = ms;
        next.clock.remainingMs = ms;
        next.timerMinutes = Math.max(1, req.body.rules.halfDurationMinutes);
        next.timerSeconds = 0;
      }
    }

    if (req.body.resetScorerDefaults) {
      next.scorerSettings = createDefaultKabaddiScorerSettings();
    } else if (req.body.scorerSettings && typeof req.body.scorerSettings === 'object') {
      next.scorerSettings = {
        ...next.scorerSettings,
        ...req.body.scorerSettings,
        buttons: {
          ...next.scorerSettings.buttons,
          ...(req.body.scorerSettings.buttons || {}),
        },
        panels: {
          ...next.scorerSettings.panels,
          ...(req.body.scorerSettings.panels || {}),
        },
      };
    }

    if (req.body.resetViewerDefaults) {
      next.viewerDisplaySettings = createDefaultKabaddiViewerSettings();
    } else if (req.body.viewerDisplaySettings && typeof req.body.viewerDisplaySettings === 'object') {
      next.viewerDisplaySettings = {
        ...next.viewerDisplaySettings,
        ...req.body.viewerDisplaySettings,
      };
    }

    score.sportType = 'Kabaddi';
    score.sportSpecificDetails = next as unknown as Record<string, unknown>;
    score.markModified?.('sportSpecificDetails');
    score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
    score.lastUpdatedAt = new Date();
    await score.save();

    await recordActivity(
      req.user!,
      'UPDATE_KABADDI_SETTINGS',
      'LiveScore',
      score._id.toString(),
      'Updated Kabaddi rules / console / viewer display settings'
    );

    const payload = {
      streamId: id,
      score: score.toObject(),
    };

    emitStreamEvent(id, 'kabaddi:settings_updated', payload);
    emitStreamEvent(id, 'score:updated', payload);
    res.json(payload);
  } catch (err: any) {
    console.error('[Kabaddi] Settings route error:', err);
    res.status(400).json({ message: err?.message || 'Failed to save Kabaddi settings.' });
  }
}

export async function handleKabaddiCompleteRoute(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const allowed =
      (await canManageStream(req.user!, id, 'result')) ||
      (await canManageStream(req.user!, id, 'score'));
    if (!allowed) {
      res.status(403).json({
        message: 'Forbidden: You are not authorized to complete this Kabaddi match.',
      });
      return;
    }

    const stream = await resolveKabaddiStream(id);
    if (!stream) {
      res.status(404).json({ message: 'Live stream not found.' });
      return;
    }
    const score = await ensureKabaddiScore(stream._id.toString());
    if (!score) {
      res.status(404).json({ message: 'Score record not found.' });
      return;
    }

    const nextDetails = normalizeKabaddiDetails(
      score.sportSpecificDetails as Partial<KabaddiDetails>
    );
    const labelA = stream.teamAName || 'Team A';
    const labelB = stream.teamBName || 'Team B';
    const forfeitSide =
      req.body?.forfeitTeam === 'A' || req.body?.forfeitTeam === 'B'
        ? (req.body.forfeitTeam as 'A' | 'B')
        : '';
    const forfeitReason = sanitizeText(req.body?.forfeitReason, 240);
    const goldenRaidWinner =
      req.body?.goldenRaidWinner === 'A' || req.body?.goldenRaidWinner === 'B'
        ? (req.body.goldenRaidWinner as 'A' | 'B')
        : '';
    const allowDraw = Boolean(req.body?.allowDraw);

    let winnerSide: 'A' | 'B' | null = null;
    let normalizedStatus: 'DECLARED' | 'TIE' = 'DECLARED';
    let resultType: 'TEAM_A_WON' | 'TEAM_B_WON' | 'TIE' = 'TIE';
    let winningMargin = '';
    let resultDescription = '';

    if (forfeitSide) {
      winnerSide = forfeitSide === 'A' ? 'B' : 'A';
      const winName = winnerSide === 'A' ? labelA : labelB;
      const loseName = forfeitSide === 'A' ? labelA : labelB;
      resultType = winnerSide === 'A' ? 'TEAM_A_WON' : 'TEAM_B_WON';
      normalizedStatus = 'DECLARED';
      winningMargin = 'by Forfeit';
      resultDescription = `${winName} won by forfeit (${loseName} forfeited${forfeitReason ? `: ${forfeitReason}` : ''})`;
      nextDetails.forfeitTeam = forfeitSide;
      nextDetails.forfeitReason = forfeitReason;
    } else if (score.teamAScore > score.teamBScore) {
      winnerSide = 'A';
      const diff = score.teamAScore - score.teamBScore;
      resultType = 'TEAM_A_WON';
      normalizedStatus = 'DECLARED';
      winningMargin = `by ${diff} point${diff === 1 ? '' : 's'}`;
      resultDescription = `${labelA} defeated ${labelB} ${score.teamAScore}-${score.teamBScore} (${winningMargin})`;
    } else if (score.teamBScore > score.teamAScore) {
      winnerSide = 'B';
      const diff = score.teamBScore - score.teamAScore;
      resultType = 'TEAM_B_WON';
      normalizedStatus = 'DECLARED';
      winningMargin = `by ${diff} point${diff === 1 ? '' : 's'}`;
      resultDescription = `${labelB} defeated ${labelA} ${score.teamBScore}-${score.teamAScore} (${winningMargin})`;
    } else {
      // Scores are tied
      const tbA = Number(nextDetails.tieBreakerScoreA || 0);
      const tbB = Number(nextDetails.tieBreakerScoreB || 0);
      if (nextDetails.isTieBreaker && tbA !== tbB) {
        winnerSide = tbA > tbB ? 'A' : 'B';
        const winName = winnerSide === 'A' ? labelA : labelB;
        resultType = winnerSide === 'A' ? 'TEAM_A_WON' : 'TEAM_B_WON';
        normalizedStatus = 'DECLARED';
        winningMargin = `in Tie-Breaker (${tbA}-${tbB})`;
        resultDescription = `${winName} won ${winningMargin}`;
      } else if (goldenRaidWinner) {
        winnerSide = goldenRaidWinner;
        const winName = winnerSide === 'A' ? labelA : labelB;
        nextDetails.goldenRaidWinner = goldenRaidWinner;
        nextDetails.tieBreakStage = 'GOLDEN_RAID';
        resultType = winnerSide === 'A' ? 'TEAM_A_WON' : 'TEAM_B_WON';
        normalizedStatus = 'DECLARED';
        winningMargin = 'via Golden Raid';
        resultDescription = `${winName} won via Golden Raid (${score.teamAScore}-${score.teamBScore})`;
      } else if (nextDetails.rules.tieResolutionMode === 'ALLOW_TIE' || allowDraw) {
        winnerSide = null;
        normalizedStatus = 'TIE';
        resultType = 'TIE';
        winningMargin = 'Match Tied';
        resultDescription = `${labelA} and ${labelB} tied ${score.teamAScore}-${score.teamBScore}`;
      } else {
        res.status(409).json({
          message: `Match is tied (${score.teamAScore}-${score.teamBScore}). Start Extra Time, Tie-Breaker, Golden Raid, or explicitly confirm a Tied finish.`,
          tieRequiresResolution: true,
          recommendedMode: nextDetails.rules.tieResolutionMode,
        });
        return;
      }
    }

    const clocked = applyKabaddiClockCommand(nextDetails, { type: 'COMPLETE_CLOCK' }, Date.now());
    const finalDetails = clocked.details;

    const previousSnapshot = {
      sportType: score.sportType,
      teamAScore: score.teamAScore,
      teamBScore: score.teamBScore,
      sportSpecificDetails: score.sportSpecificDetails,
      matchStatus: score.matchStatus,
      resultStatus: score.resultStatus,
      winnerTeamName: score.winnerTeamName,
    };

    const winnerTeamName = winnerSide === 'A' ? labelA : winnerSide === 'B' ? labelB : '';
    const winnerTeamId =
      winnerSide === 'A'
        ? stream.teamAId || null
        : winnerSide === 'B'
          ? stream.teamBId || null
          : null;

    score.sportType = 'Kabaddi';
    score.sportSpecificDetails = finalDetails as unknown as Record<string, unknown>;
    score.markModified?.('sportSpecificDetails');
    score.resultStatus = normalizedStatus;
    score.resultType = resultType;
    score.winnerTeamId = winnerTeamId;
    score.winnerTeamName = winnerTeamName;
    score.winningMargin = winningMargin;
    score.resultDescription = resultDescription;
    score.declaredBy = req.user!._id as mongoose.Types.ObjectId;
    score.declaredByName = req.user!.name || req.user!.email;
    score.declaredAt = new Date();
    score.matchStatus = normalizedStatus === 'TIE' ? 'Tied' : 'Completed';
    score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
    score.lastUpdatedAt = new Date();
    await score.save();

    if (stream.status !== 'ENDED') {
      stream.status = 'ENDED';
      stream.endedAt = new Date();
      stream.endedBy = req.user!._id as mongoose.Types.ObjectId;
      await stream.save();
    }

    // Sync tournament Fixture & knockout progression
    const linkedFixture = await Fixture.findOne({ liveStreamId: stream._id });
    if (linkedFixture) {
      linkedFixture.status = 'COMPLETED';
      linkedFixture.resultConfirmed = true;
      linkedFixture.resultSummary = resultDescription;
      linkedFixture.winnerTeamId = winnerTeamId;
      linkedFixture.winnerTeamName = winnerTeamName;
      linkedFixture.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await linkedFixture.save();

      if (linkedFixture.nextFixtureId && (winnerSide === 'A' || winnerSide === 'B')) {
        const nextFixture = await Fixture.findById(linkedFixture.nextFixtureId);
        if (nextFixture) {
          const winnerTeamDoc = winnerTeamId ? await Team.findById(winnerTeamId).lean() : null;
          const winLogo =
            winnerTeamDoc?.logoUrl ||
            (winnerSide === 'A' ? stream.teamALogo : stream.teamBLogo) ||
            '';
          if (linkedFixture.nextFixtureSlot === 'B') {
            nextFixture.teamBId = winnerTeamId;
            nextFixture.teamBName = winnerTeamName;
            nextFixture.teamBLogo = winLogo;
          } else {
            nextFixture.teamAId = winnerTeamId;
            nextFixture.teamAName = winnerTeamName;
            nextFixture.teamALogo = winLogo;
          }
          nextFixture.updatedBy = req.user!._id as mongoose.Types.ObjectId;
          await nextFixture.save();
        }
      }
    }

    const updatedSnapshot = {
      sportType: score.sportType,
      teamAScore: score.teamAScore,
      teamBScore: score.teamBScore,
      sportSpecificDetails: score.sportSpecificDetails,
      matchStatus: score.matchStatus,
      resultStatus: score.resultStatus,
      winnerTeamName: score.winnerTeamName,
    };

    const historyItem = await ScoreHistory.create({
      liveStreamId: score.liveStreamId,
      entryType: 'RESULT',
      sportType: 'Kabaddi',
      teamSide: winnerSide || '',
      teamId: winnerTeamId,
      eventCategory: 'RESULT',
      eventType: forfeitSide ? 'FORFEIT_COMPLETED' : 'MATCH_COMPLETED',
      previousScore: previousSnapshot,
      updatedScore: updatedSnapshot,
      action: `Match Completed: ${resultDescription}`,
      updatedBy: req.user!._id,
    });
    const populatedHistory = await ScoreHistory.findById(historyItem._id)
      .populate('updatedBy', 'name role')
      .lean();

    await recordActivity(
      req.user!,
      'COMPLETE_KABADDI_MATCH',
      'LiveScore',
      score._id.toString(),
      resultDescription,
      { newValue: { winnerTeamName, teamAScore: score.teamAScore, teamBScore: score.teamBScore } }
    );

    await dispatchMatchNotifications({
      type: 'MATCH_COMPLETED',
      title: 'Kabaddi Match Completed',
      message: `${stream.matchTitle || `${labelA} vs ${labelB}`}: ${resultDescription}`,
      entityType: 'LiveStream',
      entityId: stream._id.toString(),
      link: `/live/${stream._id.toString()}`,
      dedupeKey: `kabaddi-complete-${stream._id.toString()}`,
      teamIds: [stream.teamAId, stream.teamBId],
      tournamentId: stream.tournamentId,
      includeAllSpectatorsIfNoFollowers: true,
    });

    const payload = {
      streamId: id,
      score: score.toObject(),
      historyItem: populatedHistory,
    };

    emitStreamEvent(id, 'kabaddi:match_completed', payload);
    emitStreamEvent(id, 'match:result:declared', { ...payload, isCorrection: false });
    emitStreamEvent(id, 'score:updated', payload);
    emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populatedHistory });
    if (stream.tournamentId) {
      emitTournamentEvent(stream.tournamentId.toString(), 'tournament:points_updated', {
        tournamentId: stream.tournamentId.toString(),
        streamId: id,
        resultStatus: score.resultStatus,
        winnerTeamId: winnerTeamId ? winnerTeamId.toString() : null,
      });
    }

    triggerBroadcastGraphicEvent(id, 'MATCH_COMPLETED', `k_complete_${id}`).catch(() => {});

    res.json(payload);
  } catch (err: any) {
    console.error('[Kabaddi] Complete match error:', err);
    res.status(500).json({ message: err?.message || 'Failed to complete Kabaddi match.' });
  }
}

export async function handleKabaddiReopenRoute(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const allowed = await canManageStream(req.user!, id, 'result');
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden: Only authorized admins can reopen a completed match.' });
      return;
    }

    const reason = sanitizeText(req.body?.reason, 240) || 'Admin correction reopen';
    const stream = await resolveKabaddiStream(id);
    const score = stream ? await ensureKabaddiScore(stream._id.toString()) : null;
    if (!score || !stream) {
      res.status(404).json({ message: 'Match not found.' });
      return;
    }

    const nextDetails = normalizeKabaddiDetails(
      score.sportSpecificDetails as Partial<KabaddiDetails>
    );
    nextDetails.matchCompleted = false;
    nextDetails.clock.status = 'PAUSED';
    nextDetails.clock.matchEndedAtIso = null;

    const prevSnapshot = {
      sportType: score.sportType,
      teamAScore: score.teamAScore,
      teamBScore: score.teamBScore,
      sportSpecificDetails: score.sportSpecificDetails,
      matchStatus: score.matchStatus,
      resultStatus: score.resultStatus,
    };

    score.sportSpecificDetails = nextDetails as unknown as Record<string, unknown>;
    score.markModified?.('sportSpecificDetails');
    score.resultStatus = 'NOT_DECLARED';
    score.resultType = '';
    score.winnerTeamId = null;
    score.winnerTeamName = '';
    score.winningMargin = '';
    score.resultDescription = '';
    score.matchStatus = 'Live';
    score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
    score.lastUpdatedAt = new Date();
    await score.save();

    if (stream.status === 'ENDED') {
      stream.status = 'LIVE';
      await stream.save();
    }

    const linkedFixture = await Fixture.findOne({ liveStreamId: stream._id });
    if (linkedFixture && linkedFixture.resultConfirmed) {
      linkedFixture.status = 'LIVE';
      linkedFixture.resultConfirmed = false;
      linkedFixture.resultSummary = '';
      linkedFixture.winnerTeamId = null;
      linkedFixture.winnerTeamName = '';
      linkedFixture.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await linkedFixture.save();
    }

    const hist = await ScoreHistory.create({
      liveStreamId: score.liveStreamId,
      entryType: 'CORRECTION',
      sportType: 'Kabaddi',
      eventCategory: 'CONTROL',
      eventType: 'MATCH_REOPENED',
      previousScore: prevSnapshot,
      updatedScore: {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      },
      action: `Match reopened for correction: ${reason}`,
      updatedBy: req.user!._id,
    });
    const populatedHistory = await ScoreHistory.findById(hist._id)
      .populate('updatedBy', 'name role')
      .lean();

    const payload = { streamId: id, score: score.toObject(), historyItem: populatedHistory };
    emitStreamEvent(id, 'score:updated', payload);
    emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populatedHistory });
    res.json(payload);
  } catch (err: any) {
    console.error('[Kabaddi] Reopen match error:', err);
    res.status(500).json({ message: 'Failed to reopen Kabaddi match.' });
  }
}
