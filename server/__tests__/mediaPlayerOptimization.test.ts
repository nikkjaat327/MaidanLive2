import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractRecentImportantEvent,
  isAdminPanelPath,
  resolveAdminEmbedPreviewTarget,
  resolveMediaLayoutMode,
} from '../../src/utils/mediaPlayerUtils.ts';
import { normalizeBroadcast } from '../../src/utils/normalizeBroadcast.ts';
import type { LiveScoreData, LiveStreamData, ScoreHistoryItem } from '../../src/types/index.ts';

function makeStream(overrides: Partial<LiveStreamData>): LiveStreamData {
  return {
    id: 'm1',
    matchTitle: 'Chandena XI vs Saharanpur Stars',
    youtubeVideoId: 'dQw4w9WgXcQ',
    youtubeInput: 'dQw4w9WgXcQ',
    teamAName: 'Chandena XI',
    teamBName: 'Saharanpur Stars',
    teamALogo: '',
    teamBLogo: '',
    location: 'Saharanpur',
    gameName: 'Cricket',
    tournamentName: 'Maidan Cup',
    matchDescription: 'Knockout fixture',
    status: 'LIVE',
    matchDate: new Date().toISOString(),
    replayVideoId: '',
    replayInput: '',
    replayAvailable: false,
    replayPublished: false,
    scoreboardPosition: 'BOTTOM',
    scoreboardVisibleByDefault: true,
    chatEnabled: true,
    highlightsEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeHistory(overrides: Partial<ScoreHistoryItem>): ScoreHistoryItem {
  return {
    _id: 'h1',
    liveStreamId: 'm1',
    previousScore: {},
    updatedScore: {},
    action: 'Update',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('resolveMediaLayoutMode adapts cleanly across portrait mobile, fullscreen landscape, and portrait fallback', () => {
  const mobilePortrait = resolveMediaLayoutMode({
    containerWidth: 375,
    containerHeight: 211,
    viewportWidth: 375,
    viewportHeight: 812,
    isFullscreen: false,
  });
  assert.equal(mobilePortrait.viewportOrientation, 'portrait');
  assert.equal(mobilePortrait.stageOrientation, 'landscape');
  assert.equal(mobilePortrait.scoreboardMode, 'portrait');
  assert.equal(mobilePortrait.isCompactStage, true);

  const landscapeFullscreen = resolveMediaLayoutMode({
    containerWidth: 844,
    containerHeight: 390,
    viewportWidth: 844,
    viewportHeight: 390,
    isFullscreen: true,
  });
  assert.equal(landscapeFullscreen.stageOrientation, 'landscape');
  assert.equal(landscapeFullscreen.scoreboardMode, 'landscape');
  assert.equal(landscapeFullscreen.isCompactStage, false);

  const portraitFallback = resolveMediaLayoutMode({
    containerWidth: 390,
    containerHeight: 844,
    viewportWidth: 390,
    viewportHeight: 844,
    isFullscreen: true,
  });
  assert.equal(portraitFallback.stageOrientation, 'portrait');
  assert.equal(portraitFallback.scoreboardMode, 'portrait');
});

test('extractRecentImportantEvent recognizes genuine sports events and ignores routine or old items', () => {
  const sixEvent = [
    makeHistory({
      _id: 'h1',
      sportType: 'Cricket',
      eventType: 'SIX',
      action: 'Massive six over long-on!',
      pointsAwarded: 6,
    }),
  ];
  const parsedSix = extractRecentImportantEvent(sixEvent, 'Cricket');
  assert.ok(parsedSix);
  assert.equal(parsedSix.label, 'SIX');
  assert.equal(parsedSix.accent, 'emerald');

  const superTackle = [
    makeHistory({
      _id: 'h2',
      sportType: 'Kabaddi',
      eventType: 'SUPER_TACKLE',
      action: 'Ankle hold by left corner',
      pointsAwarded: 2,
    }),
  ];
  assert.equal(extractRecentImportantEvent(superTackle, 'Kabaddi')?.label, 'SUPER TACKLE');

  const undoEvent = [
    makeHistory({
      _id: 'h3',
      sportType: 'Cricket',
      entryType: 'UNDO',
      eventType: 'UNDO',
      action: 'Reverted previous delivery',
      pointsAwarded: 0,
    }),
  ];
  assert.equal(extractRecentImportantEvent(undoEvent, 'Cricket'), null);

  const staleEvent = [
    makeHistory({
      _id: 'h4',
      sportType: 'Football',
      eventType: 'GOAL',
      action: 'Header goal',
      pointsAwarded: 1,
      createdAt: new Date(Date.now() - 45_000).toISOString(),
    }),
  ];
  assert.equal(extractRecentImportantEvent(staleEvent, 'Football'), null);
});

test('isAdminPanelPath and resolveAdminEmbedPreviewTarget enforce admin-only embed detection', () => {
  assert.equal(isAdminPanelPath('/admin/dashboard'), true);
  assert.equal(isAdminPanelPath('/admin/broadcast-studio/m1'), true);
  assert.equal(isAdminPanelPath('/broadcast/overlay/m1'), true);
  assert.equal(isAdminPanelPath('/broadcast/overlay/view/m1'), false);
  assert.equal(isAdminPanelPath('/broadcaster/control-room'), false);
  assert.equal(isAdminPanelPath('/live/m1'), false);
  assert.equal(isAdminPanelPath('/admin/login'), false);

  const upcomingStream = makeStream({
    id: 's_up',
    status: 'UPCOMING',
    activeStreamingProvider: 'youtube',
  });
  assert.equal(resolveAdminEmbedPreviewTarget([upcomingStream]), null);

  const liveMtx = makeStream({
    id: 's_mtx',
    gameName: 'Kabaddi',
    matchTitle: '',
    teamAName: 'Patna',
    teamBName: 'U Mumba',
    youtubeVideoId: '',
    youtubeInput: '',
    mediamtxPlaybackUrl: 'https://stream.maidanlive.in/live/index.m3u8',
    status: 'LIVE',
    activeStreamingProvider: 'mediamtx',
  });
  const resolved = resolveAdminEmbedPreviewTarget([upcomingStream, liveMtx]);
  assert.ok(resolved);
  assert.equal(resolved.streamId, 's_mtx');
  assert.equal(resolved.provider, 'mediamtx');
  assert.equal(resolved.title, 'Patna vs U Mumba');
});

test('normalizeBroadcast outputs consistent team scores and metadata for Cricket, Kabaddi, Football, Volleyball', () => {
  const baseStream = makeStream({});
  const nowIso = new Date().toISOString();

  const cricketScore: LiveScoreData = {
    liveStreamId: 'm1',
    sportType: 'Cricket',
    teamAScore: 112,
    teamBScore: 0,
    matchStatus: '1st Innings',
    lastUpdatedAt: nowIso,
    sportSpecificDetails: {
      teamARuns: 112,
      teamAWickets: 3,
      teamABalls: 74,
      battingTeam: 'A',
      innings: 1,
      oversLimit: 20,
      batsman1: 'Rohan',
      bowler: 'Aman',
    },
  };
  const cNorm = normalizeBroadcast(baseStream, cricketScore);
  assert.equal(cNorm.teamA.primaryText, '112/3');
  assert.equal(cNorm.teamA.badgeText, 'BATTING');
  assert.ok(cNorm.subStripItems.some((item) => item.label === 'CRR'));

  const vbNorm = normalizeBroadcast(
    makeStream({ gameName: 'Volleyball' }),
    {
      liveStreamId: 'm1',
      sportType: 'Volleyball',
      teamAScore: 24,
      teamBScore: 24,
      matchStatus: 'Set 2',
      lastUpdatedAt: nowIso,
      sportSpecificDetails: {
        currentSet: 2,
        bestOfSets: 3,
        teamASetsWon: 1,
        teamBSetsWon: 0,
        servingTeam: 'A',
        setScores: [{ set: 1, teamA: 25, teamB: 20, winner: 'A' }, { set: 2, teamA: 24, teamB: 24 }],
      },
    }
  );
  assert.equal(vbNorm.teamA.primaryText, '24');
  assert.equal(vbNorm.teamA.badgeText, 'SERVING');
  assert.ok(vbNorm.centerMeta.periodLabel?.includes('DEUCE'));
});
