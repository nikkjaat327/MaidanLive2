import mongoose from 'mongoose';
import { Notification } from '../models/Notification.ts';
import type { INotification } from '../models/Notification.ts';
import { User } from '../models/User.ts';
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
      return 'tournamentUpdates';
    default:
      return 'matchLive';
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
    for (const r of recipients) {
      const uid = r._id.toString();
      try {
        const doc = await Notification.findOneAndUpdate(
          { userId: r._id, dedupeKey: params.dedupeKey },
          {
            $setOnInsert: {
              userId: r._id,
              type: params.type,
              title: params.title.slice(0, 160),
              message: params.message.slice(0, 400),
              entityType: params.entityType,
              entityId: params.entityId,
              link: params.link,
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
    }
    return createdCount;
  } catch (err) {
    console.error('[Notifications] Dispatch error:', err);
    return 0;
  }
}
