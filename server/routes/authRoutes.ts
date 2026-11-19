import crypto from 'crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { ADMIN_PORTAL_ROLES, ALL_GRANULAR_PERMISSIONS, User } from '../models/User.ts';
import { UserSession } from '../models/UserSession.ts';
import { RoleAssignment } from '../models/RoleAssignment.ts';
import { SecurityPolicy } from '../models/SecurityPolicy.ts';
import {
  authenticate,
  getEffectiveGranularPermissions,
  requireAdminPortal,
  requireRole,
  signAuthToken,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';
import {
  buildOtpAuthUri,
  generateTotpQrDataUrl,
  generateTotpSecret,
  verifyTotpCode,
} from '../services/totpService.ts';

const router = Router();

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function getOrCreateSecurityPolicy() {
  let policy = await SecurityPolicy.findOne({ key: 'default' });
  if (!policy) {
    policy = await SecurityPolicy.create({
      key: 'default',
      enforceAdmin2FA: false,
      maxFailedLoginAttempts: 5,
      lockoutMinutes: 15,
      providerSwitchGraceSeconds: 15,
    });
  }
  return policy;
}

async function createSessionForUser(
  user: any,
  portal: 'admin' | 'customer',
  req: Request
): Promise<{ token: string; refreshToken: string; sessionId: string }> {
  const rawRefresh = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (portal === 'admin' ? 7 : 30) * 24 * 60 * 60 * 1000);
  const session = await UserSession.create({
    userId: user._id,
    portal,
    refreshTokenHash: hashToken(rawRefresh),
    userAgent: sanitizeText(req.headers['user-agent'] || '', 280),
    ipAddress: sanitizeText(req.ip || req.socket.remoteAddress || '', 80),
    isRevoked: false,
    lastActiveAt: new Date(),
    expiresAt,
  });
  const sessionId = session._id.toString();
  const token = signAuthToken(user, portal, sessionId);
  return { token, refreshToken: rawRefresh, sessionId };
}

export function serializeUser(user: any) {
  const effectivePerms = Array.from(getEffectiveGranularPermissions(user));
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
    granularPermissions: effectivePerms,
    totpEnabled: Boolean(user.totpEnabled),
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

// Customer Registration (SPECTATOR or CAPTAIN)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const name = sanitizeText(req.body.name, 120);
    const email = sanitizeText(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const phone = sanitizeText(req.body.phone, 30);
    const favoriteSport = sanitizeText(req.body.favoriteSport, 40);
    const role = req.body.role === 'CAPTAIN' ? 'CAPTAIN' : 'SPECTATOR';

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
      role,
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
      granularPermissions: role === 'CAPTAIN' ? ['teams:register'] : [],
      phone,
      favoriteSport,
      lastLoginAt: new Date(),
    });

    const session = await createSessionForUser(user, 'customer', req);
    res.status(201).json({
      token: session.token,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      user: serializeUser(user),
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ message: 'Failed to register customer account.' });
  }
});

// Customer Portal Login (with lockout protection)
router.post('/login', async (req: Request, res: Response) => {
  try {
    const email = sanitizeText(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required.' });
      return;
    }

    const policy = await getOrCreateSecurityPolicy();
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.isActive) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      res.status(423).json({
        message: `Account temporarily locked due to repeated failed logins. Try again after ${new Date(
          user.lockedUntil
        ).toLocaleTimeString()}.`,
      });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const nextFails = (user.failedLoginAttempts || 0) + 1;
      user.failedLoginAttempts = nextFails;
      if (nextFails >= (policy.maxFailedLoginAttempts || 5)) {
        user.lockedUntil = new Date(Date.now() + (policy.lockoutMinutes || 15) * 60 * 1000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    const session = await createSessionForUser(user, 'customer', req);
    res.json({
      token: session.token,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      user: serializeUser(user),
    });
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
      granularPermissions: [...ALL_GRANULAR_PERMISSIONS],
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

    const session = await createSessionForUser(superAdmin, 'admin', req);
    res.status(201).json({
      token: session.token,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      user: serializeUser(superAdmin),
    });
  } catch (err) {
    console.error('[Auth] Admin bootstrap error:', err);
    res.status(500).json({ message: 'Failed to initialize Super Admin.' });
  }
});

// Admin Portal Login (Rejects SPECTATOR/CAPTAIN, enforces Lockout & TOTP 2FA)
router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const email = sanitizeText(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const totpCode = typeof req.body.totpCode === 'string' ? req.body.totpCode.trim() : '';

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required.' });
      return;
    }

    const policy = await getOrCreateSecurityPolicy();
    const user = await User.findOne({ email }).select('+passwordHash +totpSecret');
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

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      res.status(423).json({
        message: `Admin account locked due to failed logins. Try again after ${new Date(
          user.lockedUntil
        ).toLocaleTimeString()}.`,
      });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const nextFails = (user.failedLoginAttempts || 0) + 1;
      user.failedLoginAttempts = nextFails;
      if (nextFails >= (policy.maxFailedLoginAttempts || 5)) {
        user.lockedUntil = new Date(Date.now() + (policy.lockoutMinutes || 15) * 60 * 1000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    // Check TOTP 2FA if user enabled it
    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        res.status(200).json({
          requires2FA: true,
          message: 'Enter the 6-digit authenticator code to complete admin sign in.',
        });
        return;
      }
      if (!verifyTotpCode(user.totpSecret, totpCode)) {
        res.status(401).json({
          requires2FA: true,
          message: 'Invalid 6-digit authenticator code.',
        });
        return;
      }
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    await recordActivity(
      user,
      'ADMIN_LOGIN',
      'Auth',
      user._id.toString(),
      `Signed in (${user.role})`
    );

    const session = await createSessionForUser(user, 'admin', req);
    res.json({
      token: session.token,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      require2FASetup: Boolean(policy.enforceAdmin2FA && !user.totpEnabled),
      user: serializeUser(user),
    });
  } catch (err) {
    console.error('[Auth] Admin login error:', err);
    res.status(500).json({ message: 'Failed to sign in to Admin Portal.' });
  }
});

// Rotate Refresh Token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const rawRefresh = typeof req.body.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
    if (!rawRefresh) {
      res.status(400).json({ message: 'Refresh token is required.' });
      return;
    }
    const tokenHash = hashToken(rawRefresh);
    const session = await UserSession.findOne({ refreshTokenHash: tokenHash, isRevoked: false });
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      res.status(401).json({ message: 'Refresh token is invalid or expired.' });
      return;
    }

    const user = await User.findById(session.userId);
    if (!user || !user.isActive) {
      res.status(401).json({ message: 'User account is inactive.' });
      return;
    }

    const nextRawRefresh = crypto.randomBytes(32).toString('hex');
    session.refreshTokenHash = hashToken(nextRawRefresh);
    session.lastActiveAt = new Date();
    await session.save();

    const token = signAuthToken(user, session.portal, session._id.toString());
    res.json({
      token,
      refreshToken: nextRawRefresh,
      sessionId: session._id.toString(),
      user: serializeUser(user),
    });
  } catch (err) {
    console.error('[Auth] Refresh error:', err);
    res.status(500).json({ message: 'Failed to refresh session.' });
  }
});

// Logout current session
router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.sessionId) {
      await UserSession.findByIdAndUpdate(req.sessionId, {
        isRevoked: true,
        revokedAt: new Date(),
      });
    }
    res.json({ ok: true, message: 'Signed out.' });
  } catch {
    res.json({ ok: true });
  }
});

// Logout all sessions for current user
router.post('/logout-all', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await UserSession.updateMany(
      { userId: req.user!._id, isRevoked: false },
      { $set: { isRevoked: true, revokedAt: new Date() } }
    );
    await recordActivity(
      req.user!,
      'LOGOUT_ALL_SESSIONS',
      'Auth',
      req.user!._id.toString(),
      'Revoked all active sessions'
    );
    res.json({ ok: true, message: 'All active sessions revoked.' });
  } catch (err) {
    console.error('[Auth] Logout all error:', err);
    res.status(500).json({ message: 'Failed to revoke all sessions.' });
  }
});

// List active sessions for current user (or all for SUPER_ADMIN)
router.get('/sessions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scopeAll =
      req.query.all === 'true' &&
      (req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN');
    const filter: Record<string, any> = scopeAll
      ? { isRevoked: false }
      : { userId: req.user!._id, isRevoked: false };
    const sessions = await UserSession.find(filter)
      .populate('userId', 'name email role')
      .sort({ lastActiveAt: -1 })
      .limit(100)
      .lean();
    res.json({
      sessions: sessions.map((s: any) => ({
        id: s._id.toString(),
        userId: typeof s.userId === 'object' ? s.userId?._id?.toString() : String(s.userId),
        user: typeof s.userId === 'object' ? s.userId : null,
        portal: s.portal,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        isCurrent: req.sessionId === s._id.toString(),
      })),
    });
  } catch (err) {
    console.error('[Auth] Sessions list error:', err);
    res.status(500).json({ message: 'Failed to load sessions.' });
  }
});

// Revoke specific session
router.delete('/sessions/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = await UserSession.findById(req.params.id);
    if (!session) {
      res.status(404).json({ message: 'Session not found.' });
      return;
    }
    const isOwner = session.userId.toString() === req.user!._id.toString();
    const isAdmin = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      res.status(403).json({ message: 'Forbidden: Cannot revoke another user session.' });
      return;
    }
    session.isRevoked = true;
    session.revokedAt = new Date();
    await session.save();
    res.json({ ok: true, message: 'Session revoked.' });
  } catch (err) {
    console.error('[Auth] Revoke session error:', err);
    res.status(500).json({ message: 'Failed to revoke session.' });
  }
});

// Forgot / Reset password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const email = sanitizeText(req.body.email, 160).toLowerCase();
    if (!email) {
      res.status(400).json({ message: 'Email is required.' });
      return;
    }
    const user = await User.findOne({ email });
    if (!user) {
      res.json({
        ok: true,
        message: 'If an account exists for that email, a password reset token has been generated.',
      });
      return;
    }
    const resetToken = crypto.randomBytes(24).toString('hex');
    user.passwordResetTokenHash = hashToken(resetToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    res.json({
      ok: true,
      message: 'Password reset token generated (valid for 30 minutes).',
      resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined,
    });
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    res.status(500).json({ message: 'Failed to generate password reset token.' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    if (!token || newPassword.length < 6) {
      res.status(400).json({ message: 'Valid reset token and password (min 6 chars) are required.' });
      return;
    }
    const user = await User.findOne({
      passwordResetTokenHash: hashToken(token),
    }).select('+passwordResetTokenHash');
    if (
      !user ||
      !user.passwordResetExpiresAt ||
      new Date(user.passwordResetExpiresAt).getTime() < Date.now()
    ) {
      res.status(400).json({ message: 'Invalid or expired password reset token.' });
      return;
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = '';
    user.passwordResetExpiresAt = null;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();
    await UserSession.updateMany(
      { userId: user._id },
      { $set: { isRevoked: true, revokedAt: new Date() } }
    );
    res.json({ ok: true, message: 'Password has been reset successfully. Please sign in.' });
  } catch (err) {
    console.error('[Auth] Reset password error:', err);
    res.status(500).json({ message: 'Failed to reset password.' });
  }
});

// TOTP 2FA Setup & Management
router.post('/2fa/setup', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!._id).select('+totpSecret');
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const secret = generateTotpSecret();
    user.totpSecret = secret;
    user.totpEnabled = false;
    await user.save();

    const otpAuthUri = buildOtpAuthUri(user.email, secret, 'MaidanLive');
    const qrDataUrl = await generateTotpQrDataUrl(otpAuthUri);
    res.json({
      manualSecret: secret,
      otpAuthUri,
      qrDataUrl,
    });
  } catch (err) {
    console.error('[Auth] 2FA setup error:', err);
    res.status(500).json({ message: 'Failed to initialize 2FA setup.' });
  }
});

router.post('/2fa/verify-enable', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    const user = await User.findById(req.user!._id).select('+totpSecret');
    if (!user || !user.totpSecret) {
      res.status(400).json({ message: '2FA setup has not been started.' });
      return;
    }
    if (!verifyTotpCode(user.totpSecret, code)) {
      res.status(400).json({ message: 'Invalid 6-digit code. Please check your authenticator app.' });
      return;
    }
    user.totpEnabled = true;
    user.totpVerifiedAt = new Date();
    await user.save();
    await recordActivity(user, 'ENABLE_2FA', 'Auth', user._id.toString(), 'Enabled TOTP 2FA');
    res.json({ ok: true, user: serializeUser(user) });
  } catch (err) {
    console.error('[Auth] 2FA verify error:', err);
    res.status(500).json({ message: 'Failed to enable 2FA.' });
  }
});

router.post('/2fa/disable', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = await User.findById(req.user!._id).select('+passwordHash +totpSecret');
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(400).json({ message: 'Current password is required to disable 2FA.' });
      return;
    }
    user.totpEnabled = false;
    user.totpSecret = '';
    user.totpVerifiedAt = null;
    await user.save();
    await recordActivity(user, 'DISABLE_2FA', 'Auth', user._id.toString(), 'Disabled TOTP 2FA');
    res.json({ ok: true, user: serializeUser(user) });
  } catch (err) {
    console.error('[Auth] 2FA disable error:', err);
    res.status(500).json({ message: 'Failed to disable 2FA.' });
  }
});

// Admin Security Policy & Scoped Role Assignments
router.get(
  '/admin/security-policy',
  authenticate,
  requireAdminPortal,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const policy = await getOrCreateSecurityPolicy();
      res.json({
        policy: {
          enforceAdmin2FA: policy.enforceAdmin2FA,
          maxFailedLoginAttempts: policy.maxFailedLoginAttempts,
          lockoutMinutes: policy.lockoutMinutes,
          providerSwitchGraceSeconds: policy.providerSwitchGraceSeconds,
          updatedByName: policy.updatedByName,
          updatedAt: policy.updatedAt,
        },
        availablePermissions: ALL_GRANULAR_PERMISSIONS,
      });
    } catch (err) {
      console.error('[Auth] Security policy get error:', err);
      res.status(500).json({ message: 'Failed to load security policy.' });
    }
  }
);

router.patch(
  '/admin/security-policy',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const policy = await getOrCreateSecurityPolicy();
      if (typeof req.body.enforceAdmin2FA === 'boolean') {
        policy.enforceAdmin2FA = req.body.enforceAdmin2FA;
      }
      if (req.body.maxFailedLoginAttempts !== undefined) {
        policy.maxFailedLoginAttempts = Math.min(
          20,
          Math.max(3, Number(req.body.maxFailedLoginAttempts) || 5)
        );
      }
      if (req.body.lockoutMinutes !== undefined) {
        policy.lockoutMinutes = Math.min(1440, Math.max(1, Number(req.body.lockoutMinutes) || 15));
      }
      if (req.body.providerSwitchGraceSeconds !== undefined) {
        policy.providerSwitchGraceSeconds = Math.min(
          120,
          Math.max(5, Number(req.body.providerSwitchGraceSeconds) || 15)
        );
      }
      policy.updatedBy = req.user!._id as any;
      policy.updatedByName = req.user!.name;
      await policy.save();

      await recordActivity(
        req.user!,
        'UPDATE_SECURITY_POLICY',
        'SecurityPolicy',
        policy._id.toString(),
        `2FA enforce=${policy.enforceAdmin2FA}, maxFails=${policy.maxFailedLoginAttempts}`
      );
      res.json({ policy });
    } catch (err) {
      console.error('[Auth] Security policy update error:', err);
      res.status(500).json({ message: 'Failed to update security policy.' });
    }
  }
);

router.get(
  '/admin/role-assignments',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const assignments = await RoleAssignment.find()
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .lean();
      res.json({
        assignments: assignments.map((a: any) => ({ ...a, id: a._id.toString() })),
      });
    } catch (err) {
      console.error('[Auth] Role assignments list error:', err);
      res.status(500).json({ message: 'Failed to load role assignments.' });
    }
  }
);

router.post(
  '/admin/role-assignments',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = String(req.body.userId || '').trim();
      const role = sanitizeText(req.body.role || 'SCORER', 60);
      const scopeType = ['global', 'tournament', 'match', 'team'].includes(req.body.scopeType)
        ? req.body.scopeType
        : 'global';
      const scopeId = sanitizeText(req.body.scopeId || '', 80);
      const permissions = Array.isArray(req.body.permissions)
        ? req.body.permissions.filter((p: unknown) => typeof p === 'string')
        : [];

      if (!userId) {
        res.status(400).json({ message: 'userId is required.' });
        return;
      }

      const created = await RoleAssignment.create({
        userId,
        role,
        scopeType,
        scopeId,
        permissions,
        assignedBy: req.user!._id,
      });

      await recordActivity(
        req.user!,
        'CREATE_ROLE_ASSIGNMENT',
        'RoleAssignment',
        created._id.toString(),
        `${role} (${scopeType}:${scopeId || 'all'})`
      );
      res.status(201).json({ assignment: { ...created.toObject(), id: created._id.toString() } });
    } catch (err) {
      console.error('[Auth] Role assignment create error:', err);
      res.status(500).json({ message: 'Failed to create role assignment.' });
    }
  }
);

router.delete(
  '/admin/role-assignments/:id',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await RoleAssignment.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Auth] Role assignment delete error:', err);
      res.status(500).json({ message: 'Failed to delete role assignment.' });
    }
  }
);

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
router.get(
  '/customer/preferences',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({
      notificationPreferences: serializeUser(req.user).notificationPreferences,
      followedTeamIds: serializeUser(req.user).followedTeamIds,
    });
  }
);

router.patch(
  '/customer/preferences',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
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
  }
);

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
    const currentPassword =
      typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
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
