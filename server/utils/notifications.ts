import mongoose from 'mongoose';
import { Notification } from '../models/Notification.ts';
import type { INotification } from '../models/Notification.ts';
import { User } from '../models/User.ts';
import { Tournament } from '../models/Tournament.ts';
import { emitUserNotification } from '../socket/index.ts';

type NotificationType = INotification['type'];

function preferenceKeyForType(type: NotificationType): string {
  switch (type) {
    case 'MATCH_STARTING':
      return 'matchStart';
    case 'MATCH_LIVE':
    case 'INNINGS_BREAK':
    case 'SECOND_INNINGS_STARTED':
      return 'matchLive';
    case 'FOLLOWED_TEAM':
      return 'followedTeams';
    case 'SCORE_UPDATE':
    case 'WICKET':
      return 'scoreUpdates';
    case 'MATCH_RESULT':
    case 'MATCH_COMPLETED':
      return 'matchResults';
    case 'TOURNAMENT_PUBLISHED':
    case 'FIXTURE_PUBLISHED':
    case 'FIXTURE_UPDATED':
      return 'tournamentUpdates';
    default:
      return 'matchLive';
  }
}

export async function notifyUser(params: {
  userId: mongoose.Types.ObjectId | string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  link: string;
  dedupeKey: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  try {
    const uid = params.userId.toString();
    if (!mongoose.Types.ObjectId.isValid(uid)) return;
    const doc = await Notification.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(uid), dedupeKey: params.dedupeKey },
      {
        $setOnInsert: {
          userId: new mongoose.Types.ObjectId(uid),
          type: params.type,
          title: params.title.slice(0, 160),
          message: params.message.slice(0, 400),
          entityType: params.entityType,
          entityId: params.entityId,
          link: params.link,
          metadata: params.metadata || {},
          dedupeKey: params.dedupeKey,
          isRead: false,
        },
      },
      { upsert: true, new: true }
    ).lean();
    if (doc) {
      emitUserNotification(uid, { ...doc, id: doc._id.toString() });
    }
  } catch (err) {
    console.error('[Notifications] notifyUser error:', err);
  }
}

export async function notifyTournamentAdminsAndOrganizers(params: {
  tournamentId?: mongoose.Types.ObjectId | string | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  link: string;
  dedupeKeyPrefix: string;
  metadata?: Record<string, string>;
}): Promise<number> {
  try {
    const adminUsers = await User.find({
      isActive: true,
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER'] },
    })
      .select('_id role assignedTournamentIds permissions')
      .lean();

    let tournamentCreatorId = '';
    const tidStr = params.tournamentId ? params.tournamentId.toString() : '';
    if (tidStr && mongoose.Types.ObjectId.isValid(tidStr)) {
      const tr = await Tournament.findById(tidStr).select('createdBy').lean();
      if (tr?.createdBy) tournamentCreatorId = tr.createdBy.toString();
    }

    const targets = adminUsers.filter((u: any) => {
      if (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') return true;
      if (!tidStr) return true;
      if (tournamentCreatorId && u._id.toString() === tournamentCreatorId) return true;
      return (u.assignedTournamentIds || []).some((id: any) => id.toString() === tidStr);
    });

    let count = 0;
    for (const target of targets) {
      await notifyUser({
        userId: target._id,
        type: params.type,
        title: params.title,
        message: params.message,
        entityType: params.entityType,
        entityId: params.entityId,
        link: params.link,
        dedupeKey: `${params.dedupeKeyPrefix}-${target._id.toString()}`,
        metadata: params.metadata,
      });
      count += 1;
    }
    return count;
  } catch (err) {
    console.error('[Notifications] notifyTournamentAdminsAndOrganizers error:', err);
    return 0;
  }
}

export async function dispatchMatchNotifications(params: {
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  link: string;
  dedupeKey: string;
  teamIds?: Array<mongoose.Types.ObjectId | string | null | undefined>;
  tournamentId?: mongoose.Types.ObjectId | string | null;
  playerIds?: Array<mongoose.Types.ObjectId | string | null | undefined>;
  includeAllSpectatorsIfNoFollowers?: boolean;
  metadata?: Record<string, string>;
}): Promise<number> {
  try {
    const validTeamIds = (params.teamIds || [])
      .map((id) => (id ? id.toString() : ''))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    const validTournamentId =
      params.tournamentId && mongoose.Types.ObjectId.isValid(params.tournamentId.toString())
        ? params.tournamentId.toString()
        : '';

    const validPlayerIds = (params.playerIds || [])
      .map((id) => (id ? id.toString() : ''))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    const prefField = preferenceKeyForType(params.type);
    const query: Record<string, unknown> = {
      isActive: true,
      [`notificationPreferences.${prefField}`]: { $ne: false },
    };

    const orConditions: Record<string, unknown>[] = [];
    if (validTeamIds.length > 0) {
      orConditions.push({ followedTeamIds: { $in: validTeamIds } });
    }
    if (validTournamentId) {
      orConditions.push({ followedTournamentIds: validTournamentId });
    }
    if (validPlayerIds.length > 0) {
      orConditions.push({ followedPlayerIds: { $in: validPlayerIds } });
    }

    if (orConditions.length > 0) {
      if (params.includeAllSpectatorsIfNoFollowers) {
        orConditions.push({ role: 'SPECTATOR' });
      }
      query.$or = orConditions;
    }

    const recipients = await User.find(query).select('_id').limit(500).lean();
    if (recipients.length === 0) return 0;

    let createdCount = 0;
    const CHUNK_SIZE = 25;
    const safeTitle = params.title.slice(0, 160);
    const safeMessage = params.message.slice(0, 400);

    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (r) => {
          const uid = r._id.toString();
          try {
            const doc = await Notification.findOneAndUpdate(
              { userId: r._id, dedupeKey: params.dedupeKey },
              {
                $setOnInsert: {
                  userId: r._id,
                  type: params.type,
                  title: safeTitle,
                  message: safeMessage,
                  entityType: params.entityType,
                  entityId: params.entityId,
                  link: params.link,
                  metadata: params.metadata || {},
                  dedupeKey: params.dedupeKey,
                  isRead: false,
                },
              },
              { upsert: true, new: true }
            ).lean();
            if (doc) {
              createdCount += 1;
              emitUserNotification(uid, {
                ...doc,
                id: doc._id.toString(),
              });
            }
          } catch {
            // Ignore duplicate dedupeKey race
          }
        })
      );
    }
    return createdCount;
  } catch (err) {
    console.error('[Notifications] Dispatch error:', err);
    return 0;
  }
}
