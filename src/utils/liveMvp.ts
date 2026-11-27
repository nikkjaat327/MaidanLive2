import { LiveScoreData, PlayerMatchStatRecord, ScoreHistoryItem } from '../types/index.ts';
import {
  CricketDetails,
  deriveCricketInningsScorecard,
  normalizeCricketDetails,
} from './cricketScoring.ts';
import { normalizeKabaddiDetails } from './kabaddiScoring.ts';

export interface LiveMvpCandidate {
  key: string;
  name: string;
  teamName: string;
  teamSide?: 'A' | 'B';
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: string;
  wickets: number;
  overs: string;
  runsConceded: number;
  maidens: number;
  dotBalls: number;
  economy: string;
  impactScore: number;
  statLine: string;
  roleHighlight: string;
}

export interface LiveMvpRankingResult {
  sport: string;
  suggestedMvp: LiveMvpCandidate | null;
  candidates: LiveMvpCandidate[];
}

export function computeLiveMvpCandidates(params: {
  sportType?: string;
  teamAName?: string;
  teamBName?: string;
  score?: LiveScoreData | null;
  history?: ScoreHistoryItem[];
  playerStats?: PlayerMatchStatRecord[];
}): LiveMvpRankingResult {
  const sport = params.score?.sportType || params.sportType || 'Cricket';
  const teamA = params.teamAName?.trim() || 'Team A';
  const teamB = params.teamBName?.trim() || 'Team B';
  const score = params.score ?? null;
  const history = Array.isArray(params.history) ? params.history : [];
  const playerStats = Array.isArray(params.playerStats) ? params.playerStats : [];

  if (sport === 'Cricket') {
    const d = normalizeCricketDetails(
      (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
    );
    const card1 = deriveCricketInningsScorecard(d, 1, teamA, teamB);
    const card2 = deriveCricketInningsScorecard(d, 2, teamA, teamB);

    const map = new Map<
      string,
      Omit<LiveMvpCandidate, 'impactScore' | 'statLine' | 'roleHighlight'> & {
        bowlingBalls: number;
        notOut: boolean;
      }
    >();

    const ensure = (name: string, teamName: string, teamSide?: 'A' | 'B') => {
      const cleanName = name.trim();
      const k = `${teamName.toLowerCase()}::${cleanName.toLowerCase()}`;
      let entry = map.get(k);
      if (!entry) {
        entry = {
          key: k,
          name: cleanName,
          teamName,
          teamSide,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strikeRate: '0.0',
          wickets: 0,
          overs: '0.0',
          runsConceded: 0,
          maidens: 0,
          dotBalls: 0,
          economy: '0.00',
          bowlingBalls: 0,
          notOut: false,
        };
        map.set(k, entry);
      }
      return entry;
    };

    for (const card of [card1, card2]) {
      for (const bat of card.batting) {
        if (!bat.name.trim()) continue;
        const entry = ensure(bat.name, card.battingTeamName, card.battingTeam);
        entry.runs += bat.runs;
        entry.balls += bat.balls;
        entry.fours += bat.fours;
        entry.sixes += bat.sixes;
        entry.notOut = entry.notOut || !bat.isOut;
        entry.strikeRate =
          entry.balls > 0 ? ((entry.runs / entry.balls) * 100).toFixed(1) : '0.0';
      }
      for (const bowl of card.bowling) {
        if (!bowl.name.trim()) continue;
        const entry = ensure(bowl.name, card.bowlingTeamName, card.bowlingTeam);
        entry.wickets += bowl.wickets;
        entry.runsConceded += bowl.runsConceded;
        entry.maidens += bowl.maidens;
        entry.dotBalls += bowl.dotBalls || 0;
        entry.bowlingBalls += bowl.balls;
        const ov = Math.floor(entry.bowlingBalls / 6);
        const rem = entry.bowlingBalls % 6;
        entry.overs = `${ov}.${rem}`;
        entry.economy =
          entry.bowlingBalls > 0
            ? ((entry.runsConceded * 6) / entry.bowlingBalls).toFixed(2)
            : '0.00';
      }
    }

    // Fallback: merge manually saved PlayerMatchStat records if higher or missing
    for (const st of playerStats) {
      const pObj = typeof st.playerId === 'object' && st.playerId ? st.playerId : null;
      const tObj = typeof st.teamId === 'object' && st.teamId ? st.teamId : null;
      const pName = pObj?.name || '';
      if (!pName) continue;
      const tName = tObj?.name || tObj?.shortName || teamA;
      const side: 'A' | 'B' | undefined =
        tName.toLowerCase() === teamB.toLowerCase()
          ? 'B'
          : tName.toLowerCase() === teamA.toLowerCase()
            ? 'A'
            : undefined;
      const entry = ensure(pName, tName, side);
      if ((st.runs || 0) > entry.runs) entry.runs = st.runs;
      if ((st.ballsFaced || 0) > entry.balls) entry.balls = st.ballsFaced;
      if ((st.fours || 0) > entry.fours) entry.fours = st.fours;
      if ((st.sixes || 0) > entry.sixes) entry.sixes = st.sixes;
      if ((st.wickets || 0) > entry.wickets) entry.wickets = st.wickets;
      if (entry.balls > 0) entry.strikeRate = ((entry.runs / entry.balls) * 100).toFixed(1);
    }

    const candidates: LiveMvpCandidate[] = Array.from(map.values())
      .filter((e) => e.runs > 0 || e.balls > 0 || e.wickets > 0 || e.bowlingBalls > 0)
      .map((e) => {
        // Weighted impact score emphasizing runs & wickets
        const batMilestone = e.runs >= 100 ? 40 : e.runs >= 50 ? 20 : e.runs >= 30 ? 10 : 0;
        const srBonus =
          e.balls >= 8 && Number(e.strikeRate) >= 150
            ? 8
            : e.balls >= 8 && Number(e.strikeRate) >= 125
              ? 4
              : 0;
        const bowlMilestone = e.wickets >= 5 ? 25 : e.wickets >= 3 ? 12 : 0;
        const econBonus =
          e.bowlingBalls >= 6 && Number(e.economy) <= 6
            ? 6
            : e.bowlingBalls >= 6 && Number(e.economy) <= 7.5
              ? 3
              : 0;

        const impactScore = Math.round(
          e.runs * 1.2 +
            e.fours * 1 +
            e.sixes * 2 +
            batMilestone +
            srBonus +
            e.wickets * 26 +
            e.maidens * 8 +
            e.dotBalls * 1 +
            bowlMilestone +
            econBonus
        );

        const parts: string[] = [];
        if (e.balls > 0 || e.runs > 0) {
          parts.push(`${e.runs}${e.notOut ? '*' : ''} (${e.balls})`);
        }
        if (e.wickets > 0 || e.bowlingBalls > 0) {
          parts.push(`${e.wickets}/${e.runsConceded} (${e.overs} ov)`);
        }

        const roleHighlight =
          e.runs > 0 && e.wickets > 0
            ? 'All-Round Impact'
            : e.wickets * 26 >= e.runs * 1.2
              ? 'Top Bowler'
              : 'Top Batter';

        return {
          key: e.key,
          name: e.name,
          teamName: e.teamName,
          teamSide: e.teamSide,
          runs: e.runs,
          balls: e.balls,
          fours: e.fours,
          sixes: e.sixes,
          strikeRate: e.strikeRate,
          wickets: e.wickets,
          overs: e.overs,
          runsConceded: e.runsConceded,
          maidens: e.maidens,
          dotBalls: e.dotBalls,
          economy: e.economy,
          impactScore,
          statLine: parts.join(' · ') || 'Active Performer',
          roleHighlight,
        };
      })
      .sort((a, b) => {
        if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
        if (b.wickets !== a.wickets) return b.wickets - a.wickets;
        return b.runs - a.runs;
      });

    return {
      sport: 'Cricket',
      suggestedMvp: candidates[0] || null,
      candidates,
    };
  }

  if (sport === 'Kabaddi') {
    const kd = normalizeKabaddiDetails(score?.sportSpecificDetails);
    const list: LiveMvpCandidate[] = [];
    const addCourt = (players: typeof kd.courtPlayersA, side: 'A' | 'B', teamName: string) => {
      for (const p of players) {
        const pts = (p.stats.raidPoints || 0) + (p.stats.tacklePoints || 0) + (p.stats.bonusPoints || 0);
        const impact = Math.round(
          (p.stats.raidPoints || 0) * 2 +
            (p.stats.tacklePoints || 0) * 2.5 +
            (p.stats.bonusPoints || 0) +
            (p.stats.superRaids || 0) * 5 +
            (p.stats.superTackles || 0) * 6
        );
        if (impact <= 0) continue;
        list.push({
          key: `${side}-${p.playerId || p.name}`,
          name: p.name,
          teamName,
          teamSide: side,
          runs: pts,
          balls: 0,
          fours: p.stats.raidPoints || 0,
          sixes: p.stats.tacklePoints || 0,
          strikeRate: '0.0',
          wickets: p.stats.tacklePoints || 0,
          overs: '0.0',
          runsConceded: 0,
          maidens: 0,
          dotBalls: 0,
          economy: '0.00',
          impactScore: impact,
          statLine: `${pts} pts (Raid ${p.stats.raidPoints || 0} · Tackle ${p.stats.tacklePoints || 0})`,
          roleHighlight:
            (p.stats.tacklePoints || 0) > (p.stats.raidPoints || 0) ? 'Top Defender' : 'Top Raider',
        });
      }
    };
    addCourt(kd.courtPlayersA, 'A', teamA);
    addCourt(kd.courtPlayersB, 'B', teamB);
    list.sort((a, b) => b.impactScore - a.impactScore);
    return {
      sport: 'Kabaddi',
      suggestedMvp: list[0] || null,
      candidates: list,
    };
  }

  // Generic / Football / Volleyball fallback from history & playerStats
  const genericMap = new Map<string, LiveMvpCandidate>();
  const ensureGen = (name: string, teamName: string, side?: 'A' | 'B') => {
    const clean = name.trim();
    const k = `${teamName.toLowerCase()}::${clean.toLowerCase()}`;
    let row = genericMap.get(k);
    if (!row) {
      row = {
        key: k,
        name: clean,
        teamName,
        teamSide: side,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: '0.0',
        wickets: 0,
        overs: '0.0',
        runsConceded: 0,
        maidens: 0,
        dotBalls: 0,
        economy: '0.00',
        impactScore: 0,
        statLine: '',
        roleHighlight: 'Top Performer',
      };
      genericMap.set(k, row);
    }
    return row;
  };

  for (const h of history) {
    if (h.reverted || h.entryType !== 'SCORE_UPDATE') continue;
    const tSide = h.teamSide === 'B' ? 'B' : h.teamSide === 'A' ? 'A' : undefined;
    const tName = tSide === 'B' ? teamB : teamA;
    if (h.playerName) {
      const r = ensureGen(h.playerName, tName, tSide);
      const pts = Math.max(1, Number(h.pointsAwarded || 0));
      r.runs += pts;
      r.impactScore += pts * 10;
    }
    if (h.assistPlayerName && h.eventCategory !== 'SUBSTITUTION') {
      const a = ensureGen(h.assistPlayerName, tName, tSide);
      a.wickets += 1;
      a.impactScore += 6;
    }
  }

  const list = Array.from(genericMap.values())
    .map((r) => ({
      ...r,
      statLine: `${r.runs} pts${r.wickets > 0 ? ` · ${r.wickets} assists` : ''}`,
    }))
    .sort((a, b) => b.impactScore - a.impactScore);

  return {
    sport,
    suggestedMvp: list[0] || null,
    candidates: list,
  };
}
