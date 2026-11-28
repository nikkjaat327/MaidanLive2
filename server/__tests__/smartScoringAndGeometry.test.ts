import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  applyCricketAction,
  createInitialCricketDetails,
  deriveCricketBattingTeamFromToss,
  getCurrentOverBalls,
  hasCricketScoringStarted,
} from '../../src/utils/cricketScoring.ts';
import {
  applyFootballAction,
  createInitialFootballDetails,
  hasFootballScoringStarted,
} from '../../src/utils/footballScoring.ts';
import {
  applyKabaddiEngineAction,
  createInitialKabaddiDetails,
  hasKabaddiScoringStarted,
} from '../../src/utils/kabaddiScoring.ts';
import {
  applyVolleyballAction,
  createInitialVolleyballDetails,
  hasVolleyballScoringStarted,
} from '../../src/utils/volleyballScoring.ts';
import {
  buildTeamRosterSets,
  validateSportPlayerOwnership,
} from '../utils/rosterOwnershipValidation.ts';
import {
  DEFAULT_OBS_BOX,
  DEFAULT_OVERLAY_CONFIG,
  DEFAULT_VIEWER_LANDSCAPE_BOX,
  DEFAULT_VIEWER_PORTRAIT_BOX,
  clampScoreboardGeometryBox,
  normalizeOverlayConfig,
} from '../../src/utils/overlayConfig.ts';
import { buildScoreboardViewModel } from '../../src/components/obs/scoreboardViewModel.ts';
import { resolveObsTheme } from '../../src/components/obs/obsTheme.ts';
import { normalizeBroadcast } from '../../src/utils/normalizeBroadcast.ts';

const baseCricketStream = {
  id: 'stream_cricket_1',
  title: 'Chandena vs Nagal',
  gameName: 'Cricket',
  tournamentName: 'Rural Premier League',
  teamAId: 'team_a',
  teamBId: 'team_b',
  teamAName: 'Chandena XI',
  teamBName: 'Nagal Strikers',
  status: 'LIVE' as const,
  streamingProvider: 'youtube' as const,
};

describe('Cricket Current-Over Deliveries (getCurrentOverBalls)', () => {
  it('retains wides and no-balls mid-over, resets after 6 legal balls & END_OVER, and never falls back to lastOverSummary', () => {
    let d = createInitialCricketDetails(10);
    d = applyCricketAction(d, { type: 'RUNS', runs: 1 }).details;
    d = applyCricketAction(d, { type: 'WIDE', extraRuns: 0 }).details;
    d = applyCricketAction(d, { type: 'RUNS', runs: 4 }).details;
    d = applyCricketAction(d, { type: 'NO_BALL', extraRuns: 0, batRuns: 1 }).details;

    assert.deepEqual(getCurrentOverBalls(d), ['1', 'Wd', '4', 'Nb+1']);

    // Complete remaining 4 legal balls (total 6 legal balls -> over completes)
    d = applyCricketAction(d, { type: 'RUNS', runs: 0 }).details;
    d = applyCricketAction(d, { type: 'RUNS', runs: 2 }).details;
    d = applyCricketAction(d, { type: 'RUNS', runs: 1 }).details;
    d = applyCricketAction(d, { type: 'RUNS', runs: 6 }).details;

    assert.equal(d.teamABalls, 6);
    assert.ok(d.lastOverSummary.length >= 6);
    assert.deepEqual(getCurrentOverBalls(d), []);

    // Next over starts cleanly with 1 delivery, then END_OVER clears it
    d = applyCricketAction(d, { type: 'RUNS', runs: 2 }).details;
    assert.deepEqual(getCurrentOverBalls(d), ['2']);
    d = applyCricketAction(d, { type: 'END_OVER' }).details;
    assert.deepEqual(getCurrentOverBalls(d), []);

    // Even if a stale doc only had lastOverSummary populated at ball 0 of over, never fall back
    const staleDoc = {
      ...d,
      teamABalls: 6,
      recentBalls: [],
      lastOverSummary: ['1', '4', '0', '6', '1', '2'],
      deliveryHistory: [],
    };
    assert.deepEqual(getCurrentOverBalls(staleDoc), []);
  });
});

describe('Pre-Match Toss & Opening Setup Across All Sports', () => {
  it('derives Cricket battingTeam from tossWinner + tossDecision and locks hasCricketScoringStarted after first ball', () => {
    assert.equal(deriveCricketBattingTeamFromToss('A', 'BAT'), 'A');
    assert.equal(deriveCricketBattingTeamFromToss('A', 'BOWL'), 'B');
    assert.equal(deriveCricketBattingTeamFromToss('B', 'BAT'), 'B');
    assert.equal(deriveCricketBattingTeamFromToss('B', 'BOWL'), 'A');

    let d = createInitialCricketDetails(10);
    assert.equal(hasCricketScoringStarted(d), false);

    const tossStep = applyCricketAction(d, {
      type: 'SET_PRE_MATCH_TOSS',
      tossWinner: 'B',
      tossDecision: 'BOWL',
    });
    d = tossStep.details;
    assert.equal(d.tossWinner, 'B');
    assert.equal(d.tossDecision, 'BOWL');
    assert.equal(d.battingTeam, 'A');
    assert.equal(hasCricketScoringStarted(d), false);

    d = applyCricketAction(d, { type: 'RUNS', runs: 1 }).details;
    assert.equal(hasCricketScoringStarted(d), true);
  });

  it('supports SET_PRE_MATCH_SETUP and scoring-started guards for Football, Kabaddi, and Volleyball', () => {
    // Football
    const fbInit = createInitialFootballDetails();
    assert.equal(hasFootballScoringStarted(fbInit, 0, 0), false);
    const fbSetup = applyFootballAction(fbInit, 0, 0, {
      type: 'SET_PRE_MATCH_SETUP',
      tossWinner: 'B',
      tossDecision: 'KICKOFF',
      kickoffTeam: 'B',
    });
    assert.equal(fbSetup.details.kickoffTeam, 'B');
    assert.equal(fbSetup.details.tossWinner, 'B');
    assert.equal(hasFootballScoringStarted(fbSetup.details, 0, 0), false);
    assert.equal(hasFootballScoringStarted(fbSetup.details, 1, 0), true);

    // Kabaddi
    const kbInit = createInitialKabaddiDetails();
    assert.equal(hasKabaddiScoringStarted(kbInit, 0, 0), false);
    const kbSetup = applyKabaddiEngineAction(kbInit, 0, 0, {
      type: 'SET_PRE_MATCH_SETUP',
      tossWinner: 'B',
      tossDecision: 'RAID',
      startingRaidingTeam: 'B',
      sideSwapped: true,
    });
    assert.equal(kbSetup.details.activeRaidingTeam, 'B');
    assert.equal(kbSetup.details.clock.sideSwapped, true);
    assert.equal(hasKabaddiScoringStarted(kbSetup.details, 0, 0), false);
    assert.equal(hasKabaddiScoringStarted(kbSetup.details, 1, 0), true);

    // Volleyball
    const vbInit = createInitialVolleyballDetails();
    assert.equal(hasVolleyballScoringStarted(vbInit, 0, 0), false);
    const vbSetup = applyVolleyballAction(vbInit, 0, 0, {
      type: 'SET_PRE_MATCH_SETUP',
      tossWinner: 'B',
      tossDecision: 'SERVE',
      servingTeam: 'B',
    });
    assert.equal(vbSetup.details.servingTeam, 'B');
    assert.equal(hasVolleyballScoringStarted(vbSetup.details, 0, 0), false);
    assert.equal(hasVolleyballScoringStarted(vbSetup.details, 1, 0), true);
  });

  it('exposes POST /:id/score/toss route with match-started 409 lock and adminOverride bypass', () => {
    const scoreRoutesSrc = readFileSync(
      resolve(process.cwd(), 'server/routes/scoreRoutes.ts'),
      'utf8'
    );
    assert.match(scoreRoutesSrc, /'\/:id\/score\/toss'/);
    assert.match(scoreRoutesSrc, /hasCricketScoringStarted/);
    assert.match(scoreRoutesSrc, /adminOverride === true && isAdminRole/);
    assert.match(scoreRoutesSrc, /res\.status\(409\)\.json/);
  });
});

describe('Strict Team Roster Ownership Validation', () => {
  const rosters = buildTeamRosterSets({
    teamAId: 'team_a',
    teamBId: 'team_b',
    teamAPlayers: [{ name: 'Virat Kohli' }, { name: 'Rohit Sharma' }],
    teamBPlayers: [{ name: 'Jasprit Bumrah' }, { name: 'Hardik Pandya' }],
    dbPlayers: [
      { name: 'Shubman Gill', teamId: 'team_a' },
      { name: 'Rashid Khan', teamId: 'team_b' },
    ],
  });

  it('rejects cross-team Cricket batter/bowler selections and allows valid team or custom names', () => {
    // Batting team A, trying to assign Team B player as striker -> reject
    const badBatter = validateSportPlayerOwnership({
      sportType: 'Cricket',
      rosters,
      battingTeam: 'A',
      batsman1: 'Jasprit Bumrah',
    });
    assert.equal(badBatter.valid, false);

    // Batting team A, trying to assign Team A player as bowler -> reject
    const badBowler = validateSportPlayerOwnership({
      sportType: 'Cricket',
      rosters,
      battingTeam: 'A',
      bowler: 'Shubman Gill',
    });
    assert.equal(badBowler.valid, false);

    // Valid Cricket assignment + custom guest name
    const validCricket = validateSportPlayerOwnership({
      sportType: 'Cricket',
      rosters,
      battingTeam: 'A',
      batsman1: 'Virat Kohli',
      batsman2: 'Guest Batter',
      bowler: 'Rashid Khan',
    });
    assert.equal(validCricket.valid, true);
  });

  it('validates Football, Volleyball, and Kabaddi raid/tackle ownership across teams', () => {
    const badFootball = validateSportPlayerOwnership({
      sportType: 'Football',
      rosters,
      action: { team: 'A', playerName: 'Rashid Khan' },
    });
    assert.equal(badFootball.valid, false);

    const goodFootball = validateSportPlayerOwnership({
      sportType: 'Football',
      rosters,
      action: { team: 'A', playerName: 'Virat Kohli', assistPlayerName: 'Rohit Sharma' },
    });
    assert.equal(goodFootball.valid, true);

    const badKabaddiTackle = validateSportPlayerOwnership({
      sportType: 'Kabaddi',
      rosters,
      action: { team: 'B', eventType: 'TACKLE_POINT', defenderName: 'Virat Kohli' },
    });
    assert.equal(badKabaddiTackle.valid, false);

    const goodKabaddiTackle = validateSportPlayerOwnership({
      sportType: 'Kabaddi',
      rosters,
      action: { team: 'B', eventType: 'TACKLE_POINT', defenderName: 'Rashid Khan' },
    });
    assert.equal(goodKabaddiTackle.valid, true);
  });
});

describe('Independent Scoreboard Geometry Boxes (OBS vs Viewer Landscape vs Viewer Portrait)', () => {
  it('clamps geometry box coordinates cleanly and keeps obsBox, viewerLandscapeBox, and viewerPortraitBox independent', () => {
    const clamped = clampScoreboardGeometryBox(
      {
        enabled: true,
        xPct: 95,
        yPct: 120,
        widthPct: 60,
        heightPx: 400,
        scale: 3,
      },
      DEFAULT_OBS_BOX
    );
    // widthPct 60 limits xPct to max 40 (100 - 60)
    assert.equal(clamped.enabled, true);
    assert.equal(clamped.widthPct, 60);
    assert.equal(clamped.xPct, 40);
    assert.equal(clamped.yPct, 95);
    assert.equal(clamped.heightPx, 360);
    assert.equal(clamped.scale, 1.8);

    const cfg = normalizeOverlayConfig({
      ...DEFAULT_OVERLAY_CONFIG,
      obsBox: { enabled: true, xPct: 10, yPct: 80, widthPct: 80, heightPx: 0, scale: 1.1 },
      viewerLandscapeBox: {
        enabled: true,
        xPct: 4,
        yPct: 84,
        widthPct: 92,
        heightPx: 96,
        scale: 0.95,
      },
      viewerPortraitBox: {
        enabled: false,
        xPct: 0,
        yPct: 75,
        widthPct: 100,
        heightPx: 0,
        scale: 1,
      },
    });

    assert.equal(cfg.obsBox.enabled, true);
    assert.equal(cfg.obsBox.xPct, 10);
    assert.equal(cfg.viewerLandscapeBox.enabled, true);
    assert.equal(cfg.viewerLandscapeBox.heightPx, 96);
    assert.equal(cfg.viewerPortraitBox.enabled, false);
    assert.equal(cfg.viewerPortraitBox.yPct, 75);

    // Partial update preserves defaults for untouched boxes
    const defaultCfg = normalizeOverlayConfig({
      obsBox: { enabled: true, xPct: 12, yPct: 70, widthPct: 75, heightPx: 0, scale: 1 },
    });
    assert.deepEqual(defaultCfg.viewerLandscapeBox, DEFAULT_VIEWER_LANDSCAPE_BOX);
    assert.deepEqual(defaultCfg.viewerPortraitBox, DEFAULT_VIEWER_PORTRAIT_BOX);
  });
});

describe('Cricket Team Wing Player Separation & Zero Fake Placeholders', () => {
  it('separates striker/non-striker into batting wing and bowler+figures into bowling wing without placeholders', () => {
    let d = createInitialCricketDetails(10);
    d = applyCricketAction(d, { type: 'SET_PRE_MATCH_TOSS', tossWinner: 'B', tossDecision: 'BAT' }).details;
    d = applyCricketAction(d, {
      type: 'UPDATE_META',
      batsman1: 'Rohan',
      batsman2: 'Aman',
      bowler: 'Kartik',
    }).details;
    d = applyCricketAction(d, {
      type: 'RUNS',
      runs: 4,
      striker: 'Rohan',
      nonStriker: 'Aman',
      bowler: 'Kartik',
    }).details;
    d = applyCricketAction(d, {
      type: 'WICKET',
      striker: 'Rohan',
      nonStriker: 'Aman',
      bowler: 'Kartik',
      newBatsman: 'Surya',
    }).details;

    const config = normalizeOverlayConfig(DEFAULT_OVERLAY_CONFIG);
    const theme = resolveObsTheme(config);
    const scoreDoc: any = {
      sportType: 'Cricket',
      teamAScore: d.teamARuns,
      teamBScore: d.teamBRuns,
      sportSpecificDetails: d,
    };

    const vm = buildScoreboardViewModel(baseCricketStream as any, scoreDoc, config, theme, Date.now());
    assert.equal(vm.primaryName, 'Nagal Strikers');
    assert.equal(vm.secondaryName, 'Chandena XI');
    assert.equal(vm.leftPlayerLine, '* Surya · Aman');
    assert.equal(vm.rightPlayerLine, 'Kartik (1-4, 0.2)');

    const norm = normalizeBroadcast(baseCricketStream as any, scoreDoc);
    assert.equal(norm.teamB.playerLine, 'Surya* · Aman');
    assert.equal(norm.teamA.playerLine, 'Kartik (1-4, 0.2)');

    // When no players are selected yet, player lines remain empty (no fake placeholders)
    d.batsman1 = '';
    d.batsman2 = '';
    d.bowler = '';
    const emptyVm = buildScoreboardViewModel(baseCricketStream as any, scoreDoc, config, theme, Date.now());
    assert.equal(emptyVm.leftPlayerLine, '');
    assert.equal(emptyVm.rightPlayerLine, '');
  });
});
