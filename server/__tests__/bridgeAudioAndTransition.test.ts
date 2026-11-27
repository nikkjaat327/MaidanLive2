import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const {
  BridgeEngine,
  APPROVED_COMMANDS,
  OBS_EVENT_SUBSCRIPTIONS,
  linearMulToDb,
  isLikelyAudioInput,
  selectPrimaryAudioInput,
  evaluateAudioReadiness,
} = require('../../desktop/obs-bridge/bridgeEngine.cjs');

describe('OBS Bridge Primary Audio Peak Meter & Scene Transition Controls', () => {
  it('subscribes to OBS WebSocket v5 InputVolumeMeters events alongside core events', () => {
    // EventSubscription.InputVolumeMeters = 1 << 16 (65536)
    assert.equal(Boolean(OBS_EVENT_SUBSCRIPTIONS & 65536), true);
    assert.ok(APPROVED_COMMANDS.has('trigger_transition'));
    assert.ok(APPROVED_COMMANDS.has('set_studio_mode'));
    assert.ok(APPROVED_COMMANDS.has('set_preview_scene'));
    assert.ok(APPROVED_COMMANDS.has('set_primary_audio_input'));
  });

  it('converts OBS linear volume multipliers cleanly to bounded dBFS values', () => {
    assert.equal(linearMulToDb(0), -60);
    assert.equal(linearMulToDb(-0.1), -60);
    assert.equal(linearMulToDb(1), 0);
    const halfDb = linearMulToDb(0.5);
    assert.ok(halfDb > -6.2 && halfDb < -5.9, `expected ~-6.0 dB, got ${halfDb}`);
    const minusTwenty = linearMulToDb(0.1);
    assert.ok(Math.abs(minusTwenty - -20) <= 0.1);
  });

  it('prioritizes special OBS mic inputs and excludes non-audio graphic sources when auto-selecting primary audio input', () => {
    assert.equal(
      isLikelyAudioInput({ inputName: 'Tournament Banner', inputKind: 'image_source' }),
      false
    );
    assert.equal(
      isLikelyAudioInput({ inputName: 'Overlay Text', inputKind: 'text_gdiplus_v2' }),
      false
    );
    assert.equal(
      isLikelyAudioInput({ inputName: 'Commentary Mic', inputKind: 'wasapi_input_capture' }),
      true
    );

    const selection = selectPrimaryAudioInput({
      preferredInputName: '',
      specialInputs: {
        desktop1: 'Desktop Audio',
        mic1: 'Mic/Aux',
      },
      meterInputs: [
        { inputName: 'Desktop Audio', inputLevelsMul: [[0.01, 0.01, 0.01]] },
        { inputName: 'Mic/Aux', inputLevelsMul: [[0.25, 0.35, 0.35]] },
      ],
      obsInputs: [
        { inputName: 'MaidanLive Scoreboard', inputKind: 'browser_source' },
        { inputName: 'Desktop Audio', inputKind: 'wasapi_output_capture' },
        { inputName: 'Mic/Aux', inputKind: 'wasapi_input_capture' },
      ],
    });

    assert.equal(selection.primaryInputName, 'Mic/Aux');
    assert.ok(selection.availableAudioInputs.includes('Mic/Aux'));
    assert.ok(selection.availableAudioInputs.includes('Desktop Audio'));
  });

  it('evaluates pre-live audio readiness accurately across silent, optimal, muted, and clipping levels', () => {
    assert.equal(
      evaluateAudioReadiness({ obsConnected: false, inputName: 'Mic/Aux', muted: false, peakDb: -12, clipping: false }).status,
      'OFFLINE'
    );
    assert.equal(
      evaluateAudioReadiness({ obsConnected: true, inputName: 'Mic/Aux', muted: true, peakDb: -12, clipping: false }).status,
      'MUTED'
    );
    assert.equal(
      evaluateAudioReadiness({ obsConnected: true, inputName: 'Mic/Aux', muted: false, peakDb: -0.5, clipping: true }).status,
      'CLIPPING'
    );
    const optimal = evaluateAudioReadiness({
      obsConnected: true,
      inputName: 'Mic/Aux',
      muted: false,
      peakDb: -12,
      clipping: false,
    });
    assert.equal(optimal.status, 'OPTIMAL');
    assert.equal(optimal.readyForLive, true);
    assert.equal(
      evaluateAudioReadiness({ obsConnected: true, inputName: 'Mic/Aux', muted: false, peakDb: -58, clipping: false }).status,
      'SILENT'
    );
  });

  it('processes InputVolumeMeters snapshots with peak hold, mute override, and emits audio-levels', () => {
    const engine = new BridgeEngine();
    engine.state.obsConnected = true;
    engine.state.primaryAudioInput = 'Mic/Aux';
    engine.specialInputs = { mic1: 'Mic/Aux' };
    engine.audioMuteMap.set('Mic/Aux', false);

    const emitted: any[] = [];
    engine.on('audio-levels', (meter: any) => emitted.push(meter));

    const first = engine._processAudioVolumeMeters(
      [
        {
          inputName: 'Mic/Aux',
          inputLevelsMul: [
            [0.12, 0.25, 0.25], // ~ -12.0 dB peak
            [0.1, 0.2, 0.2],
          ],
        },
      ],
      { forceEmit: true }
    );

    assert.equal(first.obsConnected, true);
    assert.equal(first.primaryInputName, 'Mic/Aux');
    assert.equal(first.status, 'OPTIMAL');
    assert.equal(first.readyForLive, true);
    assert.ok(first.peakDb <= -11.9 && first.peakDb >= -12.2);
    assert.equal(first.peakHoldDb, first.peakDb);
    assert.equal(emitted.length, 1);

    // Next quiet frame preserves peakHoldDb within hold window
    const quieter = engine._processAudioVolumeMeters(
      [
        {
          inputName: 'Mic/Aux',
          inputLevelsMul: [
            [0.01, 0.02, 0.02],
            [0.01, 0.02, 0.02],
          ],
        },
      ],
      { forceEmit: true }
    );
    assert.ok(quieter.peakHoldDb >= first.peakHoldDb - 0.1);

    // Muted frame flags MUTED and disables readyForLive
    engine.audioMuteMap.set('Mic/Aux', true);
    const mutedSnap = engine._processAudioVolumeMeters(
      [
        {
          inputName: 'Mic/Aux',
          inputLevelsMul: [[0.99, 0.99, 0.99]],
        },
      ],
      { forceEmit: true }
    );
    assert.equal(mutedSnap.muted, true);
    assert.equal(mutedSnap.clipping, false);
    assert.equal(mutedSnap.status, 'MUTED');
    assert.equal(mutedSnap.readyForLive, false);
  });

  it('executes trigger_transition command in OBS WebSocket v5 by enabling Studio Mode if off and calling TriggerStudioModeTransition', async () => {
    const engine = new BridgeEngine();
    engine.state.obsConnected = true;

    const obsCalls: Array<{ requestType: string; requestData: any }> = [];
    let studioMode = false;
    let programScene = 'CAM 1 FULL';
    let previewScene = 'CAM 2 FULL';
    let currentTransition = 'Fade';

    engine.obs = {
      identified: true,
      call: async (requestType: string, requestData?: any) => {
        obsCalls.push({ requestType, requestData });
        switch (requestType) {
          case 'SetCurrentSceneTransition':
            currentTransition = requestData.transitionName;
            return {};
          case 'SetCurrentSceneTransitionDuration':
            return {};
          case 'GetStudioModeEnabled':
            return { studioModeEnabled: studioMode };
          case 'SetStudioModeEnabled':
            studioMode = Boolean(requestData.studioModeEnabled);
            return {};
          case 'SetCurrentPreviewScene':
            previewScene = requestData.sceneName;
            return {};
          case 'TriggerStudioModeTransition': {
            const prev = programScene;
            programScene = previewScene;
            previewScene = prev;
            return {};
          }
          case 'GetCurrentProgramScene':
            return { currentProgramSceneName: programScene };
          case 'GetCurrentPreviewScene':
            return { currentPreviewSceneName: previewScene };
          case 'GetCurrentSceneTransition':
            return { transitionName: currentTransition, transitionDuration: 450 };
          case 'GetSceneTransitionList':
            return {
              currentSceneTransitionName: currentTransition,
              transitions: [{ transitionName: 'Cut' }, { transitionName: 'Fade' }],
            };
          case 'GetSceneList':
            return {
              currentProgramSceneName: programScene,
              currentPreviewSceneName: previewScene,
              scenes: [{ sceneName: 'CAM 1 FULL' }, { sceneName: 'CAM 2 FULL' }],
            };
          case 'GetStreamStatus':
            return { outputActive: false };
          case 'GetRecordStatus':
            return { outputActive: false };
          case 'GetInputList':
            return { inputs: [] };
          case 'GetStats':
            return {};
          default:
            return {};
        }
      },
    };
    engine.emitObsSnapshot = async () => {};

    const res = await engine.handleCommand('trigger_transition', {
      previewSceneName: 'CAM 2 FULL',
      transitionName: 'Fade',
      transitionDurationMs: 450,
    });

    assert.equal(res.triggered, true);
    assert.equal(res.studioModeEnabled, true);
    assert.equal(res.activeObsScene, 'CAM 2 FULL');
    assert.equal(res.previewObsScene, 'CAM 1 FULL');
    assert.equal(res.currentTransitionName, 'Fade');
    assert.ok(obsCalls.some((c) => c.requestType === 'SetStudioModeEnabled' && c.requestData.studioModeEnabled === true));
    assert.ok(obsCalls.some((c) => c.requestType === 'SetCurrentPreviewScene' && c.requestData.sceneName === 'CAM 2 FULL'));
    assert.ok(obsCalls.some((c) => c.requestType === 'TriggerStudioModeTransition'));
  });
});
