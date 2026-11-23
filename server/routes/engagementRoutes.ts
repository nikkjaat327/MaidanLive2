import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { LiveStream } from '../models/LiveStream.ts';
import { MatchHighlight } from '../models/MatchHighlight.ts';
import { ChatMessage } from '../models/ChatMessage.ts';
import { Poll } from '../models/Poll.ts';
import { Team } from '../models/Team.ts';
import { Player } from '../models/Player.ts';
import { Tournament } from '../models/Tournament.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { User } from '../models/User.ts';
import {
  authenticate,
  canManageStream,
  canModerateChat,
  requireAdminPortal,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';
import { emitStreamEvent } from '../socket/index.ts';
import { isStreamVisibleToPublic } from '../utils/streamVisibility.ts';

const router = Router();

// Simple in-memory rate limiter for chat spam prevention (max 5 msgs per 15 seconds per user)
const chatRateMap = new Map<string, number[]>();

// ==================== MATCH HIGHLIGHTS (MODULE 1 & 11) ====================
router.get('/live/:id/highlights', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }
    const highlights = await MatchHighlight.find({ liveStreamId: id })
      .sort({ videoTimestampSeconds: 1, createdAt: 1 })
      .lean();
    res.json({
      highlights: highlights.map((h) => ({ ...h, id: h._id.toString() })),
    });
  } catch (err) {
    console.error('[Highlights] List error:', err);
    res.status(500).json({ message: 'Failed to load match highlights.' });
  }
});

router.post(
  '/live/:id/highlights',
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
        res.status(403).json({ message: 'Forbidden: Not authorized to create highlights.' });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Stream not found.' });
        return;
      }

      const eventType = sanitizeText(req.body.eventType, 80);
      const seconds = Number(req.body.videoTimestampSeconds);
      if (!eventType || !Number.isFinite(seconds) || seconds < 0) {
        res.status(400).json({
          message: 'Event type and valid timestamp (seconds >= 0) are required.',
        });
        return;
      }

      const highlight = await MatchHighlight.create({
        liveStreamId: stream._id,
        eventType,
        videoTimestampSeconds: Math.floor(seconds),
        description: sanitizeText(req.body.description, 300),
        teamSide: req.body.teamSide === 'A' || req.body.teamSide === 'B' ? req.body.teamSide : '',
        playerId:
          req.body.playerId && mongoose.Types.ObjectId.isValid(req.body.playerId)
            ? req.body.playerId
            : null,
        playerName: sanitizeText(req.body.playerName, 120),
        createdBy: req.user!._id,
        updatedBy: req.user!._id,
        auditTrail: [
          {
            action: 'CREATED',
            actorId: req.user!._id,
            actorName: req.user!.name,
            at: new Date(),
            note: `${eventType} @ ${Math.floor(seconds)}s`,
          },
        ],
      });

      const payload = { ...highlight.toObject(), id: highlight._id.toString() };
      await recordActivity(
        req.user!,
        'CREATE_HIGHLIGHT',
        'MatchHighlight',
        highlight._id.toString(),
        `${eventType} @ ${Math.floor(seconds)}s`
      );
      emitStreamEvent(id, 'highlight:added', { streamId: id, highlight: payload });
      res.status(201).json({ highlight: payload });
    } catch (err) {
      console.error('[Highlights] Create error:', err);
      res.status(500).json({ message: 'Failed to create highlight.' });
    }
  }
);

router.patch(
  '/highlights/:highlightId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { highlightId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(highlightId)) {
        res.status(400).json({ message: 'Invalid highlight ID.' });
        return;
      }
      const highlight = await MatchHighlight.findById(highlightId);
      if (!highlight) {
        res.status(404).json({ message: 'Highlight not found.' });
        return;
      }

      const streamId = highlight.liveStreamId.toString();
      const allowed = await canManageStream(req.user!, streamId, 'score');
      if (!allowed) {
        res.status(403).json({ message: 'Forbidden: Not authorized to edit this highlight.' });
        return;
      }

      if (req.body.eventType !== undefined) {
        const clean = sanitizeText(req.body.eventType, 80);
        if (clean) highlight.eventType = clean;
      }
      if (req.body.videoTimestampSeconds !== undefined) {
        const sec = Number(req.body.videoTimestampSeconds);
        if (Number.isFinite(sec) && sec >= 0) {
          highlight.videoTimestampSeconds = Math.floor(sec);
        }
      }
      if (req.body.description !== undefined) {
        highlight.description = sanitizeText(req.body.description, 300);
      }
      if (req.body.playerName !== undefined) {
        highlight.playerName = sanitizeText(req.body.playerName, 120);
      }
      if (req.body.teamSide === 'A' || req.body.teamSide === 'B' || req.body.teamSide === '') {
        highlight.teamSide = req.body.teamSide;
      }

      highlight.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      highlight.auditTrail.push({
        action: 'UPDATED',
        actorId: req.user!._id as mongoose.Types.ObjectId,
        actorName: req.user!.name,
        at: new Date(),
        note: `${highlight.eventType} @ ${highlight.videoTimestampSeconds}s`,
      });
      await highlight.save();

      const payload = { ...highlight.toObject(), id: highlight._id.toString() };
      await recordActivity(
        req.user!,
        'UPDATE_HIGHLIGHT',
        'MatchHighlight',
        highlightId,
        `${highlight.eventType} @ ${highlight.videoTimestampSeconds}s`
      );
      emitStreamEvent(streamId, 'highlight:updated', { streamId, highlight: payload });
      res.json({ highlight: payload });
    } catch (err) {
      console.error('[Highlights] Update error:', err);
      res.status(500).json({ message: 'Failed to update highlight.' });
    }
  }
);

router.delete(
  '/highlights/:highlightId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { highlightId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(highlightId)) {
        res.status(400).json({ message: 'Invalid highlight ID.' });
        return;
      }
      const highlight = await MatchHighlight.findById(highlightId);
      if (!highlight) {
        res.status(404).json({ message: 'Highlight not found.' });
        return;
      }
      const streamId = highlight.liveStreamId.toString();
      const allowed = await canManageStream(req.user!, streamId, 'score');
      if (!allowed) {
        res.status(403).json({ message: 'Forbidden: Not authorized to delete highlight.' });
        return;
      }

      await MatchHighlight.deleteOne({ _id: highlightId });
      await recordActivity(
        req.user!,
        'DELETE_HIGHLIGHT',
        'MatchHighlight',
        highlightId,
        `${highlight.eventType} @ ${highlight.videoTimestampSeconds}s`
      );
      emitStreamEvent(streamId, 'highlight:deleted', { streamId, highlightId });
      res.json({ message: 'Highlight deleted.' });
    } catch (err) {
      console.error('[Highlights] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete highlight.' });
    }
  }
);

// ==================== LIVE MATCH CHAT & MODERATION (MODULE 6) ====================
router.get('/live/:id/chat', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }
    const messages = await ChatMessage.find({ liveStreamId: id, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(80)
      .lean();
    res.json({
      messages: messages.reverse().map((m) => ({ ...m, id: m._id.toString() })),
    });
  } catch (err) {
    console.error('[Chat] List error:', err);
    res.status(500).json({ message: 'Failed to load live chat.' });
  }
});

router.post(
  '/live/:id/chat',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Match stream not found.' });
        return;
      }
      if (!stream.chatEnabled) {
        res.status(403).json({ message: 'Live chat is disabled for this match.' });
        return;
      }

      const user = req.user!;
      if (user.chatMutedUntil && new Date(user.chatMutedUntil).getTime() > Date.now()) {
        res.status(403).json({
          message: `You are currently muted from chat${
            user.chatMutedReason ? `: ${user.chatMutedReason}` : '.'
          }`,
        });
        return;
      }

      // Rate-limit spam protection: 5 messages per 15s
      const uid = user._id.toString();
      const now = Date.now();
      const timestamps = (chatRateMap.get(uid) || []).filter((t) => now - t < 15000);
      if (timestamps.length >= 5) {
        res.status(429).json({
          message: 'You are sending messages too fast. Please wait a few seconds.',
        });
        return;
      }
      timestamps.push(now);
      chatRateMap.set(uid, timestamps);

      const text = sanitizeText(req.body.message, 400);
      if (!text) {
        res.status(400).json({ message: 'Chat message cannot be empty.' });
        return;
      }

      const msg = await ChatMessage.create({
        liveStreamId: stream._id,
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        message: text,
      });

      const payload = { ...msg.toObject(), id: msg._id.toString() };
      emitStreamEvent(id, 'chat:message', { streamId: id, message: payload });
      res.status(201).json({ message: payload });
    } catch (err) {
      console.error('[Chat] Post error:', err);
      res.status(500).json({ message: 'Failed to send chat message.' });
    }
  }
);

router.post(
  '/chat/:messageId/report',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { messageId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        res.status(400).json({ message: 'Invalid chat message ID.' });
        return;
      }
      const msg = await ChatMessage.findById(messageId);
      if (!msg) {
        res.status(404).json({ message: 'Message not found.' });
        return;
      }

      const alreadyReported = msg.reports.some(
        (r) => r.userId.toString() === req.user!._id.toString()
      );
      if (alreadyReported) {
        res.json({ message: 'You have already reported this message.', reportedCount: msg.reportedCount });
        return;
      }

      msg.reports.push({
        userId: req.user!._id as mongoose.Types.ObjectId,
        reason: sanitizeText(req.body.reason, 200) || 'Abuse / Spam',
        createdAt: new Date(),
      });
      msg.reportedCount = msg.reports.length;
      await msg.save();

      res.json({ message: 'Message flagged for moderation.', reportedCount: msg.reportedCount });
    } catch (err) {
      console.error('[Chat] Report error:', err);
      res.status(500).json({ message: 'Failed to report message.' });
    }
  }
);

router.delete(
  '/chat/:messageId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!canModerateChat(req.user!)) {
        res.status(403).json({ message: 'Forbidden: Moderation permissions required.' });
        return;
      }
      const { messageId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        res.status(400).json({ message: 'Invalid chat message ID.' });
        return;
      }
      const msg = await ChatMessage.findById(messageId);
      if (!msg) {
        res.status(404).json({ message: 'Message not found.' });
        return;
      }
      msg.isDeleted = true;
      msg.deletedBy = req.user!._id as mongoose.Types.ObjectId;
      await msg.save();

      const streamId = msg.liveStreamId.toString();
      await recordActivity(
        req.user!,
        'MODERATE_DELETE_CHAT',
        'ChatMessage',
        messageId,
        `Deleted message by ${msg.userName}: ${msg.message.slice(0, 80)}`
      );
      emitStreamEvent(streamId, 'chat:deleted', { streamId, messageId });
      res.json({ message: 'Chat message removed.' });
    } catch (err) {
      console.error('[Chat] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete chat message.' });
    }
  }
);

router.post(
  '/chat/mute/:userId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!canModerateChat(req.user!)) {
        res.status(403).json({ message: 'Forbidden: Moderation permissions required.' });
        return;
      }
      const { userId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'Invalid user ID.' });
        return;
      }
      const target = await User.findById(userId);
      if (!target) {
        res.status(404).json({ message: 'User not found.' });
        return;
      }
      if (target.role === 'SUPER_ADMIN') {
        res.status(403).json({ message: 'Cannot mute a Super Admin account.' });
        return;
      }

      const minutes = Number(req.body.minutes);
      if (req.body.unmute === true || minutes === 0) {
        target.chatMutedUntil = null;
        target.chatMutedReason = '';
      } else {
        const durMins = Number.isFinite(minutes) && minutes > 0 ? Math.min(43200, minutes) : 60;
        target.chatMutedUntil = new Date(Date.now() + durMins * 60 * 1000);
        target.chatMutedReason = sanitizeText(req.body.reason, 240) || 'Chat guideline violation';
      }
      await target.save();

      await recordActivity(
        req.user!,
        target.chatMutedUntil ? 'MUTE_CHAT_USER' : 'UNMUTE_CHAT_USER',
        'User',
        userId,
        target.email
      );
      res.json({
        userId,
        chatMutedUntil: target.chatMutedUntil,
        chatMutedReason: target.chatMutedReason,
      });
    } catch (err) {
      console.error('[Chat] Mute error:', err);
      res.status(500).json({ message: 'Failed to update user mute status.' });
    }
  }
);

router.get(
  '/admin/chat/moderation',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!canModerateChat(req.user!)) {
        res.status(403).json({ message: 'Forbidden: Moderation permissions required.' });
        return;
      }
      const [flaggedMessages, recentMessages, mutedUsers] = await Promise.all([
        ChatMessage.find({ reportedCount: { $gt: 0 }, isDeleted: false })
          .populate('liveStreamId', 'matchTitle teamAName teamBName')
          .sort({ reportedCount: -1, createdAt: -1 })
          .limit(50)
          .lean(),
        ChatMessage.find({ isDeleted: false })
          .populate('liveStreamId', 'matchTitle teamAName teamBName')
          .sort({ createdAt: -1 })
          .limit(60)
          .lean(),
        User.find({ chatMutedUntil: { $gt: new Date() } })
          .select('name email role chatMutedUntil chatMutedReason')
          .lean(),
      ]);

      res.json({
        flaggedMessages: flaggedMessages.map((m) => ({ ...m, id: m._id.toString() })),
        recentMessages: recentMessages.map((m) => ({ ...m, id: m._id.toString() })),
        mutedUsers: mutedUsers.map((u) => ({ ...u, id: u._id.toString() })),
      });
    } catch (err) {
      console.error('[Chat] Moderation queue error:', err);
      res.status(500).json({ message: 'Failed to load moderation queue.' });
    }
  }
);

// ==================== LIVE POLLS (MODULE 6) ====================
router.get('/live/:id/polls', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }
    const polls = await Poll.find({ liveStreamId: id }).sort({ createdAt: -1 }).lean();
    res.json({
      polls: polls.map((p) => ({
        id: p._id.toString(),
        liveStreamId: p.liveStreamId.toString(),
        question: p.question,
        options: p.options,
        status: p.status,
        totalVotes: (p.options || []).reduce((acc, o) => acc + (o.votes || 0), 0),
        voterUserIds: (p.voters || []).map((v) => v.userId.toString()),
        voters: p.voters || [],
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error('[Polls] List error:', err);
    res.status(500).json({ message: 'Failed to load polls.' });
  }
});

router.post(
  '/live/:id/polls',
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
      if (!allowed && !canModerateChat(req.user!)) {
        res.status(403).json({ message: 'Forbidden: Not authorized to create match polls.' });
        return;
      }

      const question = sanitizeText(req.body.question, 240);
      const rawOptions = Array.isArray(req.body.options) ? req.body.options : [];
      const cleanOptions = rawOptions
        .map((opt: unknown) => sanitizeText(typeof opt === 'string' ? opt : (opt as any)?.label, 120))
        .filter(Boolean);

      if (!question || cleanOptions.length < 2) {
        res.status(400).json({ message: 'Poll question and at least 2 options are required.' });
        return;
      }

      const poll = await Poll.create({
        liveStreamId: id,
        question,
        options: cleanOptions.slice(0, 6).map((label: string, idx: number) => ({
          id: `opt_${idx + 1}_${Date.now()}`,
          label,
          votes: 0,
        })),
        voters: [],
        status: 'OPEN',
        createdBy: req.user!._id,
      });

      const payload = {
        id: poll._id.toString(),
        liveStreamId: id,
        question: poll.question,
        options: poll.options,
        status: poll.status,
        totalVotes: 0,
        voters: [],
        createdAt: poll.createdAt,
      };
      await recordActivity(req.user!, 'CREATE_POLL', 'Poll', poll._id.toString(), question);
      emitStreamEvent(id, 'poll:updated', { streamId: id, poll: payload });
      res.status(201).json({ poll: payload });
    } catch (err) {
      console.error('[Polls] Create error:', err);
      res.status(500).json({ message: 'Failed to create poll.' });
    }
  }
);

router.post(
  '/polls/:pollId/vote',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { pollId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        res.status(400).json({ message: 'Invalid poll ID.' });
        return;
      }
      const optionId = typeof req.body.optionId === 'string' ? req.body.optionId.trim() : '';
      if (!optionId) {
        res.status(400).json({ message: 'Option selection is required.' });
        return;
      }

      const poll = await Poll.findById(pollId);
      if (!poll) {
        res.status(404).json({ message: 'Poll not found.' });
        return;
      }
      if (poll.status !== 'OPEN') {
        res.status(400).json({ message: 'This poll is closed.' });
        return;
      }

      const optionExists = poll.options.some((o) => o.id === optionId);
      if (!optionExists) {
        res.status(400).json({ message: 'Invalid poll option.' });
        return;
      }

      const updated = await Poll.findOneAndUpdate(
        {
          _id: pollId,
          status: 'OPEN',
          'voters.userId': { $ne: req.user!._id },
          'options.id': optionId,
        },
        {
          $inc: { 'options.$.votes': 1 },
          $push: {
            voters: { userId: req.user!._id, optionId, votedAt: new Date() },
          },
        },
        { new: true }
      ).lean();

      if (!updated) {
        res.status(409).json({ message: 'You have already voted in this poll.' });
        return;
      }

      const streamId = updated.liveStreamId.toString();
      const payload = {
        id: updated._id.toString(),
        liveStreamId: streamId,
        question: updated.question,
        options: updated.options,
        status: updated.status,
        totalVotes: updated.options.reduce((acc, o) => acc + (o.votes || 0), 0),
        voters: updated.voters,
        createdAt: updated.createdAt,
      };
      emitStreamEvent(streamId, 'poll:updated', { streamId, poll: payload });
      res.json({ poll: payload });
    } catch (err) {
      console.error('[Polls] Vote error:', err);
      res.status(500).json({ message: 'Failed to submit vote.' });
    }
  }
);

router.patch(
  '/polls/:pollId/close',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { pollId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        res.status(400).json({ message: 'Invalid poll ID.' });
        return;
      }
      const poll = await Poll.findById(pollId);
      if (!poll) {
        res.status(404).json({ message: 'Poll not found.' });
        return;
      }
      const streamId = poll.liveStreamId.toString();
      const allowed = await canManageStream(req.user!, streamId, 'score');
      if (!allowed && !canModerateChat(req.user!)) {
        res.status(403).json({ message: 'Forbidden: Not authorized to close this poll.' });
        return;
      }

      poll.status = 'CLOSED';
      await poll.save();

      const payload = {
        id: poll._id.toString(),
        liveStreamId: streamId,
        question: poll.question,
        options: poll.options,
        status: poll.status,
        totalVotes: poll.options.reduce((acc, o) => acc + (o.votes || 0), 0),
        voters: poll.voters,
        createdAt: poll.createdAt,
      };
      emitStreamEvent(streamId, 'poll:updated', { streamId, poll: payload });
      res.json({ poll: payload });
    } catch (err) {
      console.error('[Polls] Close error:', err);
      res.status(500).json({ message: 'Failed to close poll.' });
    }
  }
);

// ==================== TEAM FOLLOWING (MODULE 6) ====================
router.post('/teams/:id/follow', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid team ID.' });
      return;
    }
    const team = await Team.findById(id);
    if (!team) {
      res.status(404).json({ message: 'Team not found.' });
      return;
    }

    const userUpdate = await User.updateOne(
      { _id: req.user!._id, followedTeamIds: { $ne: team._id } },
      { $addToSet: { followedTeamIds: team._id } }
    );
    if (userUpdate.modifiedCount > 0) {
      team.followersCount = (team.followersCount || 0) + 1;
      await team.save();
    }

    const updatedUser = await User.findById(req.user!._id).select('followedTeamIds').lean();
    res.json({
      followed: true,
      followersCount: team.followersCount,
      followedTeamIds: (updatedUser?.followedTeamIds || []).map((tid) => tid.toString()),
    });
  } catch (err) {
    console.error('[Follow] Follow team error:', err);
    res.status(500).json({ message: 'Failed to follow team.' });
  }
});

router.delete(
  '/teams/:id/follow',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid team ID.' });
        return;
      }
      const team = await Team.findById(id);
      if (!team) {
        res.status(404).json({ message: 'Team not found.' });
        return;
      }

      const userUpdate = await User.updateOne(
        { _id: req.user!._id, followedTeamIds: team._id },
        { $pull: { followedTeamIds: team._id } }
      );
      if (userUpdate.modifiedCount > 0) {
        team.followersCount = Math.max(0, (team.followersCount || 0) - 1);
        await team.save();
      }

      const updatedUser = await User.findById(req.user!._id).select('followedTeamIds').lean();
      res.json({
        followed: false,
        followersCount: team.followersCount,
        followedTeamIds: (updatedUser?.followedTeamIds || []).map((tid) => tid.toString()),
      });
    } catch (err) {
      console.error('[Follow] Unfollow team error:', err);
      res.status(500).json({ message: 'Failed to unfollow team.' });
    }
  }
);

// ==================== PLAYER & TOURNAMENT FOLLOWING ====================
router.post('/players/:id/follow', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid player ID.' });
      return;
    }
    const player = await Player.findById(id);
    if (!player) {
      res.status(404).json({ message: 'Player not found.' });
      return;
    }

    const userUpdate = await User.updateOne(
      { _id: req.user!._id, followedPlayerIds: { $ne: player._id } },
      { $addToSet: { followedPlayerIds: player._id } }
    );
    if (userUpdate.modifiedCount > 0) {
      player.followersCount = (player.followersCount || 0) + 1;
      await player.save();
    }

    const updatedUser = await User.findById(req.user!._id).select('followedPlayerIds').lean();
    res.json({
      followed: true,
      followersCount: player.followersCount || 0,
      followedPlayerIds: (updatedUser?.followedPlayerIds || []).map((pid) => pid.toString()),
    });
  } catch (err) {
    console.error('[Follow] Follow player error:', err);
    res.status(500).json({ message: 'Failed to follow player.' });
  }
});

router.delete(
  '/players/:id/follow',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid player ID.' });
        return;
      }
      const player = await Player.findById(id);
      if (!player) {
        res.status(404).json({ message: 'Player not found.' });
        return;
      }

      const userUpdate = await User.updateOne(
        { _id: req.user!._id, followedPlayerIds: player._id },
        { $pull: { followedPlayerIds: player._id } }
      );
      if (userUpdate.modifiedCount > 0) {
        player.followersCount = Math.max(0, (player.followersCount || 0) - 1);
        await player.save();
      }

      const updatedUser = await User.findById(req.user!._id).select('followedPlayerIds').lean();
      res.json({
        followed: false,
        followersCount: player.followersCount || 0,
        followedPlayerIds: (updatedUser?.followedPlayerIds || []).map((pid) => pid.toString()),
      });
    } catch (err) {
      console.error('[Follow] Unfollow player error:', err);
      res.status(500).json({ message: 'Failed to unfollow player.' });
    }
  }
);

router.post(
  '/tournaments/:id/follow',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid tournament ID.' });
        return;
      }
      const tournament = await Tournament.findById(id);
      if (!tournament) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }

      const userUpdate = await User.updateOne(
        { _id: req.user!._id, followedTournamentIds: { $ne: tournament._id } },
        { $addToSet: { followedTournamentIds: tournament._id } }
      );
      if (userUpdate.modifiedCount > 0) {
        tournament.followersCount = (tournament.followersCount || 0) + 1;
        await tournament.save();
      }

      const updatedUser = await User.findById(req.user!._id)
        .select('followedTournamentIds')
        .lean();
      res.json({
        followed: true,
        followersCount: tournament.followersCount || 0,
        followedTournamentIds: (updatedUser?.followedTournamentIds || []).map((tid) =>
          tid.toString()
        ),
      });
    } catch (err) {
      console.error('[Follow] Follow tournament error:', err);
      res.status(500).json({ message: 'Failed to follow tournament.' });
    }
  }
);

router.delete(
  '/tournaments/:id/follow',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid tournament ID.' });
        return;
      }
      const tournament = await Tournament.findById(id);
      if (!tournament) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }

      const userUpdate = await User.updateOne(
        { _id: req.user!._id, followedTournamentIds: tournament._id },
        { $pull: { followedTournamentIds: tournament._id } }
      );
      if (userUpdate.modifiedCount > 0) {
        tournament.followersCount = Math.max(0, (tournament.followersCount || 0) - 1);
        await tournament.save();
      }

      const updatedUser = await User.findById(req.user!._id)
        .select('followedTournamentIds')
        .lean();
      res.json({
        followed: false,
        followersCount: tournament.followersCount || 0,
        followedTournamentIds: (updatedUser?.followedTournamentIds || []).map((tid) =>
          tid.toString()
        ),
      });
    } catch (err) {
      console.error('[Follow] Unfollow tournament error:', err);
      res.status(500).json({ message: 'Failed to unfollow tournament.' });
    }
  }
);

router.get('/customer/following', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teamIds = req.user!.followedTeamIds || [];
    const playerIds = req.user!.followedPlayerIds || [];
    const tournamentIds = req.user!.followedTournamentIds || [];

    if (teamIds.length === 0 && playerIds.length === 0 && tournamentIds.length === 0) {
      res.json({
        teams: [],
        players: [],
        tournaments: [],
        upcomingMatches: [],
        liveMatches: [],
        recentResults: [],
      });
      return;
    }

    const [teams, players, tournaments] = await Promise.all([
      teamIds.length > 0 ? Team.find({ _id: { $in: teamIds } }).sort({ name: 1 }).lean() : Promise.resolve([]),
      playerIds.length > 0
        ? Player.find({ _id: { $in: playerIds } })
            .populate('teamId', 'name shortName logoUrl')
            .sort({ name: 1 })
            .lean()
        : Promise.resolve([]),
      tournamentIds.length > 0
        ? Tournament.find({ _id: { $in: tournamentIds } }).sort({ startDate: 1, name: 1 }).lean()
        : Promise.resolve([]),
    ]);

    const playerTeamIds = players
      .map((p: any) => (p.teamId?._id ? p.teamId._id : p.teamId))
      .filter(Boolean);
    const combinedTeamIds = [...teamIds, ...playerTeamIds];

    const streamOr: Record<string, unknown>[] = [];
    if (combinedTeamIds.length > 0) {
      streamOr.push({ teamAId: { $in: combinedTeamIds } }, { teamBId: { $in: combinedTeamIds } });
    }
    if (tournamentIds.length > 0) {
      streamOr.push({ tournamentId: { $in: tournamentIds } });
    }

    const rawStreams =
      streamOr.length > 0
        ? await LiveStream.find({ $or: streamOr })
            .sort({ startedAt: -1, matchDate: 1, createdAt: -1 })
            .limit(50)
            .lean()
        : [];
    const streams = rawStreams.filter((s) => isStreamVisibleToPublic(s));

    const streamIds = streams.map((s) => s._id);
    const scores =
      streamIds.length > 0
        ? await LiveScore.find({ liveStreamId: { $in: streamIds } }).lean()
        : [];
    const scoreMap = new Map(scores.map((sc) => [sc.liveStreamId.toString(), sc]));
    const enrichedStreams = streams.map((s) => ({
      ...s,
      id: s._id.toString(),
      score: scoreMap.get(s._id.toString()) || null,
    }));

    res.json({
      teams: teams.map((t) => ({ ...t, id: t._id.toString() })),
      players: players.map((p) => ({ ...p, id: p._id.toString() })),
      tournaments: tournaments.map((tr) => ({ ...tr, id: tr._id.toString() })),
      liveMatches: enrichedStreams.filter((s) => s.status === 'LIVE'),
      upcomingMatches: enrichedStreams.filter((s) => s.status === 'UPCOMING'),
      recentResults: enrichedStreams.filter((s) => s.status === 'ENDED'),
    });
  } catch (err) {
    console.error('[Follow] Following feed error:', err);
    res.status(500).json({ message: 'Failed to load favorites feed.' });
  }
});

export default router;
