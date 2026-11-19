import type { NotificationData } from '../types/index.ts';

export function resolveNotificationTarget(
  n: NotificationData,
  portal: 'customer' | 'admin' = 'customer'
): string {
  const link = (n.link || '').trim();
  const meta = n.metadata || {};

  if (portal === 'admin') {
    if (link.startsWith('/admin/')) return link;
    if (n.type === 'PAYMENT_SUBMITTED') {
      return meta.registrationId
        ? `/admin/payments?registrationId=${meta.registrationId}`
        : '/admin/payments';
    }
    if (n.type === 'TEAM_EDITED' || n.type === 'REGISTRATION_SUBMITTED') {
      return meta.registrationId
        ? `/admin/registrations?highlight=${meta.registrationId}`
        : '/admin/registrations';
    }
    if (n.entityType === 'TournamentRegistration') {
      return `/admin/registrations?highlight=${n.entityId || meta.registrationId || ''}`;
    }
    if (n.entityType === 'Tournament' && n.entityId) {
      return `/admin/tournaments`;
    }
    if (n.entityType === 'Fixture') {
      return `/admin/fixtures`;
    }
    if (link.startsWith('/')) return link;
    return '/admin/dashboard';
  }

  // Customer / Captain / Spectator portal
  if (link.startsWith('/')) {
    if (
      n.type === 'FIXTURE_UPDATED' &&
      !link.includes('tab=') &&
      link.startsWith('/tournaments/')
    ) {
      return `${link}?tab=bracket`;
    }
    if (
      (n.type === 'PAYMENT_APPROVED' ||
        n.type === 'PAYMENT_REJECTED' ||
        n.type === 'REGISTRATION_REVIEWED') &&
      !link.includes('tab=') &&
      link.startsWith('/tournaments/')
    ) {
      return `${link}?tab=register`;
    }
    return link;
  }

  if (meta.tournamentId) {
    if (meta.tab) return `/tournaments/${meta.tournamentId}?tab=${meta.tab}`;
    return `/tournaments/${meta.tournamentId}`;
  }

  switch (n.entityType) {
    case 'LiveStream':
    case 'Match':
      return n.entityId ? `/live/${n.entityId}` : '/';
    case 'Tournament':
      return n.entityId ? `/tournaments/${n.entityId}` : '/tournaments';
    case 'Fixture':
      return meta.tournamentId ? `/tournaments/${meta.tournamentId}?tab=bracket` : '/tournaments';
    case 'Team':
      return n.entityId ? `/teams/${n.entityId}` : '/teams';
    case 'Player':
      return n.entityId ? `/players/${n.entityId}` : '/leaderboards';
    case 'TournamentRegistration':
      return meta.tournamentId ? `/tournaments/${meta.tournamentId}?tab=register` : '/tournaments';
    default:
      return '/tournaments';
  }
}
