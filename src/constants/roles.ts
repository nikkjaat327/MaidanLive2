export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'TOURNAMENT_ORGANIZER'
  | 'MODERATOR'
  | 'SCORER'
  | 'SPECTATOR';

export const ADMIN_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'TOURNAMENT_ORGANIZER',
  'MODERATOR',
  'SCORER',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TOURNAMENT_ORGANIZER: 'Organizer',
  MODERATOR: 'Moderator',
  SCORER: 'Scorer',
  SPECTATOR: 'Spectator',
};
