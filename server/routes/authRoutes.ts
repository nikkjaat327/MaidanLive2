import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { ADMIN_PORTAL_ROLES, User } from '../models/User.ts';
import { authenticate, signAuthToken } from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';

const router = Router();

export function serializeUser(user: any) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: {
      manageStreams: Boolean(user.permissions?.manageStreams),
      manageScores: Boolean(user.permissions?.manageScores),
      manageTournaments: Boolean(user.permissions?.manageTournaments),
      manageTeams: Boolean(user.permissions?.manageTeams),
      managePlayers: Boolean(user.permissions?.managePlayers),
      moderateChat: Boolean(user.permissions?.moderateChat),
      manageSponsors: Boolean(user.permissions?.manageSponsors),
      manageVenues: Boolean(user.permissions?.manageVenues),
      declareResults: user.permissions?.declareResults !== false,
    },
    assignedStreamIds: (user.assignedStreamIds || []).map((id: any) => id.toString()),
    assignedTournamentIds: (user.assignedTournamentIds || []).map((id: any) => id.toString()),
    followedTeamIds: (user.followedTeamIds || []).map((id: any) => id.toString()),
    notificationPreferences: {
      matchStart: user.notificationPreferences?.matchStart !== false,
      matchLive: user.notificationPreferences?.matchLive !== false,
      followedTeams: user.notificationPreferences?.followedTeams !== false,
      scoreUpdates: Boolean(user.notificationPreferences?.scoreUpdates),
      matchResults: user.notificationPreferences?.matchResults !== false,
      tournamentUpdates: user.notificationPreferences?.tournamentUpdates !== false,
      browserPushEnabled: Boolean(user.notificationPreferences?.browserPushEnabled),
    },
    chatMutedUntil: user.chatMutedUntil || null,
    chatMutedReason: user.chatMutedReason || '',
    isActive: user.isActive,
    phone: user.phone || '',
    favoriteSport: user.favoriteSport || '',
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

// Customer Registration (Strictly SPECTATOR role only)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const name = sanitizeText(req.body.name, 120);
    const email = sanitizeText(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const phone = sanitizeText(req.body.phone, 30);
    const favoriteSport = sanitizeText(req.body.favoriteSport, 40);

    if (!name || !email || password.length < 6) {
      res.status(400).json({
        message: 'Name, valid email, and password (minimum 6 characters) are required.',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ message: 'Please enter a valid email address.' });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ message: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: 'SPECTATOR',
      permissions: {
        manageStreams: false,
        manageScores: false,
        manageTournaments: false,
        manageTeams: false,
        managePlayers: false,
        moderateChat: false,
        manageSponsors: false,
        manageVenues: false,
        declareResults: false,
      },
      phone,
      favoriteSport,
      lastLoginAt: new Date(),
    });

    const token = signAuthToken(user, 'customer');
    res.status(201).json({ token, user: serializeUser(user) });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ message: 'Failed to register customer account.' });
  }
});

// Customer Portal Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const email = sanitizeText(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required.' });
      return;
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.isActive) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signAuthToken(user, 'customer');
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    console.error('[Auth] Customer login error:', err);
    res.status(500).json({ message: 'Failed to sign in.' });
  }
});

// Check whether initial Super Admin bootstrap is required
router.get('/admin/setup-status', async (_req: Request, res: Response) => {
  try {
    const superAdminCount = await User.countDocuments({ role: 'SUPER_ADMIN' });
    res.json({
      needsSetup: superAdminCount === 0,
      requiresSetupKey: Boolean(process.env.ADMIN_SETUP_KEY?.trim()),
    });
  } catch (err) {
    console.error('[Auth] Setup status error:', err);
    res.status(500).json({ message: 'Failed to check admin setup status.' });
  }
});

// Controlled one-time Super Admin bootstrap when DB has 0 Super Admins
router.post('/admin/bootstrap', async (req: Request, res: Response) => {
  try {
    const existingSuperAdmin = await User.countDocuments({ role: 'SUPER_ADMIN' });
    if (existingSuperAdmin > 0) {
      res.status(403).json({
        message: 'Super Admin already exists. Public admin registration is disabled.',
      });
      return;
    }

    const configuredKey = process.env.ADMIN_SETUP_KEY?.trim();
    if (configuredKey) {
      const providedKey = typeof req.body.setupKey === 'string' ? req.body.setupKey.trim() : '';
      if (providedKey !== configuredKey) {
        res.status(403).json({ message: 'Invalid admin setup key.' });
        return;
      }
    }

    const name = sanitizeText(req.body.name, 120);
    const email = sanitizeText(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!name || !email || password.length < 8) {
      res.status(400).json({
        message: 'Name, valid email, and strong password (minimum 8 characters) are required.',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ message: 'Please provide a valid email address.' });
      return;
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      res.status(409).json({ message: 'Email is already registered.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const superAdmin = await User.create({
      name,
      email,
      passwordHash,
      role: 'SUPER_ADMIN',
      permissions: {
        manageStreams: true,
        manageScores: true,
        manageTournaments: true,
        manageTeams: true,
        managePlayers: true,
        moderateChat: true,
        manageSponsors: true,
        manageVenues: true,
        declareResults: true,
      },
      isActive: true,
      lastLoginAt: new Date(),
    });

    await recordActivity(
      superAdmin,
      'BOOTSTRAP_SUPER_ADMIN',
      'User',
      superAdmin._id.toString(),
      'Initialized primary Super Admin account'
    );

    const token = signAuthToken(superAdmin, 'admin');
    res.status(201).json({ token, user: serializeUser(superAdmin) });
  } catch (err) {
    console.error('[Auth] Admin bootstrap error:', err);
    res.status(500).json({ message: 'Failed to initialize Super Admin.' });
  }
});

// Admin Portal Login (Rejects SPECTATOR accounts)
router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const email = sanitizeText(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required.' });
      return;
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.isActive) {
      res.status(401).json({ message: 'Invalid credentials or inactive account.' });
      return;
    }

    if (!ADMIN_PORTAL_ROLES.includes(user.role)) {
      res.status(403).json({
        message: 'Access denied. Customer accounts cannot access the Admin Portal.',
      });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    user.lastLoginAt = new Date();
    await user.save();

    await recordActivity(user, 'ADMIN_LOGIN', 'Auth', user._id.toString(), `Signed in (${user.role})`);

    const token = signAuthToken(user, 'admin');
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    console.error('[Auth] Admin login error:', err);
    res.status(500).json({ message: 'Failed to sign in to Admin Portal.' });
  }
});

// Get current authenticated user
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: serializeUser(req.user),
    portal: req.authPortal,
  });
});

// Customer Me alias
router.get('/customer/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: serializeUser(req.user),
    portal: req.authPortal,
  });
});

// Get / Update customer notification preferences
router.get('/customer/preferences', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    notificationPreferences: serializeUser(req.user).notificationPreferences,
    followedTeamIds: serializeUser(req.user).followedTeamIds,
  });
});

router.patch('/customer/preferences', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const prefs = req.body.notificationPreferences || req.body || {};
    user.notificationPreferences = {
      matchStart:
        typeof prefs.matchStart === 'boolean'
          ? prefs.matchStart
          : user.notificationPreferences?.matchStart !== false,
      matchLive:
        typeof prefs.matchLive === 'boolean'
          ? prefs.matchLive
          : user.notificationPreferences?.matchLive !== false,
      followedTeams:
        typeof prefs.followedTeams === 'boolean'
          ? prefs.followedTeams
          : user.notificationPreferences?.followedTeams !== false,
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
    res.json({
      user: serializeUser(user),
      notificationPreferences: serializeUser(user).notificationPreferences,
    });
  } catch (err) {
    console.error('[Auth] Preferences update error:', err);
    res.status(500).json({ message: 'Failed to update notification preferences.' });
  }
});

// Update current user profile
router.patch('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (req.body.name !== undefined) {
      const cleanName = sanitizeText(req.body.name, 120);
      if (!cleanName) {
        res.status(400).json({ message: 'Name cannot be empty.' });
        return;
      }
      user.name = cleanName;
    }
    if (req.body.phone !== undefined) user.phone = sanitizeText(req.body.phone, 30);
    if (req.body.favoriteSport !== undefined) {
      user.favoriteSport = sanitizeText(req.body.favoriteSport, 40);
    }

    await user.save();
    res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error('[Auth] Update profile error:', err);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// Change password
router.patch('/change-password', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword || newPassword.length < 6) {
      res.status(400).json({
        message: 'Current password and a new password (min 6 characters) are required.',
      });
      return;
    }

    const userWithHash = await User.findById(req.user!._id).select('+passwordHash');
    if (!userWithHash) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const matches = await bcrypt.compare(currentPassword, userWithHash.passwordHash);
    if (!matches) {
      res.status(400).json({ message: 'Current password is incorrect.' });
      return;
    }

    userWithHash.passwordHash = await bcrypt.hash(newPassword, 10);
    await userWithHash.save();
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[Auth] Change password error:', err);
    res.status(500).json({ message: 'Failed to update password.' });
  }
});

export default router;
