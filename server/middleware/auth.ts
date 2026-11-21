import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { ADMIN_PORTAL_ROLES, User } from '../models/User.ts';
import type { IUser, UserPermissions, UserRole } from '../models/User.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { Tournament } from '../models/Tournament.ts';
import { RoleAssignment } from '../models/RoleAssignment.ts';
import { UserSession } from '../models/UserSession.ts';
import { findDocByAnyId } from '../utils/mongoNormalize.ts';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

export function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || EPHEMERAL_FALLBACK_SECRET;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  portal: 'admin' | 'customer';
  sid?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  authPortal?: 'admin' | 'customer';
  sessionId?: string;
}

export function signAuthToken(user: IUser, portal: 'admin' | 'customer', sessionId?: string): string {
  const payload: JwtPayload = {
    sub: user._id.toString(),
    role: user.role,
    portal,
    ...(sessionId ? { sid: sessionId } : {}),
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: portal === 'admin' ? '1h' : '2h' });
}

export function getEffectiveGranularPermissions(user: IUser): Set<string> {
  const set = new Set<string>(Array.isArray(user.granularPermissions) ? user.granularPermissions : []);
  const perms = user.permissions || ({} as UserPermissions);
  if (user.role === 'SUPER_ADMIN') {
    return new Set(['*']);
  }
  if (ADMIN_PORTAL_ROLES.includes(user.role)) set.add('admin_portal:access');
  if (perms.manageStreams) {
    set.add('matches:manage_stream');
    set.add('matches:publish_replay');
    set.add('broadcast:control');
    set.add('broadcast:manage_cameras');
  }
  if (perms.manageScores) set.add('matches:score');
  if (perms.manageTournaments) {
    set.add('tournaments:create');
    set.add('tournaments:manage');
    set.add('matches:create');
    set.add('matches:manage');
    set.add('matches:assign_scorers');
  }
  if (perms.manageTeams) {
    set.add('teams:manage');
    set.add('teams:approve');
    set.add('registrations:review');
  }
  if (perms.managePlayers) {
    set.add('players:manage');
    set.add('players:verify');
  }
  if (perms.manageSponsors) set.add('sponsors:manage');
  if (user.role === 'ADMIN') {
    set.add('analytics:view');
    set.add('tournaments:approve');
    set.add('registrations:review');
    set.add('users:view');
    set.add('audit_logs:view');
    set.add('broadcast:override');
  }
  if (user.role === 'TOURNAMENT_ORGANIZER') {
    set.add('analytics:view');
    set.add('registrations:review');
  }
  if (user.role === 'MODERATOR') {
    set.add('audit_logs:view');
  }
  if (user.role === 'CAPTAIN') {
    set.add('teams:register');
  }
  return set;
}

export async function hasGranularPermission(
  user: IUser,
  permission: string,
  scope?: { scopeType: 'tournament' | 'match' | 'team'; scopeId: string }
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  const base = getEffectiveGranularPermissions(user);
  if (base.has('*') || base.has(permission)) return true;

  const assignments = await RoleAssignment.find({ userId: user._id }).lean();
  for (const a of assignments) {
    const matchesScope =
      a.scopeType === 'global' ||
      (scope && a.scopeType === scope.scopeType && a.scopeId === scope.scopeId);
    if (matchesScope && Array.isArray(a.permissions) && a.permissions.includes(permission)) {
      return true;
    }
  }
  return false;
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      res.status(401).json({ message: 'Authentication required.', code: 'TOKEN_MISSING' });
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    const user = await findDocByAnyId(User, decoded.sub);

    if (!user || !user.isActive) {
      res.status(401).json({ message: 'Account is inactive or no longer exists.', code: 'ACCOUNT_INACTIVE' });
      return;
    }

    if (decoded.sid) {
      const session = await findDocByAnyId(UserSession, decoded.sid, { lean: true });
      if (!session || session.isRevoked || new Date(session.expiresAt).getTime() <= Date.now()) {
        res.status(401).json({
          message: 'Session has been revoked or expired. Please sign in again.',
          code: 'SESSION_REVOKED',
        });
        return;
      }
    }

    req.user = user;
    req.authPortal = decoded.portal;
    req.sessionId = decoded.sid;
    next();
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      res.status(401).json({ message: 'Access token expired.', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ message: 'Invalid or expired authentication token.', code: 'TOKEN_INVALID' });
  }
}

export async function optionalAuthenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (token) {
      const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
      const user = await findDocByAnyId(User, decoded.sub);
      if (user && user.isActive) {
        req.user = user;
        req.authPortal = decoded.portal;
        req.sessionId = decoded.sid;
      }
    }
  } catch {
    // Optional auth ignores invalid tokens
  }
  next();
}

export function requireAdminPortal(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  if (!ADMIN_PORTAL_ROLES.includes(req.user.role) || req.authPortal !== 'admin') {
    res.status(403).json({
      message: 'Forbidden: Administrative portal credentials required.',
    });
    return;
  }

  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ message: 'Forbidden: Insufficient role permissions.' });
      return;
    }
    next();
  };
}

export function requirePermission(permission: keyof UserPermissions) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    if (req.user.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    if (req.user.role === 'SPECTATOR' || req.user.role === 'CAPTAIN') {
      res.status(403).json({ message: 'Forbidden: Insufficient administrative permissions.' });
      return;
    }

    if (req.user.permissions?.[permission]) {
      next();
      return;
    }

    res.status(403).json({ message: `Forbidden: Missing "${permission}" permission.` });
  };
}

export function requireGranularPermission(permission: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    const ok = await hasGranularPermission(req.user, permission);
    if (!ok) {
      res.status(403).json({ message: `Forbidden: Missing "${permission}" permission.` });
      return;
    }
    next();
  };
}

export function canModerateChat(user: IUser): boolean {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MODERATOR') {
    return true;
  }
  if (user.role === 'SPECTATOR' || user.role === 'CAPTAIN') return false;
  return Boolean(user.permissions?.moderateChat);
}

export async function canManageTournament(user: IUser, tournamentId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (
    user.role === 'SPECTATOR' ||
    user.role === 'CAPTAIN' ||
    user.role === 'SCORER' ||
    user.role === 'MODERATOR'
  ) {
    return false;
  }
  if (!user.permissions?.manageTournaments) return false;
  if (user.role === 'ADMIN') return true;

  const tournament = await findDocByAnyId(Tournament, tournamentId);
  if (!tournament) return false;
  if (tournament.createdBy?.toString() === user._id.toString()) return true;
  return (user.assignedTournamentIds || []).some((id) => id.toString() === tournamentId);
}

export async function canManageStream(
  user: IUser,
  streamId: string,
  action: 'stream' | 'score' | 'result'
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'SPECTATOR' || user.role === 'CAPTAIN') return false;

  if (action === 'stream') {
    // Strictly require matches:manage_stream (or manageStreams) — never allow unauthorized scorers to switch providers
    const hasExplicitManageStream = await hasGranularPermission(user, 'matches:manage_stream', {
      scopeType: 'match',
      scopeId: streamId,
    });
    if (user.role === 'SCORER') {
      return (
        Array.isArray(user.granularPermissions) &&
        user.granularPermissions.includes('matches:manage_stream')
      );
    }
    if (user.role === 'MODERATOR') return false;
    if (!user.permissions?.manageStreams && !hasExplicitManageStream) return false;
    if (user.role === 'ADMIN') return true;

    const stream = await findDocByAnyId(LiveStream, streamId);
    if (!stream) return false;
    if (stream.createdBy?.toString() === user._id.toString()) return true;
    if ((user.assignedStreamIds || []).some((id) => id.toString() === streamId)) return true;
    if (
      stream.tournamentId &&
      (user.assignedTournamentIds || []).some(
        (id) => id.toString() === stream.tournamentId?.toString()
      )
    ) {
      return true;
    }
    return hasExplicitManageStream;
  }

  if (action === 'result') {
    const hasResultPerm =
      user.permissions?.declareResults !== false &&
      (Boolean(user.permissions?.manageScores) ||
        user.role === 'ADMIN' ||
        user.role === 'SCORER' ||
        user.role === 'TOURNAMENT_ORGANIZER');
    if (!hasResultPerm) return false;
  }

  // Score control
  if (!user.permissions?.manageScores && user.role !== 'SCORER' && user.role !== 'ADMIN') {
    return false;
  }
  if (user.role === 'ADMIN') {
    return Boolean(user.permissions?.manageScores);
  }
  if (user.role === 'SCORER') {
    if (!user.permissions?.manageScores) return false;
    const stream = await LiveStream.findById(streamId);
    if (
      stream &&
      (stream.authorizedScorerId?.toString() === user._id.toString() ||
        stream.backupScorerId?.toString() === user._id.toString())
    ) {
      return true;
    }
    if ((user.assignedStreamIds || []).length === 0) return true;
    return (user.assignedStreamIds || []).some((id) => id.toString() === streamId);
  }
  if (user.role === 'TOURNAMENT_ORGANIZER') {
    if (!user.permissions?.manageScores) return false;
    const stream = await findDocByAnyId(LiveStream, streamId);
    if (!stream) return false;
    if (stream.createdBy?.toString() === user._id.toString()) return true;
    if ((user.assignedStreamIds || []).some((id) => id.toString() === streamId)) return true;
    if (
      stream.tournamentId &&
      (user.assignedTournamentIds || []).some(
        (id) => id.toString() === stream.tournamentId?.toString()
      )
    ) {
      return true;
    }
    return false;
  }

  return false;
}
