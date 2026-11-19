import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { ADMIN_PORTAL_ROLES, User } from '../models/User.ts';
import type { IUser, UserPermissions, UserRole } from '../models/User.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { Tournament } from '../models/Tournament.ts';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

export function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || EPHEMERAL_FALLBACK_SECRET;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  portal: 'admin' | 'customer';
}

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  authPortal?: 'admin' | 'customer';
}

export function signAuthToken(user: IUser, portal: 'admin' | 'customer'): string {
  const payload: JwtPayload = {
    sub: user._id.toString(),
    role: user.role,
    portal,
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
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
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    const user = await User.findById(decoded.sub);

    if (!user || !user.isActive) {
      res.status(401).json({ message: 'Account is inactive or no longer exists.' });
      return;
    }

    req.user = user;
    req.authPortal = decoded.portal;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired authentication token.' });
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
      const user = await User.findById(decoded.sub);
      if (user && user.isActive) {
        req.user = user;
        req.authPortal = decoded.portal;
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

    if (req.user.role === 'SPECTATOR') {
      res.status(403).json({ message: 'Forbidden: Spectators have read-only access.' });
      return;
    }

    if (req.user.permissions?.[permission]) {
      next();
      return;
    }

    res.status(403).json({ message: `Forbidden: Missing "${permission}" permission.` });
  };
}

export function canModerateChat(user: IUser): boolean {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MODERATOR') {
    return true;
  }
  if (user.role === 'SPECTATOR') return false;
  return Boolean(user.permissions?.moderateChat);
}

export async function canManageTournament(user: IUser, tournamentId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'SPECTATOR' || user.role === 'SCORER' || user.role === 'MODERATOR') return false;
  if (!user.permissions?.manageTournaments) return false;
  if (user.role === 'ADMIN') return true;

  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) return false;
  if (tournament.createdBy.toString() === user._id.toString()) return true;
  return (user.assignedTournamentIds || []).some((id) => id.toString() === tournamentId);
}

export async function canManageStream(
  user: IUser,
  streamId: string,
  action: 'stream' | 'score' | 'result'
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'SPECTATOR') return false;

  if (action === 'stream') {
    if (user.role === 'SCORER' || user.role === 'MODERATOR') return false;
    if (!user.permissions?.manageStreams) return false;
    if (user.role === 'ADMIN') return true;

    const stream = await LiveStream.findById(streamId);
    if (!stream) return false;
    if (stream.createdBy.toString() === user._id.toString()) return true;
    if (user.assignedStreamIds.some((id) => id.toString() === streamId)) return true;
    if (
      stream.tournamentId &&
      user.assignedTournamentIds.some((id) => id.toString() === stream.tournamentId?.toString())
    ) {
      return true;
    }
    return false;
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
    if (user.assignedStreamIds.length === 0) return true;
    return user.assignedStreamIds.some((id) => id.toString() === streamId);
  }
  if (user.role === 'TOURNAMENT_ORGANIZER') {
    if (!user.permissions?.manageScores) return false;
    const stream = await LiveStream.findById(streamId);
    if (!stream) return false;
    if (stream.createdBy.toString() === user._id.toString()) return true;
    if (user.assignedStreamIds.some((id) => id.toString() === streamId)) return true;
    if (
      stream.tournamentId &&
      user.assignedTournamentIds.some((id) => id.toString() === stream.tournamentId?.toString())
    ) {
      return true;
    }
    return false;
  }

  return false;
}
