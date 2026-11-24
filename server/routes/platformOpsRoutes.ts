import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Venue } from '../models/Venue.ts';
import { Sponsor, SponsorOverlay } from '../models/Sponsor.ts';
import { Notification } from '../models/Notification.ts';
import { MatchReport } from '../models/MatchReport.ts';
import { ViewerMetric } from '../models/ViewerMetric.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { Tournament } from '../models/Tournament.ts';
import { Player } from '../models/Player.ts';
import { PlayerMatchStat } from '../models/PlayerMatchStat.ts';
import {
  OrganizerSubscription,
  RevenueRecord,
  SubscriptionPlan,
} from '../models/SubscriptionPlan.ts';
import {
  authenticate,
  canManageStream,
  optionalAuthenticate,
  requireAdminPortal,
  requirePermission,
  requireRole,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { sanitizeImageUrl, sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';
import { emitStreamEvent, getAllActiveViewerCounts } from '../socket/index.ts';

const router = Router();

// ==================== VENUES (MODULE 8) ====================
router.get('/venues', async (_req: Request, res: Response) => {
  try {
    const venues = await Venue.find().sort({ name: 1 }).lean();
    res.json({
      venues: venues.map((v) => ({ ...v, id: v._id.toString() })),
    });
  } catch (err) {
    console.error('[Venues] List error:', err);
    res.status(500).json({ message: 'Failed to load venues.' });
  }
});

router.post(
  '/venues',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const canManage =
        req.user!.role === 'SUPER_ADMIN' ||
        req.user!.role === 'ADMIN' ||
        req.user!.role === 'TOURNAMENT_ORGANIZER' ||
        Boolean(req.user!.permissions?.manageVenues);
      if (!canManage) {
        res.status(403).json({ message: 'Forbidden: Not authorized to create venues.' });
        return;
      }

      const name = sanitizeText(req.body.name, 160);
      if (!name) {
        res.status(400).json({ message: 'Venue name is required.' });
        return;
      }

      const lat =
        req.body.latitude !== undefined && req.body.latitude !== '' && req.body.latitude !== null
          ? Number(req.body.latitude)
          : null;
      const lng =
        req.body.longitude !== undefined && req.body.longitude !== '' && req.body.longitude !== null
          ? Number(req.body.longitude)
          : null;

      const venue = await Venue.create({
        name,
        address: sanitizeText(req.body.address, 280),
        city: sanitizeText(req.body.city, 100),
        state: sanitizeText(req.body.state, 100),
        details: sanitizeText(req.body.details, 600),
        latitude: lat !== null && Number.isFinite(lat) ? lat : null,
        longitude: lng !== null && Number.isFinite(lng) ? lng : null,
        createdBy: req.user!._id,
        updatedBy: req.user!._id,
      });

      await recordActivity(req.user!, 'CREATE_VENUE', 'Venue', venue._id.toString(), name);
      res.status(201).json({ venue: { ...venue.toObject(), id: venue._id.toString() } });
    } catch (err) {
      console.error('[Venues] Create error:', err);
      res.status(500).json({ message: 'Failed to create venue.' });
    }
  }
);

router.patch(
  '/venues/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid venue ID.' });
        return;
      }
      const canManage =
        req.user!.role === 'SUPER_ADMIN' ||
        req.user!.role === 'ADMIN' ||
        req.user!.role === 'TOURNAMENT_ORGANIZER' ||
        Boolean(req.user!.permissions?.manageVenues);
      if (!canManage) {
        res.status(403).json({ message: 'Forbidden: Not authorized to update venues.' });
        return;
      }

      const venue = await Venue.findById(id);
      if (!venue) {
        res.status(404).json({ message: 'Venue not found.' });
        return;
      }

      if (req.body.name !== undefined) {
        const clean = sanitizeText(req.body.name, 160);
        if (!clean) {
          res.status(400).json({ message: 'Venue name cannot be empty.' });
          return;
        }
        venue.name = clean;
      }
      if (req.body.address !== undefined) venue.address = sanitizeText(req.body.address, 280);
      if (req.body.city !== undefined) venue.city = sanitizeText(req.body.city, 100);
      if (req.body.state !== undefined) venue.state = sanitizeText(req.body.state, 100);
      if (req.body.details !== undefined) venue.details = sanitizeText(req.body.details, 600);
      if (req.body.latitude !== undefined) {
        const lat =
          req.body.latitude !== '' && req.body.latitude !== null ? Number(req.body.latitude) : null;
        venue.latitude = lat !== null && Number.isFinite(lat) ? lat : null;
      }
      if (req.body.longitude !== undefined) {
        const lng =
          req.body.longitude !== '' && req.body.longitude !== null ? Number(req.body.longitude) : null;
        venue.longitude = lng !== null && Number.isFinite(lng) ? lng : null;
      }
      venue.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await venue.save();

      await recordActivity(req.user!, 'UPDATE_VENUE', 'Venue', id, venue.name);
      res.json({ venue: { ...venue.toObject(), id: venue._id.toString() } });
    } catch (err) {
      console.error('[Venues] Update error:', err);
      res.status(500).json({ message: 'Failed to update venue.' });
    }
  }
);

router.delete(
  '/venues/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid venue ID.' });
        return;
      }
      const canManage =
        req.user!.role === 'SUPER_ADMIN' ||
        req.user!.role === 'ADMIN' ||
        Boolean(req.user!.permissions?.manageVenues);
      if (!canManage) {
        res.status(403).json({ message: 'Forbidden: Not authorized to delete venues.' });
        return;
      }

      const deleted = await Venue.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ message: 'Venue not found.' });
        return;
      }
      await recordActivity(req.user!, 'DELETE_VENUE', 'Venue', id, deleted.name);
      res.json({ message: 'Venue deleted.' });
    } catch (err) {
      console.error('[Venues] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete venue.' });
    }
  }
);

// ==================== SPONSORS & OVERLAYS (MODULE 9) ====================
router.get('/sponsors', async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    if (req.query.publishedOnly === 'true') {
      query.isPublished = true;
      query.isActive = true;
    }
    const sponsors = await Sponsor.find(query)
      .populate('tournamentId', 'name')
      .populate('liveStreamId', 'matchTitle')
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      sponsors: sponsors.map((s) => ({ ...s, id: s._id.toString() })),
    });
  } catch (err) {
    console.error('[Sponsors] List error:', err);
    res.status(500).json({ message: 'Failed to load sponsors.' });
  }
});

router.post(
  '/sponsors',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const canManage =
        req.user!.role === 'SUPER_ADMIN' ||
        req.user!.role === 'ADMIN' ||
        Boolean(req.user!.permissions?.manageSponsors);
      if (!canManage) {
        res.status(403).json({ message: 'Forbidden: Sponsor management permission required.' });
        return;
      }

      const name = sanitizeText(req.body.name, 140);
      if (!name) {
        res.status(400).json({ message: 'Sponsor name is required.' });
        return;
      }

      const placement = ['live_match', 'home_feed', 'tournament_banner'].includes(req.body.placement)
        ? req.body.placement
        : 'live_match';

      const sponsor = await Sponsor.create({
        name,
        logoUrl: sanitizeImageUrl(req.body.logoUrl),
        websiteUrl: sanitizeText(req.body.websiteUrl, 300),
        contactInfo: sanitizeText(req.body.contactInfo, 200),
        sponsorshipType: sanitizeText(req.body.sponsorshipType, 80) || 'Broadcast Partner',
        placement,
        tagline: sanitizeText(req.body.tagline, 200),
        ctaText: sanitizeText(req.body.ctaText, 60) || 'Visit Partner',
        tournamentId:
          req.body.tournamentId && mongoose.Types.ObjectId.isValid(req.body.tournamentId)
            ? req.body.tournamentId
            : null,
        liveStreamId:
          req.body.liveStreamId && mongoose.Types.ObjectId.isValid(req.body.liveStreamId)
            ? req.body.liveStreamId
            : null,
        isPublished: req.body.isPublished === false ? false : true,
        isActive: req.body.isActive === false ? false : true,
        createdBy: req.user!._id,
      });

      await recordActivity(req.user!, 'CREATE_SPONSOR', 'Sponsor', sponsor._id.toString(), name);
      res.status(201).json({ sponsor: { ...sponsor.toObject(), id: sponsor._id.toString() } });
    } catch (err) {
      console.error('[Sponsors] Create error:', err);
      res.status(500).json({ message: 'Failed to create sponsor.' });
    }
  }
);

router.patch(
  '/sponsors/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid sponsor ID.' });
        return;
      }
      const canManage =
        req.user!.role === 'SUPER_ADMIN' ||
        req.user!.role === 'ADMIN' ||
        Boolean(req.user!.permissions?.manageSponsors);
      if (!canManage) {
        res.status(403).json({ message: 'Forbidden: Sponsor management permission required.' });
        return;
      }

      const sponsor = await Sponsor.findById(id);
      if (!sponsor) {
        res.status(404).json({ message: 'Sponsor not found.' });
        return;
      }

      if (req.body.name !== undefined) {
        const clean = sanitizeText(req.body.name, 140);
        if (clean) sponsor.name = clean;
      }
      if (req.body.logoUrl !== undefined) sponsor.logoUrl = sanitizeImageUrl(req.body.logoUrl);
      if (req.body.websiteUrl !== undefined) sponsor.websiteUrl = sanitizeText(req.body.websiteUrl, 300);
      if (req.body.contactInfo !== undefined) sponsor.contactInfo = sanitizeText(req.body.contactInfo, 200);
      if (req.body.sponsorshipType !== undefined) {
        sponsor.sponsorshipType = sanitizeText(req.body.sponsorshipType, 80);
      }
      if (['live_match', 'home_feed', 'tournament_banner'].includes(req.body.placement)) {
        sponsor.placement = req.body.placement;
      }
      if (req.body.tagline !== undefined) sponsor.tagline = sanitizeText(req.body.tagline, 200);
      if (req.body.ctaText !== undefined) sponsor.ctaText = sanitizeText(req.body.ctaText, 60);
      if (req.body.tournamentId !== undefined) {
        sponsor.tournamentId =
          req.body.tournamentId && mongoose.Types.ObjectId.isValid(req.body.tournamentId)
            ? req.body.tournamentId
            : null;
      }
      if (req.body.liveStreamId !== undefined) {
        sponsor.liveStreamId =
          req.body.liveStreamId && mongoose.Types.ObjectId.isValid(req.body.liveStreamId)
            ? req.body.liveStreamId
            : null;
      }
      if (typeof req.body.isPublished === 'boolean') sponsor.isPublished = req.body.isPublished;
      if (typeof req.body.isActive === 'boolean') sponsor.isActive = req.body.isActive;
      await sponsor.save();

      await recordActivity(req.user!, 'UPDATE_SPONSOR', 'Sponsor', id, sponsor.name);
      res.json({ sponsor: { ...sponsor.toObject(), id: sponsor._id.toString() } });
    } catch (err) {
      console.error('[Sponsors] Update error:', err);
      res.status(500).json({ message: 'Failed to update sponsor.' });
    }
  }
);

router.delete(
  '/sponsors/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid sponsor ID.' });
        return;
      }
      const canManage =
        req.user!.role === 'SUPER_ADMIN' ||
        req.user!.role === 'ADMIN' ||
        Boolean(req.user!.permissions?.manageSponsors);
      if (!canManage) {
        res.status(403).json({ message: 'Forbidden: Sponsor management permission required.' });
        return;
      }

      const deleted = await Sponsor.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ message: 'Sponsor not found.' });
        return;
      }
      await SponsorOverlay.deleteMany({ sponsorId: id });
      await recordActivity(req.user!, 'DELETE_SPONSOR', 'Sponsor', id, deleted.name);
      res.json({ message: 'Sponsor deleted.' });
    } catch (err) {
      console.error('[Sponsors] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete sponsor.' });
    }
  }
);

// Public active & published sponsor overlays for a live match
router.get('/live/:id/sponsors', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }
    const stream = await LiveStream.findById(id).select('tournamentId').lean();
    if (!stream) {
      res.status(404).json({ message: 'Stream not found.' });
      return;
    }

    const overlayFilter: Record<string, unknown>[] = [{ liveStreamId: id }];
    if (stream.tournamentId) {
      overlayFilter.push({ tournamentId: stream.tournamentId, liveStreamId: null });
    }
    overlayFilter.push({ liveStreamId: null, tournamentId: null });

    const overlays = await SponsorOverlay.find({
      isVisible: true,
      $or: overlayFilter,
    })
      .populate('sponsorId')
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();

    const activeOverlays = overlays
      .filter((ov: any) => ov.sponsorId && ov.sponsorId.isActive && ov.sponsorId.isPublished)
      .map((ov: any) => ({
        ...ov,
        id: ov._id.toString(),
        sponsor: { ...ov.sponsorId, id: ov.sponsorId._id.toString() },
      }));

    res.json({ overlays: activeOverlays });
  } catch (err) {
    console.error('[SponsorOverlays] Live list error:', err);
    res.status(500).json({ message: 'Failed to load match sponsor overlays.' });
  }
});

router.get(
  '/admin/sponsor-overlays',
  authenticate,
  requireAdminPortal,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const overlays = await SponsorOverlay.find()
        .populate('sponsorId', 'name logoUrl sponsorshipType isActive isPublished')
        .populate('liveStreamId', 'matchTitle teamAName teamBName')
        .populate('tournamentId', 'name')
        .sort({ displayOrder: 1, createdAt: -1 })
        .lean();

      res.json({
        overlays: overlays.map((ov: any) => ({
          ...ov,
          id: ov._id.toString(),
          sponsor: ov.sponsorId
            ? { ...ov.sponsorId, id: ov.sponsorId._id.toString() }
            : null,
        })),
      });
    } catch (err) {
      console.error('[SponsorOverlays] Admin list error:', err);
      res.status(500).json({ message: 'Failed to load sponsor overlays.' });
    }
  }
);

router.post(
  '/admin/sponsor-overlays',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const canManage =
        req.user!.role === 'SUPER_ADMIN' ||
        req.user!.role === 'ADMIN' ||
        Boolean(req.user!.permissions?.manageSponsors);
      if (!canManage) {
        res.status(403).json({ message: 'Forbidden: Sponsor management permission required.' });
        return;
      }

      if (!req.body.sponsorId || !mongoose.Types.ObjectId.isValid(req.body.sponsorId)) {
        res.status(400).json({ message: 'Valid sponsorId is required.' });
        return;
      }

      const validAnimations = ['none', 'pulse', 'float', 'glow', 'shimmer', 'bounce'];
      const validTransitions = [
        'fade',
        'slide-left',
        'slide-right',
        'slide-top',
        'slide-bottom',
        'zoom',
        'pop',
        'none',
      ];
      const parsedDuration = Number(req.body.durationSeconds);
      const parsedTransitionMs = Number(req.body.transitionDurationMs);
      const parsedRepeatSec = Number(req.body.repeatIntervalSeconds);

      const overlay = await SponsorOverlay.create({
        sponsorId: req.body.sponsorId,
        liveStreamId:
          req.body.liveStreamId && mongoose.Types.ObjectId.isValid(req.body.liveStreamId)
            ? req.body.liveStreamId
            : null,
        tournamentId:
          req.body.tournamentId && mongoose.Types.ObjectId.isValid(req.body.tournamentId)
            ? req.body.tournamentId
            : null,
        position: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'].includes(req.body.position)
          ? req.body.position
          : 'BOTTOM',
        durationSeconds: Math.max(2, Math.min(300, Number.isFinite(parsedDuration) ? parsedDuration : 12)),
        animation: validAnimations.includes(req.body.animation) ? req.body.animation : 'pulse',
        transition: validTransitions.includes(req.body.transition) ? req.body.transition : 'fade',
        transitionDurationMs: Math.max(
          100,
          Math.min(3000, Number.isFinite(parsedTransitionMs) ? parsedTransitionMs : 450)
        ),
        repeatIntervalSeconds: Math.max(
          0,
          Math.min(3600, Number.isFinite(parsedRepeatSec) ? parsedRepeatSec : 15)
        ),
        repeatContinuously: req.body.repeatContinuously === false ? false : true,
        showOnTimeoutFullscreen: req.body.showOnTimeoutFullscreen === true,
        displayOrder: Math.max(1, Number(req.body.displayOrder) || 1),
        mode: req.body.mode === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'BANNER',
        announcementText: sanitizeText(req.body.announcementText, 180),
        isVisible: req.body.isVisible === false ? false : true,
        createdBy: req.user!._id,
      });

      const populated = await SponsorOverlay.findById(overlay._id).populate('sponsorId').lean();
      if (overlay.liveStreamId) {
        emitStreamEvent(overlay.liveStreamId.toString(), 'sponsor:updated', {
          streamId: overlay.liveStreamId.toString(),
        });
      }
      await recordActivity(
        req.user!,
        'CREATE_SPONSOR_OVERLAY',
        'SponsorOverlay',
        overlay._id.toString(),
        `Position: ${overlay.position}`
      );
      res.status(201).json({ overlay: { ...populated, id: overlay._id.toString() } });
    } catch (err) {
      console.error('[SponsorOverlays] Create error:', err);
      res.status(500).json({ message: 'Failed to create sponsor overlay.' });
    }
  }
);

router.patch(
  '/admin/sponsor-overlays/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid overlay ID.' });
        return;
      }
      const canManage =
        req.user!.role === 'SUPER_ADMIN' ||
        req.user!.role === 'ADMIN' ||
        Boolean(req.user!.permissions?.manageSponsors);
      if (!canManage) {
        res.status(403).json({ message: 'Forbidden: Sponsor management permission required.' });
        return;
      }

      const overlay = await SponsorOverlay.findById(id);
      if (!overlay) {
        res.status(404).json({ message: 'Sponsor overlay not found.' });
        return;
      }
      const validAnimations = ['none', 'pulse', 'float', 'glow', 'shimmer', 'bounce'];
      const validTransitions = [
        'fade',
        'slide-left',
        'slide-right',
        'slide-top',
        'slide-bottom',
        'zoom',
        'pop',
        'none',
      ];
      if (['TOP', 'BOTTOM', 'LEFT', 'RIGHT'].includes(req.body.position)) {
        overlay.position = req.body.position;
      }
      if (req.body.durationSeconds !== undefined) {
        const d = Number(req.body.durationSeconds);
        if (Number.isFinite(d)) overlay.durationSeconds = Math.max(2, Math.min(300, d));
      }
      if (validAnimations.includes(req.body.animation)) {
        overlay.animation = req.body.animation;
      }
      if (validTransitions.includes(req.body.transition)) {
        overlay.transition = req.body.transition;
      }
      if (req.body.transitionDurationMs !== undefined) {
        const tm = Number(req.body.transitionDurationMs);
        if (Number.isFinite(tm)) overlay.transitionDurationMs = Math.max(100, Math.min(3000, tm));
      }
      if (req.body.repeatIntervalSeconds !== undefined) {
        const r = Number(req.body.repeatIntervalSeconds);
        if (Number.isFinite(r)) overlay.repeatIntervalSeconds = Math.max(0, Math.min(3600, r));
      }
      if (typeof req.body.repeatContinuously === 'boolean') {
        overlay.repeatContinuously = req.body.repeatContinuously;
      }
      if (typeof req.body.showOnTimeoutFullscreen === 'boolean') {
        overlay.showOnTimeoutFullscreen = req.body.showOnTimeoutFullscreen;
      }
      if (req.body.displayOrder !== undefined) {
        overlay.displayOrder = Math.max(1, Number(req.body.displayOrder) || 1);
      }
      if (req.body.mode === 'BANNER' || req.body.mode === 'ANNOUNCEMENT') {
        overlay.mode = req.body.mode;
      }
      if (req.body.announcementText !== undefined) {
        overlay.announcementText = sanitizeText(req.body.announcementText, 180);
      }
      if (typeof req.body.isVisible === 'boolean') overlay.isVisible = req.body.isVisible;
      await overlay.save();

      if (overlay.liveStreamId) {
        emitStreamEvent(overlay.liveStreamId.toString(), 'sponsor:updated', {
          streamId: overlay.liveStreamId.toString(),
        });
      }
      res.json({ overlay: { ...overlay.toObject(), id: overlay._id.toString() } });
    } catch (err) {
      console.error('[SponsorOverlays] Update error:', err);
      res.status(500).json({ message: 'Failed to update sponsor overlay.' });
    }
  }
);

router.delete(
  '/admin/sponsor-overlays/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid overlay ID.' });
        return;
      }
      const deleted = await SponsorOverlay.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ message: 'Sponsor overlay not found.' });
        return;
      }
      if (deleted.liveStreamId) {
        emitStreamEvent(deleted.liveStreamId.toString(), 'sponsor:updated', {
          streamId: deleted.liveStreamId.toString(),
        });
      }
      res.json({ message: 'Sponsor overlay removed.' });
    } catch (err) {
      console.error('[SponsorOverlays] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete sponsor overlay.' });
    }
  }
);

// ==================== NOTIFICATIONS (MODULE 7) ====================
router.get('/notifications', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const notifications = await Notification.find({ userId: req.user!._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const unreadCount = await Notification.countDocuments({
      userId: req.user!._id,
      isRead: false,
    });
    res.json({
      notifications: notifications.map((n) => ({ ...n, id: n._id.toString() })),
      unreadCount,
    });
  } catch (err) {
    console.error('[Notifications] List error:', err);
    res.status(500).json({ message: 'Failed to load notifications.' });
  }
});

router.patch(
  '/notifications/:id/read',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid notification ID.' });
        return;
      }
      const updated = await Notification.findOneAndUpdate(
        { _id: id, userId: req.user!._id },
        { isRead: true },
        { new: true }
      ).lean();
      if (!updated) {
        res.status(404).json({ message: 'Notification not found.' });
        return;
      }
      res.json({ notification: { ...updated, id: updated._id.toString() } });
    } catch (err) {
      console.error('[Notifications] Read error:', err);
      res.status(500).json({ message: 'Failed to mark notification as read.' });
    }
  }
);

router.post(
  '/notifications/read-all',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await Notification.updateMany({ userId: req.user!._id, isRead: false }, { isRead: true });
      res.json({ message: 'All notifications marked as read.', unreadCount: 0 });
    } catch (err) {
      console.error('[Notifications] Read-all error:', err);
      res.status(500).json({ message: 'Failed to mark notifications as read.' });
    }
  }
);

router.delete(
  '/notifications/:id',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid notification ID.' });
        return;
      }
      const deleted = await Notification.findOneAndDelete({ _id: id, userId: req.user!._id });
      if (!deleted) {
        res.status(404).json({ message: 'Notification not found.' });
        return;
      }
      res.json({ ok: true, id });
    } catch (err) {
      console.error('[Notifications] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete notification.' });
    }
  }
);

router.patch(
  '/notifications/preferences',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const prefs = req.body || {};
      user.notificationPreferences = {
        matchStart:
          typeof prefs.matchStart === 'boolean'
            ? prefs.matchStart
            : user.notificationPreferences?.matchStart !== false,
        matchLive:
          typeof prefs.matchLive === 'boolean'
            ? prefs.matchLive
            : user.notificationPreferences?.matchLive !== false,
        matchDelayed:
          typeof prefs.matchDelayed === 'boolean'
            ? prefs.matchDelayed
            : user.notificationPreferences?.matchDelayed !== false,
        matchResumed:
          typeof prefs.matchResumed === 'boolean'
            ? prefs.matchResumed
            : user.notificationPreferences?.matchResumed !== false,
        followedTeams:
          typeof prefs.followedTeams === 'boolean'
            ? prefs.followedTeams
            : user.notificationPreferences?.followedTeams !== false,
        favoritePlayers:
          typeof prefs.favoritePlayers === 'boolean'
            ? prefs.favoritePlayers
            : user.notificationPreferences?.favoritePlayers !== false,
        scoreUpdates:
          typeof prefs.scoreUpdates === 'boolean'
            ? prefs.scoreUpdates
            : Boolean(user.notificationPreferences?.scoreUpdates),
        matchResults:
          typeof prefs.matchResults === 'boolean'
            ? prefs.matchResults
            : user.notificationPreferences?.matchResults !== false,
        tournamentUpdates:
          typeof prefs.tournamentUpdates === 'boolean'
            ? prefs.tournamentUpdates
            : user.notificationPreferences?.tournamentUpdates !== false,
        browserPushEnabled:
          typeof prefs.browserPushEnabled === 'boolean'
            ? prefs.browserPushEnabled
            : Boolean(user.notificationPreferences?.browserPushEnabled),
      };
      await user.save();
      res.json({ notificationPreferences: user.notificationPreferences });
    } catch (err) {
      console.error('[Notifications] Preferences error:', err);
      res.status(500).json({ message: 'Failed to save notification preferences.' });
    }
  }
);

// ==================== ISSUE REPORTS (MODULE 14) ====================
router.post(
  '/live/:id/reports',
  optionalAuthenticate,
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

      const validCategories = [
        'STREAM_DOWN',
        'WRONG_SCORE',
        'AUDIO_VIDEO_ISSUE',
        'CHAT_ABUSE',
        'OTHER',
      ];
      const category = validCategories.includes(req.body.category) ? req.body.category : 'OTHER';
      const description = sanitizeText(req.body.description, 1000);
      if (!description) {
        res.status(400).json({ message: 'Please describe the issue before submitting.' });
        return;
      }

      const report = await MatchReport.create({
        liveStreamId: stream._id,
        reportedByUserId: req.user ? req.user._id : null,
        reporterName: req.user?.name || sanitizeText(req.body.reporterName, 120) || 'Viewer',
        reporterEmail: req.user?.email || sanitizeText(req.body.reporterEmail, 160) || '',
        category,
        description,
        status: 'OPEN',
      });

      res.status(201).json({
        report: { ...report.toObject(), id: report._id.toString() },
        message: 'Issue report submitted. Thank you for helping keep MaidanLive accurate.',
      });
    } catch (err) {
      console.error('[Reports] Create error:', err);
      res.status(500).json({ message: 'Failed to submit issue report.' });
    }
  }
);

router.get(
  '/admin/reports',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const query: Record<string, unknown> = {};
      if (
        typeof req.query.status === 'string' &&
        ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'].includes(req.query.status)
      ) {
        query.status = req.query.status;
      }
      const reports = await MatchReport.find(query)
        .populate('liveStreamId', 'matchTitle teamAName teamBName gameName status')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      res.json({
        reports: reports.map((r: any) => ({
          ...r,
          id: r._id.toString(),
          stream: r.liveStreamId
            ? { ...r.liveStreamId, id: r.liveStreamId._id.toString() }
            : null,
        })),
      });
    } catch (err) {
      console.error('[Reports] Admin list error:', err);
      res.status(500).json({ message: 'Failed to load issue reports.' });
    }
  }
);

router.patch(
  '/admin/reports/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid report ID.' });
        return;
      }
      const report = await MatchReport.findById(id);
      if (!report) {
        res.status(404).json({ message: 'Report not found.' });
        return;
      }

      if (
        req.body.status &&
        ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'].includes(req.body.status)
      ) {
        report.status = req.body.status;
        if (req.body.status === 'RESOLVED' || req.body.status === 'DISMISSED') {
          report.resolvedBy = req.user!._id as mongoose.Types.ObjectId;
          report.resolvedAt = new Date();
        }
      }
      if (req.body.resolutionNotes !== undefined) {
        report.resolutionNotes = sanitizeText(req.body.resolutionNotes, 500);
      }
      await report.save();

      await recordActivity(
        req.user!,
        'UPDATE_MATCH_REPORT',
        'MatchReport',
        id,
        `Status -> ${report.status}`
      );
      res.json({ report: { ...report.toObject(), id: report._id.toString() } });
    } catch (err) {
      console.error('[Reports] Update error:', err);
      res.status(500).json({ message: 'Failed to update report.' });
    }
  }
);

// ==================== VIEWER ANALYTICS (MODULE 12) ====================
router.post(
  '/analytics/track',
  optionalAuthenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const liveStreamId = req.body.liveStreamId;
      const sessionKey = sanitizeText(req.body.sessionKey, 120);
      if (!liveStreamId || !mongoose.Types.ObjectId.isValid(liveStreamId) || !sessionKey) {
        res.status(400).json({ message: 'Valid liveStreamId and sessionKey are required.' });
        return;
      }

      const mode =
        req.body.mode === 'REPLAY' || req.body.mode === 'PREVIEW' ? req.body.mode : 'LIVE';
      const watchDelta = Math.max(0, Math.min(120, Math.floor(Number(req.body.watchSecondsDelta) || 0)));

      const existing = await ViewerMetric.findOne({ liveStreamId, sessionKey });
      if (!existing) {
        await ViewerMetric.create({
          liveStreamId,
          sessionKey,
          userId: req.user ? req.user._id : null,
          mode,
          watchSeconds: watchDelta,
          lastHeartbeatAt: new Date(),
        });

        const incFields: Record<string, number> = { totalViewsCount: 1 };
        if (mode === 'REPLAY') incFields.replayViewsCount = 1;
        await LiveStream.updateOne({ _id: liveStreamId }, { $inc: incFields });
      } else {
        existing.watchSeconds += watchDelta;
        existing.lastHeartbeatAt = new Date();
        if (existing.mode !== mode && mode === 'REPLAY') {
          existing.mode = 'REPLAY';
          await LiveStream.updateOne({ _id: liveStreamId }, { $inc: { replayViewsCount: 1 } });
        }
        await existing.save();
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[Analytics] Track error:', err);
      res.status(500).json({ message: 'Failed to record platform analytics.' });
    }
  }
);

router.get(
  '/admin/analytics',
  authenticate,
  requireAdminPortal,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const activeCounts = getAllActiveViewerCounts();
      const [streams, rawMetrics] = await Promise.all([
        LiveStream.find()
          .select('matchTitle teamAName teamBName gameName status totalViewsCount replayViewsCount startedAt')
          .sort({ totalViewsCount: -1, createdAt: -1 })
          .limit(50)
          .lean(),
        ViewerMetric.find().lean(),
      ]);

      const metricMap = new Map<
        string,
        { uniqueSessions: number; totalWatchSeconds: number; replaySessions: number }
      >();
      for (const m of rawMetrics as any[]) {
        const sid = m.liveStreamId?.toString();
        if (!sid) continue;
        const cur = metricMap.get(sid) || {
          uniqueSessions: 0,
          totalWatchSeconds: 0,
          replaySessions: 0,
        };
        cur.uniqueSessions += 1;
        cur.totalWatchSeconds += Number(m.watchSeconds) || 0;
        if (m.mode === 'REPLAY') cur.replaySessions += 1;
        metricMap.set(sid, cur);
      }

      const perMatch = streams.map((s) => {
        const sid = s._id.toString();
        const agg = metricMap.get(sid);
        return {
          streamId: sid,
          matchTitle: s.matchTitle || [s.teamAName, s.teamBName].filter(Boolean).join(' vs ') || 'Match',
          gameName: s.gameName || 'Other',
          status: s.status,
          liveSocketViewers: activeCounts[sid] || 0,
          totalViews: s.totalViewsCount || 0,
          replayViews: s.replayViewsCount || 0,
          uniqueSessions: agg?.uniqueSessions || 0,
          totalWatchSeconds: agg?.totalWatchSeconds || 0,
        };
      });

      const summary = {
        totalActiveSocketViewers: Object.values(activeCounts).reduce((a, b) => a + b, 0),
        totalPlatformViews: perMatch.reduce((acc, m) => acc + m.totalViews, 0),
        totalReplayViews: perMatch.reduce((acc, m) => acc + m.replayViews, 0),
        totalWatchSeconds: perMatch.reduce((acc, m) => acc + m.totalWatchSeconds, 0),
        streamsTracked: perMatch.length,
        sourceNote: 'MaidanLive platform viewer & session metrics (independent of YouTube Studio internal analytics).',
      };

      res.json({ summary, perMatch });
    } catch (err) {
      console.error('[Analytics] Admin summary error:', err);
      res.status(500).json({ message: 'Failed to load viewer analytics.' });
    }
  }
);

// ==================== PLAYER MATCH STATS & LEADERBOARDS (MODULE 5) ====================
router.get('/leaderboards', async (req: Request, res: Response) => {
  try {
    const sportType = typeof req.query.sportType === 'string' ? req.query.sportType : 'Cricket';
    const matchStage: Record<string, unknown> = {};
    if (['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'].includes(sportType)) {
      matchStage.sportType = sportType;
    }
    if (
      typeof req.query.tournamentId === 'string' &&
      mongoose.Types.ObjectId.isValid(req.query.tournamentId)
    ) {
      matchStage.tournamentId = req.query.tournamentId;
    }

    const rawStats = await PlayerMatchStat.find(matchStage).lean();
    const groupedMap = new Map<string, any>();
    for (const st of rawStats as any[]) {
      const pid = st.playerId?.toString();
      if (!pid) continue;
      const cur = groupedMap.get(pid) || {
        _id: pid,
        teamId: st.teamId,
        sportType: st.sportType,
        matches: 0,
        runs: 0,
        ballsFaced: 0,
        wickets: 0,
        raidPoints: 0,
        tacklePoints: 0,
        bonusPoints: 0,
        superRaids: 0,
        superTackles: 0,
        attackPoints: 0,
        blockPoints: 0,
        serveAces: 0,
        goals: 0,
        assists: 0,
        mvpAwards: 0,
      };
      cur.matches += Number(st.appearances) || 0;
      cur.runs += Number(st.runs) || 0;
      cur.ballsFaced += Number(st.ballsFaced) || 0;
      cur.wickets += Number(st.wickets) || 0;
      cur.raidPoints += Number(st.raidPoints) || 0;
      cur.tacklePoints += Number(st.tacklePoints) || 0;
      cur.bonusPoints += Number(st.bonusPoints) || 0;
      cur.superRaids += Number(st.superRaids) || 0;
      cur.superTackles += Number(st.superTackles) || 0;
      cur.attackPoints += Number(st.attackPoints) || 0;
      cur.blockPoints += Number(st.blockPoints) || 0;
      cur.serveAces += Number(st.serveAces) || 0;
      cur.goals += Number(st.goals) || 0;
      cur.assists += Number(st.assists) || 0;
      if (st.isMvp) cur.mvpAwards += 1;
      groupedMap.set(pid, cur);
    }

    const aggregated = Array.from(groupedMap.values()).slice(0, 100);

    if (aggregated.length === 0) {
      res.json({
        entries: [],
        insufficientData: true,
        message: 'No verified match player statistics recorded yet for this filter.',
      });
      return;
    }

    const playerIds = aggregated.map((a) => a._id);
    const players = await Player.find({ _id: { $in: playerIds } })
      .populate('teamId', 'name shortName logoUrl')
      .lean();
    const playerMap = new Map(players.map((p) => [p._id.toString(), p]));

    const entries = aggregated
      .map((a) => {
        const p = playerMap.get(a._id.toString()) as any;
        if (!p) return null;
        return {
          playerId: p._id.toString(),
          playerName: p.name,
          avatarUrl: p.avatarUrl || '',
          teamId: p.teamId?._id ? p.teamId._id.toString() : null,
          teamName: p.teamId?.name || '',
          teamShortName: p.teamId?.shortName || '',
          sportType: a.sportType,
          matches: a.matches,
          runs: a.runs,
          wickets: a.wickets,
          raidPoints: a.raidPoints,
          tacklePoints: a.tacklePoints,
          totalKabaddiPoints: a.raidPoints + a.tacklePoints + a.bonusPoints,
          attackPoints: a.attackPoints,
          blockPoints: a.blockPoints,
          serveAces: a.serveAces,
          goals: a.goals,
          assists: a.assists,
          mvpAwards: a.mvpAwards,
        };
      })
      .filter(Boolean);

    res.json({
      entries,
      insufficientData: entries.length === 0,
    });
  } catch (err) {
    console.error('[Leaderboards] Query error:', err);
    res.status(500).json({ message: 'Failed to load leaderboards.' });
  }
});

router.get('/live/:id/player-stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }
    const stats = await PlayerMatchStat.find({ liveStreamId: id })
      .populate('playerId', 'name role jerseyNumber avatarUrl')
      .populate('teamId', 'name shortName')
      .lean();
    res.json({ stats: stats.map((s) => ({ ...s, id: s._id.toString() })) });
  } catch (err) {
    console.error('[PlayerStats] List error:', err);
    res.status(500).json({ message: 'Failed to load match player stats.' });
  }
});

router.post(
  '/live/:id/player-stats',
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
        res.status(403).json({ message: 'Forbidden: Not authorized to record match player stats.' });
        return;
      }
      if (!req.body.playerId || !mongoose.Types.ObjectId.isValid(req.body.playerId)) {
        res.status(400).json({ message: 'Valid playerId is required.' });
        return;
      }
      const [stream, player] = await Promise.all([
        LiveStream.findById(id),
        Player.findById(req.body.playerId),
      ]);
      if (!stream || !player) {
        res.status(404).json({ message: 'Stream or player not found.' });
        return;
      }

      const num = (val: unknown) => Math.max(0, Math.floor(Number(val) || 0));
      const stat = await PlayerMatchStat.findOneAndUpdate(
        { liveStreamId: stream._id, playerId: player._id },
        {
          liveStreamId: stream._id,
          tournamentId: stream.tournamentId || null,
          teamId: player.teamId || null,
          playerId: player._id,
          sportType: stream.gameName || player.sportType || 'Cricket',
          runs: num(req.body.runs),
          ballsFaced: num(req.body.ballsFaced),
          fours: num(req.body.fours),
          sixes: num(req.body.sixes),
          wickets: num(req.body.wickets),
          catches: num(req.body.catches),
          raidPoints: num(req.body.raidPoints),
          tacklePoints: num(req.body.tacklePoints),
          bonusPoints: num(req.body.bonusPoints),
          superRaids: num(req.body.superRaids),
          superTackles: num(req.body.superTackles),
          attackPoints: num(req.body.attackPoints),
          blockPoints: num(req.body.blockPoints),
          serveAces: num(req.body.serveAces),
          goals: num(req.body.goals),
          assists: num(req.body.assists),
          yellowCards: num(req.body.yellowCards),
          redCards: num(req.body.redCards),
          saves: num(req.body.saves),
          isMvp: Boolean(req.body.isMvp),
          appearances: Math.max(1, num(req.body.appearances || 1)),
          updatedBy: req.user!._id,
        },
        { upsert: true, new: true }
      )
        .populate('playerId', 'name role jerseyNumber avatarUrl')
        .populate('teamId', 'name shortName')
        .lean();

      await recordActivity(
        req.user!,
        'UPSERT_PLAYER_MATCH_STAT',
        'PlayerMatchStat',
        stat!._id.toString(),
        `${player.name} stats recorded`
      );
      res.json({ stat: { ...stat, id: stat!._id.toString() } });
    } catch (err) {
      console.error('[PlayerStats] Save error:', err);
      res.status(500).json({ message: 'Failed to save player match stats.' });
    }
  }
);

// ==================== ORGANIZER WORKSPACE & MONETIZATION (MODULE 15) ====================
router.get(
  '/organizer/overview',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const isGlobalAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

      const tournamentQuery = isGlobalAdmin
        ? {}
        : {
            $or: [
              { createdBy: user._id },
              { _id: { $in: user.assignedTournamentIds || [] } },
            ],
          };

      const streamQuery = isGlobalAdmin
        ? {}
        : {
            $or: [
              { createdBy: user._id },
              { _id: { $in: user.assignedStreamIds || [] } },
              { tournamentId: { $in: user.assignedTournamentIds || [] } },
            ],
          };

      const [tournaments, streams, subscriptions, revenueRecords, plans] = await Promise.all([
        Tournament.find(tournamentQuery).sort({ createdAt: -1 }).lean(),
        LiveStream.find(streamQuery).sort({ createdAt: -1 }).limit(50).lean(),
        OrganizerSubscription.find(isGlobalAdmin ? {} : { organizerUserId: user._id })
          .populate('planId')
          .populate('organizerUserId', 'name email')
          .sort({ createdAt: -1 })
          .lean(),
        RevenueRecord.find(isGlobalAdmin ? {} : { organizerUserId: user._id })
          .populate('tournamentId', 'name')
          .sort({ recordedAt: -1 })
          .limit(100)
          .lean(),
        SubscriptionPlan.find({ isActive: true }).sort({ monthlyPrice: 1 }).lean(),
      ]);

      const totalRevenue = revenueRecords
        .filter((r) => r.status !== 'REFUNDED')
        .reduce((sum, r) => sum + (r.amount || 0), 0);

      res.json({
        tournaments: tournaments.map((t) => ({ ...t, id: t._id.toString() })),
        streams: streams.map((s) => ({ ...s, id: s._id.toString() })),
        subscriptions: subscriptions.map((sub: any) => ({ ...sub, id: sub._id.toString() })),
        revenueRecords: revenueRecords.map((rec: any) => ({ ...rec, id: rec._id.toString() })),
        plans: plans.map((p) => ({ ...p, id: p._id.toString() })),
        totalRevenue,
      });
    } catch (err) {
      console.error('[Organizer] Overview error:', err);
      res.status(500).json({ message: 'Failed to load organizer workspace.' });
    }
  }
);

router.get('/subscription-plans', async (_req: Request, res: Response) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ monthlyPrice: 1 }).lean();
    res.json({ plans: plans.map((p) => ({ ...p, id: p._id.toString() })) });
  } catch (err) {
    console.error('[Monetization] Plans list error:', err);
    res.status(500).json({ message: 'Failed to load subscription plans.' });
  }
});

router.post(
  '/admin/subscription-plans',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = sanitizeText(req.body.name, 120);
      const code = sanitizeText(req.body.code, 40).toUpperCase();
      const monthlyPrice = Number(req.body.monthlyPrice);
      if (!name || !code || !Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
        res.status(400).json({ message: 'Plan name, code, and non-negative price are required.' });
        return;
      }

      const plan = await SubscriptionPlan.create({
        name,
        code,
        monthlyPrice,
        currency: sanitizeText(req.body.currency, 10) || 'INR',
        maxActiveStreams: Math.max(1, Number(req.body.maxActiveStreams) || 2),
        maxTournaments: Math.max(1, Number(req.body.maxTournaments) || 5),
        features: Array.isArray(req.body.features)
          ? req.body.features.map((f: unknown) => sanitizeText(f, 160)).filter(Boolean)
          : [],
        isActive: req.body.isActive === false ? false : true,
      });

      await recordActivity(
        req.user!,
        'CREATE_SUBSCRIPTION_PLAN',
        'SubscriptionPlan',
        plan._id.toString(),
        `${name} (${code})`
      );
      res.status(201).json({ plan: { ...plan.toObject(), id: plan._id.toString() } });
    } catch (err: any) {
      if (err?.code === 11000) {
        res.status(409).json({ message: 'A plan with this code already exists.' });
        return;
      }
      console.error('[Monetization] Create plan error:', err);
      res.status(500).json({ message: 'Failed to create subscription plan.' });
    }
  }
);

router.post(
  '/admin/organizer-subscriptions',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { organizerUserId, planId } = req.body;
      if (
        !organizerUserId ||
        !mongoose.Types.ObjectId.isValid(organizerUserId) ||
        !planId ||
        !mongoose.Types.ObjectId.isValid(planId)
      ) {
        res.status(400).json({ message: 'Valid organizerUserId and planId are required.' });
        return;
      }

      const sub = await OrganizerSubscription.create({
        organizerUserId,
        planId,
        status: ['ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED'].includes(req.body.status)
          ? req.body.status
          : 'ACTIVE',
        startedAt: req.body.startedAt ? new Date(req.body.startedAt) : new Date(),
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        notes: sanitizeText(req.body.notes, 400),
        createdBy: req.user!._id,
      });

      const populated = await OrganizerSubscription.findById(sub._id)
        .populate('planId')
        .populate('organizerUserId', 'name email')
        .lean();

      await recordActivity(
        req.user!,
        'ASSIGN_ORGANIZER_SUBSCRIPTION',
        'OrganizerSubscription',
        sub._id.toString(),
        `Assigned plan ${planId} to organizer ${organizerUserId}`
      );
      res.status(201).json({ subscription: { ...populated, id: sub._id.toString() } });
    } catch (err) {
      console.error('[Monetization] Assign subscription error:', err);
      res.status(500).json({ message: 'Failed to assign organizer subscription.' });
    }
  }
);

router.post(
  '/admin/revenue-records',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const description = sanitizeText(req.body.description, 240);
      const amount = Number(req.body.amount);
      if (!description || !Number.isFinite(amount) || amount < 0) {
        res.status(400).json({ message: 'Description and non-negative amount are required.' });
        return;
      }

      const rec = await RevenueRecord.create({
        organizerUserId:
          req.body.organizerUserId && mongoose.Types.ObjectId.isValid(req.body.organizerUserId)
            ? req.body.organizerUserId
            : req.user!._id,
        tournamentId:
          req.body.tournamentId && mongoose.Types.ObjectId.isValid(req.body.tournamentId)
            ? req.body.tournamentId
            : null,
        sourceType: ['SUBSCRIPTION', 'SPONSORSHIP', 'REGISTRATION', 'OTHER'].includes(
          req.body.sourceType
        )
          ? req.body.sourceType
          : 'OTHER',
        description,
        amount,
        currency: sanitizeText(req.body.currency, 10) || 'INR',
        status: ['RECORDED', 'PAID', 'REFUNDED'].includes(req.body.status)
          ? req.body.status
          : 'PAID',
        referenceNumber: sanitizeText(req.body.referenceNumber, 80),
        createdBy: req.user!._id,
      });

      await recordActivity(
        req.user!,
        'RECORD_REVENUE',
        'RevenueRecord',
        rec._id.toString(),
        `${description} (${rec.currency} ${amount})`
      );
      res.status(201).json({ record: { ...rec.toObject(), id: rec._id.toString() } });
    } catch (err) {
      console.error('[Monetization] Revenue record error:', err);
      res.status(500).json({ message: 'Failed to record revenue entry.' });
    }
  }
);

// ==================== ADMIN MATCH HEALTH MONITOR ====================
router.get(
  '/admin/match-health',
  authenticate,
  requireAdminPortal,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const activeCounts = getAllActiveViewerCounts();
      const [streams, scores] = await Promise.all([
        LiveStream.find()
          .populate('authorizedScorerId', 'name email')
          .populate('backupScorerId', 'name email')
          .sort({ status: 1, updatedAt: -1 })
          .limit(80)
          .lean(),
        LiveScore.find().lean(),
      ]);

      const scoreMap = new Map(scores.map((sc) => [sc.liveStreamId.toString(), sc]));

      const matches = streams.map((s: any) => {
        const sid = s._id.toString();
        const sc = scoreMap.get(sid) || null;
        const activeProvider = s.activeStreamingProvider || s.streamingProvider || 'youtube';
        const sh = s.streamHealth || { ok: false, status: 'UNKNOWN', checkedAt: null };
        const viewers = activeCounts[sid] || 0;

        let healthGrade: 'Healthy' | 'Degraded' | 'Offline' | 'Unknown' = 'Unknown';
        if (s.status === 'ENDED') {
          healthGrade = 'Offline';
        } else if (activeProvider === 'mediamtx') {
          if (s.mediamtxPublishStatus === 'PUBLISHING' || sh.ok) {
            healthGrade = 'Healthy';
          } else if (s.mediamtxPublishStatus === 'ERROR' || s.mediamtxPublishStatus === 'OFFLINE') {
            healthGrade = 'Offline';
          } else if (sh.checkedAt) {
            healthGrade = sh.ok ? 'Healthy' : 'Degraded';
          }
        } else {
          if (sh.checkedAt) {
            if (sh.ok) healthGrade = 'Healthy';
            else if (s.youtubeStreamStatus === 'UNAVAILABLE') healthGrade = 'Offline';
            else healthGrade = 'Degraded';
          } else if (s.youtubeStreamStatus === 'UNAVAILABLE') {
            healthGrade = 'Offline';
          } else if (s.youtubeStreamStatus === 'LIVE') {
            healthGrade = 'Healthy';
          }
        }

        return {
          id: sid,
          matchTitle:
            s.matchTitle || [s.teamAName, s.teamBName].filter(Boolean).join(' vs ') || 'Match',
          teamAName: s.teamAName || 'Team A',
          teamBName: s.teamBName || 'Team B',
          sport: s.gameName || 'Other',
          tournamentName: s.tournamentName || '',
          status: s.status,
          matchStatus: sc?.matchStatus || s.status,
          activeStreamingProvider: activeProvider,
          streamHealth: sh,
          youtubeVideoId: s.youtubeVideoId || '',
          youtubeStreamStatus: s.youtubeStreamStatus || 'UNKNOWN',
          mediamtxStreamPath: s.mediamtxStreamPath || '',
          mediamtxPublishStatus: s.mediamtxPublishStatus || 'IDLE',
          activeSocketViewers: viewers,
          scoreUpdatedAt: sc?.lastUpdatedAt || null,
          authorizedScorer:
            typeof s.authorizedScorerId === 'object' && s.authorizedScorerId
              ? { id: s.authorizedScorerId._id?.toString(), name: s.authorizedScorerId.name }
              : null,
          backupScorer:
            typeof s.backupScorerId === 'object' && s.backupScorerId
              ? { id: s.backupScorerId._id?.toString(), name: s.backupScorerId.name }
              : null,
          healthGrade,
        };
      });

      res.json({
        generatedAt: new Date().toISOString(),
        totalStreams: matches.length,
        liveCount: matches.filter((m) => m.status === 'LIVE').length,
        matches,
      });
    } catch (err) {
      console.error('[MatchHealth] Overview error:', err);
      res.status(500).json({ message: 'Failed to load match health diagnostics.' });
    }
  }
);

export default router;
