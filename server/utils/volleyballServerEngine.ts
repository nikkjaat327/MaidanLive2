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
  applyVolleyballAction,
  getVolleyballCompletionEligibility,
  isVolleyballScoringLocked,
  normalizeVolleyballDetails,
  validateVolleyballRules,
} from '../../src/utils/volleyballScoring.ts';
import type { VolleyballDetails, VolleyballRules } from '../../src/utils/volleyballScoring.ts';
import { sanitizeText } from './sanitize.ts';
import { emitStreamEvent, emitTournamentEvent } from '../socket/index.ts';
import { recordActivity } from './audit.ts';
import { dispatchMatchNotifications } from './notifications.ts';
import { findDocByAnyId } from './mongoNormalize.ts';
import { triggerBroadcastGraphicEvent } from '../services/broadcastGraphicsService.ts';

export async function resolveVolleyballStream(idOrFixtureId: string, session: any = null) {
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

export async function ensureVolleyballScore(streamId: string, session: any = null) {
  const stream = await resolveVolleyballStream(streamId, session);
  if (!stream) return null;
  let score = await LiveScore.findOne({ liveStreamId: stream._id }).session(session);
  if (!score) {
    const created = await LiveScore.create(
      [
        {
          liveStreamId: stream._id,
          sportType: 'Volleyball' as const,
          teamAScore: 0,
          teamBScore: 0,
          sportSpecificDetails: normalizeVolleyballDetails(null) as unknown as Record<string, unknown>,
          matchStatus:
            stream.status === 'ENDED'
              ? 'Completed'
              : stream.status === 'UPCOMING'
                ? stream.broadcastPublished === false
                  ? 'Prepared'
                  : 'Upcoming'
                : 'Live',
          resultStatus: 'NOT_DECLARED',
          lastUpdatedAt: new Date(),
        },
      ],
      { session: session || undefined }
    );
    score = created[0];
  }
  return score;
}

export async function syncVolleyballFixtureOnCompletion(params: {
  stream: any;
  score: any;
  winnerSide: 'A' | 'B';
  actorId: mongoose.Types.ObjectId;
}) {
  const { stream, score, winnerSide, actorId } = params;
  const linkedFixture = await Fixture.findOne({ liveStreamId: stream._id });
  if (!linkedFixture) return;

  linkedFixture.status = 'COMPLETED';
  linkedFixture.resultConfirmed = true;
  linkedFixture.resultSummary = score.resultDescription || '';
  linkedFixture.winnerTeamId = score.winnerTeamId || null;
  linkedFixture.winnerTeamName = score.winnerTeamName || '';
  linkedFixture.updatedBy = actorId;
  await linkedFixture.save();

  if (linkedFixture.nextFixtureId) {
    const nextFixture = await Fixture.findById(linkedFixture.nextFixtureId);
    if (nextFixture) {
      const winnerTeamDoc = score.winnerTeamId
        ? await Team.findById(score.winnerTeamId).lean()
        : null;
      const winLogo =
        winnerTeamDoc?.logoUrl ||
        (winnerSide === 'A' ? stream.teamALogo : stream.teamBLogo) ||
        '';
      const winName =
        score.winnerTeamName ||
        (winnerSide === 'A' ? stream.teamAName : stream.teamBName) ||
        'Winner';
      if (linkedFixture.nextFixtureSlot === 'B') {
        nextFixture.teamBId = score.winnerTeamId || null;
        nextFixture.teamBName = winName;
        nextFixture.teamBLogo = winLogo;
      } else {
        nextFixture.teamAId = score.winnerTeamId || null;
        nextFixture.teamAName = winName;
        nextFixture.teamALogo = winLogo;
      }
      nextFixture.updatedBy = actorId;
      await nextFixture.save();
    }
  }
}

export async function revertVolleyballFixtureOnReopenOrUndo(params: {
  stream: any;
  previousWinnerName?: string;
  previousWinnerTeamId?: mongoose.Types.ObjectId | string | null;
  actorId: mongoose.Types.ObjectId;
}) {
  const { stream, previousWinnerName, previousWinnerTeamId, actorId } = params;
  const linkedFixture = await Fixture.findOne({ liveStreamId: stream._id });
  if (!linkedFixture) return;

  if (linkedFixture.nextFixtureId) {
    const nextFixture = await Fixture.findById(linkedFixture.nextFixtureId);
    if (nextFixture && nextFixture.status === 'SCHEDULED' && !nextFixture.resultConfirmed) {
      const prevIdStr = previousWinnerTeamId ? String(previousWinnerTeamId) : '';
      if (linkedFixture.nextFixtureSlot === 'B') {
        const slotMatches =
          (prevIdStr && String(nextFixture.teamBId || '') === prevIdStr) ||
          (previousWinnerName && nextFixture.teamBName === previousWinnerName);
        if (slotMatches) {
          nextFixture.teamBId = null;
          nextFixture.teamBName = 'TBD';
          nextFixture.teamBLogo = '';
          nextFixture.updatedBy = actorId;
          await nextFixture.save();
        }
      } else {
        const slotMatches =
          (prevIdStr && String(nextFixture.teamAId || '') === prevIdStr) ||
          (previousWinnerName && nextFixture.teamAName === previousWinnerName);
        if (slotMatches) {
          nextFixture.teamAId = null;
          nextFixture.teamAName = 'TBD';
          nextFixture.teamALogo = '';
          nextFixture.updatedBy = actorId;
          await nextFixture.save();
        }
      }
    }
  }

  linkedFixture.status = stream.status === 'UPCOMING' ? 'SCHEDULED' : 'LIVE';
  linkedFixture.resultConfirmed = false;
  linkedFixture.resultSummary = '';
  linkedFixture.winnerTeamId = null;
  linkedFixture.winnerTeamName = '';
  linkedFixture.updatedBy = actorId;
  await linkedFixture.save();
}

export async function finalizeVolleyballMatchCompletion(params: {
  stream: any;
  score: any;
  winnerSide: 'A' | 'B';
  actor: { _id: any; name?: string; email?: string; role?: string };
  reason?: string;
  winningMargin?: string;
  resultDescription?: string;
  mvpPlayerId?: string;
  mvpPlayerName?: string;
  finalSummary?: string;
  isManualOverride?: boolean;
  preCompletionSnapshot: Record<string, unknown>;
  pairedScoreEventId?: mongoose.Types.ObjectId | null;
}) {
  const {
    stream,
    score,
    winnerSide,
    actor,
    reason = '',
    winningMargin: customMargin = '',
    resultDescription: customDesc = '',
    mvpPlayerId: rawMvpId = '',
    mvpPlayerName: rawMvpName = '',
    finalSummary: rawFinalSummary = '',
    isManualOverride = false,
    preCompletionSnapshot,
    pairedScoreEventId = null,
  } = params;

  const id = stream._id.toString();
  const labelA = stream.teamAName || 'Team A';
  const labelB = stream.teamBName || 'Team B';
  const norm = normalizeVolleyballDetails(score.sportSpecificDetails as Partial<VolleyballDetails>);
  const elig = getVolleyballCompletionEligibility(norm);

  norm.matchCompleted = true;
  norm.advantageTeam = null;
  norm.isDeuce = false;
  norm.completedReason =
    !isManualOverride && elig.thresholdReached ? 'THRESHOLD_REACHED' : 'MANUAL_DECISION';
  norm.manualWinnerSide = winnerSide;
  norm.manualWinnerReason = reason;

  const winnerName = winnerSide === 'A' ? labelA : labelB;
  const winnerTeamId =
    winnerSide === 'A' ? stream.teamAId || null : stream.teamBId || null;
  const setsSummary = `${norm.teamASetsWon}-${norm.teamBSetsWon}`;
  const winningMargin =
    customMargin ||
    (elig.thresholdReached ? `Sets ${setsSummary}` : `Declared Winner (Sets ${setsSummary})`);
  const resultDescription =
    customDesc ||
    (reason
      ? `${winnerName} declared winner (${reason})`
      : `${winnerName} won the match (${setsSummary} sets)`);

  let mvpPlayerId: mongoose.Types.ObjectId | null = null;
  let mvpPlayerName = sanitizeText(rawMvpName, 120);
  if (rawMvpId && mongoose.Types.ObjectId.isValid(rawMvpId)) {
    const mvpDoc = await Player.findById(rawMvpId);
    if (mvpDoc) {
      mvpPlayerId = mvpDoc._id as mongoose.Types.ObjectId;
      if (!mvpPlayerName) mvpPlayerName = mvpDoc.name;
    }
  }

  score.sportType = 'Volleyball';
  score.sportSpecificDetails = norm as unknown as Record<string, unknown>;
  score.markModified?.('sportSpecificDetails');
  score.resultStatus = 'DECLARED';
  score.resultType = winnerSide === 'A' ? 'TEAM_A_WON' : 'TEAM_B_WON';
  score.winnerTeamId = winnerTeamId;
  score.winnerTeamName = winnerName;
  score.winningMargin = winningMargin;
  score.resultDescription = resultDescription;
  score.mvpPlayerId = mvpPlayerId;
  score.mvpPlayerName = mvpPlayerName;
  score.finalSummary = sanitizeText(rawFinalSummary, 500);
  score.declaredBy = actor._id as mongoose.Types.ObjectId;
  score.declaredByName = actor.name || actor.email || 'Admin';
  score.declaredAt = new Date();
  score.matchStatus = 'Completed';
  score.lastUpdatedBy = actor._id as mongoose.Types.ObjectId;
  score.lastUpdatedAt = new Date();
  await score.save();

  if (mvpPlayerId) {
    await PlayerMatchStat.findOneAndUpdate(
      { liveStreamId: stream._id, playerId: mvpPlayerId },
      {
        $setOnInsert: {
          liveStreamId: stream._id,
          tournamentId: stream.tournamentId || null,
          playerId: mvpPlayerId,
          sportType: 'Volleyball',
          appearances: 1,
        },
        $set: { isMvp: true, updatedBy: actor._id },
      },
      { upsert: true }
    );
  }

  if (stream.status !== 'ENDED') {
    stream.status = 'ENDED';
    stream.endedAt = new Date();
    stream.endedBy = actor._id as mongoose.Types.ObjectId;
    await stream.save();
  }

  await syncVolleyballFixtureOnCompletion({
    stream,
    score,
    winnerSide,
    actorId: actor._id as mongoose.Types.ObjectId,
  });

  const updatedSnapshot = {
    sportType: score.sportType,
    teamAScore: score.teamAScore,
    teamBScore: score.teamBScore,
    sportSpecificDetails: score.sportSpecificDetails,
    matchStatus: score.matchStatus,
    resultStatus: score.resultStatus,
    winnerTeamName: score.winnerTeamName,
    streamStatus: stream.status,
  };

  const historyItem = await ScoreHistory.create({
    liveStreamId: score.liveStreamId,
    entryType: 'RESULT',
    sportType: 'Volleyball',
    teamSide: winnerSide,
    teamId: winnerTeamId,
    eventCategory: 'RESULT',
    eventType:
      norm.completedReason === 'THRESHOLD_REACHED'
        ? 'MATCH_COMPLETED'
        : 'MANUAL_WINNER_DECLARED',
    details: {
      reason,
      completedReason: norm.completedReason,
      pairedScoreEventId: pairedScoreEventId ? pairedScoreEventId.toString() : null,
    },
    previousScore: preCompletionSnapshot,
    updatedScore: updatedSnapshot,
    action: `Match Completed: ${resultDescription}`,
    updatedBy: actor._id,
  });

  const populatedHistory = await ScoreHistory.findById(historyItem._id)
    .populate('updatedBy', 'name role')
    .lean();

  await recordActivity(
    actor as any,
    norm.completedReason === 'THRESHOLD_REACHED'
      ? 'COMPLETE_VOLLEYBALL_MATCH'
      : 'DECLARE_VOLLEYBALL_WINNER_MANUAL',
    'LiveScore',
    score._id.toString(),
    resultDescription,
    {
      previousValue: {
        resultStatus: (preCompletionSnapshot as any).resultStatus || 'NOT_DECLARED',
        sets: `${(preCompletionSnapshot as any).sportSpecificDetails?.teamASetsWon ?? 0}-${(preCompletionSnapshot as any).sportSpecificDetails?.teamBSetsWon ?? 0}`,
      },
      newValue: {
        winnerTeamName: winnerName,
        sets: setsSummary,
        completedReason: norm.completedReason,
        reason,
      },
    }
  );

  await dispatchMatchNotifications({
    type: 'MATCH_COMPLETED',
    title: 'Volleyball Match Completed',
    message: `${stream.matchTitle || `${labelA} vs ${labelB}`}: ${resultDescription}`,
    entityType: 'LiveStream',
    entityId: id,
    link: `/live/${id}`,
    dedupeKey: `volleyball-complete-${id}-${Date.now()}`,
    teamIds: [stream.teamAId, stream.teamBId],
    tournamentId: stream.tournamentId,
    includeAllSpectatorsIfNoFollowers: true,
  });

  const payload = {
    streamId: id,
    score: score.toObject(),
    historyItem: populatedHistory,
  };

  emitStreamEvent(id, 'volleyball:match_completed', payload);
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

  triggerBroadcastGraphicEvent(id, 'MATCH_COMPLETED', `vb_complete_${id}_${Date.now()}`).catch(
    () => {}
  );

  return payload;
}

export async function handleVolleyballRulesRoute(
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
      res.status(403).json({
        message: 'Forbidden: You are not authorized to configure Volleyball rules for this match.',
      });
      return;
    }

    const stream = await resolveVolleyballStream(id);
    const score = stream ? await ensureVolleyballScore(stream._id.toString()) : null;
    if (!stream || !score) {
      res.status(404).json({ message: 'Match not found.' });
      return;
    }

    if (score.sportType !== 'Volleyball') {
      res.status(400).json({ message: 'Match rules route is only applicable to Volleyball matches.' });
      return;
    }

    const lock = isVolleyballScoringLocked(score.sportSpecificDetails, score.resultStatus);
    if (lock.locked) {
      res.status(409).json({ message: lock.reason, locked: true });
      return;
    }

    const incomingRules: Partial<VolleyballRules> = {
      ...(req.body?.rules && typeof req.body.rules === 'object' ? req.body.rules : {}),
      ...(req.body?.bestOfSets !== undefined ? { bestOfSets: Number(req.body.bestOfSets) } : {}),
      ...(req.body?.pointsPerSet !== undefined ? { pointsPerSet: Number(req.body.pointsPerSet) } : {}),
      ...(req.body?.minMargin !== undefined ? { minMargin: Number(req.body.minMargin) } : {}),
      ...(req.body?.finalSetPoints !== undefined
        ? { finalSetPoints: Number(req.body.finalSetPoints) }
        : {}),
      ...(req.body?.finalSetMinMargin !== undefined
        ? { finalSetMinMargin: Number(req.body.finalSetMinMargin) }
        : {}),
      ...(typeof req.body?.autoCompleteSets === 'boolean'
        ? { autoCompleteSets: req.body.autoCompleteSets }
        : {}),
      ...(typeof req.body?.allowManualWinnerDeclaration === 'boolean'
        ? { allowManualWinnerDeclaration: req.body.allowManualWinnerDeclaration }
        : {}),
      ...(typeof req.body?.allowMatchReopen === 'boolean'
        ? { allowMatchReopen: req.body.allowMatchReopen }
        : {}),
    };

    const currentDetails = normalizeVolleyballDetails(score.sportSpecificDetails);
    const mergedProposal = { ...currentDetails.rules, ...incomingRules };
    const validated = validateVolleyballRules(mergedProposal);
    if (!validated.valid) {
      res.status(400).json({ message: validated.error || 'Invalid Volleyball rules.' });
      return;
    }

    const applied = applyVolleyballAction(
      currentDetails,
      score.teamAScore,
      score.teamBScore,
      { type: 'UPDATE_RULES', rules: validated.rules }
    );

    if (applied.blockedReason) {
      res.status(409).json({ message: applied.blockedReason });
      return;
    }

    const previousSnapshot = {
      sportType: score.sportType,
      teamAScore: score.teamAScore,
      teamBScore: score.teamBScore,
      sportSpecificDetails: score.sportSpecificDetails,
      matchStatus: score.matchStatus,
      resultStatus: score.resultStatus,
    };

    score.teamAScore = applied.teamAScore;
    score.teamBScore = applied.teamBScore;
    score.sportSpecificDetails = applied.details as unknown as Record<string, unknown>;
    score.markModified?.('sportSpecificDetails');
    score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
    score.lastUpdatedAt = new Date();
    await score.save();

    const updatedSnapshot = {
      sportType: score.sportType,
      teamAScore: score.teamAScore,
      teamBScore: score.teamBScore,
      sportSpecificDetails: score.sportSpecificDetails,
      matchStatus: score.matchStatus,
      resultStatus: score.resultStatus,
    };

    const historyItem = await ScoreHistory.create({
      liveStreamId: score.liveStreamId,
      entryType: 'SCORE_UPDATE',
      sportType: 'Volleyball',
      eventCategory: 'RULES',
      eventType: 'UPDATE_RULES',
      previousScore: previousSnapshot,
      updatedScore: updatedSnapshot,
      action: applied.label,
      updatedBy: req.user!._id,
    });

    const populatedHistory = await ScoreHistory.findById(historyItem._id)
      .populate('updatedBy', 'name role')
      .lean();

    await recordActivity(
      req.user!,
      'UPDATE_VOLLEYBALL_RULES',
      'LiveScore',
      score._id.toString(),
      applied.label,
      {
        previousValue: { ...currentDetails.rules } as Record<string, unknown>,
        newValue: { ...applied.details.rules } as Record<string, unknown>,
      }
    );

    const payload = {
      streamId: id,
      score: score.toObject(),
      historyItem: populatedHistory,
    };

    emitStreamEvent(id, 'volleyball:rules_updated', payload);
    emitStreamEvent(id, 'score:updated', payload);
    emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populatedHistory });
    res.json(payload);
  } catch (err: any) {
    console.error('[Volleyball] Rules update error:', err);
    res.status(500).json({ message: err?.message || 'Failed to update Volleyball rules.' });
  }
}

export async function handleVolleyballCompleteRoute(
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
      res.status(403).json({
        message: 'Forbidden: You are not authorized to declare a match winner.',
      });
      return;
    }

    const stream = await resolveVolleyballStream(id);
    const score = stream ? await ensureVolleyballScore(stream._id.toString()) : null;
    if (!stream || !score) {
      res.status(404).json({ message: 'Match not found.' });
      return;
    }

    const winnerSide = req.body?.winnerSide === 'A' || req.body?.winnerSide === 'B'
      ? req.body.winnerSide
      : null;
    if (!winnerSide) {
      res.status(400).json({ message: 'winnerSide ("A" or "B") is required to declare winner.' });
      return;
    }

    const norm = normalizeVolleyballDetails(score.sportSpecificDetails as Partial<VolleyballDetails>);
    const elig = getVolleyballCompletionEligibility(norm);

    if (norm.matchCompleted && score.resultStatus !== 'NOT_DECLARED') {
      res.status(409).json({
        message: 'Match is already completed. Reopen the match first to change the declared result.',
      });
      return;
    }

    if (!elig.thresholdReached && !norm.rules.allowManualWinnerDeclaration) {
      res.status(403).json({
        message:
          'Manual winner declaration prior to winning set threshold is disabled by current match rules.',
      });
      return;
    }

    const preCompletionSnapshot = {
      sportType: score.sportType,
      teamAScore: score.teamAScore,
      teamBScore: score.teamBScore,
      sportSpecificDetails: score.sportSpecificDetails,
      matchStatus: score.matchStatus,
      resultStatus: score.resultStatus,
      winnerTeamName: score.winnerTeamName,
      streamStatus: stream.status,
    };

    const payload = await finalizeVolleyballMatchCompletion({
      stream,
      score,
      winnerSide,
      actor: req.user!,
      reason: sanitizeText(req.body?.reason, 240),
      winningMargin: sanitizeText(req.body?.winningMargin, 120),
      resultDescription: sanitizeText(req.body?.resultDescription, 300),
      mvpPlayerId: typeof req.body?.mvpPlayerId === 'string' ? req.body.mvpPlayerId : '',
      mvpPlayerName: sanitizeText(req.body?.mvpPlayerName, 120),
      finalSummary: sanitizeText(req.body?.finalSummary, 500),
      isManualOverride: !elig.thresholdReached,
      preCompletionSnapshot,
    });

    res.json(payload);
  } catch (err: any) {
    console.error('[Volleyball] Complete match error:', err);
    res.status(500).json({ message: err?.message || 'Failed to complete Volleyball match.' });
  }
}

export async function handleVolleyballReopenRoute(
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
      res.status(403).json({
        message: 'Forbidden: Only authorized admins, organizers, or scorers can reopen a match.',
      });
      return;
    }

    const stream = await resolveVolleyballStream(id);
    const score = stream ? await ensureVolleyballScore(stream._id.toString()) : null;
    if (!stream || !score) {
      res.status(404).json({ message: 'Match not found.' });
      return;
    }

    const nextDetails = normalizeVolleyballDetails(
      score.sportSpecificDetails as Partial<VolleyballDetails>
    );

    if (
      !nextDetails.rules.allowMatchReopen &&
      req.user!.role !== 'SUPER_ADMIN' &&
      req.user!.role !== 'ADMIN'
    ) {
      res.status(403).json({
        message: 'Reopening completed matches is restricted to Admins under current match rules.',
      });
      return;
    }

    const reason = sanitizeText(req.body?.reason, 240) || 'Match resumed by authorized controller';

    const prevSnapshot = {
      sportType: score.sportType,
      teamAScore: score.teamAScore,
      teamBScore: score.teamBScore,
      sportSpecificDetails: score.sportSpecificDetails,
      matchStatus: score.matchStatus,
      resultStatus: score.resultStatus,
      winnerTeamName: score.winnerTeamName,
      streamStatus: stream.status,
    };

    const prevWinnerName = score.winnerTeamName;
    const prevWinnerTeamId = score.winnerTeamId;

    // Preserve all actual set scores and points without duplicating or resetting
    nextDetails.matchCompleted = false;
    nextDetails.completedReason = '';
    nextDetails.manualWinnerSide = null;
    nextDetails.manualWinnerReason = '';
    nextDetails.advantageTeam = null;
    nextDetails.isDeuce = false;
    nextDetails.reopenedCount = (nextDetails.reopenedCount || 0) + 1;
    nextDetails.lastReopenedAt = new Date().toISOString();

    score.sportType = 'Volleyball';
    score.sportSpecificDetails = nextDetails as unknown as Record<string, unknown>;
    score.markModified?.('sportSpecificDetails');
    score.resultStatus = 'NOT_DECLARED';
    score.resultType = '';
    score.winnerTeamId = null;
    score.winnerTeamName = '';
    score.winningMargin = '';
    score.resultDescription = '';
    score.declaredBy = null;
    score.declaredByName = '';
    score.declaredAt = null;
    score.matchStatus = 'Live';
    score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
    score.lastUpdatedAt = new Date();
    await score.save();

    if (stream.status === 'ENDED') {
      stream.status = 'LIVE';
      stream.endedAt = null;
      await stream.save();
    }

    await revertVolleyballFixtureOnReopenOrUndo({
      stream,
      previousWinnerName: prevWinnerName,
      previousWinnerTeamId: prevWinnerTeamId,
      actorId: req.user!._id as mongoose.Types.ObjectId,
    });

    const hist = await ScoreHistory.create({
      liveStreamId: score.liveStreamId,
      entryType: 'CORRECTION',
      sportType: 'Volleyball',
      eventCategory: 'CONTROL',
      eventType: 'MATCH_REOPENED',
      details: { reason, reopenedCount: nextDetails.reopenedCount },
      previousScore: prevSnapshot,
      updatedScore: {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
        resultStatus: score.resultStatus,
        streamStatus: stream.status,
      },
      action: `Match reopened / resumed: ${reason}`,
      updatedBy: req.user!._id,
    });

    const populatedHistory = await ScoreHistory.findById(hist._id)
      .populate('updatedBy', 'name role')
      .lean();

    await recordActivity(
      req.user!,
      'REOPEN_VOLLEYBALL_MATCH',
      'LiveScore',
      score._id.toString(),
      `Reopened Volleyball match: ${reason}`,
      {
        previousValue: { resultStatus: prevSnapshot.resultStatus, winnerTeamName: prevWinnerName },
        newValue: {
          resultStatus: 'NOT_DECLARED',
          sets: `${nextDetails.teamASetsWon}-${nextDetails.teamBSetsWon}`,
          reopenedCount: nextDetails.reopenedCount,
        },
      }
    );

    const payload = {
      streamId: id,
      score: score.toObject(),
      historyItem: populatedHistory,
    };

    emitStreamEvent(id, 'volleyball:match_reopened', payload);
    emitStreamEvent(id, 'match:result:updated', { ...payload, isCorrection: true });
    emitStreamEvent(id, 'score:updated', payload);
    emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populatedHistory });
    if (stream.tournamentId) {
      emitTournamentEvent(stream.tournamentId.toString(), 'tournament:points_updated', {
        tournamentId: stream.tournamentId.toString(),
        streamId: id,
        resultStatus: 'NOT_DECLARED',
        winnerTeamId: null,
      });
    }

    res.json(payload);
  } catch (err: any) {
    console.error('[Volleyball] Reopen match error:', err);
    res.status(500).json({ message: err?.message || 'Failed to reopen Volleyball match.' });
  }
}
