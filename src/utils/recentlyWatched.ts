export interface RecentMatchEntry {
  id: string;
  title: string;
  teamAName: string;
  teamBName: string;
  sport: string;
  status: string;
  tournamentName?: string;
  visitedAt: string;
}

export interface RecentTournamentEntry {
  id: string;
  name: string;
  sportType: string;
  location?: string;
  visitedAt: string;
}

export interface RecentTeamEntry {
  id: string;
  name: string;
  sportType: string;
  logoUrl?: string;
  visitedAt: string;
}

const MATCHES_KEY = 'maidanlive_recent_matches_v1';
const TOURNAMENTS_KEY = 'maidanlive_recent_tournaments_v1';
const TEAMS_KEY = 'maidanlive_recent_teams_v1';

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList<T extends { id: string }>(key: string, entry: T, maxItems: number): void {
  try {
    const current = readList<T>(key).filter((item) => item.id !== entry.id);
    const next = [entry, ...current].slice(0, maxItems);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignore quota errors
  }
}

export const recentlyWatchedStore = {
  recordMatch(entry: Omit<RecentMatchEntry, 'visitedAt'>): void {
    if (!entry.id) return;
    writeList<RecentMatchEntry>(
      MATCHES_KEY,
      { ...entry, visitedAt: new Date().toISOString() },
      12
    );
  },
  getMatches(): RecentMatchEntry[] {
    return readList<RecentMatchEntry>(MATCHES_KEY);
  },
  clearMatches(): void {
    try {
      localStorage.removeItem(MATCHES_KEY);
    } catch {
      // ignore
    }
  },
  recordTournament(entry: Omit<RecentTournamentEntry, 'visitedAt'>): void {
    if (!entry.id) return;
    writeList<RecentTournamentEntry>(
      TOURNAMENTS_KEY,
      { ...entry, visitedAt: new Date().toISOString() },
      8
    );
  },
  getTournaments(): RecentTournamentEntry[] {
    return readList<RecentTournamentEntry>(TOURNAMENTS_KEY);
  },
  recordTeam(entry: Omit<RecentTeamEntry, 'visitedAt'>): void {
    if (!entry.id) return;
    writeList<RecentTeamEntry>(
      TEAMS_KEY,
      { ...entry, visitedAt: new Date().toISOString() },
      8
    );
  },
  getTeams(): RecentTeamEntry[] {
    return readList<RecentTeamEntry>(TEAMS_KEY);
  },
};
