import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { ADMIN_PORTAL_ROLES, User } from '../models/User.ts';
import type { IUser, UserPermissions, UserRole } from '../models/User.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { Tournament } from '../models/Tournament.ts';
import { RoleAssignment } from '../models/RoleAssignment.ts';
import { BroadcastAssignment } from '../models/BroadcastAssignment.ts';
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
  if (perms.manageStreams && user.role !== 'BROADCASTER') {
    set.add('matches:manage_stream');
    set.add('matches:publish_replay');
    set.add('broadcast:control');
    set.add('broadcast:manage_cameras');
    set.add('broadcast:manage_overlays');
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
    set.add('broadcast:assign_broadcasters');
  }
  if (user.role === 'BROADCASTER') {
    set.add('broadcast:scoped_access');
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
    user.role === 'MODERATOR' ||
    user.role === 'BROADCASTER'
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

export type BroadcastAccessPermission =
  | 'broadcast:control'
  | 'broadcast:manage_cameras'
  | 'broadcast:manage_overlays'
  | 'broadcast:stream_control'
  | 'broadcast:record_control'
  | 'broadcast:override';

export async function hasBroadcastAccess(
  user: IUser,
  matchId: string,
  requiredPerm: BroadcastAccessPermission = 'broadcast:control'
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'SPECTATOR' || user.role === 'CAPTAIN' || user.role === 'MODERATOR') {
    return false;
  }

  if (requiredPerm === 'broadcast:override') {
    if (user.role === 'BROADCASTER') return false;
    if (user.role === 'ADMIN') return true;
    if (user.role === 'TOURNAMENT_ORGANIZER') {
      const stream = await findDocByAnyId(LiveStream, matchId);
      if (!stream) return false;
      const tourId = stream.tournamentId ? stream.tournamentId.toString() : '';
      if (tourId && (await canManageTournament(user, tourId))) return true;
      return stream.createdBy?.toString() === user._id.toString();
    }
    return await hasGranularPermission(user, 'broadcast:override', {
      scopeType: 'match',
      scopeId: matchId,
    });
  }

  const stream = await findDocByAnyId(LiveStream, matchId);
  if (!stream) return false;
  const streamTournamentId = stream.tournamentId ? stream.tournamentId.toString() : '';

  if (user.role === 'ADMIN') {
    return true;
  }

  if (user.role === 'TOURNAMENT_ORGANIZER') {
    if (stream.createdBy?.toString() === user._id.toString()) return true;
    if ((user.assignedStreamIds || []).some((id) => id.toString() === matchId)) return true;
    if (
      streamTournamentId &&
      ((await canManageTournament(user, streamTournamentId)) ||
        (user.assignedTournamentIds || []).some((id) => id.toString() === streamTournamentId))
    ) {
      return true;
    }
    return await hasGranularPermission(user, requiredPerm, {
      scopeType: 'match',
      scopeId: matchId,
    });
  }

  if (user.role === 'BROADCASTER') {
    // Broadcasters are strictly camera/layout operators; never grant camera config or overlay editing
    if (
      requiredPerm === 'broadcast:manage_cameras' ||
      requiredPerm === 'broadcast:manage_overlays'
    ) {
      return false;
    }

    const assignments = await BroadcastAssignment.find({ userId: user._id }).lean();
    let explicitlyBlocked = false;

    for (const a of assignments) {
      const matchHit = a.scopeType === 'match' && a.matchId && String(a.matchId) === matchId;
      const tourHit =
        a.scopeType === 'tournament' &&
        a.tournamentId &&
        streamTournamentId &&
        String(a.tournamentId) === streamTournamentId;

      if (matchHit || tourHit) {
        if (a.status === 'ACTIVE') {
          const perms = Array.isArray(a.permissions) ? a.permissions : [];
          if (requiredPerm === 'broadcast:control') {
            if (perms.length === 0 || perms.includes('broadcast:control')) {
              return true;
            }
          } else if (perms.includes(requiredPerm)) {
            return true;
          }
        } else {
          explicitlyBlocked = true;
        }
      }
    }

    if (explicitlyBlocked) return false;

    // Legacy direct user assignment fallback: only basic camera/layout control, not higher perms
    if (requiredPerm === 'broadcast:control') {
      const directMatch = (user.assignedStreamIds || []).some((id) => id.toString() === matchId);
      const directTournament =
        Boolean(streamTournamentId) &&
        (user.assignedTournamentIds || []).some((id) => id.toString() === streamTournamentId);
      if (directMatch || directTournament) {
        return true;
      }
    }
    return false;
  }

  // SCORER: NEVER automatically receives broadcaster permissions unless explicitly opted-in
  if (user.role === 'SCORER') {
    const activeAssignments = await BroadcastAssignment.find({
      userId: user._id,
      status: 'ACTIVE',
    }).lean();
    for (const a of activeAssignments) {
      const matchHit = a.scopeType === 'match' && a.matchId && String(a.matchId) === matchId;
      const tourHit =
        a.scopeType === 'tournament' &&
        a.tournamentId &&
        streamTournamentId &&
        String(a.tournamentId) === streamTournamentId;
      if ((matchHit || tourHit) && (!a.permissions?.length || a.permissions.includes(requiredPerm))) {
        return true;
      }
    }
    const explicitPerms = Array.isArray(user.granularPermissions) ? user.granularPermissions : [];
    if (explicitPerms.includes(requiredPerm)) {
      if ((user.assignedStreamIds || []).length === 0 && (user.assignedTournamentIds || []).length === 0) {
        return true;
      }
      if ((user.assignedStreamIds || []).some((id) => id.toString() === matchId)) return true;
      if (
        streamTournamentId &&
        (user.assignedTournamentIds || []).some((id) => id.toString() === streamTournamentId)
      ) {
        return true;
      }
    }
    return await hasGranularPermission(user, requiredPerm, {
      scopeType: 'match',
      scopeId: matchId,
    });
  }

  return false;
}

export async function getAuthorizedBroadcastScope(user: IUser): Promise<{
  allAccess: boolean;
  tournamentIds: string[];
  matchIds: string[];
}> {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    return { allAccess: true, tournamentIds: [], matchIds: [] };
  }

  const tournamentSet = new Set<string>();
  const matchSet = new Set<string>();

  if (user.role === 'TOURNAMENT_ORGANIZER') {
    const ownedTournaments = await Tournament.find({ createdBy: user._id }).select('_id').lean();
    for (const t of ownedTournaments) tournamentSet.add(String(t._id));
    for (const id of user.assignedTournamentIds || []) tournamentSet.add(id.toString());
    const ownedStreams = await LiveStream.find({ createdBy: user._id }).select('_id').lean();
    for (const s of ownedStreams) matchSet.add(String(s._id));
    for (const id of user.assignedStreamIds || []) matchSet.add(id.toString());
    return {
      allAccess: false,
      tournamentIds: Array.from(tournamentSet),
      matchIds: Array.from(matchSet),
    };
  }

  if (user.role === 'BROADCASTER') {
    const assignments = await BroadcastAssignment.find({
      userId: user._id,
      status: 'ACTIVE',
    }).lean();
    for (const a of assignments) {
      if (a.scopeType === 'tournament' && a.tournamentId) {
        tournamentSet.add(String(a.tournamentId));
      } else if (a.scopeType === 'match' && a.matchId) {
        matchSet.add(String(a.matchId));
      }
    }
    for (const id of user.assignedTournamentIds || []) tournamentSet.add(id.toString());
    for (const id of user.assignedStreamIds || []) matchSet.add(id.toString());
    return {
      allAccess: false,
      tournamentIds: Array.from(tournamentSet),
      matchIds: Array.from(matchSet),
    };
  }

  return { allAccess: false, tournamentIds: [], matchIds: [] };
}

export async function canManageStream(
  user: IUser,
  streamId: string,
  action: 'stream' | 'score' | 'result'
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'SPECTATOR' || user.role === 'CAPTAIN') return false;

  if (user.role === 'BROADCASTER') {
    if (action === 'stream') {
      return await hasBroadcastAccess(user, streamId, 'broadcast:control');
    }
    // Broadcaster is independent of Scorer and cannot submit scores or declare results
    return false;
  }

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
    const stream = await findDocByAnyId(LiveStream, streamId);
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
