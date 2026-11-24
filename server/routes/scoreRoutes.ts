import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { LiveStream } from '../models/LiveStream.ts';
import type { SportType } from '../models/LiveStream.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { ScoreHistory } from '../models/ScoreHistory.ts';
import { Fixture } from '../models/Fixture.ts';
import { Player } from '../models/Player.ts';
import { PlayerMatchStat } from '../models/PlayerMatchStat.ts';
import { Team } from '../models/Team.ts';
import {
  authenticate,
  canManageStream,
  requireAdminPortal,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { getInitialSportDetails } from '../../src/utils/scoringEngine.ts';
import { applyKabaddiAction } from '../../src/utils/kabaddiScoring.ts';
import type { KabaddiDetails } from '../../src/utils/kabaddiScoring.ts';
import {
  applyCricketAction,
  computeCricketChaseState,
  isBowlerCreditedWicket,
  isCricketScoringLocked,
  normalizeCricketDetails,
} from '../../src/utils/cricketScoring.ts';
import type { CricketDetails } from '../../src/utils/cricketScoring.ts';
import {
  applyVolleyballAction,
  createInitialVolleyballDetails,
  getVolleyballCompletionEligibility,
  isVolleyballScoringLocked,
  normalizeVolleyballDetails,
} from '../../src/utils/volleyballScoring.ts';
import type { VolleyballDetails } from '../../src/utils/volleyballScoring.ts';
import { applyFootballAction } from '../../src/utils/footballScoring.ts';
import type { FootballDetails } from '../../src/utils/footballScoring.ts';
import { validateMatchResult } from '../../src/utils/matchResultValidation.ts';
import type { MatchResultType } from '../../src/utils/matchResultValidation.ts';
import { sanitizeText } from '../utils/sanitize.ts';
import { emitStreamEvent, emitTournamentEvent } from '../socket/index.ts';
import { recordActivity } from '../utils/audit.ts';
import { runWithOptionalTransaction } from '../utils/dbTransaction.ts';
import { dispatchMatchNotifications } from '../utils/notifications.ts';
import { triggerBroadcastGraphicEvent } from '../services/broadcastGraphicsService.ts';
import {
  applyKabaddiPlayerStatDeltas,
  handleKabaddiClockRoute,
  handleKabaddiCompleteRoute,
  handleKabaddiEventRoute,
  handleKabaddiReopenRoute,
  handleKabaddiSettingsRoute,
} from '../utils/kabaddiServerEngine.ts';
import {
  finalizeVolleyballMatchCompletion,
  handleVolleyballCompleteRoute,
  handleVolleyballReopenRoute,
  handleVolleyballRulesRoute,
  revertVolleyballFixtureOnReopenOrUndo,
} from '../utils/volleyballServerEngine.ts';

const router = Router();

async function ensureLiveScore(streamId: string, session: any = null) {
  let score = await LiveScore.findOne({ liveStreamId: streamId }).session(session);
  if (!score) {
    const stream = await LiveStream.findById(streamId).session(session);
    if (!stream) return null;
    const sport: SportType = (stream.gameName as SportType) || 'Other';
    const created = await LiveScore.create(
      [
        {
          liveStreamId: stream._id,
          sportType: sport,
          teamAScore: 0,
          teamBScore: 0,
          sportSpecificDetails: getInitialSportDetails(sport),
          matchStatus:
            stream.status === 'ENDED'
              ? 'Completed'
              : stream.status === 'UPCOMING'
                ? stream.broadcastPublished === false
                  ? 'Prepared'
                  : 'Upcoming'
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

async function applyStatUpdateForStructuredEvent(params: {
  stream: any;
  sportType: SportType;
  action: any;
  playerId?: string;
  assistPlayerId?: string;
  actorId: mongoose.Types.ObjectId;
  session: any;
}) {
  const { stream, sportType, action, playerId, assistPlayerId, actorId, session } = params;

  const incStat = async (
    pid: string,
    teamSide: 'A' | 'B' | '',
    incObj: Record<string, number>
  ) => {
    if (!pid || !mongoose.Types.ObjectId.isValid(pid)) return;
    const player = await Player.findById(pid).session(session);
    if (!player) return;
    const teamId =
      player.teamId ||
      (teamSide === 'A' ? stream.teamAId : teamSide === 'B' ? stream.teamBId : null);

    await PlayerMatchStat.findOneAndUpdate(
      { liveStreamId: stream._id, playerId: player._id },
      {
        $setOnInsert: {
          liveStreamId: stream._id,
          tournamentId: stream.tournamentId || null,
          teamId: teamId || null,
          playerId: player._id,
          sportType,
          appearances: 1,
        },
        $set: { updatedBy: actorId },
        $inc: incObj,
      },
      { upsert: true, new: true, session: session || undefined }
    );
  };

  if (sportType === 'Kabaddi' && action?.type === 'STRUCTURED_EVENT' && playerId) {
    const pts = Math.max(0, Math.trunc(action.points || 0));
    const bonusPart = Math.max(0, Math.min(pts, Math.trunc(action.bonusIncluded || 0)));
    const inc: Record<string, number> = {};
    if (action.eventType === 'BONUS_POINT') {
      inc.bonusPoints = pts > 0 ? pts : 1;
    } else if (action.eventType === 'SUPER_RAID') {
      const total = Math.max(3, pts);
      inc.superRaids = 1;
      inc.raidPoints = total - Math.min(bonusPart, total);
      if (bonusPart > 0) inc.bonusPoints = Math.min(bonusPart, total);
    } else if (
      ['SUCCESSFUL_TACKLE', 'TEAM_TACKLE', 'MULTI_POINT_TACKLE', 'CUSTOM_TACKLE'].includes(
        action.eventType
      )
    ) {
      inc.tacklePoints = pts > 0 ? pts : 1;
    } else if (action.eventType === 'SUPER_TACKLE') {
      inc.superTackles = 1;
      inc.tacklePoints = pts >= 2 ? pts : 2;
    } else if (
      ['SUCCESSFUL_RAID', 'MULTI_POINT_RAID', 'DO_OR_DIE_RAID', 'CUSTOM_RAID'].includes(
        action.eventType
      )
    ) {
      if (pts >= 3) inc.superRaids = 1;
      inc.raidPoints = Math.max(0, pts - bonusPart);
      if (bonusPart > 0) inc.bonusPoints = bonusPart;
    }
    if (Object.keys(inc).length > 0) {
      await incStat(playerId, action.team || '', inc);
    }
  } else if (
    sportType === 'Cricket' &&
    (action?.type === 'STRUCTURED_DELIVERY' ||
      ['RUNS', 'WIDE', 'NO_BALL', 'BYE', 'LEG_BYE', 'WICKET'].includes(String(action?.type || '')))
  ) {
    const batRuns = Math.max(
      0,
      Math.trunc(
        action.type === 'RUNS'
          ? action.runs || 0
          : action.type === 'NO_BALL' || action.type === 'WICKET' || action.type === 'STRUCTURED_DELIVERY'
            ? action.batRuns || 0
            : 0
      )
    );
    const extraType =
      action.extraType ||
      (action.type === 'WIDE'
        ? 'WIDE'
        : action.type === 'NO_BALL'
          ? 'NO_BALL'
          : action.type === 'BYE'
            ? 'BYE'
            : action.type === 'LEG_BYE'
              ? 'LEG_BYE'
              : 'NONE');
    const extraRuns = Math.max(
      0,
      Math.trunc(
        action.type === 'WIDE'
          ? 1 + (action.extraRuns || 0)
          : action.type === 'NO_BALL'
            ? 1 + (action.extraRuns || 0)
            : action.type === 'BYE' || action.type === 'LEG_BYE'
              ? action.runs || 0
              : action.extraRuns || 0
      )
    );
    const isLegal =
      typeof action.countsAsLegalBall === 'boolean'
        ? action.countsAsLegalBall
        : extraType !== 'WIDE' && extraType !== 'NO_BALL' && action.eventType !== 'PENALTY_RUNS';
    const isWicket = Boolean(action.isWicket || action.type === 'WICKET');

    if (playerId) {
      const inc: Record<string, number> = {};
      if (batRuns > 0) inc.runs = batRuns;
      if (isLegal) inc.ballsFaced = 1;
      if (batRuns === 4) inc.fours = 1;
      if (batRuns === 6) inc.sixes = 1;
      if (Object.keys(inc).length > 0) {
        await incStat(playerId, '', inc);
      }
    }
    if (assistPlayerId) {
      const bowlerInc: Record<string, number> = {};
      if (isLegal) bowlerInc.oversBowledBalls = 1;
      const bowlerRuns =
        batRuns + (extraType === 'WIDE' || extraType === 'NO_BALL' ? extraRuns : 0);
      if (bowlerRuns > 0) bowlerInc.runsConceded = bowlerRuns;
      if (isWicket && isBowlerCreditedWicket(action.wicketType)) {
        bowlerInc.wickets = 1;
      }
      if (Object.keys(bowlerInc).length > 0) {
        await incStat(assistPlayerId, '', bowlerInc);
      }
    }
  } else if (sportType === 'Volleyball' && action?.type === 'STRUCTURED_POINT' && playerId) {
    const inc: Record<string, number> = {};
    if (action.eventType === 'ATTACK_POINT') inc.attackPoints = 1;
    else if (action.eventType === 'BLOCK_POINT') inc.blockPoints = 1;
    else if (action.eventType === 'SERVICE_ACE') inc.serveAces = 1;
    if (Object.keys(inc).length > 0) {
      await incStat(playerId, action.team || '', inc);
    }
  } else if (sportType === 'Football' && action?.type === 'STRUCTURED_EVENT') {
    if (playerId) {
      const inc: Record<string, number> = {};
      if (action.eventType === 'GOAL' || action.eventType === 'PENALTY_GOAL') inc.goals = 1;
      else if (action.eventType === 'YELLOW_CARD') inc.yellowCards = 1;
      else if (action.eventType === 'RED_CARD') inc.redCards = 1;
      else if (action.eventType === 'SECOND_YELLOW') {
        inc.yellowCards = 1;
        inc.redCards = 1;
      }
      if (Object.keys(inc).length > 0) {
        await incStat(playerId, action.team || '', inc);
      }
    }
    if (
      assistPlayerId &&
      (action.eventType === 'GOAL' || action.eventType === 'PENALTY_GOAL')
    ) {
      await incStat(assistPlayerId, action.team || '', { assists: 1 });
    }
  }
}

// GET /api/live/:id/score
router.get('/:id/score', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const score = await ensureLiveScore(id);
    if (!score) {
      res.status(404).json({ message: 'Stream not found.' });
      return;
    }

    res.json({ score });
  } catch (err) {
    console.error('[Score] Get error:', err);
    res.status(500).json({ message: 'Failed to load scoreboard.' });
  }
});

// PATCH /api/live/:id/score
router.patch(
  '/:id/score',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'score');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to update scores for this stream.',
        });
        return;
      }

      const score = await ensureLiveScore(id);
      if (!score) {
        res.status(404).json({ message: 'Live stream not found.' });
        return;
      }

      if (score.sportType === 'Cricket') {
        const lockCheck = isCricketScoringLocked(
          (score.sportSpecificDetails || {}) as Partial<CricketDetails>
        );
        const incomingDetails =
          req.body.sportSpecificDetails && typeof req.body.sportSpecificDetails === 'object'
            ? (req.body.sportSpecificDetails as Record<string, unknown>)
            : null;
        const currD = (score.sportSpecificDetails || {}) as Record<string, unknown>;
        const mutatingScoreValues =
          (typeof req.body.teamAScore === 'number' && req.body.teamAScore !== score.teamAScore) ||
          (typeof req.body.teamBScore === 'number' && req.body.teamBScore !== score.teamBScore) ||
          Boolean(
            incomingDetails &&
              (Number(incomingDetails.teamARuns ?? currD.teamARuns) !== Number(currD.teamARuns ?? 0) ||
                Number(incomingDetails.teamBRuns ?? currD.teamBRuns) !== Number(currD.teamBRuns ?? 0) ||
                Number(incomingDetails.teamABalls ?? currD.teamABalls) !== Number(currD.teamABalls ?? 0) ||
                Number(incomingDetails.teamBBalls ?? currD.teamBBalls) !== Number(currD.teamBBalls ?? 0) ||
                Number(incomingDetails.teamAWickets ?? currD.teamAWickets) !== Number(currD.teamAWickets ?? 0) ||
                Number(incomingDetails.teamBWickets ?? currD.teamBWickets) !== Number(currD.teamBWickets ?? 0))
          );

        if (lockCheck.locked && mutatingScoreValues && req.body.allowLockedOverride !== true) {
          res.status(409).json({ message: lockCheck.reason, locked: true });
          return;
        }
      }

      const targetSport =
        typeof req.body.sportType === 'string' &&
        ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'].includes(req.body.sportType)
          ? (req.body.sportType as SportType)
          : score.sportType;

      let volleyballAutoWinnerSide: 'A' | 'B' | null = null;
      if (score.sportType === 'Volleyball' && targetSport === 'Volleyball') {
        const vbLock = isVolleyballScoringLocked(score.sportSpecificDetails, score.resultStatus);
        const mutatingVolleyballScore =
          typeof req.body.teamAScore === 'number' ||
          typeof req.body.teamBScore === 'number' ||
          Boolean(req.body.sportSpecificDetails);
        if (
          vbLock.locked &&
          mutatingVolleyballScore &&
          req.body.allowPostCompletionOverride !== true
        ) {
          res.status(409).json({ message: vbLock.reason, locked: true });
          return;
        }
      }

      const streamDocForPrev =
        score.sportType === 'Volleyball' ? await LiveStream.findById(id).lean() : null;
      const previousSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
        resultStatus: score.resultStatus,
        ...(streamDocForPrev ? { streamStatus: streamDocForPrev.status } : {}),
      };

      if (typeof req.body.teamAScore === 'number' && Number.isFinite(req.body.teamAScore)) {
        score.teamAScore = Math.max(0, Math.floor(req.body.teamAScore));
      }
      if (typeof req.body.teamBScore === 'number' && Number.isFinite(req.body.teamBScore)) {
        score.teamBScore = Math.max(0, Math.floor(req.body.teamBScore));
      }
      if (
        req.body.sportSpecificDetails &&
        typeof req.body.sportSpecificDetails === 'object' &&
        !Array.isArray(req.body.sportSpecificDetails)
      ) {
        if (targetSport === 'Volleyball') {
          const prevVb = normalizeVolleyballDetails(score.sportSpecificDetails);
          const normVb = normalizeVolleyballDetails(
            req.body.sportSpecificDetails as Partial<VolleyballDetails>
          );
          if (!prevVb.matchCompleted && normVb.matchCompleted) {
            const elig = getVolleyballCompletionEligibility(normVb);
            volleyballAutoWinnerSide =
              elig.thresholdWinnerSide ||
              (normVb.teamASetsWon > normVb.teamBSetsWon
                ? 'A'
                : normVb.teamBSetsWon > normVb.teamASetsWon
                  ? 'B'
                  : null);
          }
          score.sportSpecificDetails = normVb as unknown as Record<string, unknown>;
        } else {
          score.sportSpecificDetails = req.body.sportSpecificDetails;
        }
      }
      if (typeof req.body.matchStatus === 'string' && req.body.matchStatus.trim()) {
        score.matchStatus = sanitizeText(req.body.matchStatus, 80);
      }
      if (
        typeof req.body.sportType === 'string' &&
        ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'].includes(req.body.sportType)
      ) {
        score.sportType = req.body.sportType as SportType;
      }
      if (req.body.tossWinner === 'A' || req.body.tossWinner === 'B' || req.body.tossWinner === '') {
        score.tossWinner = req.body.tossWinner;
      }
      if (typeof req.body.tossDecision === 'string') {
        score.tossDecision = sanitizeText(req.body.tossDecision, 40);
      }

      score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
      score.lastUpdatedAt = new Date();
      score.markModified?.('sportSpecificDetails');
      await score.save();

      const updatedSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const actionLabel = sanitizeText(req.body.action, 200) || 'Score updated';

      const historyItem = await ScoreHistory.create({
        liveStreamId: score.liveStreamId,
        entryType: 'SCORE_UPDATE',
        sportType: score.sportType,
        previousScore: previousSnapshot,
        updatedScore: updatedSnapshot,
        action: actionLabel,
        updatedBy: req.user!._id,
      });

      if (
        score.sportType === 'Volleyball' &&
        volleyballAutoWinnerSide &&
        score.resultStatus === 'NOT_DECLARED'
      ) {
        const streamDoc = await LiveStream.findById(id);
        if (streamDoc) {
          const completionPayload = await finalizeVolleyballMatchCompletion({
            stream: streamDoc,
            score,
            winnerSide: volleyballAutoWinnerSide,
            actor: req.user!,
            preCompletionSnapshot: previousSnapshot,
            pairedScoreEventId: historyItem._id as mongoose.Types.ObjectId,
          });
          res.json(completionPayload);
          return;
        }
      }

      const populatedHistory = await ScoreHistory.findById(historyItem._id)
        .populate('updatedBy', 'name role')
        .lean();

      const payload = {
        streamId: id,
        score: score.toObject(),
        historyItem: populatedHistory,
      };

      emitStreamEvent(id, 'score:updated', payload);
      emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populatedHistory });
      res.json(payload);
    } catch (err) {
      console.error('[Score] Update error:', err);
      res.status(500).json({ message: 'Failed to update score.' });
    }
  }
);

// POST /api/live/:id/score/event - Structured multi-point & delivery scoring with duplicate guard
async function handleStructuredScoreEvent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'score');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to record score events for this stream.',
        });
        return;
      }

      const clientEventId = sanitizeText(req.body.clientEventId, 100);
      if (clientEventId) {
        const existingEvent = await ScoreHistory.findOne({
          liveStreamId: id,
          clientEventId,
        })
          .populate('updatedBy', 'name role')
          .lean();
        if (existingEvent) {
          const existingScore = await LiveScore.findOne({ liveStreamId: id }).lean();
          res.json({
            streamId: id,
            score: existingScore,
            historyItem: existingEvent,
            duplicatePrevented: true,
          });
          return;
        }
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Live stream not found.' });
        return;
      }

      const playerId =
        typeof req.body.playerId === 'string' && mongoose.Types.ObjectId.isValid(req.body.playerId)
          ? req.body.playerId
          : '';
      const assistPlayerId =
        typeof req.body.assistPlayerId === 'string' &&
        mongoose.Types.ObjectId.isValid(req.body.assistPlayerId)
          ? req.body.assistPlayerId
          : '';

      const actionPayload = req.body.action;
      if (!actionPayload || typeof actionPayload !== 'object') {
        res.status(400).json({ message: 'Valid scoring action payload is required.' });
        return;
      }

      const txResult = await runWithOptionalTransaction(async (session) => {
        const score = await ensureLiveScore(id, session);
        if (!score) return null;

        const sport = (req.body.sportType as SportType) || score.sportType || 'Other';

        const isCricketDeliveryMutation =
          sport === 'Cricket' &&
          [
            'RUNS',
            'WIDE',
            'NO_BALL',
            'BYE',
            'LEG_BYE',
            'WICKET',
            'END_OVER',
            'STRUCTURED_DELIVERY',
          ].includes(String(actionPayload.type || ''));

        if (isCricketDeliveryMutation) {
          const lockCheck = isCricketScoringLocked(
            (score.sportSpecificDetails || {}) as Partial<CricketDetails>
          );
          if (lockCheck.locked) {
            return { locked: true as const, reason: lockCheck.reason };
          }
        }

        if (sport === 'Volleyball') {
          const vbLock = isVolleyballScoringLocked(score.sportSpecificDetails, score.resultStatus);
          if (vbLock.locked && req.body.allowPostCompletionOverride !== true) {
            return { locked: true as const, reason: vbLock.reason };
          }
        }

        const previousSnapshot = {
          sportType: score.sportType,
          teamAScore: score.teamAScore,
          teamBScore: score.teamBScore,
          sportSpecificDetails: score.sportSpecificDetails,
          matchStatus: score.matchStatus,
          resultStatus: score.resultStatus,
          streamStatus: stream.status,
        };

        let nextDetails: Record<string, unknown> = (score.sportSpecificDetails || {}) as Record<
          string,
          unknown
        >;
        let nextTeamAScore = score.teamAScore;
        let nextTeamBScore = score.teamBScore;
        let label = sanitizeText(req.body.label, 240) || 'Score event recorded';
        let pointsAwarded = 0;
        let eventCategory = sanitizeText(req.body.eventCategory, 60) || sport.toUpperCase();
        let eventType = sanitizeText(req.body.eventType, 80) || actionPayload.type || 'CUSTOM_EVENT';
        let teamSide: 'A' | 'B' | '' =
          actionPayload.team === 'A' || actionPayload.team === 'B' ? actionPayload.team : '';
        let autoCompletedInnings1 = false;
        let autoCompletedMatch = false;
        let autoWinnerSide: 'A' | 'B' | null = null;
        let cricketWicketEvent = false;

        if (sport === 'Kabaddi') {
          const applied = applyKabaddiAction(
            nextDetails as unknown as KabaddiDetails,
            score.teamAScore,
            score.teamBScore,
            actionPayload
          );
          nextDetails = applied.details as unknown as Record<string, unknown>;
          nextTeamAScore = applied.teamAScore;
          nextTeamBScore = applied.teamBScore;
          label = applied.label;
          pointsAwarded = applied.pointsAwarded;
          eventCategory = applied.eventCategory;
          eventType = applied.eventType;
        } else if (sport === 'Cricket') {
          const applied = applyCricketAction(
            nextDetails as unknown as CricketDetails,
            actionPayload
          );
          nextDetails = applied.details as unknown as Record<string, unknown>;
          nextTeamAScore = applied.teamAScore;
          nextTeamBScore = applied.teamBScore;
          label = applied.label;
          pointsAwarded = applied.pointsAwarded;
          eventCategory = applied.eventCategory;
          eventType = applied.eventType;
          teamSide = applied.details.battingTeam;
          autoCompletedInnings1 = Boolean(applied.autoCompletedInnings1);
          autoCompletedMatch = Boolean(applied.autoCompletedMatch);
          cricketWicketEvent = Boolean(
            actionPayload.isWicket || actionPayload.type === 'WICKET' || eventType === 'WICKET'
          );
          if (applied.details.tossWinner) score.tossWinner = applied.details.tossWinner;
          if (applied.details.tossDecision) score.tossDecision = applied.details.tossDecision;
        } else if (sport === 'Volleyball') {
          const applied = applyVolleyballAction(
            nextDetails as unknown as VolleyballDetails,
            score.teamAScore,
            score.teamBScore,
            actionPayload
          );
          if (applied.blockedReason) {
            return { locked: true as const, reason: applied.blockedReason };
          }
          nextDetails = applied.details as unknown as Record<string, unknown>;
          nextTeamAScore = applied.teamAScore;
          nextTeamBScore = applied.teamBScore;
          label = applied.label;
          pointsAwarded = applied.pointsAwarded;
          eventCategory = applied.eventCategory;
          eventType = applied.eventType;
          autoCompletedMatch = Boolean(applied.autoCompletedMatch);
          autoWinnerSide = applied.autoWinnerSide || null;
        } else if (sport === 'Football') {
          const applied = applyFootballAction(
            nextDetails as unknown as FootballDetails,
            score.teamAScore,
            score.teamBScore,
            actionPayload
          );
          nextDetails = applied.details as unknown as Record<string, unknown>;
          nextTeamAScore = applied.teamAScore;
          nextTeamBScore = applied.teamBScore;
          label = applied.label;
          pointsAwarded = applied.pointsAwarded;
          eventCategory = applied.eventCategory;
          eventType = applied.eventType;
        } else {
          const deltaA = Number(actionPayload.deltaA || 0);
          const deltaB = Number(actionPayload.deltaB || 0);
          nextTeamAScore = Math.max(0, score.teamAScore + (Number.isFinite(deltaA) ? deltaA : 0));
          nextTeamBScore = Math.max(0, score.teamBScore + (Number.isFinite(deltaB) ? deltaB : 0));
          pointsAwarded = (deltaA || 0) + (deltaB || 0);
          if (actionPayload.description) {
            label = sanitizeText(actionPayload.description, 240);
          }
        }

        score.sportType = sport;
        score.teamAScore = nextTeamAScore;
        score.teamBScore = nextTeamBScore;
        score.sportSpecificDetails = nextDetails;
        score.markModified?.('sportSpecificDetails');
        if (autoCompletedInnings1) {
          score.matchStatus = 'INNINGS BREAK';
        } else if (autoCompletedMatch && sport === 'Cricket') {
          const chaseEval = computeCricketChaseState(
            nextDetails as unknown as CricketDetails,
            stream.teamAName || 'Team A',
            stream.teamBName || 'Team B'
          );
          score.matchStatus = chaseEval.outcome === 'TIED' ? 'Tied' : 'Completed';
        } else if (autoCompletedMatch && sport === 'Volleyball') {
          score.matchStatus = 'Completed';
        } else if (typeof req.body.matchStatus === 'string' && req.body.matchStatus.trim()) {
          score.matchStatus = sanitizeText(req.body.matchStatus, 80);
        }
        score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
        score.lastUpdatedAt = new Date();
        await score.save({ session: session || undefined });

        const updatedSnapshot = {
          sportType: score.sportType,
          teamAScore: score.teamAScore,
          teamBScore: score.teamBScore,
          sportSpecificDetails: score.sportSpecificDetails,
          matchStatus: score.matchStatus,
        };

        const teamId =
          teamSide === 'A'
            ? stream.teamAId || null
            : teamSide === 'B'
              ? stream.teamBId || null
              : null;

        const createdHistory = await ScoreHistory.create(
          [
            {
              liveStreamId: score.liveStreamId,
              entryType: 'SCORE_UPDATE',
              sportType: score.sportType,
              teamSide,
              teamId,
              eventCategory,
              eventType,
              pointsAwarded,
              playerId: playerId ? new mongoose.Types.ObjectId(playerId) : null,
              playerName: sanitizeText(
                req.body.playerName || actionPayload.playerName || actionPayload.dismissedPlayer,
                120
              ),
              assistPlayerId: assistPlayerId ? new mongoose.Types.ObjectId(assistPlayerId) : null,
              assistPlayerName: sanitizeText(
                req.body.assistPlayerName || actionPayload.assistPlayerName || actionPayload.bowler,
                120
              ),
              eventPhase: sanitizeText(req.body.eventPhase, 60),
              details: actionPayload,
              clientEventId,
              previousScore: previousSnapshot,
              updatedScore: updatedSnapshot,
              action: label.slice(0, 280),
              updatedBy: req.user!._id,
            },
          ],
          { session: session || undefined }
        );

        await applyStatUpdateForStructuredEvent({
          stream,
          sportType: sport,
          action: actionPayload,
          playerId,
          assistPlayerId,
          actorId: req.user!._id as mongoose.Types.ObjectId,
          session,
        });

        return {
          locked: false as const,
          score,
          historyId: createdHistory[0]._id,
          previousSnapshot,
          autoCompletedInnings1,
          autoCompletedMatch,
          autoWinnerSide,
          cricketWicketEvent,
          eventType,
          actionLabel: label,
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

      // If 2nd innings (Cricket) or winning set threshold (Volleyball) auto-completed the match, officially declare result & sync linked fixture
      let finalScoreObj = txResult.score.toObject();
      let resultHistoryItem: any = null;
      if (
        txResult.autoCompletedMatch &&
        txResult.score.sportType === 'Volleyball' &&
        txResult.autoWinnerSide &&
        txResult.score.resultStatus === 'NOT_DECLARED'
      ) {
        const vbPayload = await finalizeVolleyballMatchCompletion({
          stream,
          score: txResult.score,
          winnerSide: txResult.autoWinnerSide,
          actor: req.user!,
          preCompletionSnapshot: txResult.previousSnapshot,
          pairedScoreEventId: txResult.historyId as mongoose.Types.ObjectId,
        });
        finalScoreObj = vbPayload.score;
        resultHistoryItem = vbPayload.historyItem;
      } else if (
        txResult.autoCompletedMatch &&
        txResult.score.sportType === 'Cricket' &&
        txResult.score.resultStatus === 'NOT_DECLARED'
      ) {
        const d = normalizeCricketDetails(
          (txResult.score.sportSpecificDetails || {}) as Partial<CricketDetails>
        );
        const chase = computeCricketChaseState(
          d,
          stream.teamAName || 'Team A',
          stream.teamBName || 'Team B'
        );
        const resScore = txResult.score;
        const winSide = chase.winnerSide;
        const winnerName =
          winSide === 'A'
            ? stream.teamAName || 'Team A'
            : winSide === 'B'
              ? stream.teamBName || 'Team B'
              : '';
        resScore.resultStatus = chase.outcome === 'TIED' ? 'TIE' : 'DECLARED';
        resScore.resultType =
          winSide === 'A' ? 'TEAM_A_WON' : winSide === 'B' ? 'TEAM_B_WON' : 'TIE';
        resScore.winnerTeamId =
          winSide === 'A' ? stream.teamAId || null : winSide === 'B' ? stream.teamBId || null : null;
        resScore.winnerTeamName = winnerName;
        resScore.winningMargin = chase.winningMarginText;
        resScore.resultDescription = chase.chaseSummaryText;
        resScore.declaredBy = req.user!._id as mongoose.Types.ObjectId;
        resScore.declaredByName = req.user!.name || req.user!.email;
        resScore.declaredAt = new Date();
        resScore.matchStatus = chase.outcome === 'TIED' ? 'Tied' : 'Completed';
        await resScore.save();
        finalScoreObj = resScore.toObject();

        const linkedFixture = await Fixture.findOne({ liveStreamId: stream._id });
        if (linkedFixture) {
          linkedFixture.status = 'COMPLETED';
          linkedFixture.resultConfirmed = true;
          linkedFixture.resultSummary = resScore.resultDescription;
          linkedFixture.winnerTeamId = resScore.winnerTeamId || null;
          linkedFixture.winnerTeamName = resScore.winnerTeamName || '';
          linkedFixture.updatedBy = req.user!._id as mongoose.Types.ObjectId;
          await linkedFixture.save();

          if (linkedFixture.nextFixtureId && (winSide === 'A' || winSide === 'B')) {
            const nextFixture = await Fixture.findById(linkedFixture.nextFixtureId);
            if (nextFixture) {
              const winnerTeamDoc = resScore.winnerTeamId
                ? await Team.findById(resScore.winnerTeamId).lean()
                : null;
              const winLogo =
                winnerTeamDoc?.logoUrl ||
                (winSide === 'A' ? stream.teamALogo : stream.teamBLogo) ||
                '';
              if (linkedFixture.nextFixtureSlot === 'B') {
                nextFixture.teamBId = resScore.winnerTeamId || null;
                nextFixture.teamBName = winnerName;
                nextFixture.teamBLogo = winLogo;
              } else {
                nextFixture.teamAId = resScore.winnerTeamId || null;
                nextFixture.teamAName = winnerName;
                nextFixture.teamALogo = winLogo;
              }
              nextFixture.updatedBy = req.user!._id as mongoose.Types.ObjectId;
              await nextFixture.save();
            }
          }
        }

        const rHist = await ScoreHistory.create({
          liveStreamId: resScore.liveStreamId,
          entryType: 'RESULT',
          sportType: resScore.sportType,
          previousScore: {
            sportType: resScore.sportType,
            teamAScore: resScore.teamAScore,
            teamBScore: resScore.teamBScore,
            sportSpecificDetails: resScore.sportSpecificDetails,
            matchStatus: 'Live',
          },
          updatedScore: {
            sportType: resScore.sportType,
            teamAScore: resScore.teamAScore,
            teamBScore: resScore.teamBScore,
            sportSpecificDetails: resScore.sportSpecificDetails,
            matchStatus: resScore.matchStatus,
            resultStatus: resScore.resultStatus,
            winnerTeamName: resScore.winnerTeamName,
          },
          action: `Official Result: ${resScore.resultDescription}`,
          updatedBy: req.user!._id,
        });
        resultHistoryItem = await ScoreHistory.findById(rHist._id)
          .populate('updatedBy', 'name role')
          .lean();

        emitStreamEvent(id, 'match:result:declared', {
          streamId: id,
          score: finalScoreObj,
          historyItem: resultHistoryItem,
          isCorrection: false,
        });
        emitStreamEvent(id, 'cricket:match_completed', {
          streamId: id,
          score: finalScoreObj,
          chaseState: chase,
        });
        if (stream.tournamentId) {
          emitTournamentEvent(stream.tournamentId.toString(), 'tournament:points_updated', {
            tournamentId: stream.tournamentId.toString(),
            streamId: id,
            resultStatus: resScore.resultStatus,
            winnerTeamId: resScore.winnerTeamId ? resScore.winnerTeamId.toString() : null,
          });
        }
        await dispatchMatchNotifications({
          type: 'MATCH_COMPLETED',
          title: 'Match Completed',
          message: `${stream.matchTitle || `${stream.teamAName} vs ${stream.teamBName}`}: ${resScore.resultDescription}`,
          entityType: 'LiveStream',
          entityId: stream._id.toString(),
          link: `/live/${stream._id.toString()}`,
          dedupeKey: `cricket-complete-${stream._id.toString()}`,
          teamIds: [stream.teamAId, stream.teamBId],
          tournamentId: stream.tournamentId,
          includeAllSpectatorsIfNoFollowers: true,
        });
      }

      const populatedHistory = await ScoreHistory.findById(txResult.historyId)
        .populate('updatedBy', 'name role')
        .lean();

      const payload = {
        streamId: id,
        score: finalScoreObj,
        historyItem: populatedHistory,
        duplicatePrevented: false,
      };

      emitStreamEvent(id, 'score:event:created', payload);
      emitStreamEvent(id, 'score:updated', payload);
      emitStreamEvent(id, 'match:timeline:updated', {
        streamId: id,
        historyItem: resultHistoryItem || populatedHistory,
      });

      if (txResult.autoCompletedInnings1) {
        const d = normalizeCricketDetails(
          (finalScoreObj.sportSpecificDetails || {}) as Partial<CricketDetails>
        );
        emitStreamEvent(id, 'cricket:innings_completed', payload);
        await dispatchMatchNotifications({
          type: 'INNINGS_BREAK',
          title: 'Innings Break',
          message: `${stream.matchTitle || `${stream.teamAName} vs ${stream.teamBName}`}: 1st Innings completed · Target ${d.target}`,
          entityType: 'LiveStream',
          entityId: stream._id.toString(),
          link: `/live/${stream._id.toString()}`,
          dedupeKey: `innings-break-${stream._id.toString()}`,
          teamIds: [stream.teamAId, stream.teamBId],
          tournamentId: stream.tournamentId,
          includeAllSpectatorsIfNoFollowers: true,
        });
      } else if (txResult.cricketWicketEvent && !txResult.autoCompletedMatch) {
        await dispatchMatchNotifications({
          type: 'WICKET',
          title: 'Wicket Alert!',
          message: `${stream.matchTitle || `${stream.teamAName} vs ${stream.teamBName}`}: ${txResult.actionLabel}`,
          entityType: 'LiveStream',
          entityId: stream._id.toString(),
          link: `/live/${stream._id.toString()}`,
          dedupeKey: `wicket-${stream._id.toString()}-${txResult.historyId.toString()}`,
          teamIds: [stream.teamAId, stream.teamBId],
          tournamentId: stream.tournamentId,
          includeAllSpectatorsIfNoFollowers: false,
        });
      }

      // Optional Event-Based Sponsor Graphics (with server-side cooldowns & dedupe)
      const histId = txResult.historyId ? String(txResult.historyId) : `${Date.now()}`;
      const rawActType = String(actionPayload?.type || '').toUpperCase();
      const rawEvType = String(actionPayload?.eventType || txResult.eventType || '').toUpperCase();
      const batRuns = Number(actionPayload?.batRuns ?? actionPayload?.runs ?? 0);
      const activeSport = txResult.score.sportType;
      if (txResult.autoCompletedMatch) {
        triggerBroadcastGraphicEvent(id, 'MATCH_COMPLETED', `score_${histId}`).catch(() => {});
      } else if (txResult.autoCompletedInnings1 || rawEvType === 'INNINGS_BREAK' || rawEvType === 'MATCH_BREAK') {
        triggerBroadcastGraphicEvent(id, 'MATCH_BREAK', `score_${histId}`).catch(() => {});
      } else if (txResult.cricketWicketEvent) {
        triggerBroadcastGraphicEvent(id, 'WICKET', `score_${histId}`).catch(() => {});
      } else if (
        activeSport === 'Cricket' &&
        (batRuns === 6 || rawEvType === 'SIX') &&
        rawActType !== 'WIDE' &&
        rawActType !== 'NO_BALL'
      ) {
        triggerBroadcastGraphicEvent(id, 'SIX', `score_${histId}`).catch(() => {});
      } else if (
        activeSport === 'Cricket' &&
        (batRuns === 4 || rawEvType === 'FOUR') &&
        rawActType !== 'WIDE' &&
        rawActType !== 'NO_BALL'
      ) {
        triggerBroadcastGraphicEvent(id, 'FOUR', `score_${histId}`).catch(() => {});
      } else if (rawEvType === 'HALF_TIME') {
        triggerBroadcastGraphicEvent(id, 'HALF_TIME', `score_${histId}`).catch(() => {});
      } else if (rawEvType === 'TIMEOUT') {
        triggerBroadcastGraphicEvent(id, 'TIMEOUT', `score_${histId}`).catch(() => {});
      } else if (rawEvType === 'FIRST_HALF') {
        triggerBroadcastGraphicEvent(id, 'FIRST_HALF', `score_${histId}`).catch(() => {});
      } else if (rawEvType === 'SECOND_HALF') {
        triggerBroadcastGraphicEvent(id, 'SECOND_HALF', `score_${histId}`).catch(() => {});
      }

      res.status(201).json(payload);
    } catch (err) {
      console.error('[Score] Structured event error:', err);
      res.status(500).json({ message: 'Failed to record scoring event.' });
    }
}

router.post('/:id/score/event', authenticate, requireAdminPortal, handleStructuredScoreEvent);

// POST /api/live/:id/cricket/ball - Dedicated Cricket ball-by-ball endpoint
router.post(
  '/:id/cricket/ball',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    if (!body.action) {
      const batRuns = Math.max(0, Math.floor(Number(body.batRuns ?? body.runs ?? 0) || 0));
      const extraRuns = Math.max(0, Math.floor(Number(body.extraRuns ?? 0) || 0));
      const rawExtra = String(body.extraType || body.extra || 'NONE').toUpperCase();
      const extraType = ['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE', 'PENALTY'].includes(rawExtra)
        ? rawExtra
        : 'NONE';
      const isWicket = Boolean(body.isWicket);
      const eventType = isWicket
        ? 'WICKET'
        : extraType === 'WIDE'
          ? 'WIDE'
          : extraType === 'NO_BALL'
            ? 'NO_BALL'
            : extraType === 'BYE'
              ? 'BYE'
              : extraType === 'LEG_BYE'
                ? 'LEG_BYE'
                : 'LEGAL_DELIVERY';

      req.body = {
        ...body,
        sportType: 'Cricket',
        action: {
          type: 'STRUCTURED_DELIVERY',
          eventType,
          batRuns,
          extraRuns,
          extraType,
          isWicket,
          wicketType: sanitizeText(body.wicketType, 60),
          dismissedPlayer: sanitizeText(body.dismissedPlayer, 120),
          newBatsman: sanitizeText(body.newBatsman, 120),
          bowler: sanitizeText(body.bowler, 120),
          description: sanitizeText(body.description, 200),
          countsAsLegalBall: body.countsAsLegalBall,
        },
      };
    } else {
      req.body.sportType = 'Cricket';
    }
    return handleStructuredScoreEvent(req, res);
  }
);

// POST /api/live/:id/cricket/complete-innings - Lock 1st innings & transition to INNINGS BREAK
router.post(
  '/:id/cricket/complete-innings',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'score');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to complete innings for this stream.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Live stream not found.' });
        return;
      }

      const score = await ensureLiveScore(id);
      if (!score) {
        res.status(404).json({ message: 'Score record not found.' });
        return;
      }

      if (score.sportType !== 'Cricket') {
        res.status(400).json({ message: 'Innings lifecycle is only applicable to Cricket matches.' });
        return;
      }

      const currentDetails = normalizeCricketDetails(
        (score.sportSpecificDetails || {}) as Partial<CricketDetails>
      );
      if (currentDetails.innings !== 1) {
        res.status(409).json({ message: 'Match is already in the 2nd innings.' });
        return;
      }
      if (currentDetails.innings1Locked || currentDetails.innings1Completed) {
        res.status(409).json({ message: '1st innings is already completed and locked.' });
        return;
      }

      const reasonRaw = String(req.body.reason || 'MANUAL').toUpperCase();
      const reason =
        reasonRaw === 'OVERS_COMPLETED' || reasonRaw === 'ALL_OUT' ? reasonRaw : 'MANUAL';

      const previousSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const applied = applyCricketAction(currentDetails, {
        type: 'COMPLETE_INNINGS',
        reason,
      });

      score.sportSpecificDetails = applied.details as unknown as Record<string, unknown>;
      score.matchStatus = 'INNINGS BREAK';
      score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
      score.lastUpdatedAt = new Date();
      await score.save();

      const updatedSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const historyItem = await ScoreHistory.create({
        liveStreamId: score.liveStreamId,
        entryType: 'SCORE_UPDATE',
        sportType: score.sportType,
        teamSide: applied.details.battingTeam,
        eventCategory: 'META',
        eventType: 'COMPLETE_INNINGS',
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
        'COMPLETE_FIRST_INNINGS',
        'LiveScore',
        score._id.toString(),
        applied.label,
        { previousValue: { innings1Completed: false }, newValue: { target: applied.details.target } }
      );

      const payload = {
        streamId: id,
        score: score.toObject(),
        historyItem: populatedHistory,
      };

      emitStreamEvent(id, 'cricket:innings_completed', payload);
      emitStreamEvent(id, 'score:updated', payload);
      emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populatedHistory });

      await dispatchMatchNotifications({
        type: 'INNINGS_BREAK',
        title: 'Innings Break',
        message: `${stream.matchTitle || `${stream.teamAName} vs ${stream.teamBName}`}: 1st Innings completed · Target ${applied.details.target}`,
        entityType: 'LiveStream',
        entityId: stream._id.toString(),
        link: `/live/${stream._id.toString()}`,
        dedupeKey: `innings-break-${stream._id.toString()}`,
        teamIds: [stream.teamAId, stream.teamBId],
        tournamentId: stream.tournamentId,
        includeAllSpectatorsIfNoFollowers: true,
      });

      res.json(payload);
    } catch (err) {
      console.error('[Score] Complete 1st innings error:', err);
      res.status(500).json({ message: 'Failed to complete 1st innings.' });
    }
  }
);

// POST /api/live/:id/cricket/start-second-innings - Confirm opening batters/bowler & start 2nd innings
router.post(
  '/:id/cricket/start-second-innings',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'score');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to start the 2nd innings for this stream.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Live stream not found.' });
        return;
      }

      const score = await ensureLiveScore(id);
      if (!score) {
        res.status(404).json({ message: 'Score record not found.' });
        return;
      }

      if (score.sportType !== 'Cricket') {
        res.status(400).json({ message: '2nd innings setup is only applicable to Cricket matches.' });
        return;
      }

      const currentDetails = normalizeCricketDetails(
        (score.sportSpecificDetails || {}) as Partial<CricketDetails>
      );

      if (currentDetails.matchPhase === 'COMPLETED' || currentDetails.innings2Locked) {
        res.status(409).json({ message: 'Match is already completed.' });
        return;
      }

      if (currentDetails.innings === 2 && currentDetails.innings2Started) {
        res.status(409).json({ message: '2nd innings has already started.' });
        return;
      }

      const batsman1 = sanitizeText(req.body.batsman1, 120);
      const batsman2 = sanitizeText(req.body.batsman2, 120);
      const bowler = sanitizeText(req.body.bowler, 120);
      if (!batsman1 || !batsman2 || !bowler) {
        res.status(400).json({
          message: 'Striker, Non-Striker, and Opening Bowler are required to start the 2nd innings.',
        });
        return;
      }

      const defaultSecondBatting: 'A' | 'B' =
        (currentDetails.firstInningsBattingTeam || currentDetails.battingTeam) === 'A' ? 'B' : 'A';
      const battingTeam: 'A' | 'B' =
        req.body.battingTeam === 'A' || req.body.battingTeam === 'B'
          ? req.body.battingTeam
          : defaultSecondBatting;

      const oversLimit =
        req.body.oversLimit !== undefined && req.body.oversLimit !== ''
          ? Math.max(1, Math.min(90, Math.floor(Number(req.body.oversLimit) || currentDetails.oversLimit)))
          : currentDetails.oversLimit;

      const firstRuns =
        battingTeam === 'B' ? currentDetails.teamARuns : currentDetails.teamBRuns;
      const target =
        req.body.target !== undefined && req.body.target !== '' && Number(req.body.target) > 0
          ? Math.floor(Number(req.body.target))
          : currentDetails.target > 0
            ? currentDetails.target
            : firstRuns + 1;

      const previousSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const applied = applyCricketAction(currentDetails, {
        type: 'START_SECOND_INNINGS',
        battingTeam,
        batsman1,
        batsman2,
        bowler,
        oversLimit,
        target,
      });

      score.sportSpecificDetails = applied.details as unknown as Record<string, unknown>;
      score.matchStatus = 'Live';
      score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
      score.lastUpdatedAt = new Date();
      await score.save();

      const updatedSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const historyItem = await ScoreHistory.create({
        liveStreamId: score.liveStreamId,
        entryType: 'SCORE_UPDATE',
        sportType: score.sportType,
        teamSide: battingTeam,
        eventCategory: 'META',
        eventType: 'START_SECOND_INNINGS',
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
        'START_SECOND_INNINGS',
        'LiveScore',
        score._id.toString(),
        applied.label,
        {
          previousValue: { innings: 1, matchPhase: previousSnapshot.matchStatus },
          newValue: { innings: 2, battingTeam, target, oversLimit },
        }
      );

      const payload = {
        streamId: id,
        score: score.toObject(),
        historyItem: populatedHistory,
      };

      emitStreamEvent(id, 'cricket:second_innings_started', payload);
      emitStreamEvent(id, 'score:updated', payload);
      emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populatedHistory });

      const chasingTeamName =
        battingTeam === 'A' ? stream.teamAName || 'Team A' : stream.teamBName || 'Team B';
      await dispatchMatchNotifications({
        type: 'SECOND_INNINGS_STARTED',
        title: '2nd Innings Started',
        message: `${stream.matchTitle || `${stream.teamAName} vs ${stream.teamBName}`}: ${chasingTeamName} need ${target} runs in ${oversLimit} overs`,
        entityType: 'LiveStream',
        entityId: stream._id.toString(),
        link: `/live/${stream._id.toString()}`,
        dedupeKey: `second-innings-${stream._id.toString()}`,
        teamIds: [stream.teamAId, stream.teamBId],
        tournamentId: stream.tournamentId,
        includeAllSpectatorsIfNoFollowers: true,
      });

      res.json(payload);
    } catch (err) {
      console.error('[Score] Start 2nd innings error:', err);
      res.status(500).json({ message: 'Failed to start 2nd innings.' });
    }
  }
);

// PATCH /api/live/:id/score/event/:eventId - Audited event correction without deleting history
router.patch(
  '/:id/score/event/:eventId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, eventId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(eventId)) {
        res.status(400).json({ message: 'Invalid stream or event ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'score');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to correct events for this stream.',
        });
        return;
      }

      const correctionReason = sanitizeText(req.body.correctionReason, 280);
      if (!correctionReason) {
        res.status(400).json({ message: 'A correction reason is required for audit logs.' });
        return;
      }

      const original = await ScoreHistory.findOne({ _id: eventId, liveStreamId: id });
      if (!original) {
        res.status(404).json({ message: 'Score history event not found.' });
        return;
      }
      if (original.reverted) {
        res.status(409).json({ message: 'This event has already been corrected/reverted.' });
        return;
      }

      const score = await ensureLiveScore(id);
      if (!score) {
        res.status(404).json({ message: 'Score record not found.' });
        return;
      }

      const previousSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const revertPreviousDiff = req.body.revertToBeforeEvent === true;
      if (revertPreviousDiff) {
        const prevA = Number((original.previousScore as any)?.teamAScore ?? 0);
        const updA = Number((original.updatedScore as any)?.teamAScore ?? 0);
        const prevB = Number((original.previousScore as any)?.teamBScore ?? 0);
        const updB = Number((original.updatedScore as any)?.teamBScore ?? 0);
        const diffA = updA - prevA;
        const diffB = updB - prevB;
        score.teamAScore = Math.max(0, score.teamAScore - diffA);
        score.teamBScore = Math.max(0, score.teamBScore - diffB);
      }

      if (typeof req.body.teamAScore === 'number' && Number.isFinite(req.body.teamAScore)) {
        score.teamAScore = Math.max(0, Math.floor(req.body.teamAScore));
      }
      if (typeof req.body.teamBScore === 'number' && Number.isFinite(req.body.teamBScore)) {
        score.teamBScore = Math.max(0, Math.floor(req.body.teamBScore));
      }
      if (
        req.body.sportSpecificDetails &&
        typeof req.body.sportSpecificDetails === 'object' &&
        !Array.isArray(req.body.sportSpecificDetails)
      ) {
        score.sportSpecificDetails = req.body.sportSpecificDetails;
      }

      score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
      score.lastUpdatedAt = new Date();
      await score.save();

      original.reverted = true;
      await original.save();

      const updatedSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const correctionLabel = `Corrected "${original.action}": ${correctionReason}`;
      const correctionDoc = await ScoreHistory.create({
        liveStreamId: score.liveStreamId,
        entryType: 'CORRECTION',
        sportType: score.sportType,
        teamSide: original.teamSide,
        teamId: original.teamId || null,
        eventCategory: 'CORRECTION',
        eventType: 'EVENT_CORRECTION',
        isCorrection: true,
        correctionOfId: original._id,
        correctionReason,
        previousScore: previousSnapshot,
        updatedScore: updatedSnapshot,
        action: correctionLabel.slice(0, 280),
        updatedBy: req.user!._id,
      });

      const populated = await ScoreHistory.findById(correctionDoc._id)
        .populate('updatedBy', 'name role')
        .lean();

      await recordActivity(
        req.user!,
        'CORRECT_SCORE_EVENT',
        'ScoreHistory',
        eventId,
        correctionLabel,
        {
          previousValue: {
            teamAScore: previousSnapshot.teamAScore,
            teamBScore: previousSnapshot.teamBScore,
            originalAction: original.action,
          },
          newValue: {
            teamAScore: updatedSnapshot.teamAScore,
            teamBScore: updatedSnapshot.teamBScore,
            reason: correctionReason,
          },
        }
      );

      const payload = {
        streamId: id,
        score: score.toObject(),
        historyItem: populated,
        correctedEventId: eventId,
      };

      emitStreamEvent(id, 'score:event:corrected', payload);
      emitStreamEvent(id, 'score:updated', payload);
      emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populated });

      res.json(payload);
    } catch (err) {
      console.error('[Score] Correction error:', err);
      res.status(500).json({ message: 'Failed to correct scoring event.' });
    }
  }
);

// POST /api/live/:id/score/undo & /cricket/undo
async function handleUndoScore(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const allowed = await canManageStream(req.user!, id, 'score');
    if (!allowed) {
      res.status(403).json({
        message: 'Forbidden: You are not authorized to undo scores for this stream.',
      });
      return;
    }

    const score = await ensureLiveScore(id);
    if (!score) {
      res.status(404).json({ message: 'Stream not found.' });
      return;
    }

    const historyQuery =
      score.sportType === 'Volleyball'
        ? {
            liveStreamId: score.liveStreamId,
            reverted: { $ne: true },
            $or: [{ entryType: 'SCORE_UPDATE' }, { entryType: 'RESULT' }, { entryType: { $exists: false } }],
          }
        : {
            liveStreamId: score.liveStreamId,
            reverted: { $ne: true },
            $or: [{ entryType: 'SCORE_UPDATE' }, { entryType: { $exists: false } }],
          };

    const latestHistory = (await ScoreHistory.findOne(historyQuery as any).sort({ createdAt: -1, _id: -1 })) as any;

    if (!latestHistory) {
      res.status(400).json({ message: 'No previous score update available to undo.' });
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

    const prev = latestHistory.previousScore as any;
    const prevWasDeclared = score.resultStatus !== 'NOT_DECLARED';
    const prevWinnerName = score.winnerTeamName;
    const prevWinnerTeamId = score.winnerTeamId;

    score.teamAScore = typeof prev.teamAScore === 'number' ? prev.teamAScore : 0;
    score.teamBScore = typeof prev.teamBScore === 'number' ? prev.teamBScore : 0;
    score.sportSpecificDetails =
      score.sportType === 'Volleyball'
        ? (normalizeVolleyballDetails(prev.sportSpecificDetails) as unknown as Record<string, unknown>)
        : prev.sportSpecificDetails || getInitialSportDetails(score.sportType);
    score.markModified?.('sportSpecificDetails');
    if (prev.matchStatus) score.matchStatus = prev.matchStatus;

    let revertedAutoResult = false;
    let revertedVolleyballResult = false;

    if (score.sportType === 'Cricket' && prevWasDeclared) {
      const restoredPhase = (score.sportSpecificDetails as any)?.matchPhase;
      const restoredLocked2 = Boolean((score.sportSpecificDetails as any)?.innings2Locked);
      if (restoredPhase !== 'COMPLETED' && !restoredLocked2) {
        score.resultStatus = 'NOT_DECLARED';
        score.resultType = '';
        score.winnerTeamId = null;
        score.winnerTeamName = '';
        score.winningMargin = '';
        score.resultDescription = '';
        score.declaredBy = null;
        score.declaredByName = '';
        score.declaredAt = null;
        revertedAutoResult = true;
      }
    } else if (score.sportType === 'Volleyball') {
      const restoredVb = score.sportSpecificDetails as unknown as VolleyballDetails;
      if (
        prevWasDeclared &&
        (!prev.resultStatus || prev.resultStatus === 'NOT_DECLARED') &&
        !restoredVb.matchCompleted
      ) {
        score.resultStatus = 'NOT_DECLARED';
        score.resultType = '';
        score.winnerTeamId = null;
        score.winnerTeamName = '';
        score.winningMargin = '';
        score.resultDescription = '';
        score.declaredBy = null;
        score.declaredByName = '';
        score.declaredAt = null;
        if (!prev.matchStatus || prev.matchStatus === 'Completed') {
          score.matchStatus = 'Live';
        }
        revertedVolleyballResult = true;
      }
    }

    score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
    score.lastUpdatedAt = new Date();
    await score.save();

    if (score.sportType === 'Kabaddi') {
      // Preserve full audit history for Kabaddi: mark original reverted & log an UNDO audit record
      latestHistory.reverted = true;
      await latestHistory.save();

      const statDeltas = (latestHistory.details as any)?.playerStatDeltas;
      if (statDeltas && typeof statDeltas === 'object' && Object.keys(statDeltas).length > 0) {
        const streamDoc = await LiveStream.findById(id);
        if (streamDoc) {
          await applyKabaddiPlayerStatDeltas({
            stream: streamDoc,
            playerStatDeltas: statDeltas,
            actorId: req.user!._id as mongoose.Types.ObjectId,
            direction: -1,
            session: null,
          });
        }
      }

      await ScoreHistory.create({
        liveStreamId: score.liveStreamId,
        entryType: 'UNDO',
        sportType: 'Kabaddi',
        eventCategory: 'UNDO',
        eventType: 'UNDO',
        correctionOfId: latestHistory._id,
        previousScore: previousSnapshot,
        updatedScore: {
          sportType: score.sportType,
          teamAScore: score.teamAScore,
          teamBScore: score.teamBScore,
          sportSpecificDetails: score.sportSpecificDetails,
          matchStatus: score.matchStatus,
        },
        action: `Undid: ${latestHistory.action}`.slice(0, 280),
        updatedBy: req.user!._id,
      });
    } else if (score.sportType === 'Volleyball') {
      // Preserve full audit history for Volleyball: mark original (and paired auto-completion event if any) reverted & create UNDO record
      latestHistory.reverted = true;
      await latestHistory.save();

      const pairedId = (latestHistory.details as any)?.pairedScoreEventId;
      if (pairedId && mongoose.Types.ObjectId.isValid(pairedId)) {
        await ScoreHistory.findByIdAndUpdate(pairedId, { reverted: true }).catch(() => {});
      }
      if (revertedVolleyballResult) {
        await ScoreHistory.updateMany(
          {
            liveStreamId: score.liveStreamId,
            entryType: 'RESULT',
            reverted: { $ne: true },
          } as any,
          { reverted: true } as any
        ).catch(() => {});
        const streamDoc = await LiveStream.findById(id);
        if (streamDoc) {
          if (streamDoc.status === 'ENDED') {
            streamDoc.status = prev.streamStatus === 'UPCOMING' ? 'UPCOMING' : 'LIVE';
            streamDoc.endedAt = null;
            await streamDoc.save();
          }
          await revertVolleyballFixtureOnReopenOrUndo({
            stream: streamDoc,
            previousWinnerName: prevWinnerName,
            previousWinnerTeamId: prevWinnerTeamId,
            actorId: req.user!._id as mongoose.Types.ObjectId,
          });
        }
      }

      await ScoreHistory.create({
        liveStreamId: score.liveStreamId,
        entryType: 'UNDO',
        sportType: 'Volleyball',
        eventCategory: 'UNDO',
        eventType: revertedVolleyballResult ? 'UNDO_MATCH_COMPLETION' : 'UNDO',
        correctionOfId: latestHistory._id,
        previousScore: previousSnapshot,
        updatedScore: {
          sportType: score.sportType,
          teamAScore: score.teamAScore,
          teamBScore: score.teamBScore,
          sportSpecificDetails: score.sportSpecificDetails,
          matchStatus: score.matchStatus,
          resultStatus: score.resultStatus,
        },
        action: `Undid: ${latestHistory.action}`.slice(0, 280),
        updatedBy: req.user!._id,
      });
    } else {
      await ScoreHistory.deleteOne({ _id: latestHistory._id });
    }

    if (revertedAutoResult) {
      await ScoreHistory.deleteMany({
        liveStreamId: score.liveStreamId,
        entryType: 'RESULT',
      });
      const linkedFixture = await Fixture.findOne({ liveStreamId: score.liveStreamId });
      if (linkedFixture && linkedFixture.resultConfirmed) {
        linkedFixture.status = 'LIVE';
        linkedFixture.resultConfirmed = false;
        linkedFixture.resultSummary = '';
        linkedFixture.winnerTeamId = null;
        linkedFixture.winnerTeamName = '';
        linkedFixture.updatedBy = req.user!._id as mongoose.Types.ObjectId;
        await linkedFixture.save();
      }
    }

    await recordActivity(
      req.user!,
      'UNDO_SCORE',
      'LiveScore',
      score._id.toString(),
      `Undid: ${latestHistory.action}`,
      {
        previousValue: previousSnapshot,
        newValue: { teamAScore: score.teamAScore, teamBScore: score.teamBScore },
      }
    );

    const payload = {
      streamId: id,
      score: score.toObject(),
      undoneAction: latestHistory.action,
    };

    emitStreamEvent(id, 'score:undo', payload);
    emitStreamEvent(id, 'score:updated', payload);
    if (score.sportType === 'Kabaddi') {
      emitStreamEvent(id, 'kabaddi:state', {
        streamId: id,
        score: payload.score,
        serverNowIso: new Date().toISOString(),
      });
    }
    if (revertedAutoResult || revertedVolleyballResult) {
      emitStreamEvent(id, 'match:result:updated', { streamId: id, score: score.toObject(), isCorrection: true });
      const streamForTourn = await LiveStream.findById(id).lean();
      if (streamForTourn?.tournamentId) {
        emitTournamentEvent(streamForTourn.tournamentId.toString(), 'tournament:points_updated', {
          tournamentId: streamForTourn.tournamentId.toString(),
          streamId: id,
          resultStatus: score.resultStatus,
          winnerTeamId: null,
        });
      }
    }
    emitStreamEvent(id, 'match:timeline:updated', { streamId: id });
    res.json(payload);
  } catch (err) {
    console.error('[Score] Undo error:', err);
    res.status(500).json({ message: 'Failed to undo last score update.' });
  }
}

router.post('/:id/score/undo', authenticate, requireAdminPortal, handleUndoScore);
router.post('/:id/cricket/undo', authenticate, requireAdminPortal, handleUndoScore);

// POST /api/live/:id/score/reset
router.post(
  '/:id/score/reset',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'score');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to reset scores for this stream.',
        });
        return;
      }

      const score = await ensureLiveScore(id);
      if (!score) {
        res.status(404).json({ message: 'Stream not found.' });
        return;
      }

      if (score.sportType === 'Volleyball') {
        const vbLock = isVolleyballScoringLocked(score.sportSpecificDetails, score.resultStatus);
        if (vbLock.locked) {
          res.status(409).json({ message: vbLock.reason, locked: true });
          return;
        }
      }

      const previousSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      score.teamAScore = 0;
      score.teamBScore = 0;
      score.sportSpecificDetails =
        score.sportType === 'Volleyball'
          ? (createInitialVolleyballDetails(
              normalizeVolleyballDetails(score.sportSpecificDetails).rules
            ) as unknown as Record<string, unknown>)
          : getInitialSportDetails(score.sportType);
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
      };

      await ScoreHistory.create({
        liveStreamId: score.liveStreamId,
        entryType: 'SCORE_UPDATE',
        sportType: score.sportType,
        previousScore: previousSnapshot,
        updatedScore: updatedSnapshot,
        action: 'Scoreboard reset to zero',
        updatedBy: req.user!._id,
      });

      await recordActivity(
        req.user!,
        'RESET_SCOREBOARD',
        'LiveScore',
        score._id.toString(),
        'Reset scoreboard to zero',
        {
          previousValue: {
            teamAScore: previousSnapshot.teamAScore,
            teamBScore: previousSnapshot.teamBScore,
          },
          newValue: { teamAScore: 0, teamBScore: 0 },
        }
      );

      const payload = {
        streamId: id,
        score: score.toObject(),
      };

      emitStreamEvent(id, 'score:reset', payload);
      emitStreamEvent(id, 'match:timeline:updated', { streamId: id });
      res.json(payload);
    } catch (err) {
      console.error('[Score] Reset error:', err);
      res.status(500).json({ message: 'Failed to reset scoreboard.' });
    }
  }
);

// GET /api/live/:id/score/history
router.get('/:id/score/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));
    const history = await ScoreHistory.find({ liveStreamId: id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate('updatedBy', 'name role')
      .lean();

    res.json({ history });
  } catch (err) {
    console.error('[Score] History error:', err);
    res.status(500).json({ message: 'Failed to load score history.' });
  }
});

// POST /api/live/:id/commentary - Submit live commentary snippet
router.post(
  '/:id/commentary',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'score');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to post commentary for this stream.',
        });
        return;
      }

      const snippet = sanitizeText(req.body.snippet ?? req.body.action, 280);
      if (!snippet) {
        res.status(400).json({ message: 'Commentary snippet cannot be empty.' });
        return;
      }

      const score = await ensureLiveScore(id);
      if (!score) {
        res.status(404).json({ message: 'Live stream not found.' });
        return;
      }

      const snapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
      };

      const historyItem = await ScoreHistory.create({
        liveStreamId: score.liveStreamId,
        entryType: 'COMMENTARY',
        sportType: score.sportType,
        previousScore: snapshot,
        updatedScore: snapshot,
        action: snippet,
        updatedBy: req.user!._id,
      });

      const populated = await ScoreHistory.findById(historyItem._id)
        .populate('updatedBy', 'name role')
        .lean();

      await recordActivity(
        req.user!,
        'POST_COMMENTARY',
        'LiveScore',
        score._id.toString(),
        snippet
      );

      const payload = {
        streamId: id,
        commentary: populated,
      };

      emitStreamEvent(id, 'commentary:added', payload);
      emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populated });
      res.status(201).json(payload);
    } catch (err) {
      console.error('[Score] Commentary error:', err);
      res.status(500).json({ message: 'Failed to submit commentary snippet.' });
    }
  }
);

// GET /api/live/:id/result - Get official match result status & metadata
router.get('/:id/result', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const score = await ensureLiveScore(id);
    if (!score) {
      res.status(404).json({ message: 'Stream not found.' });
      return;
    }

    res.json({
      streamId: id,
      score: score.toObject(),
      result: {
        resultStatus: score.resultStatus || 'NOT_DECLARED',
        resultType: score.resultType || '',
        winnerTeamId: score.winnerTeamId || null,
        winnerTeamName: score.winnerTeamName || '',
        winningMargin: score.winningMargin || '',
        resultDescription: score.resultDescription || '',
        mvpPlayerId: score.mvpPlayerId || null,
        mvpPlayerName: score.mvpPlayerName || '',
        finalSummary: score.finalSummary || '',
        declaredBy: score.declaredBy || null,
        declaredByName: score.declaredByName || '',
        declaredAt: score.declaredAt || null,
      },
    });
  } catch (err) {
    console.error('[Score] Get result error:', err);
    res.status(500).json({ message: 'Failed to load match result.' });
  }
});

// POST /api/live/:id/result - Explicitly declare or correct official match result & advance tournament fixture
router.post(
  '/:id/result',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'result');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to declare match results for this stream.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Live stream not found.' });
        return;
      }

      const score = await ensureLiveScore(id);
      if (!score) {
        res.status(404).json({ message: 'Score record not found.' });
        return;
      }

      const isCorrection = Boolean(score.resultStatus && score.resultStatus !== 'NOT_DECLARED');
      if (isCorrection && req.body.confirmCorrection !== true) {
        res.status(409).json({
          message:
            'A match result has already been declared. Confirm correction explicitly before overwriting.',
          requiresCorrectionConfirmation: true,
        });
        return;
      }

      const rawType = typeof req.body.resultType === 'string' ? req.body.resultType.trim() : '';
      const allowedTypes: MatchResultType[] = [
        'TEAM_A_WON',
        'TEAM_B_WON',
        'DRAW',
        'TIE',
        'NO_RESULT',
        'ABANDONED',
      ];
      if (!allowedTypes.includes(rawType as MatchResultType)) {
        res.status(400).json({
          message:
            'Please select a valid match result (Team A Won, Team B Won, Draw, Tie, No Result, or Abandoned).',
        });
        return;
      }

      const resultType = rawType as MatchResultType;
      const validation = validateMatchResult({
        sportType: score.sportType,
        resultType,
        teamAName: stream.teamAName || 'Team A',
        teamBName: stream.teamBName || 'Team B',
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: (score.sportSpecificDetails || {}) as Record<string, unknown>,
      });

      if (!validation.valid) {
        res.status(400).json({ message: validation.error || 'Match result validation failed.' });
        return;
      }

      const winningMargin = sanitizeText(req.body.winningMargin, 120);
      const customDescription = sanitizeText(req.body.resultDescription, 300);
      const finalSummary = sanitizeText(req.body.finalSummary, 500);

      let mvpPlayerId: mongoose.Types.ObjectId | null = null;
      let mvpPlayerName = sanitizeText(req.body.mvpPlayerName, 120);
      if (req.body.mvpPlayerId && mongoose.Types.ObjectId.isValid(req.body.mvpPlayerId)) {
        const mvpDoc = await Player.findById(req.body.mvpPlayerId);
        if (mvpDoc) {
          mvpPlayerId = mvpDoc._id as mongoose.Types.ObjectId;
          if (!mvpPlayerName) mvpPlayerName = mvpDoc.name;
        }
      }

      let defaultDescription = '';
      if (validation.winnerSide === 'A' || validation.winnerSide === 'B') {
        defaultDescription = winningMargin
          ? `${validation.winnerName} won ${winningMargin}`
          : `${validation.winnerName} won the match`;
      } else if (validation.normalizedStatus === 'DRAW') {
        defaultDescription = 'Match Drawn';
      } else if (validation.normalizedStatus === 'TIE') {
        defaultDescription = 'Match Tied';
      } else if (validation.normalizedStatus === 'ABANDONED') {
        defaultDescription = 'Match Abandoned';
      } else if (validation.normalizedStatus === 'NO_RESULT') {
        defaultDescription = 'No Result';
      }

      const previousSnapshot = {
        sportType: score.sportType,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        sportSpecificDetails: score.sportSpecificDetails,
        matchStatus: score.matchStatus,
        resultStatus: score.resultStatus,
        winnerTeamName: score.winnerTeamName,
        streamStatus: stream.status,
      };

      if (score.sportType === 'Volleyball') {
        const vbNorm = normalizeVolleyballDetails(score.sportSpecificDetails);
        const vbElig = getVolleyballCompletionEligibility(vbNorm);
        vbNorm.matchCompleted = true;
        vbNorm.advantageTeam = null;
        vbNorm.isDeuce = false;
        vbNorm.completedReason = vbElig.thresholdReached ? 'THRESHOLD_REACHED' : 'MANUAL_DECISION';
        vbNorm.manualWinnerSide = validation.winnerSide;
        vbNorm.manualWinnerReason = customDescription || winningMargin || '';
        score.sportSpecificDetails = vbNorm as unknown as Record<string, unknown>;
        score.markModified?.('sportSpecificDetails');
      }

      score.resultStatus = validation.normalizedStatus;
      score.resultType = resultType;
      score.winnerTeamId =
        validation.winnerSide === 'A'
          ? stream.teamAId || null
          : validation.winnerSide === 'B'
            ? stream.teamBId || null
            : null;
      score.winnerTeamName = validation.winnerName;
      score.winningMargin = winningMargin;
      score.resultDescription = customDescription || defaultDescription;
      score.mvpPlayerId = mvpPlayerId;
      score.mvpPlayerName = mvpPlayerName;
      score.finalSummary = finalSummary;
      score.declaredBy = req.user!._id as mongoose.Types.ObjectId;
      score.declaredByName = req.user!.name || req.user!.email;
      score.declaredAt = new Date();
      score.matchStatus =
        validation.normalizedStatus === 'DRAW'
          ? 'Drawn'
          : validation.normalizedStatus === 'TIE'
            ? 'Tied'
            : validation.normalizedStatus === 'ABANDONED'
              ? 'Abandoned'
              : validation.normalizedStatus === 'NO_RESULT'
                ? 'No Result'
                : 'Completed';
      score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
      score.lastUpdatedAt = new Date();
      await score.save();

      if (score.sportType === 'Volleyball' && stream.status !== 'ENDED') {
        stream.status = 'ENDED';
        stream.endedAt = new Date();
        stream.endedBy = req.user!._id as mongoose.Types.ObjectId;
        await stream.save();
      }

      if (mvpPlayerId) {
        await PlayerMatchStat.findOneAndUpdate(
          { liveStreamId: stream._id, playerId: mvpPlayerId },
          {
            $setOnInsert: {
              liveStreamId: stream._id,
              tournamentId: stream.tournamentId || null,
              playerId: mvpPlayerId,
              sportType: score.sportType,
              appearances: 1,
            },
            $set: { isMvp: true, updatedBy: req.user!._id },
          },
          { upsert: true }
        );
      }

      // Sync confirmed result to linked tournament Fixture and ONLY advance confirmed winners
      const linkedFixture = await Fixture.findOne({ liveStreamId: stream._id });
      if (linkedFixture) {
        linkedFixture.status = 'COMPLETED';
        linkedFixture.resultConfirmed = true;
        linkedFixture.resultSummary = score.resultDescription;
        linkedFixture.winnerTeamId = score.winnerTeamId || null;
        linkedFixture.winnerTeamName = score.winnerTeamName || '';
        linkedFixture.updatedBy = req.user!._id as mongoose.Types.ObjectId;
        await linkedFixture.save();

        if (
          linkedFixture.nextFixtureId &&
          (validation.winnerSide === 'A' || validation.winnerSide === 'B')
        ) {
          const nextFixture = await Fixture.findById(linkedFixture.nextFixtureId);
          if (nextFixture) {
            const winnerTeamDoc = score.winnerTeamId
              ? await Team.findById(score.winnerTeamId).lean()
              : null;
            const winLogo =
              winnerTeamDoc?.logoUrl ||
              (validation.winnerSide === 'A' ? stream.teamALogo : stream.teamBLogo) ||
              '';
            const winName = score.winnerTeamName || validation.winnerName;
            if (linkedFixture.nextFixtureSlot === 'B') {
              nextFixture.teamBId = score.winnerTeamId || null;
              nextFixture.teamBName = winName;
              nextFixture.teamBLogo = winLogo;
            } else {
              nextFixture.teamAId = score.winnerTeamId || null;
              nextFixture.teamAName = winName;
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

      const historyAction = isCorrection
        ? `Result corrected: ${score.resultDescription}`
        : `Official Result: ${score.resultDescription}`;

      const historyItem = await ScoreHistory.create({
        liveStreamId: score.liveStreamId,
        entryType: 'RESULT',
        sportType: score.sportType,
        previousScore: previousSnapshot,
        updatedScore: updatedSnapshot,
        action: historyAction,
        updatedBy: req.user!._id,
      });

      const populatedHistory = await ScoreHistory.findById(historyItem._id)
        .populate('updatedBy', 'name role')
        .lean();

      await recordActivity(
        req.user!,
        isCorrection ? 'UPDATE_MATCH_RESULT' : 'DECLARE_MATCH_RESULT',
        'LiveScore',
        score._id.toString(),
        `${stream.matchTitle || stream.youtubeVideoId}: ${score.resultDescription}`,
        {
          previousValue: {
            resultStatus: previousSnapshot.resultStatus,
            winnerTeamName: previousSnapshot.winnerTeamName,
          },
          newValue: {
            resultStatus: score.resultStatus,
            winnerTeamName: score.winnerTeamName,
            mvpPlayerName: score.mvpPlayerName,
          },
        }
      );

      await dispatchMatchNotifications({
        type: 'MATCH_RESULT',
        title: 'Official Match Result Declared',
        message: `${stream.matchTitle || `${stream.teamAName} vs ${stream.teamBName}`}: ${score.resultDescription}`,
        entityType: 'LiveStream',
        entityId: stream._id.toString(),
        link: `/live/${stream._id.toString()}`,
        dedupeKey: `match-result-${stream._id.toString()}-${isCorrection ? Date.now() : 'v1'}`,
        teamIds: [stream.teamAId, stream.teamBId],
        includeAllSpectatorsIfNoFollowers: true,
      });

      const payload = {
        streamId: id,
        score: score.toObject(),
        historyItem: populatedHistory,
        isCorrection,
      };

      emitStreamEvent(
        id,
        isCorrection ? 'match:result:updated' : 'match:result:declared',
        payload
      );
      emitStreamEvent(id, 'match:timeline:updated', { streamId: id, historyItem: populatedHistory });
      if (stream.tournamentId) {
        emitTournamentEvent(stream.tournamentId.toString(), 'tournament:points_updated', {
          tournamentId: stream.tournamentId.toString(),
          streamId: id,
          resultStatus: score.resultStatus,
          winnerTeamId: score.winnerTeamId ? score.winnerTeamId.toString() : null,
        });
      }
      res.json(payload);
    } catch (err) {
      console.error('[Score] Declare result error:', err);
      res.status(500).json({ message: 'Failed to declare match result.' });
    }
  }
);

// Dedicated Kabaddi Scorer Console Routes
router.post('/:id/kabaddi/event', authenticate, requireAdminPortal, handleKabaddiEventRoute);
router.post('/:id/kabaddi/clock', authenticate, requireAdminPortal, handleKabaddiClockRoute);
router.patch('/:id/kabaddi/settings', authenticate, requireAdminPortal, handleKabaddiSettingsRoute);
router.post('/:id/kabaddi/complete', authenticate, requireAdminPortal, handleKabaddiCompleteRoute);
router.post('/:id/kabaddi/reopen', authenticate, requireAdminPortal, handleKabaddiReopenRoute);

// Dedicated Volleyball Match Control, Rules, Completion & Reopen Routes
router.patch('/:id/volleyball/rules', authenticate, requireAdminPortal, handleVolleyballRulesRoute);
router.post('/:id/volleyball/complete', authenticate, requireAdminPortal, handleVolleyballCompleteRoute);
router.post('/:id/volleyball/reopen', authenticate, requireAdminPortal, handleVolleyballReopenRoute);

export default router;

