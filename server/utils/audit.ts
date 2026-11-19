import { ActivityLog } from '../models/ActivityLog.ts';
import type { IUser } from '../models/User.ts';

export async function recordActivity(
  actor: IUser,
  action: string,
  resourceType: string,
  resourceId = '',
  details = '',
  diff?: {
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    await ActivityLog.create({
      actorId: actor._id,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      resourceType,
      resourceId: resourceId.toString(),
      details: details.slice(0, 500),
      previousValue: diff?.previousValue ?? null,
      newValue: diff?.newValue ?? null,
    });
  } catch (err) {
    console.error('[Audit] Failed to write activity log:', err);
  }
}
