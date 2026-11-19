import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import liveStreamRoutes from './liveStreamRoutes.ts';
import scoreRoutes from './scoreRoutes.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { Tournament } from '../models/Tournament.ts';
import { Team } from '../models/Team.ts';
import { Player } from '../models/Player.ts';
import { Sponsor } from '../models/Sponsor.ts';
import { TournamentRegistration } from '../models/TournamentRegistration.ts';
import type { IRosterPlayerEntry } from '../models/TournamentRegistration.ts';
import { extractKeyFromQueryString, getMediaMTXEnvConfig } from '../services/mediamtxService.ts';
import { getDatabaseDiagnostics, retryMongoConnection } from '../config/db.ts';
import {
  authenticate,
  hasGranularPermission,
  requireAdminPortal,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { sanitizeImageUrl, sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';
import { emitUserNotification } from '../socket/index.ts';
import { Notification } from '../models/Notification.ts';

const router = Router();

function computeIsMinorFromDob(dob: string): boolean {
  if (!dob) return false;
  const parsed = new Date(dob);
  if (isNaN(parsed.getTime())) return false;
  const ageYears = (Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18;
}

function stripPrivateRegistrationFields(reg: any) {
  const copy = { ...reg };
  delete copy.verificationDocUrl;
  delete copy.verificationNotes;
  delete copy.captainPhone;
  delete copy.captainEmail;
  return copy;
}

// ==================== V1 LIVE STREAMS & MATCHES ====================
router.use('/live-streams', liveStreamRoutes);
router.use('/live-streams', scoreRoutes);

// Tournament Matches alias routes + score + provider switching
router.use('/matches', liveStreamRoutes);
router.use('/matches', scoreRoutes);

// ==================== MEDIAMTX PUBLISH AUTH WEBHOOK ====================
// Supports MediaMTX `externalAuthenticationURL` POST payload: { user, password, ip, action, path, protocol, id, query }
router.post('/mediamtx/auth', async (req: Request, res: Response) => {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    const rawPath = String(req.body?.path || '').replace(/^\/+/, '').trim();
    const rawQuery = String(req.body?.query || '');

    // Allow read/playback requests publicly unless explicitly restricted
    if (action === 'read' || action === 'playback' || action === 'api' || action === 'metrics') {
      res.status(200).json({ ok: true });
      return;
    }

    if (!rawPath) {
      res.status(401).json({ ok: false, message: 'Missing MediaMTX stream path.' });
      return;
    }

    const suppliedKey =
      extractKeyFromQueryString(rawQuery) || String(req.body?.password || '').trim();
    if (!suppliedKey) {
      res.status(401).json({ ok: false, message: 'Missing MediaMTX stream key.' });
      return;
    }

    const stream = await LiveStream.findOne({ mediamtxStreamPath: rawPath }).select(
      '+mediamtxStreamKey'
    );
    if (!stream || !stream.mediamtxStreamKey || stream.mediamtxStreamKey !== suppliedKey) {
      res.status(403).json({ ok: false, message: 'Invalid MediaMTX stream key or path.' });
      return;
    }

    if (action === 'publish') {
      stream.mediamtxPublishStatus = 'PUBLISHING';
      stream.streamHealth = {
        ok: true,
        status: 'PUBLISHING',
        checkedAt: new Date(),
        latencyMs: 0,
        detail: 'RTMP encoder authenticated and publishing to MediaMTX.',
      };
      await stream.save();
    }

    res.status(200).json({ ok: true, streamId: stream._id.toString() });
  } catch (err) {
    console.error('[MediaMTX Auth] Error:', err);
    res.status(500).json({ ok: false, message: 'MediaMTX auth validation error.' });
  }
});

// ==================== ADMIN DIAGNOSTICS & RETRY MONGODB ====================
router.get(
  '/admin/diagnostics',
  authenticate,
  requireAdminPortal,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const diagnostics = await getDatabaseDiagnostics();
      const mtxEnv = getMediaMTXEnvConfig();
      res.json({
        database: diagnostics,
        mediamtx: {
          rtmpBase: mtxEnv.rtmpBase,
          hlsBase: mtxEnv.hlsBase,
          webrtcBase: mtxEnv.webrtcBase,
          apiConfigured: Boolean(process.env.MEDIAMTX_API_URL),
        },
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
      });
    } catch (err) {
      console.error('[Diagnostics] Error:', err);
      res.status(500).json({ message: 'Failed to read system diagnostics.' });
    }
  }
);

router.post(
  '/admin/diagnostics/retry-mongo',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await retryMongoConnection();
      await recordActivity(
        req.user!,
        'RETRY_MONGODB_CONNECTION',
        'Database',
        'engine',
        `Retry MongoDB -> ${result.engine} (${result.ok ? 'connected' : 'fallback'})`
      );
      res.json(result);
    } catch (err) {
      console.error('[Diagnostics] Retry Mongo error:', err);
      res.status(500).json({ message: 'Failed to retry MongoDB connection.' });
    }
  }
);

// ==================== CAPTAIN TOURNAMENT REGISTRATION WORKFLOW ====================
router.post(
  '/tournaments/:id/register',
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

      const existing = await TournamentRegistration.findOne({
        tournamentId: id,
        captainUserId: req.user!._id,
        status: { $in: ['PENDING', 'APPROVED'] },
      });
      if (existing) {
        res.status(409).json({
          message: 'You already have an active registration for this tournament.',
          registration: { ...existing.toObject(), id: existing._id.toString() },
        });
        return;
      }

      const teamName = sanitizeText(req.body.teamName, 120);
      const captainName = sanitizeText(req.body.captainName, 120) || req.user!.name;
      if (!teamName || !captainName) {
        res.status(400).json({ message: 'Team name and captain name are required.' });
        return;
      }

      const rawRoster = Array.isArray(req.body.roster) ? req.body.roster : [];
      const roster: IRosterPlayerEntry[] = [];
      for (const item of rawRoster) {
        const pName = sanitizeText(item?.name, 120);
        if (!pName) continue;
        const dob = sanitizeText(item?.dateOfBirth, 30);
        const isMinor = typeof item?.isMinor === 'boolean' ? item.isMinor : computeIsMinorFromDob(dob);
        const guardianName = sanitizeText(item?.guardianName, 120);
        const guardianPhone = sanitizeText(item?.guardianPhone, 30);
        const guardianConsent = Boolean(item?.guardianConsent);

        if (isMinor && (!guardianName || !guardianPhone || !guardianConsent)) {
          res.status(400).json({
            message: `Player "${pName}" is a minor (under 18). Guardian name, phone, and consent are required.`,
          });
          return;
        }

        roster.push({
          name: pName,
          role: sanitizeText(item?.role, 80),
          jerseyNumber:
            item?.jerseyNumber !== undefined &&
            item?.jerseyNumber !== '' &&
            Number.isFinite(Number(item?.jerseyNumber))
              ? Math.max(0, Math.min(999, Number(item.jerseyNumber)))
              : null,
          dateOfBirth: dob,
          isMinor,
          guardianName,
          guardianPhone,
          guardianConsent,
        });
      }

      if (roster.length === 0) {
        res.status(400).json({ message: 'Please add at least one player to your team roster.' });
        return;
      }

      // Auto-upgrade SPECTATOR account to CAPTAIN on first tournament registration
      if (req.user!.role === 'SPECTATOR') {
        req.user!.role = 'CAPTAIN';
        await req.user!.save();
      }

      const feeAmount = Math.max(0, Number(tournament.registrationFee) || 0);
      const reg = await TournamentRegistration.create({
        tournamentId: tournament._id,
        captainUserId: req.user!._id,
        teamName,
        teamShortName: sanitizeText(req.body.teamShortName, 12).toUpperCase() || teamName.slice(0, 3).toUpperCase(),
        teamLogoUrl: sanitizeImageUrl(req.body.teamLogoUrl),
        city: sanitizeText(req.body.city, 100),
        captainName,
        captainPhone: sanitizeText(req.body.captainPhone, 30) || req.user!.phone || '',
        captainEmail: sanitizeText(req.body.captainEmail, 160) || req.user!.email,
        verificationDocUrl: sanitizeImageUrl(req.body.verificationDocUrl),
        verificationNotes: sanitizeText(req.body.verificationNotes, 500),
        roster,
        feeAmount,
        feeStatus: feeAmount > 0 ? 'PENDING' : 'WAIVED',
        status: 'PENDING',
      });

      await recordActivity(
        req.user!,
        'SUBMIT_TOURNAMENT_REGISTRATION',
        'TournamentRegistration',
        reg._id.toString(),
        `${teamName} -> ${tournament.name}`
      );

      res.status(201).json({
        registration: { ...reg.toObject(), id: reg._id.toString() },
        message: 'Team registration submitted for organizer approval.',
      });
    } catch (err) {
      console.error('[Registrations] Submit error:', err);
      res.status(500).json({ message: 'Failed to submit tournament registration.' });
    }
  }
);

router.get(
  '/tournaments/:id/my-registration',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid tournament ID.' });
        return;
      }
      const reg = await TournamentRegistration.findOne({
        tournamentId: id,
        captainUserId: req.user!._id,
      })
        .select('+verificationDocUrl +verificationNotes')
        .sort({ createdAt: -1 })
        .lean();

      res.json({ registration: reg ? { ...reg, id: reg._id.toString() } : null });
    } catch (err) {
      console.error('[Registrations] My registration error:', err);
      res.status(500).json({ message: 'Failed to load your registration.' });
    }
  }
);

// Public approved tournament registrations (STRICTLY omits private verification docs & phone/email)
router.get('/tournaments/:id/registrations', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid tournament ID.' });
      return;
    }
    const regs = await TournamentRegistration.find({
      tournamentId: id,
      status: 'APPROVED',
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      registrations: regs.map((r) => ({
        ...stripPrivateRegistrationFields(r),
        id: r._id.toString(),
      })),
    });
  } catch (err) {
    console.error('[Registrations] Public list error:', err);
    res.status(500).json({ message: 'Failed to load approved registrations.' });
  }
});

router.patch(
  '/registrations/:id',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }
      const reg = await TournamentRegistration.findById(id).select(
        '+verificationDocUrl +verificationNotes'
      );
      if (!reg) {
        res.status(404).json({ message: 'Registration not found.' });
        return;
      }
      if (reg.captainUserId.toString() !== req.user!._id.toString()) {
        res.status(403).json({ message: 'Forbidden: Only the submitting captain can edit this registration.' });
        return;
      }
      if (reg.status === 'APPROVED') {
        res.status(409).json({ message: 'Approved registrations cannot be modified directly.' });
        return;
      }

      if (req.body.teamName !== undefined) {
        const clean = sanitizeText(req.body.teamName, 120);
        if (clean) reg.teamName = clean;
      }
      if (req.body.teamShortName !== undefined) {
        reg.teamShortName = sanitizeText(req.body.teamShortName, 12).toUpperCase();
      }
      if (req.body.teamLogoUrl !== undefined) reg.teamLogoUrl = sanitizeImageUrl(req.body.teamLogoUrl);
      if (req.body.city !== undefined) reg.city = sanitizeText(req.body.city, 100);
      if (req.body.captainName !== undefined) reg.captainName = sanitizeText(req.body.captainName, 120);
      if (req.body.captainPhone !== undefined) reg.captainPhone = sanitizeText(req.body.captainPhone, 30);
      if (req.body.verificationDocUrl !== undefined) {
        reg.verificationDocUrl = sanitizeImageUrl(req.body.verificationDocUrl);
      }
      if (req.body.verificationNotes !== undefined) {
        reg.verificationNotes = sanitizeText(req.body.verificationNotes, 500);
      }
      if (Array.isArray(req.body.roster)) {
        const nextRoster: IRosterPlayerEntry[] = [];
        for (const item of req.body.roster) {
          const pName = sanitizeText(item?.name, 120);
          if (!pName) continue;
          const dob = sanitizeText(item?.dateOfBirth, 30);
          const isMinor =
            typeof item?.isMinor === 'boolean' ? item.isMinor : computeIsMinorFromDob(dob);
          const guardianName = sanitizeText(item?.guardianName, 120);
          const guardianPhone = sanitizeText(item?.guardianPhone, 30);
          const guardianConsent = Boolean(item?.guardianConsent);
          if (isMinor && (!guardianName || !guardianPhone || !guardianConsent)) {
            res.status(400).json({
              message: `Player "${pName}" is a minor. Guardian name, phone, and consent are required.`,
            });
            return;
          }
          nextRoster.push({
            name: pName,
            role: sanitizeText(item?.role, 80),
            jerseyNumber:
              item?.jerseyNumber !== undefined &&
              item?.jerseyNumber !== '' &&
              Number.isFinite(Number(item?.jerseyNumber))
                ? Math.max(0, Math.min(999, Number(item.jerseyNumber)))
                : null,
            dateOfBirth: dob,
            isMinor,
            guardianName,
            guardianPhone,
            guardianConsent,
          });
        }
        if (nextRoster.length > 0) reg.roster = nextRoster;
      }
      if (reg.status === 'REJECTED') reg.status = 'PENDING';
      await reg.save();

      res.json({ registration: { ...reg.toObject(), id: reg._id.toString() } });
    } catch (err) {
      console.error('[Registrations] Edit error:', err);
      res.status(500).json({ message: 'Failed to update registration.' });
    }
  }
);

router.post(
  '/registrations/:id/withdraw',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }
      const reg = await TournamentRegistration.findById(id);
      if (!reg) {
        res.status(404).json({ message: 'Registration not found.' });
        return;
      }
      if (reg.captainUserId.toString() !== req.user!._id.toString()) {
        res.status(403).json({ message: 'Forbidden: Only the submitting captain can withdraw.' });
        return;
      }
      reg.status = 'WITHDRAWN';
      await reg.save();
      res.json({ registration: { ...reg.toObject(), id: reg._id.toString() } });
    } catch (err) {
      console.error('[Registrations] Withdraw error:', err);
      res.status(500).json({ message: 'Failed to withdraw registration.' });
    }
  }
);

router.get(
  '/admin/registrations',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await hasGranularPermission(req.user!, 'registrations:review');
      if (!ok) {
        res.status(403).json({ message: 'Forbidden: Registration review permission required.' });
        return;
      }

      const query: Record<string, unknown> = {};
      if (
        typeof req.query.status === 'string' &&
        ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'].includes(req.query.status)
      ) {
        query.status = req.query.status;
      }
      if (
        typeof req.query.tournamentId === 'string' &&
        mongoose.Types.ObjectId.isValid(req.query.tournamentId)
      ) {
        query.tournamentId = req.query.tournamentId;
      }

      const regs = await TournamentRegistration.find(query)
        .select('+verificationDocUrl +verificationNotes')
        .populate('tournamentId', 'name sportType')
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        registrations: regs.map((r: any) => ({
          ...r,
          id: r._id.toString(),
          tournament: r.tournamentId
            ? { ...r.tournamentId, id: r.tournamentId._id?.toString() || '' }
            : null,
        })),
      });
    } catch (err) {
      console.error('[AdminRegistrations] List error:', err);
      res.status(500).json({ message: 'Failed to load tournament registrations.' });
    }
  }
);

router.post(
  '/admin/registrations/:id/review',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await hasGranularPermission(req.user!, 'registrations:review');
      if (!ok) {
        res.status(403).json({ message: 'Forbidden: Registration review permission required.' });
        return;
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }

      const decision = req.body.decision === 'APPROVED' ? 'APPROVED' : req.body.decision === 'REJECTED' ? 'REJECTED' : null;
      if (!decision) {
        res.status(400).json({ message: 'Decision must be APPROVED or REJECTED.' });
        return;
      }

      const reg = await TournamentRegistration.findById(id).select(
        '+verificationDocUrl +verificationNotes'
      );
      if (!reg) {
        res.status(404).json({ message: 'Registration not found.' });
        return;
      }

      const tournament = await Tournament.findById(reg.tournamentId);
      if (!tournament) {
        res.status(404).json({ message: 'Parent tournament not found.' });
        return;
      }

      reg.status = decision;
      reg.reviewNotes = sanitizeText(req.body.reviewNotes, 400);
      reg.reviewedBy = req.user!._id as mongoose.Types.ObjectId;
      reg.reviewedAt = new Date();

      if (decision === 'APPROVED' && !reg.teamId) {
        const team = await Team.create({
          name: reg.teamName,
          shortName: reg.teamShortName || reg.teamName.slice(0, 3).toUpperCase(),
          logoUrl: reg.teamLogoUrl || '',
          sportType: tournament.sportType,
          city: reg.city || '',
          captainName: reg.captainName,
          tournamentId: tournament._id,
          createdBy: req.user!._id,
          updatedBy: req.user!._id,
        });
        reg.teamId = team._id as mongoose.Types.ObjectId;

        const currentTeamIds = Array.isArray(tournament.teamIds) ? tournament.teamIds : [];
        if (!currentTeamIds.some((tid: any) => tid.toString() === team._id.toString())) {
          tournament.teamIds = [...currentTeamIds, team._id as mongoose.Types.ObjectId];
          await tournament.save();
        }

        for (const entry of reg.roster || []) {
          await Player.create({
            name: entry.name,
            teamId: team._id,
            sportType: tournament.sportType,
            role: entry.role || '',
            jerseyNumber: entry.jerseyNumber ?? null,
            dateOfBirth: entry.dateOfBirth || '',
            isMinor: Boolean(entry.isMinor),
            isVerified: true,
            verifiedBy: req.user!._id,
            createdBy: req.user!._id,
            updatedBy: req.user!._id,
          });
        }
      }

      await reg.save();

      await recordActivity(
        req.user!,
        decision === 'APPROVED' ? 'APPROVE_REGISTRATION' : 'REJECT_REGISTRATION',
        'TournamentRegistration',
        id,
        `${reg.teamName} -> ${decision}`
      );

      const notif = await Notification.create({
        userId: reg.captainUserId,
        type: 'TOURNAMENT_PUBLISHED',
        title:
          decision === 'APPROVED'
            ? `Team Approved: ${reg.teamName}`
            : `Registration Update: ${reg.teamName}`,
        message:
          decision === 'APPROVED'
            ? `Your team "${reg.teamName}" was approved for ${tournament.name}!`
            : `Your registration for "${reg.teamName}" in ${tournament.name} was declined. ${reg.reviewNotes || ''}`.trim(),
        entityType: 'Tournament',
        entityId: tournament._id.toString(),
        link: `/tournaments/${tournament._id.toString()}`,
        dedupeKey: `reg-review-${id}-${decision}`,
      });
      emitUserNotification(reg.captainUserId.toString(), notif.toObject());

      res.json({ registration: { ...reg.toObject(), id: reg._id.toString() } });
    } catch (err) {
      console.error('[AdminRegistrations] Review error:', err);
      res.status(500).json({ message: 'Failed to review tournament registration.' });
    }
  }
);

// ==================== SPONSORS PUBLIC & IMPRESSION/CLICK TRACKING ====================
router.get('/sponsors/public', async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = { isPublished: true, isActive: true };
    if (
      typeof req.query.placement === 'string' &&
      ['live_match', 'home_feed', 'tournament_banner'].includes(req.query.placement)
    ) {
      query.placement = req.query.placement;
    }
    if (
      typeof req.query.tournamentId === 'string' &&
      mongoose.Types.ObjectId.isValid(req.query.tournamentId)
    ) {
      query.$or = [{ tournamentId: req.query.tournamentId }, { tournamentId: null }];
    }
    if (
      typeof req.query.liveStreamId === 'string' &&
      mongoose.Types.ObjectId.isValid(req.query.liveStreamId)
    ) {
      query.$or = [{ liveStreamId: req.query.liveStreamId }, { liveStreamId: null }];
    }

    const sponsors = await Sponsor.find(query).sort({ createdAt: -1 }).lean();
    res.json({ sponsors: sponsors.map((s) => ({ ...s, id: s._id.toString() })) });
  } catch (err) {
    console.error('[SponsorsV1] Public error:', err);
    res.status(500).json({ message: 'Failed to load public sponsors.' });
  }
});

router.post('/sponsors/:id/impression', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid sponsor ID.' });
      return;
    }
    await Sponsor.updateOne({ _id: id }, { $inc: { impressionsCount: 1 } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

router.post('/sponsors/:id/click', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid sponsor ID.' });
      return;
    }
    await Sponsor.updateOne({ _id: id }, { $inc: { clicksCount: 1 } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

export default router;
