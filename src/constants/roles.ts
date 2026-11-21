export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'TOURNAMENT_ORGANIZER'
  | 'BROADCASTER'
  | 'MODERATOR'
  | 'SCORER'
  | 'CAPTAIN'
  | 'SPECTATOR';

export const ADMIN_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'TOURNAMENT_ORGANIZER',
  'BROADCASTER',
  'MODERATOR',
  'SCORER',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TOURNAMENT_ORGANIZER: 'Organizer',
  BROADCASTER: 'Broadcaster',
  MODERATOR: 'Moderator',
  SCORER: 'Scorer',
  CAPTAIN: 'Team Captain',
  SPECTATOR: 'Player',
};

export const ALL_GRANULAR_PERMISSIONS = [
  'admin_portal:access',
  'analytics:view',
  'tournaments:create',
  'tournaments:approve',
  'tournaments:manage',
  'tournaments:delete',
  'teams:register',
  'teams:approve',
  'teams:manage',
  'players:manage',
  'players:verify',
  'matches:create',
  'matches:manage',
  'matches:assign_scorers',
  'matches:score',
  'matches:manage_stream',
  'matches:publish_replay',
  'broadcast:control',
  'broadcast:manage_cameras',
  'broadcast:manage_overlays',
  'broadcast:stream_control',
  'broadcast:record_control',
  'broadcast:assign_broadcasters',
  'broadcast:override',
  'registrations:review',
  'sponsors:manage',
  'users:view',
  'users:create_admin',
  'users:manage_roles',
  'users:manage_status',
  'users:reset_password',
  'permissions:manage',
  'audit_logs:view',
  'security:manage',
] as const;
