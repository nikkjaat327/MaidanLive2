import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_OVERLAY_CONFIG,
  computeOverlayMetrics,
  normalizeOverlayConfig,
} from '../../src/utils/overlayConfig.ts';
import {
  applyKabaddiClockCommand,
  applyKabaddiEngineAction,
  computeEffectiveKabaddiClock,
  createInitialKabaddiDetails,
} from '../../src/utils/kabaddiScoring.ts';
import {
  applyCricketAction,
  createInitialCricketDetails,
} from '../../src/utils/cricketScoring.ts';
import { buildScoreboardViewModel } from '../../src/components/obs/scoreboardViewModel.ts';
import { resolveObsTheme } from '../../src/components/obs/obsTheme.ts';
import {
  buildVdoNinjaLinks,
  sanitizeVdoPushUrl,
  sanitizeVdoViewUrl,
} from '../utils/obsCrypto.ts';
import { buildObsEnsureInputForCamera } from '../services/obsControllerService.ts';
import {
  isolateVdoPushUrl,
  resolveCameraLiveWebUrl,
} from '../../src/utils/obsTransformGeometry.ts';

const baseStream = {
  id: 'stream_test_1',
  title: 'Test Match',
  gameName: 'Kabaddi',
  tournamentName: 'Pro Cup',
  teamAName: 'Jaipur Panthers',
  teamBName: 'Patna Pirates',
  status: 'LIVE' as const,
  streamingProvider: 'youtube' as const,
};

describe('Kabaddi Clock, Do-or-Die, All-Out, Timer Hiding & Stats Separation', () => {
  it('ticks Kabaddi match clock second-by-second with server clock alignment', () => {
    const t0 = 1_700_000_000_000;
    const init = createInitialKabaddiDetails();
    const started = applyKabaddiClockCommand(init, { type: 'START_MATCH' }, t0).details;

    assert.equal(started.clock.status, 'RUNNING');
    const eff0 = computeEffectiveKabaddiClock(started, t0);
    const eff5 = computeEffectiveKabaddiClock(started, t0 + 5000);
    const eff12 = computeEffectiveKabaddiClock(started, t0 + 12000);

    assert.equal(eff0.formattedClock, '20:00');
    assert.equal(eff5.formattedClock, '19:55');
    assert.equal(eff12.formattedClock, '19:48');
  });

  it('triggers Do-or-Die automatically on a team next raid after 2 consecutive empty raids, and supports manual trigger & All-Out', () => {
    const t0 = 1_700_000_010_000;
    let d = createInitialKabaddiDetails();
    d = applyKabaddiClockCommand(d, { type: 'START_MATCH' }, t0).details;
    let sA = 0;
    let sB = 0;
    assert.equal(d.activeRaidingTeam, 'A');

    // A empty #1 -> switches to B
    let step = applyKabaddiEngineAction(d, sA, sB, { type: 'EMPTY_RAID', team: 'A' }, t0 + 1000);
    d = step.details;
    sA = step.teamAScore;
    sB = step.teamBScore;
    assert.equal(d.consecutiveEmptyRaidsA, 1);
    assert.equal(d.activeRaidingTeam, 'B');
    assert.equal(d.doOrDie.active, false);

    // B touch -> switches back to A
    step = applyKabaddiEngineAction(d, sA, sB, { type: 'TOUCH_POINT', team: 'B' }, t0 + 2000);
    d = step.details;
    sA = step.teamAScore;
    sB = step.teamBScore;
    assert.equal(d.activeRaidingTeam, 'A');

    // A empty #2 -> pendingDoOrDieA becomes true, switches to B
    step = applyKabaddiEngineAction(d, sA, sB, { type: 'EMPTY_RAID', team: 'A' }, t0 + 3000);
    d = step.details;
    sA = step.teamAScore;
    sB = step.teamBScore;
    assert.equal(d.consecutiveEmptyRaidsA, 2);
    assert.equal(d.pendingDoOrDieA, true);
    assert.equal(d.activeRaidingTeam, 'B');

    // B empty #1 -> raid returns to A, activating A's Do-or-Die!
    step = applyKabaddiEngineAction(d, sA, sB, { type: 'EMPTY_RAID', team: 'B' }, t0 + 4000);
    d = step.details;
    sA = step.teamAScore;
    sB = step.teamBScore;
    assert.equal(d.activeRaidingTeam, 'A');
    assert.equal(d.doOrDie.active, true);
    assert.equal(d.doOrDie.team, 'A');
    assert.ok(step.triggeredDoOrDie);

    // Manual Do-or-Die trigger for Team B
    const manualDod = applyKabaddiEngineAction(
      d,
      sA,
      sB,
      { type: 'DO_OR_DIE_TRIGGER', team: 'B' },
      t0 + 5000
    );
    assert.equal(manualDod.details.doOrDie.active, true);
    assert.equal(manualDod.details.doOrDie.team, 'B');
    assert.ok(manualDod.triggeredDoOrDie);

    // All-Out inflicted by knocking out all remaining defenders on Team B (7 touch points -> triggers All-Out)
    const allOutRes = applyKabaddiEngineAction(
      manualDod.details,
      manualDod.teamAScore,
      manualDod.teamBScore,
      { type: 'MULTI_POINT_RAID', team: 'A', touchPoints: 7 },
      t0 + 6000
    );
    assert.ok(allOutRes.triggeredAllOut);
    assert.equal(allOutRes.details.lastAllOut?.awardingTeam, 'A');
    assert.equal(allOutRes.details.lastAllOut?.affectedTeam, 'B');
    assert.equal(allOutRes.details.lastAllOut?.pointsAwarded, 2);
  });

  it('hides Kabaddi timer cleanly when showMatchTimer or showMatchStatus is false and separates Team A left vs Team B right stats', () => {
    const t0 = 1_700_000_020_000;
    const details = createInitialKabaddiDetails();
    details.teamA.raidPoints = 5;
    details.teamA.tacklePoints = 2;
    details.teamB.raidPoints = 3;
    details.teamB.bonusPoints = 1;

    const config = normalizeOverlayConfig({ ...DEFAULT_OVERLAY_CONFIG, showMatchStatus: false });
    const theme = resolveObsTheme(config);

    const scoreDoc: any = {
      sportType: 'Kabaddi',
      teamAScore: 7,
      teamBScore: 4,
      sportSpecificDetails: details,
    };

    const vmHiddenStatus = buildScoreboardViewModel(baseStream as any, scoreDoc, config, theme, t0);
    assert.equal(vmHiddenStatus.centerPrimary, '');
    assert.equal(vmHiddenStatus.centerSecondary, '');

    details.viewerDisplaySettings.showMatchTimer = false;
    const configVisibleStatus = normalizeOverlayConfig({ ...DEFAULT_OVERLAY_CONFIG, showMatchStatus: true });
    const vmHiddenTimer = buildScoreboardViewModel(baseStream as any, scoreDoc, configVisibleStatus, theme, t0);
    assert.equal(vmHiddenTimer.centerPrimary, '');
    assert.ok(vmHiddenTimer.centerSecondary.length > 0);
    assert.match(vmHiddenTimer.leftStatsText || '', /R 5 · T 2/);
    assert.match(vmHiddenTimer.rightStatsText || '', /R 3 · T 0 · B 1/);
    assert.equal(vmHiddenTimer.battersText, '');
    assert.equal(vmHiddenTimer.bowlerText, '');
  });
});

describe('Cricket Current-Over-Only Delivery Strip', () => {
  it('resets recentBalls when an over completes and never falls back to lastOverSummary in view model', () => {
    let d = createInitialCricketDetails(10);
    for (let i = 0; i < 5; i += 1) {
      d = applyCricketAction(d, { type: 'RUNS', runs: 1 }).details;
    }
    assert.equal(d.recentBalls.length, 5);

    // 6th legal ball finishes the over and clears current-over recentBalls
    d = applyCricketAction(d, { type: 'RUNS', runs: 2 }).details;
    assert.equal(d.recentBalls.length, 0);
    assert.equal(d.lastOverSummary.length, 6);

    const config = normalizeOverlayConfig(DEFAULT_OVERLAY_CONFIG);
    const theme = resolveObsTheme(config);
    const vm = buildScoreboardViewModel(
      { ...baseStream, gameName: 'Cricket' } as any,
      { sportType: 'Cricket', teamAScore: 7, teamBScore: 0, sportSpecificDetails: d } as any,
      config,
      theme,
      Date.now()
    );
    assert.deepEqual(vm.recentBalls, []);

    // Manual END_OVER also clears recentBalls
    d = applyCricketAction(d, { type: 'RUNS', runs: 4 }).details;
    assert.deepEqual(d.recentBalls, ['4']);
    d = applyCricketAction(d, { type: 'END_OVER' }).details;
    assert.deepEqual(d.recentBalls, []);
  });
});

describe('VDO.Ninja Individual Camera Feed Isolation & Overlay Sizing', () => {
  it('uses isolated view=<streamId> + solo (never combined &scene) across server, OBS Bridge, and live web previews', () => {
    const cam1 = buildVdoNinjaLinks({
      roomName: 'maidan_room_1',
      streamId: 'cam1_abcd',
      password: 'secret',
      label: 'CAM 1',
    });
    const cam2 = buildVdoNinjaLinks({
      roomName: 'maidan_room_1',
      streamId: 'cam2_efgh',
      password: 'secret',
      label: 'CAM 2',
    });

    assert.ok(cam1.obsViewUrl.includes('view=cam1_abcd'));
    assert.ok(cam1.obsViewUrl.includes('&solo'));
    assert.equal(cam1.obsViewUrl.includes('&scene'), false);

    assert.ok(cam2.obsViewUrl.includes('view=cam2_efgh'));
    assert.ok(cam2.obsViewUrl.includes('&solo'));
    assert.equal(cam2.obsViewUrl.includes('&scene'), false);

    const sanitized = sanitizeVdoViewUrl('https://vdo.ninja/?view=cam3_xyz&room=abc&scene&cleanoutput');
    assert.equal(sanitized.includes('scene'), false);
    assert.ok(sanitized.includes('solo=1'));

    const webPreview = resolveCameraLiveWebUrl({
      sourceType: 'browser_source',
      connectionUrl: 'https://vdo.ninja/?view=cam4_123&room=abc&scene',
    });
    assert.equal(webPreview.includes('scene'), false);
    assert.ok(webPreview.includes('solo=1'));

    const obsInput = buildObsEnsureInputForCamera(
      {
        cameraNumber: 3,
        sourceType: 'vdoninja',
        vdoStreamId: 'cam3_9999',
        vdoRoomName: 'maidan_room_1',
      },
      { vdoRoomName: 'maidan_room_1' },
      'pass123'
    );
    assert.ok(obsInput?.inputSettings?.url.includes('view=cam3_9999'));
    assert.ok(obsInput?.inputSettings?.url.includes('&solo'));
    assert.equal(obsInput?.inputSettings?.url.includes('&scene'), false);
  });

  it('isolates VDO.Ninja mobile publisher URLs and respects includeCameraSelection flag', () => {
    // When includeCameraSelection is omitted/false, NO videodevice/facing/facingmode goes in the link
    const freeCam = buildVdoNinjaLinks({
      roomName: 'maidan_match_room',
      streamId: 'cam_free_switch',
      password: 'room_secret_pw',
      label: 'CAM FREE',
      facingMode: 'environment',
      includeCameraSelection: false,
    });
    const freeParsed = new URL(freeCam.pushUrl);
    assert.equal(freeParsed.searchParams.has('videodevice'), false);
    assert.equal(freeParsed.searchParams.has('facing'), false);
    assert.equal(freeParsed.searchParams.has('facingmode'), false);

    // When includeCameraSelection is true, MaidanLive sets videodevice=back or front
    const cam1 = buildVdoNinjaLinks({
      roomName: 'maidan_match_room',
      streamId: 'cam1_phone',
      password: 'room_secret_pw',
      label: 'CAM 1',
      facingMode: 'environment',
      includeCameraSelection: true,
    });
    const cam2 = buildVdoNinjaLinks({
      roomName: 'maidan_match_room',
      streamId: 'cam2_phone',
      password: 'room_secret_pw',
      label: 'CAM 2',
      facingMode: 'user',
      includeCameraSelection: true,
    });

    for (const [cam, expectedStream, expectedVideoDevice] of [
      [cam1, 'cam1_phone', 'back'],
      [cam2, 'cam2_phone', 'front'],
    ] as const) {
      const parsed = new URL(cam.pushUrl);
      assert.equal(parsed.searchParams.get('push'), expectedStream);
      assert.equal(parsed.searchParams.get('room'), 'maidan_match_room');
      assert.equal(parsed.searchParams.get('password'), 'room_secret_pw');
      assert.equal(parsed.searchParams.get('videodevice'), expectedVideoDevice);
      assert.equal(parsed.searchParams.has('facing'), false);
      assert.equal(parsed.searchParams.has('facingmode'), false);
      // Empty view= + novideo + noaudio + mutespeaker=1 isolate incoming room feeds while keeping local self-preview
      assert.equal(parsed.searchParams.has('view'), true);
      assert.equal(parsed.searchParams.get('view'), '');
      assert.equal(parsed.searchParams.has('novideo'), true);
      assert.equal(parsed.searchParams.get('novideo'), '');
      assert.equal(parsed.searchParams.has('noaudio'), true);
      assert.equal(parsed.searchParams.get('noaudio'), '');
      assert.equal(parsed.searchParams.get('mutespeaker'), '1');
      assert.equal(parsed.searchParams.has('showpreview'), true);
      assert.equal(parsed.searchParams.has('webcam'), true);
      assert.equal(parsed.searchParams.has('autostart'), true);
      assert.equal(parsed.searchParams.has('scene'), false);
      assert.equal(parsed.searchParams.has('broadcast'), false);

      // Push URLs (even with blank view=) must never be treated as viewer URLs in Control Room monitors
      assert.equal(
        resolveCameraLiveWebUrl({
          sourceType: 'vdoninja',
          connectionUrl: cam.pushUrl,
        }),
        ''
      );
    }

    // Legacy VDO.Ninja push URLs are normalized cleanly on both server and client
    const legacyUrl =
      'https://vdo.ninja/?push=cam9_old&room=room_x&password=pw1&facingmode=environment&noaudio=0&webcam&autostart&broadcast';
    for (const sanitizer of [sanitizeVdoPushUrl, isolateVdoPushUrl]) {
      const normalized = new URL(sanitizer(legacyUrl, { includeCameraSelection: true }));
      assert.equal(normalized.searchParams.get('push'), 'cam9_old');
      assert.equal(normalized.searchParams.get('room'), 'room_x');
      assert.equal(normalized.searchParams.get('password'), 'pw1');
      assert.equal(normalized.searchParams.get('videodevice'), 'back');
      assert.equal(normalized.searchParams.has('facing'), false);
      assert.equal(normalized.searchParams.has('facingmode'), false);
      assert.equal(normalized.searchParams.has('broadcast'), false);
      assert.equal(normalized.searchParams.get('view'), '');
      assert.equal(normalized.searchParams.get('novideo'), '');
      assert.equal(normalized.searchParams.get('noaudio'), '');
      assert.equal(normalized.searchParams.get('mutespeaker'), '1');
      assert.equal(normalized.searchParams.has('showpreview'), true);

      const stripped = new URL(sanitizer(legacyUrl, { includeCameraSelection: false }));
      assert.equal(stripped.searchParams.has('videodevice'), false);
      assert.equal(stripped.searchParams.has('facing'), false);
      assert.equal(stripped.searchParams.has('facingmode'), false);
    }

    // Non-VDO URLs remain untouched
    assert.equal(sanitizeVdoPushUrl('rtmp://localhost/live/cam1'), 'rtmp://localhost/live/cam1');
    assert.equal(isolateVdoPushUrl('rtmp://localhost/live/cam1'), 'rtmp://localhost/live/cam1');
  });

  it('produces clear bar width and typography scaling across Small, Medium, Large, and customScale', () => {
    const small = computeOverlayMetrics(normalizeOverlayConfig({ scale: 'small', customScale: 0.8 }));
    const medium = computeOverlayMetrics(normalizeOverlayConfig({ scale: 'medium', customScale: 1.0 }));
    const large = computeOverlayMetrics(normalizeOverlayConfig({ scale: 'large', customScale: 1.5 }));

    assert.ok(small.barWidthPct < medium.barWidthPct);
    assert.ok(medium.barWidthPct < large.barWidthPct);
    assert.ok(small.scoreFontPx < medium.scoreFontPx);
    assert.ok(medium.scoreFontPx < large.scoreFontPx);
  });
});
