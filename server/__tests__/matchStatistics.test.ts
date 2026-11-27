import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const {
  applyCricketAction,
  createInitialCricketDetails,
  getCricketCreaseSummary,
} = await import('../../src/utils/cricketScoring.ts');
const {
  deriveMatchStatisticsSummary,
} = await import('../../src/utils/matchStatistics.ts');

describe('Match Statistics Utility & Active Player Mini-Stats', () => {
  it('derives cumulative Cricket match statistics (CRR, extras, total wickets, boundaries, team breakdown)', () => {
    let details = createInitialCricketDetails(10, 11);
    details.battingTeam = 'A';
    details.batsman1 = 'Ankit';
    details.batsman2 = 'Hunny';
    details.bowler = 'Mohan';

    // Ball 1: 4 runs
    details = applyCricketAction(details, { type: 'RUNS', runs: 4 }).details;
    // Standard 1-run Wide (extraRuns = 0 means no additional overthrows)
    details = applyCricketAction(details, { type: 'WIDE', extraRuns: 0 }).details;
    // Ball 2: 6 runs
    details = applyCricketAction(details, { type: 'RUNS', runs: 6 }).details;
    // Ball 3: dot
    details = applyCricketAction(details, { type: 'RUNS', runs: 0 }).details;
    // Ball 4: Wicket (Ankit out, Vikas in)
    details = applyCricketAction(details, {
      type: 'WICKET',
      wicketType: 'BOWLED',
      dismissedPlayer: 'Ankit',
      newBatsman: 'Vikas',
    }).details;

    const summary = deriveMatchStatisticsSummary({
      sportType: 'Cricket',
      teamAName: 'Chandena',
      teamBName: 'Talheri',
      score: {
        _id: 'sc1',
        liveStreamId: 'st1',
        sportType: 'Cricket',
        teamAScore: details.teamARuns,
        teamBScore: details.teamBRuns,
        sportSpecificDetails: details as unknown as Record<string, unknown>,
        matchStatus: 'LIVE',
        lastUpdatedAt: new Date().toISOString(),
      },
    });

    assert.equal(summary.sport, 'Cricket');
    const crr = summary.items.find((i) => i.id === 'crr');
    const extras = summary.items.find((i) => i.id === 'extras');
    const wickets = summary.items.find((i) => i.id === 'wickets');
    const totalRuns = summary.items.find((i) => i.id === 'total-runs');
    const boundaries = summary.items.find((i) => i.id === 'boundaries');

    assert.equal(crr?.value, '16.50'); // 11 runs in 4 balls => 16.50 CRR
    assert.equal(extras?.value, '1');
    assert.ok(extras?.sublabel.includes('Wd 1'));
    assert.equal(wickets?.value, '1');
    assert.equal(totalRuns?.value, '11');
    assert.equal(boundaries?.value, '2');
    assert.ok(boundaries?.sublabel.includes('4s: 1 · 6s: 1'));
    assert.equal(summary.teamBreakdown[0].teamName, 'Chandena');
    assert.equal(summary.teamBreakdown[0].primaryMetric, '11/1');

    // Verify Active Players crease summary includes batter runs/balls and bowler dotBalls
    const crease = getCricketCreaseSummary(details, 'Chandena', 'Talheri');
    assert.equal(crease.batsman1?.name, 'Vikas');
    assert.equal(crease.batsman1?.runs, 0);
    assert.equal(crease.batsman1?.balls, 0);
    assert.equal(crease.batsman2?.name, 'Hunny');
    assert.equal(crease.bowler?.name, 'Mohan');
    assert.equal(crease.bowler?.wickets, 1);
    assert.equal(crease.bowler?.dotBalls, 1);
  });

  it('derives cumulative statistics for Volleyball and Kabaddi cleanly', () => {
    const vbSummary = deriveMatchStatisticsSummary({
      sportType: 'Volleyball',
      teamAName: 'Spikers',
      teamBName: 'Blockers',
      score: {
        _id: 'sc2',
        liveStreamId: 'st2',
        sportType: 'Volleyball',
        teamAScore: 12,
        teamBScore: 9,
        matchStatus: 'LIVE',
        lastUpdatedAt: new Date().toISOString(),
        sportSpecificDetails: {
          bestOfSets: 3,
          currentSet: 2,
          teamASetsWon: 1,
          teamBSetsWon: 0,
          setScores: [
            { set: 1, teamA: 25, teamB: 21, winner: 'A' },
          ],
        },
      },
    });
    assert.equal(vbSummary.items.find((i) => i.id === 'sets-won')?.value, '1 - 0');
    assert.equal(vbSummary.items.find((i) => i.id === 'rally-pts')?.value, '67');
  });
});
